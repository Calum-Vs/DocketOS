import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { autoUpdater } from 'electron-updater'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import {
  initDb, listProjects, createProject, updateProjectDetails, ensureProjectByRootPath, listProjectSubprojects, ensureProjectSubproject, updateProjectSubprojectPhase, updateProjectPhase, deleteProject,
  getAllSettings, getSetting, upsertSetting, upsertRule, deleteRule, listRules,
  loadCanvas, saveCanvas,
  listTemplates, upsertTemplate, deleteTemplate,
  listOutgoingLog,
  syncProjectDocumentsFromFiles, listDocuments, getDocumentForProject, listDocumentRevisions,
  searchProject, saveExtractedText,
  getChecklistForDocument, toggleChecklistItem, getChecklistItemForProject,
  listComments, createComment, resolveComment, getCommentForProject,
  upsertSavedView, listSavedViews, createIntakePackage,
  listStandardsRules, generateBriefDraft, getLatestBrief,
  addBackupMetadata, exportProjectData,
  getDatabasePath, checkpointDatabase,
} from './db.js'
import { start as startWatcher, stop as stopWatcher, getLastKanban } from './fileWatcher.js'
import { setupLauncherHandlers } from './launcher.js'
import { setupFilingHandlers } from './filing.js'
import { init as initGemini, runAnalysis, getLastResult, analyseDocument } from './gemini.js'
import { generateReport } from './report.js'
import { createRecoverySnapshot, listRecoverySnapshots, loadRecoverySnapshot } from './recovery.js'

const APP_NAME = 'DocketOS'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow
let documentWindow = null
let activeProjectId = null
let activeProjectRoot = null

const QUICK_FILING_DESTINATIONS = new Set(['04 Outgoing', '05 Data Room'])
const QUICK_FILING_DESTINATION_KEYS = [...QUICK_FILING_DESTINATIONS]
const CLOUD_FS_TIMEOUT_MS = 700
const SEARCH_RESULT_LIMIT = 50
const SKIPPED_READ_DIR_NAMES = new Set(['.git', 'node_modules', '$recycle.bin'])

function getActiveProjectId() { return activeProjectId }
function getActiveProjectRoot() { return activeProjectRoot }

function resolveActiveProjectPath(inputPath) {
  if (!activeProjectRoot || !inputPath) return null
  return path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(activeProjectRoot, inputPath)
}

function isPathInsideActiveProject(inputPath) {
  if (!activeProjectRoot || !inputPath) return false
  const root = path.resolve(activeProjectRoot).toLowerCase()
  const target = path.resolve(inputPath).toLowerCase()
  return target === root || target.startsWith(root + path.sep)
}

function normalizeFolderLabel(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function isTechnicalFolderName(value) {
  const normalized = normalizeFolderLabel(value)
  return /^(\d{1,2})?(technical|techincal)$/.test(normalized)
}

function isPathInsideRoot(rootPath, inputPath) {
  if (!rootPath || !inputPath) return false
  const root = path.resolve(rootPath).toLowerCase()
  const target = path.resolve(inputPath).toLowerCase()
  return target === root || target.startsWith(root + path.sep)
}

function withTimeout(promise, timeoutMs = CLOUD_FS_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ])
}

async function readdirSafe(dirPath) {
  return withTimeout(fs.promises.readdir(dirPath, { withFileTypes: true }))
}

async function statSafe(filePath) {
  return withTimeout(fs.promises.stat(filePath))
}

function shouldSkipReadEntry(entryName) {
  const name = String(entryName ?? '').trim()
  const lower = name.toLowerCase()
  if (!name) return true
  if (name.startsWith('~$')) return true
  if (lower.endsWith('.tmp') || lower.endsWith('.temp')) return true
  if (lower.includes('downloadconflict')) return true
  if (SKIPPED_READ_DIR_NAMES.has(lower)) return true
  return false
}

function getQuickFilingBaseRoot() {
  if (!activeProjectRoot) return null
  const resolvedRoot = path.resolve(activeProjectRoot)
  if (isTechnicalFolderName(path.basename(resolvedRoot))) {
    return path.dirname(resolvedRoot)
  }
  return resolvedRoot
}

function directoryHasQuickFilingSet(parentPath) {
  try {
    const names = new Set(
      fs.readdirSync(parentPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => normalizeFolderLabel(entry.name))
    )
    return QUICK_FILING_DESTINATION_KEYS.every(key => names.has(normalizeFolderLabel(key)))
  } catch {
    return false
  }
}

function findQuickFilingDestinationRoot(destinationKey, baseRoot) {
  const fallbackRoot = path.join(baseRoot, destinationKey)
  const targetLabel = normalizeFolderLabel(destinationKey)
  const matches = []
  const queue = [{ dirPath: baseRoot, depth: 0 }]
  const maxDepth = 4

  while (queue.length) {
    const { dirPath, depth } = queue.shift()
    let entries = []
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const childPath = path.join(dirPath, entry.name)
      const childLabel = normalizeFolderLabel(entry.name)
      if (childLabel === targetLabel) {
        const parentPath = path.dirname(childPath)
        matches.push({
          destinationRoot: childPath,
          parentHasSet: directoryHasQuickFilingSet(parentPath),
          depth,
        })
        continue
      }
      if (depth < maxDepth) queue.push({ dirPath: childPath, depth: depth + 1 })
    }
  }

  matches.sort((a, b) => {
    if (a.parentHasSet !== b.parentHasSet) return a.parentHasSet ? -1 : 1
    return a.depth - b.depth
  })

  return matches[0]?.destinationRoot ?? fallbackRoot
}

function uniqueDestinationPath(destinationPath) {
  if (!fs.existsSync(destinationPath)) return destinationPath
  const dir = path.dirname(destinationPath)
  const ext = path.extname(destinationPath)
  const base = path.basename(destinationPath, ext)
  let index = 1
  let nextPath = path.join(dir, `${base} (${index})${ext}`)
  while (fs.existsSync(nextPath)) {
    index += 1
    nextPath = path.join(dir, `${base} (${index})${ext}`)
  }
  return nextPath
}

function copyPath(sourcePath, destinationPath) {
  const stat = fs.statSync(sourcePath)
  if (stat.isDirectory()) {
    fs.cpSync(sourcePath, destinationPath, { recursive: true, errorOnExist: true, force: false })
  } else {
    fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL)
  }
}

function movePath(sourcePath, destinationPath) {
  try {
    fs.renameSync(sourcePath, destinationPath)
  } catch (err) {
    if (err.code !== 'EXDEV') throw err
    copyPath(sourcePath, destinationPath)
    fs.rmSync(sourcePath, { recursive: true, force: true })
  }
}

function activeProjectOrError(projectId) {
  if (!activeProjectId || !activeProjectRoot) return { error: 'No active project' }
  if (projectId && projectId !== activeProjectId) return { error: 'Project is not active' }
  return { projectId: activeProjectId, rootPath: activeProjectRoot }
}

async function scanFilesForIndex(rootPath, dirPath = rootPath, results = []) {
  let entries
  try { entries = await readdirSafe(dirPath) } catch { return results }
  for (const entry of entries) {
    if (shouldSkipReadEntry(entry.name)) continue
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      await scanFilesForIndex(rootPath, fullPath, results)
      continue
    }
    if (!entry.isFile()) continue
    let stat
    try { stat = await statSafe(fullPath) } catch { continue }
    results.push({
      fullPath,
      relativePath: path.relative(rootPath, fullPath).replace(/\\/g, '/'),
      name: entry.name,
      ext: path.extname(entry.name).toLowerCase(),
      sizeBytes: stat.size,
      mtime: stat.mtime.toISOString(),
    })
  }
  return results
}

function emitDocumentsChanged(projectId = activeProjectId) {
  if (!projectId) return
  for (const window of [mainWindow, documentWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('documents:changed', { projectId })
  }
}

function emitDocumentWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('documents:window-state', { open: Boolean(documentWindow && !documentWindow.isDestroyed()) })
}

function emitActiveViewRefresh() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('view:refreshActive')
}

function emitViewerReset() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('view:resetViewer')
}

function loadRendererWindow(window, query = {}) {
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    window.loadURL(url.toString())
  } else {
    window.loadFile(path.join(__dirname, '../dist/index.html'), { query })
  }
}

function createDocumentWindow() {
  if (documentWindow && !documentWindow.isDestroyed()) {
    documentWindow.focus()
    return documentWindow
  }

  documentWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  documentWindow.setTitle('DocketOS Document Control')
  documentWindow.on('closed', () => {
    documentWindow = null
    emitDocumentWindowState()
  })
  loadRendererWindow(documentWindow, { window: 'document-control' })
  emitDocumentWindowState()
  return documentWindow
}

function createDashboardBoxWindow({ boxKey, slotIndex = 0, title, projectId } = {}) {
  const cleanBoxKey = String(boxKey ?? '').trim()
  if (!cleanBoxKey) return { success: false, error: 'No dashboard box selected' }

  const dashboardBoxWindow = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 520,
    minHeight: 360,
    autoHideMenuBar: true,
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  dashboardBoxWindow.setTitle(String(title ?? 'DocketOS Dashboard Box'))
  dashboardBoxWindow.setMenuBarVisibility(false)
  dashboardBoxWindow.removeMenu()
  dashboardBoxWindow.setAlwaysOnTop(true, 'screen-saver')
  dashboardBoxWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadRendererWindow(dashboardBoxWindow, {
    window: 'dashboard-box',
    boxKey: cleanBoxKey,
    slotIndex: String(Math.max(0, Number(slotIndex) || 0)),
    projectId: projectId ? String(projectId) : '',
  })
  return { success: true }
}

async function indexActiveProjectFiles(projectId = activeProjectId) {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error }
  const files = await scanFilesForIndex(active.rootPath)
  const reconciliation = await syncProjectDocumentsFromFiles(active.projectId, files)
  emitDocumentsChanged(active.projectId)
  return { success: true, count: files.length, ...reconciliation }
}

function destinationForImport(sourcePath, destinationRoot) {
  const sourceName = path.basename(sourcePath)
  return path.join(destinationRoot, sourceName)
}

function preflightImportSources(sourcePaths, destinationRoot) {
  const seenDestinations = new Set()
  return sourcePaths.map(sourcePath => {
    if (!fs.existsSync(sourcePath)) throw new Error(`Source not found: ${sourcePath}`)
    const destinationPath = destinationForImport(sourcePath, destinationRoot)
    const destinationKey = path.resolve(destinationPath).toLowerCase()
    if (!isPathInsideActiveProject(destinationPath)) throw new Error('Destination outside active project root')
    if (seenDestinations.has(destinationKey)) throw new Error(`Duplicate import name: ${path.basename(sourcePath)}`)
    if (fs.existsSync(destinationPath)) throw new Error(`Destination already exists: ${path.basename(sourcePath)}`)
    seenDestinations.add(destinationKey)
    return { sourcePath, destinationPath }
  })
}

function copyImportPlan(plan) {
  const importedPaths = []
  try {
    for (const { sourcePath, destinationPath } of plan) {
      const stat = fs.statSync(sourcePath)
      if (stat.isDirectory()) {
        fs.cpSync(sourcePath, destinationPath, { recursive: true, errorOnExist: true, force: false })
      } else {
        fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL)
      }
      importedPaths.push(destinationPath)
    }
    return importedPaths
  } catch (err) {
    for (const importedPath of importedPaths.reverse()) {
      try { fs.rmSync(importedPath, { recursive: true, force: true }) } catch {}
    }
    throw err
  }
}

function importSourcesIntoProject({ projectId, sourcePaths, method }) {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error }
  if (sourcePaths.length === 0) return { success: false, error: 'No files or folders supplied' }
  const incomingRoot = path.join(active.rootPath, 'incoming')
  try {
    fs.mkdirSync(incomingRoot, { recursive: true })
    const plan = preflightImportSources(sourcePaths, incomingRoot)
    const importedPaths = copyImportPlan(plan)
    createIntakePackage({
      projectId: active.projectId,
      sourcePath: sourcePaths.length === 1 ? sourcePaths[0] : null,
      destinationPath: incomingRoot,
      manifest: { importedPaths, importedAt: new Date().toISOString(), method },
    })
    const indexed = indexActiveProjectFiles(active.projectId)
    emitDocumentsChanged(active.projectId)
    return { success: true, importedCount: importedPaths.length, indexedCount: indexed.count ?? 0 }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function tryExtractPlainText(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const supported = new Set(['.txt', '.md', '.csv', '.json', '.log', '.xml', '.html'])
  if (!supported.has(ext)) return null
  const stat = fs.statSync(filePath)
  if (stat.size > 1024 * 1024 * 2) return null
  return fs.readFileSync(filePath, 'utf8')
}

function deleteProjectById(projectId) {
  const projects = listProjects()
  const selected = projects.find(project => project.id === projectId)
  if (!selected) return { success: false, error: 'Project not found' }

  const wasActive = selected.id === activeProjectId
  deleteProject(selected.id)

  const remaining = listProjects()

  if (!wasActive) {
    const stillActive = remaining.find(project => project.id === activeProjectId)
    if (!stillActive) {
      activeProjectId = null
      activeProjectRoot = null
      stopWatcher()
    }
  } else if (remaining.length > 0) {
    const next = remaining[0]
    activeProjectId = next.id
    activeProjectRoot = next.root_path
    startWatcher(next.root_path, mainWindow, next.id, emitDocumentsChanged)
  } else {
    activeProjectId = null
    activeProjectRoot = null
    stopWatcher()
  }

  const payload = {
    deletedProjectId: selected.id,
    projects: remaining,
    activeProjectId,
  }
  mainWindow.webContents.send('projects:deleted', payload)
  if (documentWindow && !documentWindow.isDestroyed()) {
    const nextActiveProject = activeProjectId
      ? remaining.find(project => project.id === activeProjectId) ?? null
      : null
    documentWindow.webContents.send('projects:activeChanged', nextActiveProject)
  }
  return { success: true, ...payload }
}

function buildAppMenu() {
  const VIEW_HIDDEN_EXTS_KEY = 'view_hidden_extensions'
  const HIDDEN_EXT_PRESETS = ['.bak', '.dwl', '.dwl2', '.tmp']

  function getHiddenExtensions() {
    try {
      const raw = getSetting(VIEW_HIDDEN_EXTS_KEY)
      if (raw === null || raw === undefined) return ['.bak']
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : ['.bak']
    } catch { return ['.bak'] }
  }

  function setHiddenExtensions(exts) {
    upsertSetting(VIEW_HIDDEN_EXTS_KEY, JSON.stringify(exts))
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('view:hiddenExtensionsChanged', exts)
    }
    buildAppMenu()
  }

  const currentHidden = getHiddenExtensions()

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Delete Project...',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('projects:openDeleteModal')
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Settings',
          submenu: [
            {
              label: 'Engine Backend',
              click: () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('settings:openBackend')
                }
              },
            },
          ],
        },
        { type: 'separator' },
        {
          label: 'Export',
          submenu: [
            {
              label: 'Export Canvas as Image',
              click: () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('canvas:triggerExport')
                }
              },
            },
            {
              label: 'Print Report',
              click: () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('report:trigger')
                }
              },
            },
          ],
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Refresh Project Data',
          accelerator: 'CommandOrControl+R',
          click: emitActiveViewRefresh,
        },
        {
          label: 'Reset Viewer',
          click: emitViewerReset,
        },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Hidden Extensions',
          submenu: HIDDEN_EXT_PRESETS.map(ext => ({
            label: ext,
            type: 'checkbox',
            checked: currentHidden.includes(ext),
            click(item) {
              const next = item.checked
                ? [...getHiddenExtensions(), ext]
                : getHiddenExtensions().filter(e => e !== ext)
              setHiddenExtensions(next)
            },
          })),
        },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            manualUpdateCheck = true
            autoUpdater.checkForUpdates().catch(err => {
              manualUpdateCheck = false
              dialog.showErrorBox('Update check failed', err.message ?? String(err))
            })
          },
        },
        { type: 'separator' },
        {
          label: 'Open DocketOS Folder',
          click: () => shell.openPath(path.resolve(__dirname, '..')),
        },
      ],
    },
  ]

  if (process.platform === 'darwin') {
    template.unshift({ role: 'appMenu' })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && !input.shift && input.key?.toLowerCase() === 'r') {
      event.preventDefault()
      emitActiveViewRefresh()
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

setupLauncherHandlers(ipcMain)
setupFilingHandlers(ipcMain, getActiveProjectId, getActiveProjectRoot)

// Dashboard windows

ipcMain.handle('dashboard:openBoxWindow', (_e, payload) => createDashboardBoxWindow(payload))

// Projects

ipcMain.handle('projects:list', () => listProjects())

ipcMain.handle('projects:getActive', () => {
  if (!activeProjectId) return null
  return listProjects().find(project => project.id === activeProjectId) ?? null
})

ipcMain.handle('projects:create', (_e, data) => createProject(data))

ipcMain.handle('projects:update', (_e, data) => {
  const updated = updateProjectDetails(data)
  if (!updated) return { success: false, error: 'Project not found' }
  if (updated.id === activeProjectId) {
    activeProjectRoot = updated.root_path
    startWatcher(updated.root_path, mainWindow, updated.id, emitDocumentsChanged)
    if (documentWindow && !documentWindow.isDestroyed()) {
      documentWindow.webContents.send('projects:activeChanged', updated)
    }
  }
  return { success: true, project: updated }
})

ipcMain.handle('projects:ensureByRootPath', (_e, data) => ensureProjectByRootPath(data))

ipcMain.handle('subprojects:list', (_e, projectId) => listProjectSubprojects(projectId))

ipcMain.handle('subprojects:ensure', (_e, data) => ensureProjectSubproject(data))

ipcMain.handle('subprojects:updatePhase', (_e, { id, phase }) => {
  updateProjectSubprojectPhase(id, phase)
  return { success: true }
})

ipcMain.handle('projects:setActive', (_e, id) => {
  const projects = listProjects()
  const project = projects.find(p => p.id === id)
  if (!project) return { success: false, error: 'Project not found' }
  activeProjectId = project.id
  activeProjectRoot = project.root_path
  startWatcher(project.root_path, mainWindow, project.id, emitDocumentsChanged)
  if (documentWindow && !documentWindow.isDestroyed()) {
    documentWindow.webContents.send('projects:activeChanged', project)
  }
  return { success: true, project }
})

ipcMain.handle('projects:updatePhase', (_e, { id, phase }) => {
  updateProjectPhase(id, phase)
  return { success: true }
})

ipcMain.handle('projects:delete', (_e, { id }) => deleteProjectById(id))

// Kanban

ipcMain.handle('kanban:getColumns', () =>
  getLastKanban() ?? { todo: [], inProgress: [], done: [], unclassified: [] }
)

// File ops

ipcMain.handle('fs:moveFile', (_e, { from, to, confirmed }) => {
  if (!confirmed) return { success: false, error: 'Move not confirmed' }
  if (!activeProjectRoot) return { success: false, error: 'No active project' }
  const safeFrom = resolveActiveProjectPath(from)
  let safeTo = resolveActiveProjectPath(to)
  if (!isPathInsideActiveProject(safeFrom) || !isPathInsideActiveProject(safeTo)) {
    return { success: false, error: 'Path outside active project root' }
  }
  try {
    const toText = String(to ?? '')
    const toLooksLikeFolder = toText.endsWith('/') || toText.endsWith('\\') || path.extname(path.basename(safeTo)) === ''
    if (fs.existsSync(safeTo) && fs.statSync(safeTo).isDirectory()) {
      safeTo = path.join(safeTo, path.basename(safeFrom))
    } else if (toLooksLikeFolder) {
      safeTo = path.join(safeTo, path.basename(safeFrom))
    }
    if (!isPathInsideActiveProject(safeTo)) {
      return { success: false, error: 'Path outside active project root' }
    }
    fs.mkdirSync(path.dirname(safeTo), { recursive: true })
    fs.renameSync(safeFrom, safeTo)
    return { success: true, fullPath: safeTo }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('fs:quickFile', (_e, { sourcePaths, destinationKey, customDestinationPath, mode }) => {
  if (!activeProjectRoot) return { success: false, error: 'No active project' }
  const operation = mode === 'move' ? 'move' : 'copy'
  const paths = Array.isArray(sourcePaths) ? sourcePaths.filter(Boolean) : []
  if (!paths.length) return { success: false, error: 'No files supplied' }

  const filingBaseRoot = getQuickFilingBaseRoot()
  const isCustomDestination = destinationKey === 'custom'
  if (!isCustomDestination && !QUICK_FILING_DESTINATIONS.has(destinationKey)) return { success: false, error: 'Unsupported filing destination' }
  if (isCustomDestination && !String(customDestinationPath ?? '').trim()) return { success: false, error: 'Custom filing path required' }

  const destinationRoot = isCustomDestination
    ? path.resolve(customDestinationPath)
    : findQuickFilingDestinationRoot(destinationKey, filingBaseRoot)
  if (!isPathInsideRoot(filingBaseRoot, destinationRoot)) return { success: false, error: 'Destination outside filing root' }

  const completed = []
  try {
    fs.mkdirSync(destinationRoot, { recursive: true })
    for (const rawSourcePath of paths) {
      const sourcePath = path.resolve(rawSourcePath)
      if (!fs.existsSync(sourcePath)) throw new Error(`Source not found: ${path.basename(sourcePath)}`)
      const destinationPath = uniqueDestinationPath(path.join(destinationRoot, path.basename(sourcePath)))
      if (!isPathInsideRoot(filingBaseRoot, destinationPath)) throw new Error('Destination outside filing root')
      const sourceStat = fs.statSync(sourcePath)
      const sourceKey = path.resolve(sourcePath).toLowerCase()
      const destinationKey = path.resolve(destinationPath).toLowerCase()
      if (sourceStat.isDirectory() && (destinationKey === sourceKey || destinationKey.startsWith(sourceKey + path.sep))) {
        throw new Error(`Cannot file ${path.basename(sourcePath)} into itself`)
      }
      if (operation === 'move') movePath(sourcePath, destinationPath)
      else copyPath(sourcePath, destinationPath)
      completed.push(destinationPath)
    }
    return { success: true, mode: operation, count: completed.length, destinationRoot, paths: completed }
  } catch (err) {
    return { success: false, error: err.message, completed }
  }
})

ipcMain.handle('folder:browse', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Root Folder',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('system:browseFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select Permanent Link File',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('fs:listFolders', async (_e, { dirPath }) => {
  if (!dirPath || !isPathInsideActiveProject(dirPath)) return []
  try {
    const entries = await readdirSafe(dirPath)
    return entries
      .filter(e => e.isDirectory() && !shouldSkipReadEntry(e.name))
      .map(e => ({ name: e.name, fullPath: path.join(dirPath, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
})

ipcMain.handle('fs:saveSummaryDoc', async (_e, { projectName, fileName, summary, question }) => {
  try {
    const docsRoot = app.getPath('documents')
    const safeProject = String(projectName ?? 'Unknown Project').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').replace(/^\.+/, '_') || 'Unknown Project'
    const now = new Date()
    const dd = String(now.getDate()).padStart(2, '0')
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const yy = String(now.getFullYear()).slice(-2)
    const baseName = path.basename(String(fileName ?? 'Document'), path.extname(String(fileName ?? '')))
    const safeName = baseName.replace(/[<>:"/\\|?*]+/g, '_')
    const defaultName = `${dd}.${mm}.${yy} ${safeName} SUMMARY.doc`
    const defaultPath = path.join(docsRoot, 'DocketOS AI', safeProject, defaultName)

    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('No window')

    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save AI Summary',
      defaultPath,
      filters: [{ name: 'Word Document', extensions: ['doc'] }],
    })

    if (canceled || !filePath) return { success: false, canceled: true }

    const outputPath = path.extname(filePath) ? filePath : `${filePath}.doc`
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })

    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(safeName)} Summary</title><style>body{font-family:Calibri,sans-serif;font-size:11pt;margin:2cm}h1{font-size:14pt;color:#1a1a2e}h2{font-size:11pt;color:#444}p{margin:0 0 8pt}pre{font-family:Calibri,sans-serif;white-space:pre-wrap}</style></head><body><h1>${esc(baseName)} — AI Summary</h1><p style="color:#888;font-size:9pt">Generated ${dd}/${mm}/${yy} &nbsp;|&nbsp; DocketOS</p>${question ? `<h2>Question</h2><p>${esc(question)}</p>` : ''}<h2>Summary</h2><pre>${esc(summary)}</pre></body></html>`

    fs.writeFileSync(outputPath, html, 'utf-8')
    return { success: true, outputPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('fs:exportTextFile', async (_e, { defaultFileName, contents }) => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'No window available' }
    const safeName = String(defaultFileName ?? 'DocketOS Export')
      .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
      .replace(/^\.+/, '_')
      .trim() || 'DocketOS Export'
    const baseName = path.basename(safeName, path.extname(safeName)) || 'DocketOS Export'
    const defaultPath = path.join(app.getPath('documents'), `${baseName}.txt`)
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Text File',
      defaultPath,
      filters: [{ name: 'Text File', extensions: ['txt'] }],
    })

    if (canceled || !filePath) return { success: false, canceled: true }

    const outputPath = path.extname(filePath) ? filePath : `${filePath}.txt`
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, String(contents ?? ''), 'utf-8')
    return { success: true, outputPath }
  } catch (err) {
    console.error('Failed to export text file', err)
    return { success: false, error: err.message }
  }
})

async function walkFilesForSearch(dir, rootPath, query, results) {
  if (results.length >= SEARCH_RESULT_LIMIT) return
  let entries
  try { entries = await readdirSafe(dir) } catch { return }
  for (const entry of entries) {
    if (results.length >= SEARCH_RESULT_LIMIT) break
    if (shouldSkipReadEntry(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkFilesForSearch(fullPath, rootPath, query, results)
    } else if (entry.name.toLowerCase().includes(query.toLowerCase())) {
      results.push({ name: entry.name, relativePath: path.relative(rootPath, fullPath), fullPath })
    }
  }
}

ipcMain.handle('fs:searchFiles', async (_e, { rootPath, query }) => {
  if (!rootPath || !query || !query.trim()) return []
  const safe = path.resolve(rootPath)
  if (safe !== activeProjectRoot && !isPathInsideActiveProject(safe)) return []
  const results = []
  await walkFilesForSearch(safe, safe, query.trim(), results)
  return results
})

ipcMain.handle('fs:scanDir', async (_e, { dirPath }) => {
  if (!dirPath || !activeProjectRoot) return []
  const safe = path.resolve(dirPath)
  if (!isPathInsideActiveProject(safe)) return []
  let entries
  try { entries = await readdirSafe(safe) } catch { return [] }
  const results = []
  for (const entry of entries) {
      if (shouldSkipReadEntry(entry.name)) continue
      const fullPath = path.join(safe, entry.name)
      const isDirectory = entry.isDirectory()
      let sizeBytes = 0
      let dev = null
      let ino = null
      let mtime = null
      try {
        const stat = await statSafe(fullPath)
        dev = stat.dev
        ino = stat.ino
        mtime = stat.mtimeMs
        if (!isDirectory) sizeBytes = stat.size
      } catch {}
      results.push({
        name: entry.name,
        fullPath,
        isDirectory,
        ext: isDirectory ? '' : path.extname(entry.name).toLowerCase(),
        sizeBytes,
        dev,
        ino,
        mtime,
      })
  }
  return results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
})

ipcMain.handle('fs:statFile', async (_e, { filePath }) => {
  if (!filePath || !activeProjectRoot) return null
  const safe = path.resolve(filePath)
  if (!isPathInsideActiveProject(safe)) return null
  try {
    const stat = await statSafe(safe)
    return { sizeBytes: stat.isDirectory() ? 0 : stat.size, mtime: stat.mtimeMs }
  } catch {
    return null
  }
})

ipcMain.handle('fs:findEntryByIdentity', async (_e, { rootPath, dev, ino }) => {
  if (!activeProjectRoot || dev === null || dev === undefined || ino === null || ino === undefined) return null
  const safeRoot = path.resolve(rootPath || activeProjectRoot)
  if (!isPathInsideActiveProject(safeRoot)) return null

  async function scan(dirPath) {
    let entries
    try { entries = await readdirSafe(dirPath) } catch { return null }
    for (const entry of entries) {
      if (shouldSkipReadEntry(entry.name)) continue
      const fullPath = path.join(dirPath, entry.name)
      let stat
      try { stat = await statSafe(fullPath) } catch { continue }
      if (stat.dev === dev && stat.ino === ino) {
        return {
          name: entry.name,
          fullPath,
          isDirectory: entry.isDirectory(),
          ext: entry.isDirectory() ? '' : path.extname(entry.name).toLowerCase(),
          sizeBytes: entry.isDirectory() ? 0 : stat.size,
          dev: stat.dev,
          ino: stat.ino,
        }
      }
      if (entry.isDirectory()) {
        const found = await scan(fullPath)
        if (found) return found
      }
    }
    return null
  }

  return scan(safeRoot)
})

// Batched variant: walk the (cloud-backed) tree ONCE and resolve many identities
// at once. The per-identity handler above triggers a full recursive SharePoint
// scan per call; calling it once per quick link spawns N concurrent tree walks
// that stat every file. Always prefer this when resolving more than one entry.
ipcMain.handle('fs:findEntriesByIdentity', async (_e, { rootPath, identities }) => {
  if (!activeProjectRoot) return []
  const list = Array.isArray(identities) ? identities : []
  const remaining = new Map()
  for (const item of list) {
    if (item?.dev === null || item?.dev === undefined || item?.ino === null || item?.ino === undefined) continue
    remaining.set(`${item.dev}:${item.ino}`, true)
  }
  if (remaining.size === 0) return []

  const safeRoot = path.resolve(rootPath || activeProjectRoot)
  if (!isPathInsideActiveProject(safeRoot)) return []

  const found = []
  async function scan(dirPath) {
    if (remaining.size === 0) return
    let entries
    try { entries = await readdirSafe(dirPath) } catch { return }
    for (const entry of entries) {
      if (remaining.size === 0) return
      if (shouldSkipReadEntry(entry.name)) continue
      const fullPath = path.join(dirPath, entry.name)
      let stat
      try { stat = await statSafe(fullPath) } catch { continue }
      const key = `${stat.dev}:${stat.ino}`
      if (remaining.has(key)) {
        remaining.delete(key)
        found.push({
          name: entry.name,
          fullPath,
          isDirectory: entry.isDirectory(),
          ext: entry.isDirectory() ? '' : path.extname(entry.name).toLowerCase(),
          sizeBytes: entry.isDirectory() ? 0 : stat.size,
          dev: stat.dev,
          ino: stat.ino,
        })
      }
      if (entry.isDirectory()) await scan(fullPath)
    }
  }

  await scan(safeRoot)
  return found
})

ipcMain.handle('fs:createFolder', (_e, { parentPath, name }) => {
  if (!activeProjectRoot) return { success: false, error: 'No active project' }
  const safeParent = path.resolve(parentPath)
  const newPath = path.resolve(path.join(parentPath, name))
  if (!isPathInsideActiveProject(safeParent) || !isPathInsideActiveProject(newPath)) {
    return { success: false, error: 'Path outside project root' }
  }
  try {
    fs.mkdirSync(newPath, { recursive: true })
    return { success: true, fullPath: newPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('fs:renameFolder', (_e, { oldPath, newName }) => {
  if (!activeProjectRoot) return { success: false, error: 'No active project' }
  const safeOld = path.resolve(oldPath)
  const newPath = path.resolve(path.join(path.dirname(oldPath), newName))
  if (!isPathInsideActiveProject(safeOld) || !isPathInsideActiveProject(newPath)) {
    return { success: false, error: 'Path outside project root' }
  }
  try {
    fs.renameSync(safeOld, newPath)
    return { success: true, fullPath: newPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('fs:openInExplorer', (_e, { dirPath }) => {
  if (!activeProjectRoot) return { success: false, error: 'No active project' }
  const safe = path.resolve(dirPath)
  if (!isPathInsideActiveProject(safe)) return { success: false, error: 'Path outside project root' }
  shell.openPath(safe)
  return { success: true }
})

ipcMain.handle('fs:showInExplorer', (_e, { filePath }) => {
  if (!activeProjectRoot) return { success: false, error: 'No active project' }
  const safe = path.resolve(filePath)
  if (!isPathInsideActiveProject(safe)) return { success: false, error: 'Path outside project root' }
  shell.showItemInFolder(safe)
  return { success: true }
})

ipcMain.handle('shell:openExternal', (_e, { url }) => {
  const raw = String(url ?? '').trim()
  if (!raw.startsWith('https://')) return { success: false, error: 'Only https URLs allowed' }
  shell.openExternal(raw)
  return { success: true }
})

ipcMain.handle('system:openPath', (_e, { targetPath }) => {
  const rawPath = String(targetPath ?? '').trim()
  if (!rawPath) return { success: false, error: 'Path not found' }
  const safe = path.resolve(rawPath)
  if (!fs.existsSync(safe)) return { success: false, error: 'Path not found' }
  shell.openPath(safe)
  return { success: true }
})

// Document control

ipcMain.handle('documents:openWindow', () => {
  createDocumentWindow()
  return { success: true }
})

ipcMain.handle('documents:closeWindow', () => {
  if (documentWindow && !documentWindow.isDestroyed()) documentWindow.close()
  documentWindow = null
  emitDocumentWindowState()
  return { success: true }
})

ipcMain.handle('documents:isWindowOpen', () => ({ open: Boolean(documentWindow && !documentWindow.isDestroyed()) }))

ipcMain.handle('documents:indexProject', (_e, { projectId } = {}) => indexActiveProjectFiles(projectId))

ipcMain.handle('documents:list', (_e, { projectId }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error, documents: [] }
  return { success: true, documents: listDocuments(active.projectId) }
})

ipcMain.handle('documents:get', (_e, { id }) => {
  const active = activeProjectOrError()
  if (active.error) return { success: false, error: active.error }
  const document = getDocumentForProject(id, active.projectId)
  if (!document) return { success: false, error: 'Document not found' }
  return { success: true, document, revisions: listDocumentRevisions(id) }
})

ipcMain.handle('intake:importFromDialog', async (_e, { projectId }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Files or Folders into Incoming',
    properties: ['openFile', 'openDirectory', 'multiSelections'],
  })
  if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true }
  return importSourcesIntoProject({ projectId: active.projectId, sourcePaths: result.filePaths, method: 'dialog' })
})

ipcMain.handle('intake:importPaths', (_e, { projectId, paths }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error }
  const sourcePaths = Array.isArray(paths) ? paths.filter(Boolean) : []
  return importSourcesIntoProject({ projectId: active.projectId, sourcePaths, method: 'drag-drop' })
})

ipcMain.handle('search:query', (_e, { projectId, query, limit }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error, results: [] }
  return { success: true, results: searchProject({ projectId: active.projectId, query, limit }) }
})

ipcMain.handle('extraction:extractDocument', (_e, { projectId, documentId }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error }
  const document = getDocumentForProject(documentId, active.projectId)
  if (!document) return { success: false, error: 'Document not found' }
  if (!isPathInsideActiveProject(document.full_path)) return { success: false, error: 'Document outside active project root' }
  try {
    const text = tryExtractPlainText(document.full_path)
    if (!text) return { success: false, error: 'No local text extractor available for this file type yet' }
    saveExtractedText({ projectId: active.projectId, documentId, text, method: 'plain-text' })
    return { success: true, characters: text.length }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('checklists:getForDocument', (_e, { projectId, documentId }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error, items: [] }
  const document = getDocumentForProject(documentId, active.projectId)
  if (!document) return { success: false, error: 'Document not found', items: [] }
  return { success: true, items: getChecklistForDocument({ projectId: active.projectId, documentId }) }
})

ipcMain.handle('checklists:toggleItem', (_e, { id, done }) => {
  const active = activeProjectOrError()
  if (active.error) return { success: false, error: active.error }
  const item = getChecklistItemForProject(id, active.projectId)
  if (!item) return { success: false, error: 'Checklist item not found' }
  return { success: true, item: toggleChecklistItem({ id, done }) }
})

ipcMain.handle('comments:list', (_e, { projectId, documentId }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error, comments: [] }
  return { success: true, comments: listComments({ projectId: active.projectId, documentId }) }
})

ipcMain.handle('comments:create', (_e, { projectId, documentId, body }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error }
  if (!String(body ?? '').trim()) return { success: false, error: 'Comment body required' }
  if (documentId && !getDocumentForProject(documentId, active.projectId)) return { success: false, error: 'Document not found' }
  return { success: true, comment: createComment({ projectId: active.projectId, documentId, body: String(body).trim() }) }
})

ipcMain.handle('comments:resolve', (_e, { id }) => {
  const active = activeProjectOrError()
  if (active.error) return { success: false, error: active.error }
  const comment = getCommentForProject(id, active.projectId)
  if (!comment) return { success: false, error: 'Comment not found' }
  return { success: true, comment: resolveComment(id) }
})

ipcMain.handle('savedViews:list', (_e, { projectId }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error, views: [] }
  return { success: true, views: listSavedViews(active.projectId) }
})

ipcMain.handle('savedViews:upsert', (_e, data) => {
  const active = activeProjectOrError(data?.projectId)
  if (active.error) return { success: false, error: active.error }
  try {
    return { success: true, view: upsertSavedView({ ...data, projectId: active.projectId }) }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('standards:checkDocument', (_e, { projectId, documentId }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error, results: [] }
  const document = getDocumentForProject(documentId, active.projectId)
  if (!document) return { success: false, error: 'Document not found', results: [] }
  const rules = listStandardsRules(active.projectId)
  const results = rules.map(rule => {
    let passed = false
    try { passed = new RegExp(rule.pattern, 'i').test(`${document.name} ${document.relative_path}`) } catch {}
    return { id: rule.id, title: rule.title, severity: rule.severity, passed }
  })
  return { success: true, results }
})

ipcMain.handle('briefs:generate', (_e, { projectId }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error }
  return { success: true, brief: generateBriefDraft(active.projectId) }
})

ipcMain.handle('briefs:latest', (_e, { projectId }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error, brief: null }
  return { success: true, brief: getLatestBrief(active.projectId) ?? null }
})

ipcMain.handle('backup:create', (_e, { projectId }) => {
  const active = activeProjectOrError(projectId)
  if (active.error) return { success: false, error: active.error }
  try {
    const exportRoot = path.join(app.getPath('userData'), 'exports')
    fs.mkdirSync(exportRoot, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const exportPath = path.join(exportRoot, `docketos-${active.projectId}-${timestamp}.json`)
    const payload = exportProjectData(active.projectId)
    fs.writeFileSync(exportPath, JSON.stringify(payload, null, 2), 'utf8')
    const sizeBytes = fs.statSync(exportPath).size
    addBackupMetadata({ projectId: active.projectId, pathOnDisk: exportPath, sizeBytes })
    return { success: true, path: exportPath, sizeBytes }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('backup:createRecoverySnapshot', (_e, { localStorage = {}, project = null, reason = 'auto' } = {}) => {
  try {
    checkpointDatabase()
    const snapshot = createRecoverySnapshot({
      dbPath: getDatabasePath(),
      localStorage,
      project,
      reason,
    })
    return { success: true, data: snapshot }
  } catch (err) {
    console.error('Recovery snapshot failed:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('backup:listRecoverySnapshots', () => {
  try {
    return { success: true, data: listRecoverySnapshots() }
  } catch (err) {
    console.error('Recovery snapshot list failed:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('backup:loadRecoverySnapshot', async (_e, { snapshotId } = {}) => {
  const loaded = loadRecoverySnapshot({ snapshotId })
  if (!loaded.success) return loaded
  const createdAt = loaded.snapshot.createdAt
    ? new Date(loaded.snapshot.createdAt).toLocaleString()
    : 'the selected time'
  const projectName = loaded.snapshot.project?.name ? ` for ${loaded.snapshot.project.name}` : ''
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Restore recovery snapshot?',
    message: `Restore Dashboard data${projectName} from ${createdAt}?`,
    detail: 'This will replace current task lists, notes, timesheets, calendar notes, quick links, project info, and other Dashboard data stored in local app state. A before-restore recovery snapshot was saved automatically.',
    buttons: ['Restore', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  })
  if (response !== 0) return { success: false, canceled: true }
  return loaded
})

// Gemini

ipcMain.handle('gemini:getLastResult', () => getLastResult())

ipcMain.handle('gemini:runManual', async () => {
  const kanban = getLastKanban()
  if (!kanban) return [{ status: 'error', message: 'No project active', filePath: null, suggestedPath: null }]
  const allFiles = [
    ...(kanban.todo ?? []), ...(kanban.inProgress ?? []),
    ...(kanban.done ?? []), ...(kanban.unclassified ?? []),
  ]
  return runAnalysis(allFiles)
})

// Settings

ipcMain.handle('settings:getAll', () => ({ settings: getAllSettings(), rules: listRules() }))

ipcMain.handle('view:getHiddenExtensions', () => {
  try {
    const raw = getSetting('view_hidden_extensions')
    if (raw === null || raw === undefined) return ['.bak']
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : ['.bak']
  } catch { return ['.bak'] }
})

ipcMain.handle('settings:updatePrompt', (_e, { prompt }) => {
  upsertSetting('gemini_system_prompt', prompt)
  return { success: true }
})

ipcMain.handle('settings:updateDocPrompt', (_e, { prompt }) => {
  upsertSetting('gemini_doc_analysis_prompt', prompt)
  return { success: true }
})

ipcMain.handle('settings:getTemplateFiles', () => {
  try {
    const raw = getSetting('template_files')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
})

ipcMain.handle('settings:updateTemplateFiles', (_e, { files }) => {
  upsertSetting('template_files', JSON.stringify(files ?? []))
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:templateFilesChanged', files ?? [])
  }
  return { success: true }
})

ipcMain.handle('fs:copyFile', (_e, { from, to, destName }) => {
  if (!to) return { success: false, error: 'No destination' }
  if (!isPathInsideActiveProject(to)) return { success: false, error: 'Destination is outside the active project' }
  const cleanName = destName?.trim()
  if (cleanName && /[\\/]|\.\./.test(cleanName)) return { success: false, error: 'Invalid file name' }
  const fileName = cleanName || path.basename(from)
  const dest = path.resolve(path.join(to, fileName))
  if (!isPathInsideActiveProject(dest)) return { success: false, error: 'Destination escapes project' }
  try {
    const registered = JSON.parse(getSetting('template_files') || '[]')
    if (!registered.some(t => path.resolve(t.path) === path.resolve(from))) {
      return { success: false, error: 'Source is not a registered template file' }
    }
    fs.copyFileSync(from, dest, fs.constants.COPYFILE_EXCL)
    return { success: true, dest }
  } catch (err) {
    if (err.code === 'EEXIST') return { success: false, error: `File already exists: ${fileName}` }
    return { success: false, error: err.message }
  }
})

ipcMain.handle('settings:updateApiKey', (_e, { apiKey }) => {
  upsertSetting('gemini_api_key', apiKey)
  return { success: true }
})

ipcMain.handle('gemini:analyseDocument', async (_e, { filePath, question, model }) => {
  if (!isPathInsideActiveProject(filePath)) {
    return { success: false, error: 'File is outside the active project' }
  }
  const systemPrompt = getSetting('gemini_doc_analysis_prompt') ?? ''
  return analyseDocument({ filePath, question, systemPrompt, model })
})

ipcMain.handle('settings:upsertRule', (_e, rule) => {
  upsertRule(rule)
  return { success: true, rules: listRules() }
})

ipcMain.handle('settings:deleteRule', (_e, { id }) => {
  deleteRule(id)
  return { success: true }
})

const ALLOWED_PATH_KEYS = new Set([
  'launcher_autocad', 'launcher_12d', 'launcher_excel', 'launcher_word',
  'templates_dir', 'outgoing_dir',
])

const PROJECT_INFO_LIST_SETTING_KEYS = {
  councils: 'project_info_councils',
  projectManagers: 'project_info_project_managers',
  waterAuthorities: 'project_info_water_authorities',
}

const SIDE_PANEL_SECTION_KEYS = new Set([
  'launchers', 'folders',
  'template', 'permanentLinks', 'filing', 'gemini', 'calendar',
])

const DEFAULT_RECOVERY_BACKUP_INTERVAL_MINUTES = 10
const MIN_RECOVERY_BACKUP_INTERVAL_MINUTES = 1
const MAX_RECOVERY_BACKUP_INTERVAL_MINUTES = 1440

function normalizeRecoveryBackupIntervalMinutes(value) {
  const minutes = Math.round(Number(value))
  if (!Number.isFinite(minutes)) return DEFAULT_RECOVERY_BACKUP_INTERVAL_MINUTES
  return Math.max(MIN_RECOVERY_BACKUP_INTERVAL_MINUTES, Math.min(MAX_RECOVERY_BACKUP_INTERVAL_MINUTES, minutes))
}

function normalizeSidePanelHiddenSections(value) {
  const source = Array.isArray(value) ? value : []
  const seen = new Set()
  return source
    .map(item => String(item ?? '').trim())
    .filter(item => {
      if (!SIDE_PANEL_SECTION_KEYS.has(item) || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

const DEFAULT_SEQ_COUNCILS = [
  'Brisbane City Council',
  'City of Gold Coast',
  'Ipswich City Council',
  'Lockyer Valley Regional Council',
  'Logan City Council',
  'Moreton Bay City Council',
  'Noosa Shire Council',
  'Redland City Council',
  'Scenic Rim Regional Council',
  'Somerset Regional Council',
  'Sunshine Coast Council',
  'Toowoomba Regional Council',
]

const DEFAULT_SEQ_WATER_AUTHORITIES = [
  'City of Gold Coast',
  'Logan Water',
  'Queensland Urban Utilities',
  'Redland City Council',
  'Seqwater',
  'Toowoomba Regional Council',
  'Unitywater',
]

function mergeStringLists(...lists) {
  const seen = new Set()
  const merged = []
  for (const list of lists) {
    const source = Array.isArray(list) ? list : []
    for (const item of source) {
      const value = String(item ?? '').trim()
      if (!value) continue
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(value)
    }
  }
  return merged
}

function parseStringListSetting(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set()
    return parsed
      .map(item => String(item ?? '').trim())
      .filter(item => {
        if (!item) return false
        const key = item.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  } catch {
    return []
  }
}

function getProjectInfoListsFromSettings() {
  const councils = parseStringListSetting(getSetting(PROJECT_INFO_LIST_SETTING_KEYS.councils))
  const waterAuthorities = parseStringListSetting(getSetting(PROJECT_INFO_LIST_SETTING_KEYS.waterAuthorities))
  return {
    councils: councils.length ? councils : DEFAULT_SEQ_COUNCILS,
    projectManagers: parseStringListSetting(getSetting(PROJECT_INFO_LIST_SETTING_KEYS.projectManagers)),
    waterAuthorities: mergeStringLists(DEFAULT_SEQ_WATER_AUTHORITIES, waterAuthorities),
  }
}

ipcMain.handle('settings:upsertPath', (_e, { key, path: value }) => {
  if (!ALLOWED_PATH_KEYS.has(key) && key !== 'launcher_registry' && !/^launcher_[a-z0-9_-]+$/.test(key)) {
    return { success: false, error: 'Invalid settings key' }
  }
  upsertSetting(key, value)
  if (mainWindow && !mainWindow.isDestroyed() && (key === 'launcher_registry' || /^launcher_[a-z0-9_-]+$/.test(key))) {
    mainWindow.webContents.send('settings:launchersChanged')
  }
  return { success: true }
})

ipcMain.handle('settings:verifyPath', (_e, { path: p }) => {
  return { exists: fs.existsSync(p) }
})

ipcMain.handle('settings:getProjectInfoLists', () => {
  return { success: true, lists: getProjectInfoListsFromSettings() }
})

ipcMain.handle('settings:updateProjectInfoLists', (_e, payload = {}) => {
  const sanitize = value => {
    const source = Array.isArray(value) ? value : []
    const seen = new Set()
    return source
      .map(item => String(item ?? '').trim())
      .filter(item => {
        if (!item) return false
        const key = item.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }

  const next = {
    councils: sanitize(payload.councils),
    projectManagers: sanitize(payload.projectManagers),
    waterAuthorities: sanitize(payload.waterAuthorities),
  }

  upsertSetting(PROJECT_INFO_LIST_SETTING_KEYS.councils, JSON.stringify(next.councils))
  upsertSetting(PROJECT_INFO_LIST_SETTING_KEYS.projectManagers, JSON.stringify(next.projectManagers))
  upsertSetting(PROJECT_INFO_LIST_SETTING_KEYS.waterAuthorities, JSON.stringify(next.waterAuthorities))

  return { success: true, lists: next }
})

ipcMain.handle('settings:updateSidePanelVisibility', (_e, { hiddenSections } = {}) => {
  const next = normalizeSidePanelHiddenSections(hiddenSections)
  upsertSetting('dashboard_side_panel_hidden_sections', JSON.stringify(next))
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:sidePanelVisibilityChanged', next)
  }
  return { success: true, hiddenSections: next }
})

ipcMain.handle('settings:updateRecoveryBackupInterval', (_e, { minutes } = {}) => {
  const next = normalizeRecoveryBackupIntervalMinutes(minutes)
  upsertSetting('recovery_backup_interval_minutes', String(next))
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:recoveryBackupIntervalChanged', next)
  }
  return { success: true, minutes: next }
})

// Canvas

ipcMain.handle('canvas:load', (_e, payload) => loadCanvas(payload))

ipcMain.handle('canvas:save', (_e, payload) => saveCanvas(payload))

ipcMain.handle('canvas:exportImage', async (_e, { bounds, suggestedName = 'Canvas Export' }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'No window' }
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Canvas as Image',
    defaultPath: suggestedName,
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  })
  if (canceled || !filePath) return { success: false, canceled: true }
  try {
    const image = await mainWindow.webContents.capturePage({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    })
    fs.writeFileSync(filePath, image.toPNG())
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Templates

ipcMain.handle('templates:list', () => listTemplates())

ipcMain.handle('templates:upsert', (_e, data) => upsertTemplate(data))

ipcMain.handle('templates:delete', (_e, { id }) => {
  deleteTemplate(id)
  return { success: true }
})

ipcMain.handle('templates:browseFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Template File',
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('templates:openFile', (_e, { id }) => {
  if (!activeProjectRoot) return { success: false, error: 'No active project' }
  const templates = listTemplates()
  const tpl = templates.find(t => t.id === id)
  if (!tpl) return { success: false, error: 'Template not found' }
  if (!fs.existsSync(tpl.file_path)) return { success: false, error: 'Template file not found on disk' }
  const filename = path.basename(tpl.file_path)
  const dest = path.join(activeProjectRoot, filename)
  if (fs.existsSync(dest)) return { success: false, error: `File already exists: ${filename}` }
  try {
    fs.copyFileSync(tpl.file_path, dest)
    shell.openPath(dest)
    return { success: true, dest }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Outgoing log

ipcMain.handle('outgoing:list', (_e, { projectId }) => listOutgoingLog(projectId))

// Report

ipcMain.handle('report:generate', (_e, { projectId, projectInfo = {}, calendarNotes = {}, timelineItems = [], timesheetEntries = [], projectTasks = [], noteSectionsByScope = {}, plainNotesByBox = {} }) => {
  const tmpPath = generateReport(projectId, { projectInfo, calendarNotes, timelineItems, timesheetEntries, projectTasks, noteSectionsByScope, plainNotesByBox })
  if (!tmpPath) return { success: false, error: 'Project not found' }
  const reportWin = new BrowserWindow({
    width: 1100,
    height: 900,
    title: 'Project Report',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  reportWin.loadFile(tmpPath)
  return { success: true }
})

// Bootstrap

initDb()

app.setName(APP_NAME)

// true while the user manually triggered a check. Electron-updater de-dupes overlapping
// startup/manual checks, so this shows the next terminal check result as the manual answer.
// The GitHub repo is public, so the updater reads latest.yml + the installer anonymously.
// Do NOT add a token or `private: true` here — a client token in a public repo is a leak.
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'calumplinsell-dot',
  repo: 'DocketOS',
})

let manualUpdateCheck = false

autoUpdater.on('update-available', info => {
  if (!manualUpdateCheck) return
  manualUpdateCheck = false
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update available',
    message: `Version ${info.version} is available and downloading in the background. You'll be prompted to restart when it's ready.`,
    buttons: ['OK'],
  })
})

autoUpdater.on('update-not-available', info => {
  if (!manualUpdateCheck) return
  manualUpdateCheck = false
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Up to date',
    message: `DocketOS ${info.version} is the latest version.`,
    buttons: ['OK'],
  })
})

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update ready',
    message: 'A new version has been downloaded. Restart DocketOS to apply it.',
    buttons: ['Restart now', 'Later'],
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall()
  })
})

autoUpdater.on('error', err => {
  if (!manualUpdateCheck) return
  manualUpdateCheck = false
  dialog.showErrorBox('Update check failed', err.message ?? String(err))
})

app.whenReady().then(() => {
  createWindow()
  buildAppMenu()
  initGemini(mainWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
