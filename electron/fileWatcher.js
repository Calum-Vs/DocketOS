import fs from 'fs'
import path from 'path'
import { resetState as resetGeminiState } from './gemini.js'
import { syncProjectDocumentsFromFiles } from './db.js'

let watcher = null
let debounceTimer = null
let activeRootPath = null
let activeMainWindow = null
let activeProjectId = null
let activeDocumentsChanged = null
let lastKanban = null
let scanInProgress = false
let scanQueued = false

const WATCHER_DEBOUNCE_MS = 2000
const CLOUD_STAT_TIMEOUT_MS = 500
const SKIPPED_DIR_NAMES = new Set(['.git', 'node_modules', '$recycle.bin'])

// ─── Public API ──────────────────────────────────────────────────────────────

export function start(rootPath, mainWindow, projectId = null, onDocumentsChanged = null) {
  stop()
  resetGeminiState()

  activeRootPath = rootPath
  activeMainWindow = mainWindow
  activeProjectId = projectId
  activeDocumentsChanged = onDocumentsChanged

  if (!fs.existsSync(rootPath)) {
    console.error('[fileWatcher] root path does not exist:', rootPath)
    return
  }

  watcher = fs.watch(rootPath, { recursive: true }, () => requestScan(WATCHER_DEBOUNCE_MS))

  // Fire async scan without blocking the IPC call that started us
  requestScan(0)

  console.log('[fileWatcher] watching', rootPath)
}

export function stop() {
  if (watcher) { watcher.close(); watcher = null }
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
  activeDocumentsChanged = null
  scanInProgress = false
  scanQueued = false
}

export function getLastKanban() {
  return lastKanban
}

// ─── Internal ────────────────────────────────────────────────────────────────

// stat with a timeout so cloud-only OneDrive/SharePoint files don't block forever
function statSafe(fullPath) {
  return Promise.race([
    fs.promises.stat(fullPath),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), CLOUD_STAT_TIMEOUT_MS)),
  ])
}

function shouldSkipEntry(entryName) {
  const name = String(entryName ?? '').trim()
  const lower = name.toLowerCase()
  if (!name) return true
  if (name.startsWith('~$')) return true
  if (lower.endsWith('.tmp') || lower.endsWith('.temp')) return true
  if (lower.includes('downloadconflict')) return true
  if (SKIPPED_DIR_NAMES.has(lower)) return true
  return false
}

function requestScan(delayMs = WATCHER_DEBOUNCE_MS) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runScan, delayMs)
}

async function runScan() {
  if (scanInProgress) {
    scanQueued = true
    return
  }
  scanInProgress = true
  try {
    await scanAndEmit()
  } catch (err) {
    console.warn('[fileWatcher] scan failed:', err?.message ?? err)
  } finally {
    scanInProgress = false
    if (scanQueued) {
      scanQueued = false
      requestScan(WATCHER_DEBOUNCE_MS)
    }
  }
}

async function scanAndEmit() {
  const rootPath = activeRootPath
  const mainWindow = activeMainWindow
  const projectId = activeProjectId
  if (!rootPath || !mainWindow || mainWindow.isDestroyed()) return

  const files = await scanDir(rootPath, rootPath)

  if (rootPath !== activeRootPath || !mainWindow || mainWindow.isDestroyed()) return

  const kanban = { todo: [], inProgress: [], done: [], unclassified: [] }

  for (const file of files) {
    const rp = file.relativePath
    if (rp.startsWith('incoming/') || rp.startsWith('inbox/')) {
      kanban.todo.push(file)
    } else if (rp.startsWith('wip/') || rp.startsWith('in-progress/')) {
      kanban.inProgress.push(file)
    } else if (
      rp.startsWith('outgoing/') ||
      rp.startsWith('issued/') ||
      rp.startsWith('archive/')
    ) {
      kanban.done.push(file)
    } else {
      kanban.unclassified.push(file)
    }
  }

  lastKanban = kanban

  mainWindow.webContents.send('kanban:update', kanban)
  await indexDocuments(projectId, rootPath, files)
}

async function indexDocuments(projectId, rootPath, files) {
  if (!projectId || !rootPath) return
  await syncProjectDocumentsFromFiles(projectId, files.map(file => ({
    projectId,
    relativePath: file.relativePath,
    fullPath: path.join(rootPath, file.relativePath),
    name: file.name,
    ext: file.ext,
    sizeBytes: file.sizeBytes,
    mtime: file.mtime,
  })))
  if (activeDocumentsChanged) {
    activeDocumentsChanged(projectId)
  } else if (activeMainWindow && !activeMainWindow.isDestroyed()) {
    activeMainWindow.webContents.send('documents:changed', { projectId })
  }
}

async function scanDir(dirPath, rootPath, results = []) {
  let entries
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      await scanDir(fullPath, rootPath, results)
    } else if (entry.isFile()) {
      const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/')
      const subfolder = relativePath.split('/').length > 1 ? relativePath.split('/')[0] : ''
      let sizeBytes = 0
      let mtime = null
      try {
        const stat = await statSafe(fullPath)
        sizeBytes = stat.size
        mtime = stat.mtime.toISOString()
      } catch {}
      results.push({
        name: entry.name,
        ext: path.extname(entry.name).toLowerCase(),
        relativePath,
        sizeBytes,
        mtime,
        subfolder,
      })
    }
  }
  return results
}
