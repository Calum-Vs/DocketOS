import fs from 'fs'
import path from 'path'
import { shell } from 'electron'
import { getSetting, addOutgoingLog } from './db.js'

const OUTGOING_FOLDER_NAME = '04 Outgoing'
const DATA_ROOM_FOLDER_NAME = '05 Data Room'
const FILING_SET_FOLDER_NAMES = ['04 Outgoing', '05 Data Room']

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

function getFilingBaseRoot(activeProjectRoot) {
  if (!activeProjectRoot) return null
  const resolvedRoot = path.resolve(activeProjectRoot)
  return isTechnicalFolderName(path.basename(resolvedRoot))
    ? path.dirname(resolvedRoot)
    : resolvedRoot
}

function directoryHasFilingSet(parentPath) {
  try {
    const names = new Set(
      fs.readdirSync(parentPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => normalizeFolderLabel(entry.name))
    )
    return FILING_SET_FOLDER_NAMES.every(name => names.has(normalizeFolderLabel(name)))
  } catch {
    return false
  }
}

function findFilingDestinationDir(destinationName, baseRoot) {
  const fallbackRoot = path.join(baseRoot, destinationName)
  const targetLabel = normalizeFolderLabel(destinationName)
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
      if (normalizeFolderLabel(entry.name) === targetLabel) {
        matches.push({
          destinationRoot: childPath,
          parentHasFilingSet: directoryHasFilingSet(path.dirname(childPath)),
          depth,
        })
        continue
      }
      if (depth < maxDepth) queue.push({ dirPath: childPath, depth: depth + 1 })
    }
  }

  matches.sort((a, b) => {
    if (a.parentHasFilingSet !== b.parentHasFilingSet) return a.parentHasFilingSet ? -1 : 1
    return a.depth - b.depth
  })

  return matches[0]?.destinationRoot ?? fallbackRoot
}

function findOutgoingDir(baseRoot) {
  return findFilingDestinationDir(OUTGOING_FOLDER_NAME, baseRoot)
}

function findDataRoomDir(baseRoot) {
  const outgoingDir = findOutgoingDir(baseRoot)
  return path.join(path.dirname(outgoingDir), DATA_ROOM_FOLDER_NAME)
}

function findCreateFolderDestinationRoot({ destinationKey, customDestinationPath, baseRoot }) {
  if (destinationKey === 'custom') {
    const customPath = String(customDestinationPath ?? '').trim()
    if (!customPath) return null
    return path.resolve(customPath)
  }
  if (destinationKey === DATA_ROOM_FOLDER_NAME) return findDataRoomDir(baseRoot)
  return findOutgoingDir(baseRoot)
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

function resolveSourcePath(rawSourcePath, activeProjectRoot) {
  return path.isAbsolute(rawSourcePath)
    ? path.resolve(rawSourcePath)
    : path.resolve(activeProjectRoot, rawSourcePath)
}

function fileSourcesIntoFolder(sourcePaths, destinationRoot, mode, activeProjectRoot) {
  const operation = mode === 'move' ? 'move' : 'copy'
  const completed = []
  const files = []
  const paths = Array.isArray(sourcePaths) ? sourcePaths.filter(Boolean) : []

  for (const rawSourcePath of paths) {
    const sourcePath = resolveSourcePath(rawSourcePath, activeProjectRoot)
    if (!fs.existsSync(sourcePath)) throw new Error(`Source not found: ${path.basename(sourcePath)}`)

    const destinationPath = uniqueDestinationPath(path.join(destinationRoot, path.basename(sourcePath)))
    const sourceStat = fs.statSync(sourcePath)
    const sourceKey = path.resolve(sourcePath).toLowerCase()
    const destinationKey = path.resolve(destinationPath).toLowerCase()
    if (sourceStat.isDirectory() && (destinationKey === sourceKey || destinationKey.startsWith(sourceKey + path.sep))) {
      throw new Error(`Cannot file ${path.basename(sourcePath)} into itself`)
    }

    if (operation === 'move') movePath(sourcePath, destinationPath)
    else copyPath(sourcePath, destinationPath)
    completed.push(destinationPath)
    files.push({
      name: path.basename(sourcePath),
      sourcePath,
      destinationPath,
      destinationFolder: destinationRoot,
    })
  }

  return { operation, completed, files }
}

export function setupFilingHandlers(ipcMain, getActiveProjectId, getActiveProjectRoot) {
  ipcMain.handle('filing:createFolder', (_e, { name, sourcePaths, mode, destinationKey, customDestinationPath }) => {
    const activeProjectRoot = getActiveProjectRoot()
    const filingBaseRoot = getFilingBaseRoot(activeProjectRoot)
    const destinationRoot = filingBaseRoot ? findCreateFolderDestinationRoot({ destinationKey, customDestinationPath, baseRoot: filingBaseRoot }) : null
    const templatesDir = getSetting('templates_dir')

    if (!destinationRoot) {
      return { success: false, error: 'Select an active project and filing destination before creating a folder.' }
    }
    if (!isPathInsideRoot(filingBaseRoot, destinationRoot)) {
      return { success: false, error: 'Destination outside filing root' }
    }

    // Format date as YYYY-MM-DD using pure JS
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const datePrefix = `${yyyy}-${mm}-${dd}`

    const folderName = `${datePrefix}_${name}`
    const newFolderPath = path.join(destinationRoot, folderName)

    try {
      fs.mkdirSync(destinationRoot, { recursive: true })
      fs.mkdirSync(newFolderPath, { recursive: true })
    } catch (err) {
      return { success: false, error: `Failed to create folder: ${err.message}` }
    }

    // Find first .xlsx in templates dir and copy it — fully non-fatal
    let templateFile = null
    if (templatesDir && fs.existsSync(templatesDir)) {
      try {
        const entries = fs.readdirSync(templatesDir)
        templateFile = entries.find(f => f.toLowerCase().endsWith('.xlsx')) ?? null
      } catch (err) {
        console.warn('[filing] cannot read templates directory:', err.message)
      }
    }

    if (templateFile) {
      try {
        fs.copyFileSync(
          path.join(templatesDir, templateFile),
          path.join(newFolderPath, templateFile)
        )
      } catch (err) {
        // Non-fatal: folder was created, template copy failed
        console.warn('[filing] template copy failed:', err.message)
      }
    }

    let filed = { operation: mode === 'move' ? 'move' : 'copy', completed: [], files: [] }
    try {
      filed = fileSourcesIntoFolder(sourcePaths, newFolderPath, mode, activeProjectRoot)
    } catch (err) {
      return { success: false, error: `Folder created, but filing failed: ${err.message}`, folderPath: newFolderPath, folderName, filedCount: filed.completed.length, files: filed.files }
    }

    const projectId = getActiveProjectId()
    if (projectId) {
      addOutgoingLog({ projectId, folderName, folderPath: newFolderPath })
    }

    shell.openPath(newFolderPath)

    return { success: true, folderPath: newFolderPath, folderName, filedCount: filed.completed.length, mode: filed.operation, paths: filed.completed, files: filed.files }
  })
}
