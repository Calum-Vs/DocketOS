import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'

let db = null
let dbPath = null

export function initDb() {
  dbPath = path.join(app.getPath('userData'), 'project-hub.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.transaction(() => {
  // One-shot migrations: drop old phase_notes (data explicitly discarded), and drop
  // the previously-unused canvas_notes stub if it still has the pre-canvas schema.
  // After this runs once, the CREATE TABLE IF NOT EXISTS below sets up the new schema.
  db.exec('DROP TABLE IF EXISTS phase_notes')
  const canvasTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='canvas_notes'"
  ).get()
  if (canvasTable) {
    const cols = db.prepare('PRAGMA table_info(canvas_notes)').all()
    const hasSubprojectId = cols.some(c => c.name === 'subproject_id')
    if (!hasSubprojectId) {
      db.exec('DROP TABLE IF EXISTS canvas_notes')
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT,
      root_path     TEXT NOT NULL,
      current_phase TEXT DEFAULT 'masterplan'
    );

    CREATE TABLE IF NOT EXISTS canvas_notes (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      subproject_id TEXT,
      phase         TEXT,
      content_json  TEXT NOT NULL DEFAULT '{"boxes":[],"connections":[],"pan":{"x":0,"y":0}}',
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_unique_scope
      ON canvas_notes(project_id, IFNULL(subproject_id, ''), IFNULL(phase, ''));

    CREATE TABLE IF NOT EXISTS project_subprojects (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      subproject_path TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      current_phase TEXT DEFAULT 'masterplan',
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_subprojects_unique
      ON project_subprojects(project_id, subproject_path);

    CREATE TABLE IF NOT EXISTS templates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      file_path  TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS outgoing_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      folder_name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS backend_rules (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      extension        TEXT NOT NULL,
      regex_pattern    TEXT NOT NULL,
      target_subfolder TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      relative_path TEXT NOT NULL,
      full_path     TEXT NOT NULL,
      name          TEXT NOT NULL,
      ext           TEXT,
      size_bytes    INTEGER NOT NULL DEFAULT 0,
      mtime         TEXT,
      family_key    TEXT NOT NULL,
      revision      TEXT,
      status        TEXT NOT NULL DEFAULT 'indexed',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(project_id, relative_path)
    );

    CREATE INDEX IF NOT EXISTS idx_documents_project_family
      ON documents(project_id, family_key);

    CREATE TABLE IF NOT EXISTS document_revisions (
      id          TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      revision    TEXT,
      file_hash   TEXT,
      file_path   TEXT NOT NULL,
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      mtime       TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_revisions_unique
      ON document_revisions(document_id, file_path, IFNULL(revision, ''));

    CREATE TABLE IF NOT EXISTS checklist_templates (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      items_json  TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
      label       TEXT NOT NULL,
      done        INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS review_comments (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
      body        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS intake_packages (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_path   TEXT,
      destination_path TEXT,
      status        TEXT NOT NULL DEFAULT 'processed',
      manifest_json TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS saved_views (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      view_type   TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS document_text_content (
      document_id       TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      extracted_text    TEXT NOT NULL,
      extraction_method TEXT NOT NULL,
      extracted_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS standards_rules (
      id          TEXT PRIMARY KEY,
      project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      pattern     TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'major',
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS brief_drafts (
      id           TEXT PRIMARY KEY,
      project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      content_json TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS backup_metadata (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path_on_disk TEXT NOT NULL,
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'created',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      project_id UNINDEXED,
      source_type UNINDEXED,
      source_id UNINDEXED,
      title,
      body,
      metadata
    );
  `)

  const seedChecklist = db.prepare('INSERT OR IGNORE INTO checklist_templates (id, name, description, items_json) VALUES (?, ?, ?, ?)')
  seedChecklist.run(
    'default-document-review',
    'Default Document Review',
    'Baseline engineering document QA checks',
    JSON.stringify(['Revision identified', 'Document title clear', 'Status assigned', 'Reviewed for issue', 'Comments resolved'])
  )

  const seedStandard = db.prepare('INSERT OR IGNORE INTO standards_rules (id, project_id, title, pattern, severity) VALUES (?, NULL, ?, ?, ?)')
  seedStandard.run('filename-revision-standard', 'Filename includes a revision marker', '(rev|revision|r\\d+|p\\d+|[ _-]r[a-z0-9]+)', 'major')

  const seedSettings = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  const seedMany = db.transaction((rows) => {
    for (const [key, value] of rows) seedSettings.run(key, value)
  })

  seedMany([
    ['gemini_system_prompt', 'You are a strict engineering file structure auditor...'],
    ['launcher_autocad', 'C:\\Program Files\\Autodesk\\AutoCAD 2024\\acad.exe'],
    ['launcher_12d', 'C:\\Program Files\\12d\\12dmodel\\12d.exe'],
    ['launcher_excel', 'C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE'],
    ['launcher_word', 'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE'],
    ['launcher_registry', JSON.stringify([
      { id: 'autocad', label: 'AutoCAD', pathKey: 'launcher_autocad' },
      { id: '12d', label: '12D Model', pathKey: 'launcher_12d' },
      { id: 'excel', label: 'Excel', pathKey: 'launcher_excel' },
      { id: 'word', label: 'Word', pathKey: 'launcher_word' },
    ])],
    ['templates_dir', 'C:\\CompanyTemplates'],
    ['outgoing_dir', ''],
  ])
  })()

  console.log('[db] initialised at', dbPath)
}

export function getDb() { return db }

export function getDatabasePath() {
  return dbPath ?? path.join(app.getPath('userData'), 'project-hub.db')
}

export function checkpointDatabase() {
  if (!db) return
  db.pragma('wal_checkpoint(FULL)')
}

// Projects

export function listProjects() {
  return db.prepare('SELECT * FROM projects ORDER BY name').all()
}

export function getProjectByRootPath(rootPath) {
  return db.prepare('SELECT * FROM projects WHERE root_path = ?').get(rootPath)
}

export function createProject(data) {
  const { name, description = null, root_path } = data
  const id = randomUUID()
  db.prepare(
    'INSERT INTO projects (id, name, description, root_path) VALUES (?, ?, ?, ?)'
  ).run(id, name, description, root_path)
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
}

export function updateProjectDetails({ id, name, description = null, root_path }) {
  db.prepare(
    'UPDATE projects SET name = ?, description = ?, root_path = ? WHERE id = ?'
  ).run(name, description, root_path, id)
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
}

export function ensureProjectByRootPath({ root_path, name, description = null }) {
  const existing = getProjectByRootPath(root_path)
  if (existing) return existing
  return createProject({
    name: name || path.basename(root_path),
    description,
    root_path,
  })
}

export function getProjectSubprojectByPath(projectId, subprojectPath) {
  return db.prepare(
    'SELECT * FROM project_subprojects WHERE project_id = ? AND subproject_path = ?'
  ).get(projectId, subprojectPath)
}

export function listProjectSubprojects(projectId) {
  return db.prepare(
    'SELECT * FROM project_subprojects WHERE project_id = ? ORDER BY display_name ASC'
  ).all(projectId)
}

export function ensureProjectSubproject({ projectId, subprojectPath, displayName }) {
  const existing = getProjectSubprojectByPath(projectId, subprojectPath)
  if (existing) return existing

  const id = randomUUID()
  db.prepare(
    'INSERT INTO project_subprojects (id, project_id, subproject_path, display_name) VALUES (?, ?, ?, ?)'
  ).run(id, projectId, subprojectPath, displayName)
  return db.prepare('SELECT * FROM project_subprojects WHERE id = ?').get(id)
}

export function updateProjectSubprojectPhase(id, phase) {
  db.prepare('UPDATE project_subprojects SET current_phase = ? WHERE id = ?').run(phase, id)
}

export function updateProjectPhase(id, phase) {
  db.prepare('UPDATE projects SET current_phase = ? WHERE id = ?').run(phase, id)
}

export function deleteProject(id) {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

// Templates

export function listTemplates() {
  return db.prepare('SELECT * FROM templates ORDER BY sort_order ASC, name ASC').all()
}

export function upsertTemplate({ id, name, filePath, sortOrder = 0 }) {
  if (!id) {
    db.prepare(
      'INSERT INTO templates (name, file_path, sort_order) VALUES (?, ?, ?)'
    ).run(name, filePath, sortOrder)
    return db.prepare('SELECT * FROM templates WHERE rowid = last_insert_rowid()').get()
  } else {
    db.prepare(
      'UPDATE templates SET name = ?, file_path = ?, sort_order = ? WHERE id = ?'
    ).run(name, filePath, sortOrder, id)
    return db.prepare('SELECT * FROM templates WHERE id = ?').get(id)
  }
}

export function deleteTemplate(id) {
  db.prepare('DELETE FROM templates WHERE id = ?').run(id)
}

// Outgoing Log

export function addOutgoingLog({ projectId, folderName, folderPath }) {
  db.prepare(
    'INSERT INTO outgoing_log (project_id, folder_name, folder_path) VALUES (?, ?, ?)'
  ).run(projectId, folderName, folderPath)
}

export function listOutgoingLog(projectId) {
  return db.prepare(
    'SELECT * FROM outgoing_log WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId)
}

// Settings

export function getAllSettings() {
  return db.prepare('SELECT key, value FROM settings').all()
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : null
}

export function upsertSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

// Rules

export function listRules() {
  return db.prepare('SELECT * FROM backend_rules').all()
}

export function upsertRule({ id, extension, regex_pattern, target_subfolder }) {
  if (id == null) {
    db.prepare(
      'INSERT INTO backend_rules (extension, regex_pattern, target_subfolder) VALUES (?, ?, ?)'
    ).run(extension, regex_pattern, target_subfolder)
  } else {
    db.prepare(
      'UPDATE backend_rules SET extension = ?, regex_pattern = ?, target_subfolder = ? WHERE id = ?'
    ).run(extension, regex_pattern, target_subfolder, id)
  }
}

export function deleteRule(id) {
  db.prepare('DELETE FROM backend_rules WHERE id = ?').run(id)
}

// Canvas Notes

export function loadCanvas({ projectId, subprojectId = null, phase = null }) {
  let row = db.prepare(
    `SELECT * FROM canvas_notes
     WHERE project_id = ?
       AND IFNULL(subproject_id, '') = IFNULL(?, '')
       AND IFNULL(phase, '') = IFNULL(?, '')`
  ).get(projectId, subprojectId, phase)

  if (!row) {
    const id = randomUUID()
    db.prepare(
      'INSERT INTO canvas_notes (id, project_id, subproject_id, phase) VALUES (?, ?, ?, ?)'
    ).run(id, projectId, subprojectId, phase)
    row = db.prepare('SELECT * FROM canvas_notes WHERE id = ?').get(id)
  }

  try {
    return { id: row.id, content: JSON.parse(row.content_json) }
  } catch {
    const content = { boxes: [], connections: [], pan: { x: 0, y: 0 } }
    db.prepare(
      'UPDATE canvas_notes SET content_json = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(content), new Date().toISOString(), row.id)
    return { id: row.id, content, repaired: true }
  }
}

export function saveCanvas({ id, content }) {
  const json = JSON.stringify(content)
  const updated_at = new Date().toISOString()
  db.prepare(
    'UPDATE canvas_notes SET content_json = ?, updated_at = ? WHERE id = ?'
  ).run(json, updated_at, id)
  return { ok: true, updated_at }
}

export function listAllCanvases(projectId) {
  return db.prepare(
    'SELECT * FROM canvas_notes WHERE project_id = ? ORDER BY subproject_id, phase'
  ).all(projectId)
}

// Document Control

function nowIso() {
  return new Date().toISOString()
}

function parseRevision(name) {
  const base = path.basename(name, path.extname(name))
  const match = base.match(/(?:^|[\s_-])(?:rev(?:ision)?[\s_-]*|r|p)([a-z0-9]+)(?:$|[\s_.-])/i)
  return match ? match[1].toUpperCase() : null
}

function familyKeyFor(name) {
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  return base
    .replace(/(?:^|[\s_-])(?:rev(?:ision)?[\s_-]*|r|p)[a-z0-9]+(?:$|[\s_.-])/ig, ' ')
    .replace(/[^a-z0-9]+/ig, ' ')
    .trim()
    .toLowerCase() || base.toLowerCase()
}

function replaceSearchEntry({ projectId, sourceType, sourceId, title, body = '', metadata = '' }) {
  db.prepare('DELETE FROM search_index WHERE source_type = ? AND source_id = ?').run(sourceType, sourceId)
  db.prepare(
    'INSERT INTO search_index (project_id, source_type, source_id, title, body, metadata) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(projectId, sourceType, sourceId, title ?? '', body ?? '', metadata ?? '')
}

export function upsertDocumentFromFile({ projectId, relativePath, fullPath, name, ext, sizeBytes = 0, mtime = null, metadata = {} }) {
  const revision = parseRevision(name)
  const familyKey = familyKeyFor(name)
  const updatedAt = nowIso()
  const existing = db.prepare(
    'SELECT * FROM documents WHERE project_id = ? AND relative_path = ?'
  ).get(projectId, relativePath)

  let documentId = existing?.id
  if (!documentId) {
    documentId = randomUUID()
    db.prepare(
      `INSERT INTO documents (id, project_id, relative_path, full_path, name, ext, size_bytes, mtime, family_key, revision, metadata_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(documentId, projectId, relativePath, fullPath, name, ext, sizeBytes, mtime, familyKey, revision, JSON.stringify(metadata), updatedAt)
  } else {
    db.prepare(
      `UPDATE documents
       SET full_path = ?, name = ?, ext = ?, size_bytes = ?, mtime = ?, family_key = ?, revision = ?, metadata_json = ?, updated_at = ?
       WHERE id = ?`
    ).run(fullPath, name, ext, sizeBytes, mtime, familyKey, revision, JSON.stringify({ ...(JSON.parse(existing.metadata_json || '{}')), ...metadata }), updatedAt, documentId)
  }

  db.prepare(
    `INSERT OR IGNORE INTO document_revisions (id, document_id, project_id, revision, file_path, size_bytes, mtime)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), documentId, projectId, revision, fullPath, sizeBytes, mtime)
  db.prepare(
    `UPDATE document_revisions
     SET size_bytes = ?, mtime = ?
     WHERE document_id = ? AND file_path = ? AND IFNULL(revision, '') = IFNULL(?, '')`
  ).run(sizeBytes, mtime, documentId, fullPath, revision)

  const doc = getDocument(documentId)
  replaceSearchEntry({
    projectId,
    sourceType: 'document',
    sourceId: documentId,
    title: doc.name,
    body: `${doc.relative_path} ${doc.family_key} ${doc.revision ?? ''}`,
    metadata: doc.metadata_json,
  })
  // Checklists are created lazily by getChecklistForDocument when a document is
  // actually opened — do NOT create them here, or a first-time bulk index of a
  // large (SharePoint) project doubles its SQL volume and freezes the main process.
  return doc
}

const INDEX_BATCH_SIZE = 200

export async function syncProjectDocumentsFromFiles(projectId, files) {
  const normalizedFiles = Array.isArray(files) ? files.filter(file => file?.relativePath) : []
  const existingRows = db.prepare(
    'SELECT relative_path, full_path, name, ext, size_bytes, mtime FROM documents WHERE project_id = ?'
  ).all(projectId)
  const existingByPath = new Map(existingRows.map(row => [row.relative_path, row]))
  const changedFiles = normalizedFiles.filter(file => {
    const existing = existingByPath.get(file.relativePath)
    if (!existing) return true
    return String(existing.full_path ?? '') !== String(file.fullPath ?? '')
      || String(existing.name ?? '') !== String(file.name ?? '')
      || String(existing.ext ?? '') !== String(file.ext ?? '')
      || Number(existing.size_bytes ?? 0) !== Number(file.sizeBytes ?? 0)
      || String(existing.mtime ?? '') !== String(file.mtime ?? '')
  })

  // better-sqlite3 is synchronous, so indexing every file of a large first-time
  // scan in one transaction blocks the Electron main process (hard UI freeze).
  // Write in batches and yield the event loop between them to stay responsive.
  const upsertBatch = db.transaction(batch => {
    for (const file of batch) upsertDocumentFromFile({ projectId, ...file })
  })
  for (let i = 0; i < changedFiles.length; i += INDEX_BATCH_SIZE) {
    upsertBatch(changedFiles.slice(i, i + INDEX_BATCH_SIZE))
    if (i + INDEX_BATCH_SIZE < changedFiles.length) {
      await new Promise(resolve => setImmediate(resolve))
    }
  }

  const reconciliation = reconcileProjectDocuments(projectId, normalizedFiles.map(file => file.relativePath))
  return {
    count: normalizedFiles.length,
    indexed: changedFiles.length,
    skipped: normalizedFiles.length - changedFiles.length,
    ...reconciliation,
  }
}

export function getDocument(id) {
  return db.prepare('SELECT *, metadata_json AS metadata FROM documents WHERE id = ?').get(id)
}

export function getDocumentForProject(id, projectId) {
  return db.prepare('SELECT *, metadata_json AS metadata FROM documents WHERE id = ? AND project_id = ?').get(id, projectId)
}

export function listDocuments(projectId) {
  return db.prepare(
    `SELECT *, metadata_json AS metadata FROM documents
     WHERE project_id = ?
     ORDER BY family_key ASC, revision ASC, name ASC`
  ).all(projectId)
}

export function reconcileProjectDocuments(projectId, currentRelativePaths) {
  const current = new Set(currentRelativePaths)
  const rows = db.prepare('SELECT id, relative_path, status FROM documents WHERE project_id = ?').all(projectId)
  const markMissing = db.prepare('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?')
  const markIndexed = db.prepare('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?')
  const deleteSearch = db.prepare('DELETE FROM search_index WHERE source_id = ? AND source_type IN (?, ?)')
  const timestamp = nowIso()
  let missing = 0
  let restored = 0
  const tx = db.transaction(() => {
    for (const row of rows) {
      if (current.has(row.relative_path)) {
        if (row.status === 'missing') {
          markIndexed.run('indexed', timestamp, row.id)
          restored += 1
        }
        continue
      }
      if (row.status !== 'missing') {
        markMissing.run('missing', timestamp, row.id)
        deleteSearch.run(row.id, 'document', 'document_text')
        missing += 1
      }
    }
  })
  tx()
  return { missing, restored }
}

export function listDocumentRevisions(documentId) {
  return db.prepare(
    'SELECT * FROM document_revisions WHERE document_id = ? ORDER BY created_at DESC'
  ).all(documentId)
}

export function saveExtractedText({ projectId, documentId, text, method }) {
  db.prepare(
    `INSERT INTO document_text_content (document_id, project_id, extracted_text, extraction_method, extracted_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(document_id) DO UPDATE SET
       extracted_text = excluded.extracted_text,
       extraction_method = excluded.extraction_method,
       extracted_at = excluded.extracted_at`
  ).run(documentId, projectId, text, method, nowIso())
  const doc = getDocument(documentId)
  replaceSearchEntry({ projectId, sourceType: 'document_text', sourceId: documentId, title: doc?.name ?? '', body: text })
}

export function searchProject({ projectId, query, limit = 25 }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100))
  const terms = String(query ?? '').trim().split(/\s+/).filter(Boolean).map(term => `${term.replace(/[^\w]/g, '')}*`).filter(term => term !== '*')
  if (terms.length === 0) return []
  return db.prepare(
    `SELECT source_type, source_id, title, snippet(search_index, 4, '[', ']', '...', 12) AS excerpt
     FROM search_index
     WHERE project_id = ? AND search_index MATCH ?
     LIMIT ?`
  ).all(projectId, terms.join(' '), safeLimit).map(row => {
    let documentId = null
    if (row.source_type === 'document' || row.source_type === 'document_text') {
      documentId = row.source_id
    } else if (row.source_type === 'comment') {
      const comment = db.prepare('SELECT document_id FROM review_comments WHERE id = ? AND project_id = ?').get(row.source_id, projectId)
      documentId = comment?.document_id ?? null
    }
    return { ...row, document_id: documentId }
  })
}

export function ensureDefaultChecklistForDocument({ projectId, documentId }) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM checklist_items WHERE document_id = ?').get(documentId)
  if (existing.count > 0) return
  const template = db.prepare('SELECT * FROM checklist_templates WHERE id = ?').get('default-document-review')
  const items = JSON.parse(template?.items_json || '[]')
  const insert = db.prepare('INSERT INTO checklist_items (id, project_id, document_id, label, sort_order) VALUES (?, ?, ?, ?, ?)')
  const tx = db.transaction(() => {
    items.forEach((label, index) => insert.run(randomUUID(), projectId, documentId, label, index))
  })
  tx()
}

export function getChecklistForDocument({ projectId, documentId }) {
  ensureDefaultChecklistForDocument({ projectId, documentId })
  return db.prepare(
    'SELECT * FROM checklist_items WHERE project_id = ? AND document_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(projectId, documentId).map(item => ({ ...item, done: !!item.done }))
}

export function toggleChecklistItem({ id, done }) {
  db.prepare('UPDATE checklist_items SET done = ?, updated_at = ? WHERE id = ?').run(done ? 1 : 0, nowIso(), id)
  return db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id)
}

export function getChecklistItemForProject(id, projectId) {
  return db.prepare('SELECT * FROM checklist_items WHERE id = ? AND project_id = ?').get(id, projectId)
}

export function listChecklistItemsForProject(projectId) {
  return db.prepare(
    'SELECT * FROM checklist_items WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(projectId)
}

export function listComments({ projectId, documentId = null }) {
  if (documentId) {
    return db.prepare('SELECT * FROM review_comments WHERE project_id = ? AND document_id = ? ORDER BY created_at DESC').all(projectId, documentId)
  }
  return db.prepare('SELECT * FROM review_comments WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
}

export function createComment({ projectId, documentId = null, body }) {
  const id = randomUUID()
  db.prepare('INSERT INTO review_comments (id, project_id, document_id, body) VALUES (?, ?, ?, ?)').run(id, projectId, documentId, body)
  replaceSearchEntry({ projectId, sourceType: 'comment', sourceId: id, title: 'Review comment', body, metadata: JSON.stringify({ documentId }) })
  return db.prepare('SELECT * FROM review_comments WHERE id = ?').get(id)
}

export function getCommentForProject(id, projectId) {
  return db.prepare('SELECT * FROM review_comments WHERE id = ? AND project_id = ?').get(id, projectId)
}

export function resolveComment(id) {
  db.prepare('UPDATE review_comments SET status = ?, updated_at = ? WHERE id = ?').run('closed', nowIso(), id)
  return db.prepare('SELECT * FROM review_comments WHERE id = ?').get(id)
}

export function upsertSavedView({ projectId, id = null, name, viewType, config = {} }) {
  const savedId = id || randomUUID()
  const existing = id ? db.prepare('SELECT * FROM saved_views WHERE id = ?').get(id) : null
  if (existing && existing.project_id !== projectId) {
    throw new Error('Saved view belongs to another project')
  }
  const timestamp = nowIso()
  db.prepare(
    `INSERT INTO saved_views (id, project_id, name, view_type, config_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       view_type = excluded.view_type,
       config_json = excluded.config_json,
       updated_at = excluded.updated_at`
  ).run(savedId, projectId, name, viewType, JSON.stringify(config), timestamp)
  return db.prepare('SELECT * FROM saved_views WHERE id = ?').get(savedId)
}

export function listSavedViews(projectId) {
  return db.prepare('SELECT * FROM saved_views WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
}

export function createIntakePackage({ projectId, sourcePath = null, destinationPath = null, manifest = {} }) {
  const id = randomUUID()
  db.prepare(
    'INSERT INTO intake_packages (id, project_id, source_path, destination_path, manifest_json) VALUES (?, ?, ?, ?, ?)'
  ).run(id, projectId, sourcePath, destinationPath, JSON.stringify(manifest))
  return db.prepare('SELECT * FROM intake_packages WHERE id = ?').get(id)
}

export function listStandardsRules(projectId) {
  return db.prepare(
    'SELECT * FROM standards_rules WHERE active = 1 AND (project_id IS NULL OR project_id = ?) ORDER BY severity DESC, title ASC'
  ).all(projectId)
}

export function generateBriefDraft(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
  const documents = listDocuments(projectId)
  const comments = listComments({ projectId })
  const openComments = comments.filter(comment => comment.status !== 'closed')
  const id = randomUUID()
  const content = {
    project: project?.name ?? 'Project',
    generatedAt: nowIso(),
    documentCount: documents.length,
    openCommentCount: openComments.length,
    latestDocuments: documents.slice(0, 10).map(doc => ({ name: doc.name, revision: doc.revision, status: doc.status, path: doc.relative_path })),
    openComments: openComments.slice(0, 10).map(comment => ({ body: comment.body, documentId: comment.document_id })),
  }
  db.prepare('INSERT INTO brief_drafts (id, project_id, title, content_json) VALUES (?, ?, ?, ?)')
    .run(id, projectId, `${project?.name ?? 'Project'} Brief`, JSON.stringify(content))
  const brief = db.prepare('SELECT * FROM brief_drafts WHERE id = ?').get(id)
  replaceSearchEntry({ projectId, sourceType: 'brief', sourceId: id, title: brief.title, body: JSON.stringify(content) })
  return brief
}

export function getLatestBrief(projectId) {
  return db.prepare('SELECT * FROM brief_drafts WHERE project_id = ? ORDER BY generated_at DESC LIMIT 1').get(projectId)
}

export function addBackupMetadata({ projectId, pathOnDisk, sizeBytes = 0, status = 'created' }) {
  const id = randomUUID()
  db.prepare('INSERT INTO backup_metadata (id, project_id, path_on_disk, size_bytes, status) VALUES (?, ?, ?, ?, ?)')
    .run(id, projectId, pathOnDisk, sizeBytes, status)
  return db.prepare('SELECT * FROM backup_metadata WHERE id = ?').get(id)
}

export function exportProjectData(projectId) {
  return {
    project: db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId),
    documents: listDocuments(projectId),
    revisions: db.prepare('SELECT * FROM document_revisions WHERE project_id = ?').all(projectId),
    checklistItems: db.prepare('SELECT * FROM checklist_items WHERE project_id = ?').all(projectId),
    comments: listComments({ projectId }),
    intakePackages: db.prepare('SELECT * FROM intake_packages WHERE project_id = ?').all(projectId),
    savedViews: listSavedViews(projectId),
    extractedText: db.prepare('SELECT * FROM document_text_content WHERE project_id = ?').all(projectId),
    standardsRules: listStandardsRules(projectId),
    briefs: db.prepare('SELECT * FROM brief_drafts WHERE project_id = ?').all(projectId),
    canvasNotes: listAllCanvases(projectId),
    outgoingLog: listOutgoingLog(projectId),
  }
}
