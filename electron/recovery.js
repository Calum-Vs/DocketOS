import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const MAX_RECOVERY_SNAPSHOTS = 30
const RECOVERY_FOLDER_NAME = 'recovery'
const SNAPSHOT_PREFIX = 'docketos-recovery-'

function getRecoveryRoot() {
  return path.join(app.getPath('userData'), RECOVERY_FOLDER_NAME)
}

export function getRecoveryFolderPath() {
  return getRecoveryRoot()
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function normalizeLocalStorageSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, raw]) => [String(key ?? '').trim(), String(raw ?? '')])
      .filter(([key]) => key.startsWith('docketos.'))
  )
}

function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function copyIfExists(sourcePath, destinationPath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
  fs.copyFileSync(sourcePath, destinationPath)
  const stat = fs.statSync(destinationPath)
  return { name: path.basename(destinationPath), sizeBytes: stat.size }
}

function copyDatabaseFiles(dbPath, targetDir) {
  const files = []
  const candidates = [
    { source: dbPath, name: 'project-hub.db' },
    { source: `${dbPath}-wal`, name: 'project-hub.db-wal' },
    { source: `${dbPath}-shm`, name: 'project-hub.db-shm' },
  ]
  for (const candidate of candidates) {
    const copied = copyIfExists(candidate.source, path.join(targetDir, candidate.name))
    if (copied) files.push(copied)
  }
  return files
}

function pruneOldSnapshots(snapshotsRoot) {
  if (!fs.existsSync(snapshotsRoot)) return
  const entries = fs.readdirSync(snapshotsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith(SNAPSHOT_PREFIX))
    .map(entry => entry.name)
    .sort()
  const oldEntries = entries.slice(0, Math.max(0, entries.length - MAX_RECOVERY_SNAPSHOTS))
  for (const name of oldEntries) {
    fs.rmSync(path.join(snapshotsRoot, name), { recursive: true, force: true })
  }
}

function readSnapshotMetadata(snapshotDir) {
  const metadataPath = path.join(snapshotDir, 'recovery-snapshot.json')
  if (!fs.existsSync(metadataPath)) return null
  try {
    const snapshot = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    const stat = fs.statSync(metadataPath)
    return {
      id: path.basename(snapshotDir),
      createdAt: snapshot.createdAt ?? stat.mtime.toISOString(),
      reason: snapshot.reason ?? 'unknown',
      project: snapshot.project ?? null,
      localStorageKeyCount: Object.keys(snapshot.localStorage ?? {}).length,
      databaseFileCount: Array.isArray(snapshot.database?.files) ? snapshot.database.files.length : 0,
      path: snapshotDir,
    }
  } catch {
    return null
  }
}

function getSnapshotDir(snapshotId) {
  const raw = String(snapshotId ?? '').trim()
  if (raw === 'latest') return path.join(getRecoveryRoot(), 'latest')
  if (!raw.startsWith(SNAPSHOT_PREFIX) || raw.includes('/') || raw.includes('\\')) return null
  return path.join(getRecoveryRoot(), 'snapshots', raw)
}

function writeSnapshotFiles(targetDir, payload, dbPath) {
  fs.mkdirSync(targetDir, { recursive: true })
  const dbFiles = copyDatabaseFiles(dbPath, path.join(targetDir, 'database'))
  const snapshot = {
    ...payload,
    database: {
      fileName: 'project-hub.db',
      files: dbFiles,
    },
  }
  writeJsonAtomic(path.join(targetDir, 'recovery-snapshot.json'), snapshot)
  writeJsonAtomic(path.join(targetDir, 'renderer-local-storage.json'), payload.localStorage)
  return snapshot
}

export function createRecoverySnapshot({ dbPath, localStorage, project = null, reason = 'auto' } = {}) {
  const recoveryRoot = getRecoveryRoot()
  const snapshotsRoot = path.join(recoveryRoot, 'snapshots')
  const timestamp = safeTimestamp()
  const snapshotName = `${SNAPSHOT_PREFIX}${timestamp}`
  const snapshotDir = path.join(snapshotsRoot, snapshotName)
  const latestDir = path.join(recoveryRoot, 'latest')
  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    reason: String(reason ?? 'auto'),
    appDataPath: app.getPath('userData'),
    project: project && typeof project === 'object' ? {
      id: project.id ?? null,
      name: project.name ?? null,
      rootPath: project.rootPath ?? null,
      subprojectId: project.subprojectId ?? null,
      subprojectLabel: project.subprojectLabel ?? null,
    } : null,
    localStorage: normalizeLocalStorageSnapshot(localStorage),
  }

  fs.mkdirSync(snapshotsRoot, { recursive: true })
  const snapshot = writeSnapshotFiles(snapshotDir, payload, dbPath)
  fs.rmSync(latestDir, { recursive: true, force: true })
  writeSnapshotFiles(latestDir, payload, dbPath)
  pruneOldSnapshots(snapshotsRoot)

  return {
    recoveryRoot,
    snapshotDir,
    latestDir,
    createdAt: snapshot.createdAt,
    localStorageKeyCount: Object.keys(snapshot.localStorage).length,
    databaseFileCount: snapshot.database.files.length,
  }
}

export function listRecoverySnapshots() {
  const recoveryRoot = getRecoveryRoot()
  const snapshotsRoot = path.join(recoveryRoot, 'snapshots')
  const latest = readSnapshotMetadata(path.join(recoveryRoot, 'latest'))
  const snapshots = fs.existsSync(snapshotsRoot)
    ? fs.readdirSync(snapshotsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith(SNAPSHOT_PREFIX))
      .map(entry => readSnapshotMetadata(path.join(snapshotsRoot, entry.name)))
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    : []

  return { recoveryRoot, latest, snapshots }
}

export function loadRecoverySnapshot({ snapshotId }) {
  const snapshotDir = getSnapshotDir(snapshotId)
  if (!snapshotDir || !fs.existsSync(snapshotDir)) return { success: false, error: 'Recovery snapshot not found' }
  const metadataPath = path.join(snapshotDir, 'recovery-snapshot.json')
  if (!fs.existsSync(metadataPath)) return { success: false, error: 'Recovery snapshot metadata missing' }
  try {
    const snapshot = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    return {
      success: true,
      snapshot: {
        id: path.basename(snapshotDir),
        createdAt: snapshot.createdAt ?? null,
        reason: snapshot.reason ?? 'unknown',
        project: snapshot.project ?? null,
        localStorage: normalizeLocalStorageSnapshot(snapshot.localStorage),
        database: snapshot.database ?? null,
      },
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
