# Document AI Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add right-click AI analysis to supported documents (PDF, TXT, MD, DOC, DOCX) across all file surfaces in the dashboard, with a two-step popup (question → result) and a per-project system prompt in Settings.

**Architecture:** A new `analyseDocument` export in `gemini.js` handles per-format file reading (PDF as base64 inline data, Word via mammoth text extraction, text files as strings) and calls Gemini 1.5 Flash independently of the background audit. A new `gemini:analyseDocument` IPC handler in `main.js` guards paths, reads the DB prompt, and delegates to that function. The renderer shows a two-state modal flow driven by `docAnalysisDialog` and `docAnalysisResult` state in `Dashboard.jsx`.

**Tech Stack:** `@google/generative-ai` (already installed), `mammoth` (new dependency for Word extraction), React state + modals, Electron IPC.

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `package.json` | Add `mammoth` dependency |
| Modify | `electron/gemini.js` | Add `analyseDocument` export |
| Modify | `electron/main.js` | Add `gemini:analyseDocument` IPC handler |
| Modify | `electron/preload.js` | Expose `geminiAnalyseDocument` on `window.api` |
| Modify | `src/views/Dashboard.jsx` | State, context menu item, kanban onContextMenu, question modal, result modal, handler |
| Modify | `src/views/Settings.jsx` | Document Analysis Prompt textarea |

---

## Task 1: Install mammoth

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add mammoth to dependencies**

In `package.json`, add to the `"dependencies"` block:

```json
"mammoth": "^1.8.0"
```

The full dependencies block becomes:
```json
"dependencies": {
  "@google/generative-ai": "^0.21.0",
  "better-sqlite3": "^9.4.3",
  "mammoth": "^1.8.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0"
}
```

- [ ] **Step 2: Install**

```bash
npm install
```

Expected: mammoth appears in `node_modules/mammoth/`. The postinstall `electron-rebuild` runs automatically — this is fine, mammoth is pure JS and needs no rebuild.

- [ ] **Step 3: Commit**

```bash
git add DocketOS/package.json DocketOS/package-lock.json
git commit -m "chore: add mammoth dependency for Word document text extraction"
```

---

## Task 2: Add `analyseDocument` to gemini.js

**Files:**
- Modify: `electron/gemini.js`

- [ ] **Step 1: Add mammoth import and analyseDocument export**

Open `electron/gemini.js`. After the existing imports at the top, add the mammoth import:

```js
import mammoth from 'mammoth'
```

Then, after the closing `}` of `getLastResult()` (the last line of the file), add:

```js
const DEFAULT_DOC_ANALYSIS_PROMPT = `You are an assistant helping an engineer analyse project documents.
Answer clearly and professionally. Focus on facts present in the document.
Do not speculate beyond what the document contains.`

export async function analyseDocument({ filePath, question, systemPrompt }) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { success: false, error: 'GEMINI_API_KEY is not set' }

  const prompt = systemPrompt?.trim() || DEFAULT_DOC_ANALYSIS_PROMPT
  const ext = filePath.split('.').pop().toLowerCase()

  let parts
  try {
    if (ext === 'pdf') {
      const data = fs.readFileSync(filePath).toString('base64')
      parts = [
        { inlineData: { mimeType: 'application/pdf', data } },
        { text: question },
      ]
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
    if (err.message?.includes('mammoth') || ext === 'doc' || ext === 'docx') {
      return { success: false, error: 'Could not extract text from this Word document' }
    }
    return { success: false, error: `Could not read file: ${err.message}` }
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { temperature: 0.3 },
      systemInstruction: prompt,
    })
    const result = await model.generateContent({ contents: [{ role: 'user', parts }] })
    return { success: true, result: result.response.text() }
  } catch (err) {
    return { success: false, error: err.message ?? 'Gemini request failed' }
  }
}
```

Note: `fs` is already imported at the top of `gemini.js` — verify this is the case. If not, add `import fs from 'fs'`.

- [ ] **Step 2: Add fs import**

The current `electron/gemini.js` does not import `fs`. Add it at the top alongside the existing imports:

```js
import fs from 'fs'
import mammoth from 'mammoth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getSetting, listRules } from './db.js'
```

Replace the existing two import lines at the top of `gemini.js` with those four lines.

- [ ] **Step 3: Commit**

```bash
git add DocketOS/electron/gemini.js
git commit -m "feat: add analyseDocument export to gemini.js"
```

---

## Task 3: Wire up IPC and preload

**Files:**
- Modify: `electron/main.js` (after the `settings:updatePrompt` handler, around line 1039)
- Modify: `electron/preload.js` (in the Gemini section, after `geminiRunManual`)

- [ ] **Step 1: Import analyseDocument in main.js**

In `electron/main.js`, find the existing gemini import line:

```js
import { init as initGemini, runAnalysis, getLastResult } from './gemini.js'
```

Replace it with:

```js
import { init as initGemini, runAnalysis, getLastResult, analyseDocument } from './gemini.js'
```

- [ ] **Step 2: Add IPC handler in main.js**

Find the `settings:updatePrompt` handler in `electron/main.js`:

```js
ipcMain.handle('settings:updatePrompt', (_e, { prompt }) => {
  upsertSetting('gemini_system_prompt', prompt)
  return { success: true }
})
```

Add the new handler immediately after it:

```js
ipcMain.handle('gemini:analyseDocument', async (_e, { filePath, question }) => {
  if (!isPathInsideActiveProject(filePath)) {
    return { success: false, error: 'File is outside the active project' }
  }
  const systemPrompt = getSetting('gemini_doc_analysis_prompt') ?? ''
  return analyseDocument({ filePath, question, systemPrompt })
})
```

- [ ] **Step 3: Add to preload.js**

In `electron/preload.js`, find the Gemini section:

```js
  // Gemini
  geminiGetLastResult: () => ipcRenderer.invoke('gemini:getLastResult'),
  geminiRunManual:     () => ipcRenderer.invoke('gemini:runManual'),
```

Add the new method:

```js
  // Gemini
  geminiGetLastResult:     () => ipcRenderer.invoke('gemini:getLastResult'),
  geminiRunManual:         () => ipcRenderer.invoke('gemini:runManual'),
  geminiAnalyseDocument: (data) => ipcRenderer.invoke('gemini:analyseDocument', data),
```

- [ ] **Step 4: Build to verify IPC symmetry**

```bash
npm run build
```

Expected: build succeeds with no errors. The `.claude/scripts/check-ipc-symmetry.mjs` hook runs on edit and should report no mismatches.

- [ ] **Step 5: Commit**

```bash
git add DocketOS/electron/main.js DocketOS/electron/preload.js
git commit -m "feat: add gemini:analyseDocument IPC handler and preload binding"
```

---

## Task 4: Document Analysis Prompt in Settings

**Files:**
- Modify: `src/views/Settings.jsx`

- [ ] **Step 1: Add state for doc analysis prompt**

In `src/views/Settings.jsx`, find the existing prompt state (around line 217):

```js
  // Section 1: Gemini prompt
  const [prompt, setPrompt] = useState('')
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptMsg, setPromptMsg] = useState(null)
```

Add beneath it:

```js
  const [docPrompt, setDocPrompt] = useState('')
  const [docPromptSaving, setDocPromptSaving] = useState(false)
  const [docPromptMsg, setDocPromptMsg] = useState(null)
```

- [ ] **Step 2: Load docPrompt from settings**

Find the `settingsGetAll()` `.then` callback (around line 256):

```js
        setPrompt(map.gemini_system_prompt ?? '')
```

Add the line beneath it:

```js
        setPrompt(map.gemini_system_prompt ?? '')
        setDocPrompt(map.gemini_doc_analysis_prompt ?? '')
```

- [ ] **Step 3: Add save handler**

Find `handleSavePrompt` (around line 306):

```js
  async function handleSavePrompt() {
    setPromptSaving(true)
    try {
      await window.api.settingsUpdatePrompt({ prompt })
      showMsg(setPromptMsg, 'ok', 'Saved ✓')
    } catch {
      showMsg(setPromptMsg, 'error', 'Save failed')
    } finally {
      setPromptSaving(false)
    }
  }
```

Add a parallel function immediately after it:

```js
  async function handleSaveDocPrompt() {
    setDocPromptSaving(true)
    try {
      await window.api.settingsUpdateDocPrompt({ prompt: docPrompt })
      showMsg(setDocPromptMsg, 'ok', 'Saved ✓')
    } catch {
      showMsg(setDocPromptMsg, 'error', 'Save failed')
    } finally {
      setDocPromptSaving(false)
    }
  }
```

- [ ] **Step 4: Add IPC handler for saving in main.js**

In `electron/main.js`, directly after the `settings:updatePrompt` handler (which was modified in Task 3), add:

```js
ipcMain.handle('settings:updateDocPrompt', (_e, { prompt }) => {
  upsertSetting('gemini_doc_analysis_prompt', prompt)
  return { success: true }
})
```

- [ ] **Step 5: Expose in preload.js**

In `electron/preload.js`, find the Settings section:

```js
  settingsGetAll:      ()     => ipcRenderer.invoke('settings:getAll'),
  settingsUpdatePrompt:(data) => ipcRenderer.invoke('settings:updatePrompt', data),
```

Add after `settingsUpdatePrompt`:

```js
  settingsGetAll:         ()     => ipcRenderer.invoke('settings:getAll'),
  settingsUpdatePrompt:   (data) => ipcRenderer.invoke('settings:updatePrompt', data),
  settingsUpdateDocPrompt:(data) => ipcRenderer.invoke('settings:updateDocPrompt', data),
```

- [ ] **Step 6: Add textarea UI in Settings.jsx**

Find the section comment and closing tag for Section 1 Gemini System Prompt (around line 508):

```jsx
        </section>

        {/* Section 2: File Routing Rules */}
```

Insert the new section between them:

```jsx
        </section>

        {/* Document Analysis Prompt */}
        <section>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
            Document Analysis Prompt
          </p>
          <p className="text-xs text-text-muted mb-2">
            Primes Gemini before each right-click document analysis. Describe the project type, naming conventions, or what to focus on.
          </p>
          <textarea
            value={docPrompt}
            onChange={e => setDocPrompt(e.target.value)}
            rows={6}
            className="w-full bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent font-mono resize-none"
            placeholder="Prime the AI before each document analysis — e.g. describe the project type, naming conventions, or what to focus on"
          />
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-xs ${docPrompt.length > 3000 ? 'text-status-error' : 'text-text-muted'}`}>
              {docPrompt.length} characters
            </span>
            <button
              onClick={handleSaveDocPrompt}
              disabled={docPromptSaving}
              className="bg-accent hover:bg-accent-hover text-white text-sm rounded-app px-4 py-2 disabled:opacity-50 transition-colors"
            >
              {docPromptSaving ? 'Saving...' : 'Save Prompt'}
            </button>
            {docPromptMsg && (
              <span className={docPromptMsg.type === 'ok' ? 'text-status-ok text-xs' : 'text-status-error text-xs'}>
                {docPromptMsg.text}
              </span>
            )}
          </div>
        </section>

        {/* Section 2: File Routing Rules */}
```

- [ ] **Step 7: Build to verify**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 8: Commit**

```bash
git add DocketOS/src/views/Settings.jsx DocketOS/electron/main.js DocketOS/electron/preload.js
git commit -m "feat: add Document Analysis Prompt setting"
```

---

## Task 5: Add context menu item and kanban right-click

**Files:**
- Modify: `src/views/Dashboard.jsx`

- [ ] **Step 1: Add a helper constant near the top of Dashboard.jsx**

Find the `DEFAULT_CENTER_PANEL_SLOTS` constant near the top of the `Dashboard` function component (around line 115):

```js
const DEFAULT_CENTER_PANEL_SLOTS = ['todo', 'inProgress', 'quickLinks']
```

Add the analysable extensions set immediately before it (outside the component, as a module-level constant):

```js
const ANALYSABLE_EXTS = new Set(['pdf', 'txt', 'md', 'doc', 'docx'])
function isAnalysableEntry(entry) {
  if (!entry || entry.isDirectory) return false
  const ext = entry.name?.split('.').pop()?.toLowerCase()
  return Boolean(ext && ANALYSABLE_EXTS.has(ext))
}
```

- [ ] **Step 2: Add "Analyse with AI" item to the context menu rendering**

Find the folderContextMenu rendering in the JSX (around line 6234). Inside the menu `<div>`, after the last `</button>` (after Rename or Add Quick Link, before the closing `</div>`), add:

```jsx
          {!folderContextMenu.entry?.isDirectory && isAnalysableEntry(folderContextMenu.entry) && (
            <button
              onMouseDown={event => {
                event.preventDefault()
                event.stopPropagation()
                setDocAnalysisDialog({
                  filePath: folderContextMenu.entry.fullPath,
                  fileName: folderContextMenu.entry.name,
                  question: '',
                  length: 'short',
                  loading: false,
                  error: null,
                })
                setFolderContextMenu(null)
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[#1A1A1E] transition"
              style={{ color: '#D4D4D8' }}
            >
              🔍 Analyse with AI
            </button>
          )}
```

- [ ] **Step 3: Add onContextMenu to kanban todo file cards**

Find the kanban todo file cards rendering (around line 5260):

```jsx
                    {key === 'todo' && files.map(entry => (
                      <div
                        key={entry.relativePath ?? entry.name}
                        className="p-3 rounded border hover:border-zinc-600 transition cursor-default"
                        style={S.panel}
                      >
```

Replace that opening `<div>` to add the context menu handler:

```jsx
                    {key === 'todo' && files.map(entry => (
                      <div
                        key={entry.relativePath ?? entry.name}
                        className="p-3 rounded border hover:border-zinc-600 transition cursor-default"
                        style={S.panel}
                        onContextMenu={event => {
                          if (!activeProject?.root_path) return
                          event.preventDefault()
                          event.stopPropagation()
                          const fullPath = `${activeProject.root_path}\\${entry.relativePath.replace(/\//g, '\\')}`
                          setFolderContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            entry: { fullPath, name: entry.name, isDirectory: false },
                            parentPath: null,
                          })
                        }}
                      >
```

- [ ] **Step 4: Add state for the two modals**

Find the `folderEditDialog` state (around line 908):

```js
  const [folderEditDialog, setFolderEditDialog] = useState(null)
```

Add the two new state variables immediately after it:

```js
  const [folderEditDialog, setFolderEditDialog] = useState(null)
  const [docAnalysisDialog, setDocAnalysisDialog] = useState(null)
  const [docAnalysisResult, setDocAnalysisResult] = useState(null)
```

- [ ] **Step 5: Commit**

```bash
git add DocketOS/src/views/Dashboard.jsx
git commit -m "feat: add Analyse with AI context menu item and kanban right-click"
```

---

## Task 6: Build and wire the handleDocAnalyse function

**Files:**
- Modify: `src/views/Dashboard.jsx`

- [ ] **Step 1: Add handleDocAnalyse**

Find `handleReport` (around line 2208) in `Dashboard.jsx`. Add the following function immediately after `handleReport`'s closing brace:

```js
  async function handleDocAnalyse() {
    if (!docAnalysisDialog?.filePath) return
    const lengthInstruction = docAnalysisDialog.length === 'detailed'
      ? '\n\nProvide a detailed, structured response with clear sections and headings.'
      : '\n\nBe concise — one short paragraph.'
    const question = `${docAnalysisDialog.question}${lengthInstruction}`

    setDocAnalysisDialog(prev => ({ ...prev, loading: true, error: null }))
    const res = await window.api.geminiAnalyseDocument({
      filePath: docAnalysisDialog.filePath,
      question,
    })
    if (res.success) {
      setDocAnalysisResult({
        fileName: docAnalysisDialog.fileName,
        filePath: docAnalysisDialog.filePath,
        result: res.result,
        question: docAnalysisDialog.question,
        length: docAnalysisDialog.length,
      })
      setDocAnalysisDialog(null)
    } else {
      setDocAnalysisDialog(prev => ({ ...prev, loading: false, error: res.error ?? 'Analysis failed' }))
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add DocketOS/src/views/Dashboard.jsx
git commit -m "feat: add handleDocAnalyse IPC call and state transitions"
```

---

## Task 7: Add question modal UI

**Files:**
- Modify: `src/views/Dashboard.jsx`

- [ ] **Step 1: Add the question modal to the JSX**

Find the `{folderContextMenu && (` block near the end of the JSX (around line 6234). Add the question modal immediately before it (after any previous modal/overlay block):

```jsx
      {docAnalysisDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div
            className="rounded-lg border shadow-2xl w-[480px] max-w-[90vw] flex flex-col"
            style={{ backgroundColor: '#121214', borderColor: '#1F1F23' }}
          >
            <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: '#1F1F23' }}>
              <p className="text-sm font-semibold" style={{ color: '#E4E4E7' }}>
                🔍 Analyse with AI
              </p>
              <p className="text-xs mt-0.5 truncate" style={{ color: '#71717A' }}>
                {docAnalysisDialog.fileName.length > 50
                  ? `${docAnalysisDialog.fileName.slice(0, 47)}…`
                  : docAnalysisDialog.fileName}
              </p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: '#A1A1AA' }}>
                  What would you like to know?
                </label>
                <textarea
                  autoFocus
                  rows={3}
                  value={docAnalysisDialog.question}
                  onChange={e => setDocAnalysisDialog(prev => ({ ...prev, question: e.target.value }))}
                  disabled={docAnalysisDialog.loading}
                  placeholder="e.g. Summarise this document, or list the key action items"
                  className="w-full rounded border px-3 py-2 text-sm outline-none resize-none"
                  style={{ backgroundColor: '#1A1A1E', borderColor: '#2A2A2E', color: '#E4E4E7' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && docAnalysisDialog.question.trim()) {
                      handleDocAnalyse()
                    }
                  }}
                />
              </div>
              <div>
                <p className="text-xs font-medium mb-1.5" style={{ color: '#A1A1AA' }}>Summary length</p>
                <div className="flex gap-2">
                  {['short', 'detailed'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setDocAnalysisDialog(prev => ({ ...prev, length: opt }))}
                      disabled={docAnalysisDialog.loading}
                      className="px-4 py-1.5 rounded text-xs font-medium transition border"
                      style={{
                        backgroundColor: docAnalysisDialog.length === opt ? S.accent : '#1A1A1E',
                        borderColor: docAnalysisDialog.length === opt ? S.accent : '#2A2A2E',
                        color: docAnalysisDialog.length === opt ? '#fff' : '#A1A1AA',
                      }}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {docAnalysisDialog.error && (
                <p className="text-xs" style={{ color: '#FF453A' }}>{docAnalysisDialog.error}</p>
              )}
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button
                onClick={() => setDocAnalysisDialog(null)}
                disabled={docAnalysisDialog.loading}
                className="px-4 py-1.5 rounded text-xs border transition"
                style={{ backgroundColor: '#1A1A1E', borderColor: '#2A2A2E', color: '#A1A1AA' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDocAnalyse}
                disabled={!docAnalysisDialog.question.trim() || docAnalysisDialog.loading}
                className="px-4 py-1.5 rounded text-xs font-medium transition disabled:opacity-50"
                style={{ backgroundColor: S.accent, color: '#fff' }}
              >
                {docAnalysisDialog.loading ? 'Analysing…' : 'Analyse'}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add DocketOS/src/views/Dashboard.jsx
git commit -m "feat: add document analysis question modal"
```

---

## Task 8: Add result modal UI

**Files:**
- Modify: `src/views/Dashboard.jsx`

- [ ] **Step 1: Add copiedDocResult state**

Find the `docAnalysisResult` state you added in Task 5:

```js
  const [docAnalysisResult, setDocAnalysisResult] = useState(null)
```

Add a copied-label state for the clipboard button:

```js
  const [docAnalysisResult, setDocAnalysisResult] = useState(null)
  const [docResultCopied, setDocResultCopied] = useState(false)
```

- [ ] **Step 2: Add the result modal to the JSX**

Immediately after the `{docAnalysisDialog && (...)}` block you added in Task 7, add:

```jsx
      {docAnalysisResult && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div
            className="rounded-lg border shadow-2xl w-[560px] max-w-[90vw] flex flex-col max-h-[80vh]"
            style={{ backgroundColor: '#121214', borderColor: '#1F1F23' }}
          >
            <div className="px-5 pt-5 pb-3 border-b shrink-0" style={{ borderColor: '#1F1F23' }}>
              <p className="text-sm font-semibold" style={{ color: '#E4E4E7' }}>
                🔍 AI Analysis
              </p>
              <p className="text-xs mt-0.5 truncate" style={{ color: '#71717A' }}>
                {docAnalysisResult.fileName.length > 55
                  ? `${docAnalysisResult.fileName.slice(0, 52)}…`
                  : docAnalysisResult.fileName}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {docAnalysisResult.error ? (
                <p className="text-sm" style={{ color: '#FF453A' }}>{docAnalysisResult.error}</p>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#D4D4D8' }}>
                  {docAnalysisResult.result}
                </p>
              )}
            </div>
            <div className="px-5 pb-5 pt-3 border-t flex justify-between items-center shrink-0" style={{ borderColor: '#1F1F23' }}>
              <div className="flex gap-2">
                {docAnalysisResult.error ? (
                  <button
                    onClick={() => {
                      setDocAnalysisDialog({
                        filePath: docAnalysisResult.filePath,
                        fileName: docAnalysisResult.fileName,
                        question: docAnalysisResult.question,
                        length: docAnalysisResult.length,
                        loading: false,
                        error: null,
                      })
                      setDocAnalysisResult(null)
                    }}
                    className="px-4 py-1.5 rounded text-xs font-medium transition"
                    style={{ backgroundColor: S.accent, color: '#fff' }}
                  >
                    Retry
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(docAnalysisResult.result ?? '')
                      setDocResultCopied(true)
                      setTimeout(() => setDocResultCopied(false), 2000)
                    }}
                    className="px-4 py-1.5 rounded text-xs border transition"
                    style={{ backgroundColor: '#1A1A1E', borderColor: '#2A2A2E', color: '#A1A1AA' }}
                  >
                    {docResultCopied ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                )}
              </div>
              <button
                onClick={() => { setDocAnalysisResult(null); setDocResultCopied(false) }}
                className="px-4 py-1.5 rounded text-xs border transition"
                style={{ backgroundColor: '#1A1A1E', borderColor: '#2A2A2E', color: '#A1A1AA' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: clean build with no errors.

- [ ] **Step 4: Commit**

```bash
git add DocketOS/src/views/Dashboard.jsx
git commit -m "feat: add document analysis result modal with copy and retry"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: all three vite builds succeed (renderer, main, preload).

- [ ] **Step 2: Manual smoke test checklist**

Start the app with `npm run dev` and verify:

1. Right-click a `.pdf` file in the Quick Links panel → "🔍 Analyse with AI" appears; other items (📤 Send to Quick Filing, etc.) also still appear
2. Right-click a folder → "🔍 Analyse with AI" does NOT appear
3. Right-click a `.docx` file → item appears
4. Right-click a `.xlsx` file → item does NOT appear  
5. Click "Analyse with AI" → question modal opens with correct filename shown
6. "Analyse" button is disabled until text is typed
7. Length toggle switches between Short and Detailed with visual feedback
8. Clicking Analyse with no API key shows error in result modal with Retry button
9. Clicking Retry re-opens question modal with same question pre-filled
10. Right-click a kanban todo card → context menu appears with Analyse option for supported types
11. Settings → Engine Backend → "Document Analysis Prompt" section is visible and saves correctly

- [ ] **Step 3: Check IPC symmetry hook output**

```bash
node .claude/scripts/check-ipc-symmetry.mjs
```

Expected: silent output (no mismatches).
