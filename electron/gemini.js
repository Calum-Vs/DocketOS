import fs from 'fs'
import mammoth from 'mammoth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { getSetting, listRules } from './db.js'

let lastResult = []
let mainWindowRef = null
let isRunning = false
let lastInputFingerprint = null

// In-flight filePaths for analyseDocument concurrency guard
const analysisInFlight = new Set()

export function init(mainWindow) {
  mainWindowRef = mainWindow
}

// Called by fileWatcher when a new project is activated — clears all stale state
export function resetState() {
  lastResult = []
  lastInputFingerprint = null
  isRunning = false
}

// Parse Google's suggested retry delay from the 429 error body, e.g. "retryDelay":"59s"
function parseRetryDelay(err) {
  const match = String(err.message ?? '').match(/"retryDelay"\s*:\s*"(\d+)s"/)
  return match ? parseInt(match[1], 10) * 1000 : null
}

async function retryWithBackoff(fn, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const is429 = err.status === 429 || /429|too.?many.?request|quota exceeded/i.test(err.message ?? '')
      if (!is429 || attempt === maxRetries) throw err
      // Honor Google's suggested delay; fall back to 60s if not specified
      const delay = parseRetryDelay(err) ?? 60_000
      await new Promise(res => setTimeout(res, delay))
    }
  }
}

function pushResult(result) {
  lastResult = result
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('gemini:result', result)
  }
}

export async function runAnalysis(fileArray) {
  if (isRunning) return lastResult

  const rules = listRules()
  const systemPrompt = getSetting('gemini_system_prompt') ?? ''
  const apiKey = process.env.GEMINI_API_KEY || getSetting('gemini_api_key')

  if (!apiKey) {
    return [{ status: 'error', message: 'Gemini API key not set — add it in Engine Backend settings', filePath: null, suggestedPath: null }]
  }

  if (rules.length === 0) {
    if (lastResult.length > 0) pushResult([])
    return []
  }

  // Only send files whose extension is covered by at least one rule
  const ruleExts = new Set(rules.map(r => {
    const e = r.extension?.toLowerCase() ?? ''
    return e.startsWith('.') ? e : `.${e}`
  }).filter(e => e !== '.'))
  const relevantFiles = ruleExts.size > 0 ? fileArray.filter(f => ruleExts.has(f.ext)) : fileArray

  if (relevantFiles.length === 0) {
    if (lastResult.length > 0) pushResult([])
    return []
  }

  // Skip the API call if nothing has changed since the last successful run
  const fingerprint = JSON.stringify({
    prompt: systemPrompt,
    rules: rules.map(r => `${r.extension}|${r.regex_pattern}|${r.target_subfolder}`).sort(),
    files: relevantFiles.map(f => `${f.relativePath}|${f.subfolder}`).sort(),
  })
  if (fingerprint === lastInputFingerprint) return lastResult

  isRunning = true
  try {
    const tableHeader = '| File Name | Extension | Relative Path | Current Subfolder |\n| --------- | --------- | ------------- | ----------------- |'
    const tableRows = relevantFiles.map(f =>
      `| ${f.name} | ${f.ext} | ${f.relativePath} | ${f.subfolder} |`
    ).join('\n')

    const rulesList = rules.map((rule, i) =>
      `Rule ${i + 1}: Files matching extension [${rule.extension}] and regex [${rule.regex_pattern}] MUST be in subfolder [${rule.target_subfolder}]`
    ).join('\n')

    const userMessage = `You are auditing the following project directory. Apply each rule strictly.
Return a JSON array. Each object must have exactly these fields:
{
  "status": "ok" | "warning" | "error",
  "message": "Human-readable description of the finding",
  "filePath": "relative path of the file in question, or null if general finding",
  "suggestedPath": "the correct subfolder path the file should be in, or null"
}

Current File List:
${tableHeader}
${tableRows}

Active Rules:
${rulesList}`

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      systemInstruction: systemPrompt,
    })

    const result = await retryWithBackoff(() => model.generateContent(userMessage), 0)
    const text = result.response.text()

    // Strip any markdown fences the model may have added despite the JSON MIME hint
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return [{ status: 'error', message: 'Gemini returned unparseable response', filePath: null, suggestedPath: null }]
    }

    if (!Array.isArray(parsed)) {
      return [{ status: 'error', message: 'Gemini response was not a JSON array', filePath: null, suggestedPath: null }]
    }

    parsed = parsed.filter(item =>
      item && typeof item === 'object' && 'status' in item && 'message' in item
    )

    lastInputFingerprint = fingerprint
    pushResult(parsed)
    return lastResult
  } catch (err) {
    return [{ status: 'error', message: `Analysis failed: ${err.message}`, filePath: null, suggestedPath: null }]
  } finally {
    isRunning = false
  }
}

export function getLastResult() {
  return lastResult
}

const DEFAULT_DOC_ANALYSIS_PROMPT = `You are an assistant helping an engineer analyse project documents.
Answer clearly and professionally. Focus on facts present in the document.
Do not speculate beyond what the document contains.`

const ALLOWED_DOC_ANALYSIS_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
])
const DEFAULT_DOC_ANALYSIS_MODEL = 'gemini-2.5-flash'

export async function analyseDocument({ filePath, question, systemPrompt, model }) {
  const apiKey = process.env.GEMINI_API_KEY || getSetting('gemini_api_key')
  if (!apiKey) return { success: false, error: 'Gemini API key not set — add it in Engine Backend settings' }

  const modelName = ALLOWED_DOC_ANALYSIS_MODELS.has(model) ? model : DEFAULT_DOC_ANALYSIS_MODEL

  if (analysisInFlight.has(filePath)) {
    return { success: false, error: 'Analysis already in progress for this file' }
  }
  analysisInFlight.add(filePath)

  try {
    const prompt = systemPrompt?.trim() || DEFAULT_DOC_ANALYSIS_PROMPT
    const ext = filePath.split('.').pop().toLowerCase()

    let parts
    let uploadedFileName = null
    try {
      if (ext === 'pdf') {
        const stat = fs.statSync(filePath)
        if (stat.size > 100 * 1024 * 1024) {
          // Large PDF — use Files API (supports up to 2 GB)
          const fileManager = new GoogleAIFileManager(apiKey)
          const upload = await fileManager.uploadFile(filePath, {
            mimeType: 'application/pdf',
            displayName: filePath.split(/[\\/]/).pop(),
          })
          uploadedFileName = upload.file.name
          parts = [
            { fileData: { mimeType: 'application/pdf', fileUri: upload.file.uri } },
            { text: question },
          ]
        } else {
          // Small PDF — inline base64 (fast, no upload needed)
          const data = fs.readFileSync(filePath).toString('base64')
          parts = [
            { inlineData: { mimeType: 'application/pdf', data } },
            { text: question },
          ]
        }
      } else if (ext === 'doc' || ext === 'docx') {
        const { value } = await mammoth.extractRawText({ path: filePath })
        if (!value?.trim()) return { success: false, error: 'Could not extract text from this Word document' }
        parts = [{ text: `${value}\n\n${question}` }]
      } else {
        const text = fs.readFileSync(filePath, 'utf8')
        parts = [{ text: `${text}\n\n${question}` }]
      }
    } catch (err) {
      if (err.code === 'ENOENT') return { success: false, error: 'Could not read file: file not found' }
      if (ext === 'doc' || ext === 'docx') return { success: false, error: 'Could not extract text from this Word document' }
      return { success: false, error: `Could not read file: ${err.message}` }
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.3 },
        systemInstruction: prompt,
      })
      const result = await retryWithBackoff(() => model.generateContent({ contents: [{ role: 'user', parts }] }))
      // Delete the uploaded file only after generateContent succeeds, so retries can still use the URI
      if (uploadedFileName) {
        const fileManager = new GoogleAIFileManager(apiKey)
        fileManager.deleteFile(uploadedFileName).catch(() => {})
      }
      return { success: true, result: result.response.text() }
    } catch (err) {
      return { success: false, error: err.message ?? 'Gemini request failed' }
    }
  } finally {
    analysisInFlight.delete(filePath)
  }
}
