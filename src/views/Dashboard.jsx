import { useState, useEffect, useRef } from 'react'
import CreateProjectModal from '../components/CreateProjectModal.jsx'
import FolderTree from '../components/FolderTree.jsx'
import NoteCanvas from '../components/NoteCanvas.jsx'
import CommandPalette from '../components/CommandPalette.jsx'

const PHASES = [
  { key: 'masterplan', label: 'Masterplan' },
  { key: 'da',         label: 'Development App (DA)' },
  { key: 'opw',        label: 'Operational Works (OPW)' },
  { key: 'ifc',        label: 'Issued For Construction' },
]

const DEFAULT_LAUNCHER_APPS = [
  { id: 'autocad', label: 'AutoCAD', pathKey: 'launcher_autocad' },
  { id: '12d', label: '12D Model', pathKey: 'launcher_12d' },
  { id: 'excel', label: 'Excel', pathKey: 'launcher_excel' },
  { id: 'word', label: 'Word', pathKey: 'launcher_word' },
]

const QUICK_FILING_DESTINATIONS = [
  { key: '04 Outgoing', label: '04 Outgoing' },
  { key: '05 Data Room', label: '05 Data Room' },
  { key: 'custom', label: 'Custom Path' },
]

const QUICK_FILING_DRAG_MIME = 'application/x-docketos-quick-filing-paths'
const TEMPLATE_FILE_DRAG_MIME = 'application/x-docketos-template-file'
const TEMPLATE_FILE_DRAG_MIME_ALT = 'text/x-docketos-template-file'

function loadStoredQuickFilingCustomPath() {
  try {
    return window.localStorage.getItem('docketos.quickFilingCustomPath') ?? ''
  } catch {
    return ''
  }
}

function normalizeLauncherRegistry(value) {
  const source = Array.isArray(value) ? value : DEFAULT_LAUNCHER_APPS
  const seen = new Set()
  const apps = source.map(app => {
    const id = String(app?.id ?? '').trim()
    const label = String(app?.label ?? '').trim()
    const pathKey = String(app?.pathKey ?? `launcher_${id}`).trim()
    return { id, label, pathKey }
  }).filter(app => {
    if (!app.id || !app.label || !/^launcher_[a-z0-9_-]+$/.test(app.pathKey) || seen.has(app.id)) return false
    seen.add(app.id)
    return true
  })
  return apps.length ? apps : DEFAULT_LAUNCHER_APPS
}

function parseLauncherRegistry(raw) {
  try {
    return normalizeLauncherRegistry(JSON.parse(raw ?? 'null'))
  } catch {
    return DEFAULT_LAUNCHER_APPS
  }
}

function getPathName(value) {
  const parts = String(value ?? '').split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? ''
}

function getParentPath(value) {
  const text = String(value ?? '').replace(/[\\/]+$/, '')
  const index = Math.max(text.lastIndexOf('\\'), text.lastIndexOf('/'))
  return index > 0 ? text.slice(0, index) : ''
}

function normalizePathFlagKey(value) {
  return String(value ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

const CENTER_PANEL_OPTIONS = [
  { key: 'todo', label: 'Task List', icon: '📝' },
  { key: 'inProgress', label: 'Subproject Browser', icon: '📁' },
  { key: 'quickLinks', label: 'Quick Access Links', icon: '🔗' },
  { key: 'selectedFolder', label: 'Selected Folder', icon: '🗂️' },
  { key: 'recentFiles', label: 'Recent Files', icon: '🕘' },
  { key: 'flagged', label: 'Flagged', icon: '🏷️' },
  { key: 'timeline', label: 'Project Timeline', icon: '🧭' },
  { key: 'timesheet', label: 'Project Timesheet', icon: '⏱️' },
  { key: 'templates', label: 'Templates', icon: '📄' },
  { key: 'plainNotes', label: 'Notes', icon: '🗒️' },
]

function TimelineIcon({ kind }) {
  if (kind === 'event') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0D0D0F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
      </svg>
    )
  }
  if (kind === 'deleted') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0D0D0F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0D0D0F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function getTimelineFileKey(entry) {
  return entry.fullPath ?? entry.relativePath ?? entry.name
}

const ANALYSABLE_EXTS = new Set(['pdf', 'txt', 'md', 'doc', 'docx'])
function isAnalysableEntry(entry) {
  if (!entry || entry.isDirectory) return false
  const ext = entry.name?.split('.').pop()?.toLowerCase()
  return Boolean(ext && ANALYSABLE_EXTS.has(ext))
}

const DEFAULT_CENTER_PANEL_SLOTS = ['todo', 'inProgress', 'quickLinks']
const DEFAULT_TODO_LIST = { id: 'default', name: 'General' }
const CALENDAR_WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const CALENDAR_PANEL_MIN_HEIGHT = 720
const CALENDAR_NOTE_COLORS = ['#7A5CFF', '#30D158', '#FF9F0A', '#FF453A', '#64D2FF', '#BF5AF2']
const DEFAULT_RECOVERY_BACKUP_INTERVAL_MINUTES = 10
const MIN_RECOVERY_BACKUP_INTERVAL_MINUTES = 1
const MAX_RECOVERY_BACKUP_INTERVAL_MINUTES = 1440
const CENTER_GRID_MIN_ROW_HEIGHT = 150
const CENTER_GRID_TOP_CHROME_HEIGHT = 56
const CENTER_GRID_VERTICAL_PADDING = 20
const CENTER_GRID_ROW_GAP = 8
const PROJECT_ACTIVITY_LIMIT = 80
const LOW_VALUE_PROJECT_ACTIVITY_TITLES = new Set([
  'calendar colour changed',
  'calendar color changed',
  'completed task visibility changed',
  'folder opened',
  'path opened',
  'quick link opened',
  'task list selected',
  'task list view changed',
])
const TIMELINE_BURST_WINDOW_MS = 5000
const TIMELINE_MOVE_BURST_WINDOW_MS = 30000
const TIMELINE_FLAG_BURST_WINDOW_MS = 5 * 60 * 1000
const TIMELINE_BURST_MIN_ITEMS = 4
const SIDE_PANEL_RESIZER_WIDTH = 10
const DEFAULT_FILE_NAME_COLUMN_WIDTH = 190
const LEFT_PANEL_SECTION_KEYS = ['launchers', 'folders', 'active']
const RIGHT_PANEL_SECTION_KEYS = ['template', 'permanentLinks', 'filing', 'gemini', 'calendar']
const HIDEABLE_SIDE_PANEL_SECTION_KEYS = new Set(['launchers', 'folders', ...RIGHT_PANEL_SECTION_KEYS])

function collectDocketOsLocalStorageSnapshot() {
  const snapshot = {}
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith('docketos.')) continue
      snapshot[key] = window.localStorage.getItem(key) ?? ''
    }
  } catch {
    // Recovery snapshots are best-effort and should never interrupt Dashboard use.
  }
  return snapshot
}

function normalizeRecoveryBackupIntervalMinutes(value) {
  const minutes = Math.round(Number(value))
  if (!Number.isFinite(minutes)) return DEFAULT_RECOVERY_BACKUP_INTERVAL_MINUTES
  return Math.max(MIN_RECOVERY_BACKUP_INTERVAL_MINUTES, Math.min(MAX_RECOVERY_BACKUP_INTERVAL_MINUTES, minutes))
}

function sanitizeExportFileName(value, fallback = 'DocketOS Export') {
  const clean = String(value ?? fallback).replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').replace(/^\.+/, '_').trim()
  return clean || fallback
}

function normalizeSidePanelHiddenSections(value) {
  const source = Array.isArray(value) ? value : []
  const seen = new Set()
  return source
    .map(item => String(item ?? '').trim())
    .filter(item => {
      if (!HIDEABLE_SIDE_PANEL_SECTION_KEYS.has(item) || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

function parseSidePanelHiddenSections(raw) {
  try {
    return normalizeSidePanelHiddenSections(JSON.parse(raw ?? '[]'))
  } catch {
    return []
  }
}

// Feature flag: the project-wide File Audit AI (Gemini scan of all files in the
// active project, suggesting moves/renames). Disabled by user request.
// The other AI in this panel — the per-document PDF/Word Summary AI invoked
// via right-click → Analyse — stays ON. See docs/ai-assistants.md.
const AUDIT_AI_ENABLED = false
const S = {
  panel:     { backgroundColor: '#121214', borderColor: '#1F1F23' },
  elevated:  { backgroundColor: '#1A1A1E', borderColor: '#1F1F23' },
  deeper:    { backgroundColor: '#0D0D0F', borderColor: '#1F1F23' },
  border:    '#1F1F23',
  accent:    '#7A5CFF',
  muted:     '#8E8E93',
  dim:       '#3F3F46',
  zinc:      '#52525B',
  text:      '#F5F5F7',
  labeltext: '#A1A1AA',
}

const FILE_FLAG_OPTIONS = [
  { key: 'purple', label: 'Purple', color: S.accent },
  { key: 'green', label: 'Green', color: '#30D158' },
  { key: 'amber', label: 'Amber', color: '#FF9F0A' },
  { key: 'red', label: 'Red', color: '#FF453A' },
  { key: 'blue', label: 'Blue', color: '#64D2FF' },
  { key: 'pink', label: 'Pink', color: '#BF5AF2' },
]
const FILE_FLAG_KEYS = new Set(FILE_FLAG_OPTIONS.map(option => option.key))
const FILE_FLAG_BY_KEY = Object.fromEntries(FILE_FLAG_OPTIONS.map(option => [option.key, option]))

function FileFlagDot({ flag, title = 'Flagged' }) {
  const option = flag ? FILE_FLAG_BY_KEY[flag.color] : null
  return (
    <span
      aria-hidden="true"
      title={option ? `${title}: ${option.label}` : 'No flag'}
      className="shrink-0 rounded-full"
      style={{
        width: 8,
        height: 8,
        backgroundColor: option?.color ?? 'transparent',
        boxShadow: option ? `0 0 0 1px ${S.panel.backgroundColor}, 0 0 8px ${option.color}66` : 'none',
      }}
    />
  )
}

function isValidCenterPanelKey(key) {
  return CENTER_PANEL_OPTIONS.some(option => option.key === key)
}

function getCenterPanelSlotTasks(slot) {
  if (typeof slot === 'string') return isValidCenterPanelKey(slot) ? [slot] : [CENTER_PANEL_OPTIONS[0].key]
  if (slot && typeof slot === 'object') {
    const tasks = Array.isArray(slot.tasks)
      ? slot.tasks.filter(isValidCenterPanelKey)
      : isValidCenterPanelKey(slot.key) ? [slot.key] : []
    return tasks.length ? tasks : [CENTER_PANEL_OPTIONS[0].key]
  }
  return [CENTER_PANEL_OPTIONS[0].key]
}

function makeCenterPanelSlot(key = CENTER_PANEL_OPTIONS[0].key) {
  return { tasks: [isValidCenterPanelKey(key) ? key : CENTER_PANEL_OPTIONS[0].key] }
}

function loadStoredQuickLinks() {
  try {
    const raw = window.localStorage.getItem('docketos.quickLinksBySubproject')
      ?? window.localStorage.getItem('docketos.quickLinksByProject')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadStoredPermanentQuickLinks() {
  try {
    const raw = window.localStorage.getItem('docketos.permanentQuickLinks')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(link => ({
        id: String(link?.id ?? crypto.randomUUID()),
        label: String(link?.label ?? '').trim(),
        path: String(link?.path ?? '').trim(),
        type: link?.type === 'file' ? 'file' : 'folder',
      }))
      .filter(link => link.label && link.path)
  } catch {
    return []
  }
}

function loadStoredNoteSections() {
  try {
    const raw = window.localStorage.getItem('docketos.noteSectionsByScope')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).map(([scopeKey, sections]) => [scopeKey, normalizeNoteSections(sections)])
    )
  } catch {
    return {}
  }
}

function loadStoredActiveNoteSections() {
  try {
    const raw = window.localStorage.getItem('docketos.activeNoteByScope')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadStoredCalendarNotes() {
  try {
    const raw = window.localStorage.getItem('docketos.calendarNotes')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadStoredTodoLists() {
  try {
    const raw = window.localStorage.getItem('docketos.todoListsByScope')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadStoredActiveTodoLists() {
  try {
    const raw = window.localStorage.getItem('docketos.activeTodoListBySlot')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadStoredTodoViewModes() {
  try {
    const raw = window.localStorage.getItem('docketos.todoViewModeBySlot')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadStoredCenterPanelSlots() {
  try {
    const raw = window.localStorage.getItem('docketos.centerPanelSlots')
    if (!raw) return DEFAULT_CENTER_PANEL_SLOTS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_CENTER_PANEL_SLOTS
    const validKeys = new Set(CENTER_PANEL_OPTIONS.map(option => option.key))
    const slots = parsed.filter(key => validKeys.has(key))
    return slots.length ? slots : DEFAULT_CENTER_PANEL_SLOTS
  } catch {
    return DEFAULT_CENTER_PANEL_SLOTS
  }
}

const DEFAULT_PROJECT_INFO = {
  jobNumber: '',
  clientName: '',
  council: '',
  waterAuthority: '',
  projectManager: '',
  contactEmail: '',
}

const PROJECT_INFO_FIELD_LABELS = {
  jobNumber: 'Project number',
  clientName: 'Client',
  council: 'Council',
  waterAuthority: 'Water authority',
  projectManager: 'Project manager',
  contactEmail: 'Contact email',
}

const DEFAULT_PROJECT_INFO_LISTS = {
  councils: [],
  projectManagers: [],
  waterAuthorities: [],
}

function normalizeStringList(value) {
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

function normalizeProjectInfoLists(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    councils: normalizeStringList(source.councils),
    projectManagers: normalizeStringList(source.projectManagers),
    waterAuthorities: normalizeStringList(source.waterAuthorities),
  }
}

function inferJobNumberFromRootPath(rootPath) {
  const source = String(rootPath ?? '')
  if (!source) return ''
  const matches = [...source.matchAll(/(^|[^A-Za-z0-9])(BE[\s_-]*\d{2,})(?=$|[^A-Za-z0-9])/gi)]
  const match = matches.at(-1)?.[2]
  return match ? match.replace(/[\s_-]+/g, '').toUpperCase() : ''
}

function isBeJobNumber(value) {
  return /^BE\d{2,}$/i.test(String(value ?? '').replace(/[\s_-]+/g, '').trim())
}

function mergeSelectOptions(options, currentValue) {
  const clean = normalizeStringList(options)
  const value = String(currentValue ?? '').trim()
  if (!value) return clean
  return clean.some(item => item.toLowerCase() === value.toLowerCase())
    ? clean
    : [value, ...clean]
}

function ProjectInfoCombobox({ value, options, placeholder, disabled, onChange }) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(String(value ?? ''))
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  // Sync controlled value when it changes externally (e.g. project switch)
  useEffect(() => {
    if (!open) setInputValue(String(value ?? ''))
  }, [value, open])

  const filterText = inputValue.toLowerCase()
  const filtered = inputValue.trim()
    ? options.filter(o => o.toLowerCase().includes(filterText))
    : options

  function selectOption(opt) {
    onChange(opt)
    setInputValue(opt)
    setOpen(false)
  }

  function handleBlur() {
    onChange(inputValue)
    setOpen(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { onChange(inputValue); setOpen(false); inputRef.current?.blur() }
    if (e.key === 'Escape') { setInputValue(String(value ?? '')); setOpen(false); inputRef.current?.blur() }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div
        className="flex items-center rounded border overflow-hidden"
        style={{ backgroundColor: '#1A1A1E', borderColor: open ? S.accent : S.border, minHeight: 29 }}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 min-w-0 bg-transparent text-xs outline-none disabled:opacity-40"
          style={{ color: inputValue ? S.text : S.muted, padding: '6px 8px' }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={e => { e.preventDefault(); setOpen(o => !o); inputRef.current?.focus() }}
          className="shrink-0 flex items-center justify-center pr-2 pl-1 disabled:opacity-40"
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRight: `1px solid ${S.muted}`,
              borderBottom: `1px solid ${S.muted}`,
              transform: open ? 'rotate(225deg) translate(-1px, -1px)' : 'rotate(45deg) translate(-1px, -1px)',
              transition: 'transform 140ms ease',
            }}
          />
        </button>
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded border shadow-xl"
          style={{ ...S.elevated, boxShadow: '0 16px 32px rgba(0,0,0,0.36)' }}
        >
          <div className="thin-scrollbar max-h-44 overflow-y-auto py-1">
            {filtered.length ? filtered.map(option => {
              const isSelected = option.toLowerCase() === inputValue.toLowerCase()
              return (
                <button
                  key={option}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => selectOption(option)}
                  className="block w-full truncate px-2.5 py-1.5 text-left text-xs transition hover:bg-[#24242A]"
                  style={{
                    backgroundColor: isSelected ? '#1D1B2A' : 'transparent',
                    color: isSelected ? S.text : S.labeltext,
                  }}
                >
                  {option}
                </button>
              )
            }) : (
              <div className="px-2.5 py-1.5 text-xs" style={{ color: S.muted }}>No options</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function normalizeProjectInfo(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    jobNumber: String(source.jobNumber ?? ''),
    clientName: String(source.clientName ?? ''),
    council: String(source.council ?? '').trim(),
    waterAuthority: String(source.waterAuthority ?? source.rpeq ?? '').trim(),
    projectManager: String(source.projectManager ?? '').trim(),
    contactEmail: String(source.contactEmail ?? '').trim(),
  }
}

function loadStoredProjectInfoByProject() {
  try {
    const raw = window.localStorage.getItem('docketos.projectInfoByProject')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const normalized = {}
    for (const [projectId, info] of Object.entries(parsed)) {
      normalized[projectId] = normalizeProjectInfo(info)
    }
    return normalized
  } catch {
    return {}
  }
}

function loadStoredPlainNotesByBox() {
  try {
    const raw = window.localStorage.getItem('docketos.plainNotesByBox')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')])
    )
  } catch {
    return {}
  }
}

function loadStoredTimesheetEntriesByProject() {
  try {
    const raw = window.localStorage.getItem('docketos.timesheetEntriesByProject')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).map(([projectId, entries]) => [
        projectId,
        Array.isArray(entries)
          ? entries
            .filter(entry => entry && typeof entry === 'object')
            .map(entry => ({
              id: String(entry.id ?? crypto.randomUUID()),
              date: String(entry.date ?? ''),
              task: String(entry.task ?? '').trim(),
              hours: Math.max(0, Number(entry.hours ?? 0)),
              note: String(entry.note ?? '').trim(),
              startTime: entry.startTime ? String(entry.startTime) : '',
              endTime: entry.endTime ? String(entry.endTime) : '',
            }))
            .filter(entry => entry.task || entry.hours > 0)
          : [],
      ])
    )
  } catch {
    return {}
  }
}

function loadStoredTimesheetTimersByProject() {
  try {
    const raw = window.localStorage.getItem('docketos.timesheetTimersByProject')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([projectId, timer]) => {
          if (!timer || typeof timer !== 'object') return null
          const task = String(timer.task ?? '').trim()
          const startedAt = String(timer.startedAt ?? '')
          if (!task || Number.isNaN(new Date(startedAt).getTime())) return null
          return [projectId, {
            task,
            note: String(timer.note ?? '').trim(),
            date: String(timer.date ?? formatCalendarDateKey(new Date())),
            startedAt,
          }]
        })
        .filter(Boolean)
    )
  } catch {
    return {}
  }
}

function loadStoredFileFlagsByProject() {
  try {
    const raw = window.localStorage.getItem('docketos.fileFlagsByProject')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([projectId, flags]) => {
          if (!flags || typeof flags !== 'object') return null
          const entries = Object.entries(flags)
            .map(([rawPath, flag]) => {
              if (!flag || typeof flag !== 'object') return null
              const path = String(flag.path ?? rawPath ?? '').trim()
              const key = normalizePathFlagKey(path)
              const color = String(flag.color ?? '')
              if (!key || !FILE_FLAG_KEYS.has(color)) return null
              return [key, {
                path,
                name: String(flag.name ?? getPathName(path) ?? '').trim() || getPathName(path),
                isDirectory: Boolean(flag.isDirectory),
                color,
                flaggedAt: Number(flag.flaggedAt ?? Date.now()),
              }]
            })
            .filter(Boolean)
          return [projectId, Object.fromEntries(entries)]
        })
        .filter(Boolean)
    )
  } catch {
    return {}
  }
}

function normalizeProjectActivityLog(entries) {
  return Array.isArray(entries)
    ? entries
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => ({
        id: String(entry.id ?? crypto.randomUUID()),
        kind: String(entry.kind ?? 'event'),
        changeType: String(entry.changeType ?? 'event'),
        title: String(entry.title ?? 'Project activity'),
        detail: String(entry.detail ?? ''),
        path: entry.path ? String(entry.path) : null,
        bucket: entry.bucket ? String(entry.bucket) : null,
        coalesceKey: entry.coalesceKey ? String(entry.coalesceKey) : null,
        meta: normalizeProjectActivityMeta(entry.meta),
        ts: Number(entry.ts ?? Date.now()),
      }))
      .filter(isRelevantProjectActivityEntry)
      .filter(entry => entry.title.trim())
      .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
      .slice(0, PROJECT_ACTIVITY_LIMIT)
    : []
}

function isRelevantProjectActivityEntry(entry) {
  const title = String(entry?.title ?? '').trim().toLowerCase()
  if (!title) return false
  if (LOW_VALUE_PROJECT_ACTIVITY_TITLES.has(title)) return false
  return true
}

function normalizeProjectActivityMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {}
  return Object.fromEntries(
    Object.entries(meta)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
      .map(([key, value]) => [String(key), String(value)])
  )
}

function loadStoredProjectActivityByProject() {
  try {
    const raw = window.localStorage.getItem('docketos.projectActivityByProject')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).map(([projectId, entries]) => [projectId, normalizeProjectActivityLog(entries)])
    )
  } catch {
    return {}
  }
}

function loadStoredProjectTimelineClearedAtByProject() {
  try {
    const raw = window.localStorage.getItem('docketos.projectTimelineClearedAtByProject')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([projectId, value]) => [projectId, Number(value)])
        .filter(([, value]) => Number.isFinite(value) && value > 0)
    )
  } catch {
    return {}
  }
}

function loadStoredTodosByScope() {
  try {
    const raw = window.localStorage.getItem('docketos.todosByScope')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const DEFAULT_NOTE_SECTION = { id: 'project-notes', name: 'notes.txt' }

function normalizeNoteSections(sections) {
  const source = Array.isArray(sections) && sections.length ? sections : [DEFAULT_NOTE_SECTION]
  return source.map(note => {
    const name = note?.id === DEFAULT_NOTE_SECTION.id && note?.name === 'Project Notes'
      ? DEFAULT_NOTE_SECTION.name
      : String(note?.name ?? DEFAULT_NOTE_SECTION.name)
    return { ...note, id: String(note?.id ?? crypto.randomUUID()), name }
  })
}

function formatRelativeTime(value) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000))
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
}

function formatTimelineExactTime(value) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatLastEditedDate(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

function formatTimelineClock(value) {
  const ts = Number(value)
  if (!Number.isFinite(ts)) return '--:--'
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return '--:--'
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function formatFileSize(value) {
  const bytes = Number(value ?? 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function startOfMonth(value) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function addMonths(value, delta) {
  return new Date(value.getFullYear(), value.getMonth() + delta, 1)
}

function isSameCalendarDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

function formatCalendarDateKey(value) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseCalendarDateKey(key) {
  const [year, month, day] = String(key ?? '').split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function formatTimesheetDateLabel(value) {
  const date = parseCalendarDateKey(value)
  if (!date) return 'No date'
  const dayName = date.toLocaleDateString(undefined, { weekday: 'long' })
  return `${dayName} ${value}`
}

function groupTimesheetEntriesByDay(entries) {
  const groups = new Map()
  for (const entry of entries) {
    const key = entry.date || 'No date'
    if (!groups.has(key)) groups.set(key, { key, label: formatTimesheetDateLabel(entry.date), entries: [], totalHours: 0 })
    const group = groups.get(key)
    group.entries.push(entry)
    group.totalHours += Number(entry.hours ?? 0)
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === 'No date') return 1
    if (b.key === 'No date') return -1
    return String(b.key).localeCompare(String(a.key))
  })
}

function getTimesheetNoteRows(value) {
  const text = String(value ?? '')
  const lineCount = text.split(/\r?\n/).length
  const lengthRows = Math.ceil(text.length / 80)
  return Math.max(1, Math.min(4, Math.max(lineCount, lengthRows || 1)))
}

function getTimesheetElapsedMs(timer, nowMs = Date.now()) {
  const startedMs = new Date(timer?.startedAt ?? '').getTime()
  if (!Number.isFinite(startedMs)) return 0
  return Math.max(0, nowMs - startedMs)
}

function formatTimesheetElapsed(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatTimesheetClock(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function buildCalendarDays(visibleMonth) {
  const monthStart = startOfMonth(visibleMonth)
  const mondayOffset = (monthStart.getDay() + 6) % 7
  const gridStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index))
}

function normalizeFsPath(value) {
  return String(value ?? '').replace(/[\\/]+/g, '\\').replace(/\\+$/g, '').toLowerCase()
}

function normalizeFolderLabel(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function isTechnicalFolderName(name) {
  const normalized = normalizeFolderLabel(name)
  return /^(\d{1,2})?(technical|techincal)$/.test(normalized)
}

function isProjectRootTechnical(project) {
  return isTechnicalFolderName(getPathName(project?.root_path ?? ''))
}

function pickTechnicalFolder(folders) {
  const technicalFolders = (folders ?? []).filter(folder => isTechnicalFolderName(folder.name))
  const rank = folder => {
    const normalized = normalizeFolderLabel(folder.name)
    const match = normalized.match(/^(\d{1,2})(technical|techincal)$/)
    const phaseNumber = match ? Number(match[1]) : -1
    const preferred = /^(06technical|06techincal)$/.test(normalized) ? 1000 : 0
    return preferred + phaseNumber
  }
  return technicalFolders.sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name))[0]
    ?? null
}

function getProjectRelativePathParts(project, folderPath) {
  const projectPath = normalizeFsPath(project?.root_path)
  const candidatePath = normalizeFsPath(folderPath)
  if (!projectPath || !candidatePath.startsWith(`${projectPath}\\`)) return []
  return candidatePath.slice(projectPath.length + 1).split('\\').filter(Boolean)
}

function buildImmediateEntriesFromProjectFiles(project, folderPath, files) {
  const relativeBaseParts = getProjectRelativePathParts(project, folderPath).map(part => part.toLowerCase())
  const folderRoot = String(folderPath ?? '').replace(/[\\/]+$/g, '')
  const entriesByName = new Map()

  for (const file of files ?? []) {
    const parts = String(file?.relativePath ?? '').split('/').filter(Boolean)
    if (!parts.length) continue
    const matchesBase = relativeBaseParts.every((part, index) => parts[index]?.toLowerCase() === part)
    if (!matchesBase) continue
    const remaining = parts.slice(relativeBaseParts.length)
    if (!remaining.length) continue

    const name = remaining[0]
    const key = name.toLowerCase()
    const isDirectory = remaining.length > 1
    const existing = entriesByName.get(key)
    if (existing?.isDirectory) continue
    if (isDirectory) {
      entriesByName.set(key, {
        name,
        fullPath: `${folderRoot}\\${name}`,
        isDirectory: true,
        ext: '',
        sizeBytes: 0,
        mtime: null,
      })
      continue
    }

    entriesByName.set(key, {
      name,
      fullPath: `${folderRoot}\\${name}`,
      isDirectory: false,
      ext: file.ext ?? '',
      sizeBytes: file.sizeBytes ?? 0,
      mtime: file.mtime ? new Date(file.mtime).getTime() : null,
    })
  }

  return [...entriesByName.values()].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function isDirectTechnicalSubproject(project, folderPath) {
  const relativeParts = getProjectRelativePathParts(project, folderPath)
  if (isProjectRootTechnical(project)) return relativeParts.length === 1
  const technicalIndex = relativeParts.findIndex(isTechnicalFolderName)
  return technicalIndex >= 0 && relativeParts.length === technicalIndex + 2
}

function makeSubprojectsFromFolders(project, folders) {
  return (folders ?? []).map(folder => ({
    id: folder.fullPath,
    project_id: project.id,
    subproject_path: folder.fullPath,
    display_name: folder.name,
    current_phase: null,
  }))
}

async function findTechnicalFolder(rootPath, listFolders, maxDepth = 3) {
  const rootFolders = await listFolders({ dirPath: rootPath })
  const queue = (rootFolders ?? []).map(folder => ({ folder, depth: 0 }))
  const technicalFolders = []

  while (queue.length) {
    const { folder, depth } = queue.shift()
    if (isTechnicalFolderName(folder.name)) technicalFolders.push(folder)
    if (depth >= maxDepth) continue
    const children = await listFolders({ dirPath: folder.fullPath })
    for (const child of children ?? []) {
      queue.push({ folder: child, depth: depth + 1 })
    }
  }

  return pickTechnicalFolder(technicalFolders)
}

async function listSubprojectsForProject(project, listFolders) {
  if (isProjectRootTechnical(project)) {
    const folders = await listFolders({ dirPath: project.root_path })
    return {
      technicalPath: project.root_path,
      subprojects: makeSubprojectsFromFolders(project, folders),
    }
  }

  const technicalFolder = await findTechnicalFolder(project.root_path, listFolders)
  if (!technicalFolder?.fullPath) {
    return { technicalPath: null, subprojects: [] }
  }
  const folders = await listFolders({ dirPath: technicalFolder.fullPath })
  return {
    technicalPath: technicalFolder.fullPath,
    subprojects: makeSubprojectsFromFolders(project, folders),
  }
}

export default function Dashboard({ onOpenSettings, popoutBoxKey = null, popoutSlotIndex = 0, initialProjectId = null }) {
  const normalizedPopoutSlotIndex = Math.max(0, Number(popoutSlotIndex) || 0)
  const isBoxPopout = isValidCenterPanelKey(popoutBoxKey)
  const dragState = useRef(null)
  const centerGridResizeFrameRef = useRef(null)
  const pendingCenterGridPointerRef = useRef(null)
  const centerGridRef = useRef(null)
  const layoutReadyProjectIdRef = useRef(null)
  const [projects,        setProjects]       = useState([])
  const [activeProject,   setActiveProject]  = useState(null)
  const [activeSubproject,setActiveSubproject] = useState(null)
  const [projectOverviewSelected, setProjectOverviewSelected] = useState(false)
  const [showDropdown,    setShowDropdown]   = useState(false)
  const [showNewProject,  setShowNewProject] = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [editProjectForm, setEditProjectForm] = useState({ name: '', description: '', root_path: '' })
  const [editProjectLoading, setEditProjectLoading] = useState(false)
  const [editProjectError, setEditProjectError] = useState(null)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showDeleteProject, setShowDeleteProject] = useState(false)
  const [projectToDeleteId, setProjectToDeleteId] = useState(null)
  const [deleteProjectError, setDeleteProjectError] = useState(null)
  const [kanban,          setKanban]         = useState({ todo: [], inProgress: [], done: [], unclassified: [] })
  const [projectPhaseKey, setProjectPhaseKey] = useState('masterplan')
  const [subprojectPhaseKey, setSubprojectPhaseKey] = useState('masterplan')
  const [templates,       setTemplates]      = useState([])
  const [selectedTpl,     setSelectedTpl]    = useState('')
  const [tplToast,        setTplToast]       = useState(null)
  const [templateFiles,   setTemplateFiles]  = useState([])
  const [tplStagingItems, setTplStagingItems] = useState([])
  const [filingName,      setFilingName]     = useState('')
  const [filingLoading,   setFilingLoading]  = useState(false)
  const [filingToast,     setFilingToast]    = useState(null)
  const [quickFilingDestination, setQuickFilingDestination] = useState(QUICK_FILING_DESTINATIONS[0].key)
  const [quickFilingCustomPath, setQuickFilingCustomPath] = useState(loadStoredQuickFilingCustomPath)
  const [quickFilingMode, setQuickFilingMode] = useState('copy')
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [fileSearchResults, setFileSearchResults] = useState([])
  const [fileSearchLoading, setFileSearchLoading] = useState(false)
  const [fileRevealPath, setFileRevealPath] = useState(null)
  const [quickFilingDragging, setQuickFilingDragging] = useState(false)
  const [quickFilingQueue, setQuickFilingQueue] = useState([])
  const [geminiResults,   setGeminiResults]  = useState([])
  const [geminiLastTime,  setGeminiLastTime] = useState(null)
  const [geminiConfirm,   setGeminiConfirm]  = useState(null)
  const [geminiAuditRunning, setGeminiAuditRunning] = useState(false)
  const [visibleCalendarMonth, setVisibleCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date())
  const [calendarNotes, setCalendarNotes] = useState(loadStoredCalendarNotes)
  const [launcherApps, setLauncherApps] = useState(DEFAULT_LAUNCHER_APPS.map(app => ({ ...app, path: '' })))
  const [launcherToast,   setLauncherToast]  = useState(null)
  const [subprojects,     setSubprojects]    = useState([])
  const [subprojectDiscovery, setSubprojectDiscovery] = useState(null)
  const [subprojectKanban, setSubprojectKanban] = useState(null)
  const [subfolderOptions, setSubfolderOptions] = useState([])
  const [selectedTreeFolderPath, setSelectedTreeFolderPath] = useState(null)
  const [selectedTreeFolderEntries, setSelectedTreeFolderEntries] = useState([])
  const [selectedTreeFolderLoading, setSelectedTreeFolderLoading] = useState(false)
  const [fileMoveDropTargetPath, setFileMoveDropTargetPath] = useState(null)
  const [selectedSubfolderPath, setSelectedSubfolderPath] = useState('')
  const [selectedSubfolderName, setSelectedSubfolderName] = useState('')
  const [subprojectBrowserSort, setSubprojectBrowserSort] = useState('type-name')
  const [selectedFolderSort, setSelectedFolderSort] = useState('type-name')
  const [fileNameColumnWidth, setFileNameColumnWidth] = useState(DEFAULT_FILE_NAME_COLUMN_WIDTH)
  const [hiddenExtensions, setHiddenExtensions] = useState([])
  const [openedFilesLog, setOpenedFilesLog] = useState(() => {
    try {
      const raw = localStorage.getItem('docketos.openedFilesLog')
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })
  const [recentFilesShowAll, setRecentFilesShowAll] = useState(false)

  const [geminiKeySet, setGeminiKeySet] = useState(false)

  useEffect(() => {
    window.api.settingsGetAll().then(data => {
      const map = Object.fromEntries((data.settings ?? []).map(r => [r.key, r.value]))
      setGeminiKeySet(Boolean(map.gemini_api_key?.trim()))
    })
    window.api.settingsGetTemplateFiles().then(files => {
      setTemplateFiles(Array.isArray(files) ? files : [])
    })
    return window.api.on('settings:templateFilesChanged', files => {
      setTemplateFiles(Array.isArray(files) ? files : [])
    })
  }, [])

  useEffect(() => {
    window.api.viewGetHiddenExtensions().then(setHiddenExtensions)
    return window.api.on('view:hiddenExtensionsChanged', exts => setHiddenExtensions(exts))
  }, [])

  useEffect(() => {
    if (!fileSearchQuery.trim() || !activeProject?.root_path) {
      setFileSearchResults([])
      setFileSearchLoading(false)
      return
    }
    setFileSearchLoading(true)
    const timer = setTimeout(async () => {
      const results = await window.api.fsSearchFiles({ rootPath: activeProject.root_path, query: fileSearchQuery.trim() })
      setFileSearchResults(results)
      setFileSearchLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [fileSearchQuery, activeProject?.root_path])
  const [quickLinksByProject, setQuickLinksByProject] = useState(loadStoredQuickLinks)
  const quickLinksByProjectRef = useRef(quickLinksByProject)
  useEffect(() => { quickLinksByProjectRef.current = quickLinksByProject }, [quickLinksByProject])
  const [permanentQuickLinks, setPermanentQuickLinks] = useState(loadStoredPermanentQuickLinks)
  const [quickLinkStats, setQuickLinkStats] = useState({})
  const [draggingQuickLinkPath, setDraggingQuickLinkPath] = useState(null)
  const [expandedQuickLinkFolders, setExpandedQuickLinkFolders] = useState({})
  const [quickLinkChildrenByPath, setQuickLinkChildrenByPath] = useState({})
  const [loadingQuickLinkFolders, setLoadingQuickLinkFolders] = useState({})
  const [folderChildrenByPath, setFolderChildrenByPath] = useState({})
  const [expandedFolderPaths, setExpandedFolderPaths] = useState({})
  const [loadingFolderPaths, setLoadingFolderPaths] = useState({})
  const [folderContextMenu, setFolderContextMenu] = useState(null)
  const [folderEditDialog, setFolderEditDialog] = useState(null)
  const [docAnalysisDialog, setDocAnalysisDialog] = useState(null)
  const [docAnalysisPending, setDocAnalysisPending] = useState(null)
  const [docAnalysisResult, setDocAnalysisResult] = useState(null)
  const [docResultCopied, setDocResultCopied] = useState(false)
  const [docAnalysisHistory, setDocAnalysisHistory] = useState([])
  const [noteSectionsByScope, setNoteSectionsByScope] = useState(loadStoredNoteSections)
  const [activeNoteByScope, setActiveNoteByScope] = useState(loadStoredActiveNoteSections)
  const [projectInfoByProject, setProjectInfoByProject] = useState(loadStoredProjectInfoByProject)
  const [projectInfoLists, setProjectInfoLists] = useState(DEFAULT_PROJECT_INFO_LISTS)
  const [plainNotesByBox, setPlainNotesByBox] = useState(loadStoredPlainNotesByBox)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [todosByScope,    setTodosByScope]   = useState(loadStoredTodosByScope)
  const [todoListsByScope, setTodoListsByScope] = useState(loadStoredTodoLists)
  const [activeTodoListBySlot, setActiveTodoListBySlot] = useState(loadStoredActiveTodoLists)
  const [todoViewModeBySlot, setTodoViewModeBySlot] = useState(loadStoredTodoViewModes)
  const [todoDoneHiddenBySlot, setTodoDoneHiddenBySlot] = useState({})
  const [todoInputBySlot, setTodoInputBySlot] = useState({})
  const [newTodoListNameBySlot, setNewTodoListNameBySlot] = useState({})
  const [editingTodoItemKey, setEditingTodoItemKey] = useState(null)
  const [editingTodoDraft, setEditingTodoDraft] = useState('')
  const [draggingTodoItem, setDraggingTodoItem] = useState(null)
  const [dragOverTodoTarget, setDragOverTodoTarget] = useState(null)
  const [landedTodoItemKey, setLandedTodoItemKey] = useState(null)
  const [todoContextMenu, setTodoContextMenu] = useState(null)
  const [noteContextMenu, setNoteContextMenu] = useState(null)
  const draggedTodoMovedRef = useRef(false)
  const landedTodoTimeoutRef = useRef(null)
  const [timesheetEntriesByProject, setTimesheetEntriesByProject] = useState(loadStoredTimesheetEntriesByProject)
  const [timesheetDraftByProject, setTimesheetDraftByProject] = useState({})
  const [timesheetTimersByProject, setTimesheetTimersByProject] = useState(loadStoredTimesheetTimersByProject)
  const [timesheetNowMs, setTimesheetNowMs] = useState(() => Date.now())
  const [fileFlagsByProject, setFileFlagsByProject] = useState(loadStoredFileFlagsByProject)
  const [flaggedColorBySlot, setFlaggedColorBySlot] = useState({})
  const [flaggedSortBySlot, setFlaggedSortBySlot] = useState({})
  const [flaggedShowAllBySlot, setFlaggedShowAllBySlot] = useState({})
  const [projectActivityByProject, setProjectActivityByProject] = useState(loadStoredProjectActivityByProject)
  const [projectTimelineClearedAtByProject, setProjectTimelineClearedAtByProject] = useState(loadStoredProjectTimelineClearedAtByProject)
  const [centerPanelSlots, setCenterPanelSlots] = useState(loadStoredCenterPanelSlots)
  const [draggingCenterPanelIndex, setDraggingCenterPanelIndex] = useState(null)
  const [centerGridColumnWeights, setCenterGridColumnWeights] = useState([1, 1, 1])
  const [centerGridRowWeights, setCenterGridRowWeights] = useState([1, 1, 1])
  const [centerGridColumnRowWeights, setCenterGridColumnRowWeights] = useState({})
  const [leftWidth, setLeftWidth] = useState(256)
  const [rightWidth, setRightWidth] = useState(288)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [centerTopCollapsed, setCenterTopCollapsed] = useState(false)
  const [centerCanvasCollapsed, setCenterCanvasCollapsed] = useState(false)
  const previousFileSnapshotRef = useRef(new Map())
  const timelineHasSnapshotRef = useRef(false)
  const [timelineChangeByPath, setTimelineChangeByPath] = useState({})
  const [timelineDeletedEvents, setTimelineDeletedEvents] = useState([])
  const [expandedTimelineBursts, setExpandedTimelineBursts] = useState({})
  const [centerKanbanHeight, setCenterKanbanHeight] = useState(300)
  const [leftSectionHeights, setLeftSectionHeights] = useState({
    launchers: 150,
    folders: 220,
    active: 170,
  })
  const [leftSectionOrder, setLeftSectionOrder] = useState(LEFT_PANEL_SECTION_KEYS)
  const [rightSectionHeights, setRightSectionHeights] = useState({
    template: 320,
    permanentLinks: 190,
    filing: 280,
    gemini: 380,
    calendar: CALENDAR_PANEL_MIN_HEIGHT,
  })
  const [rightSectionOrder, setRightSectionOrder] = useState(RIGHT_PANEL_SECTION_KEYS)
  const [sidePanelHiddenSections, setSidePanelHiddenSections] = useState([])
  const [recoveryBackupIntervalMinutes, setRecoveryBackupIntervalMinutes] = useState(DEFAULT_RECOVERY_BACKUP_INTERVAL_MINUTES)
  const [draggingLeftSectionKey, setDraggingLeftSectionKey] = useState(null)
  const [draggingRightSectionKey, setDraggingRightSectionKey] = useState(null)
  const [leftDropTargetKey, setLeftDropTargetKey] = useState(null)
  const [rightDropTargetKey, setRightDropTargetKey] = useState(null)
  const [landedLeftSectionKey, setLandedLeftSectionKey] = useState(null)
  const [landedRightSectionKey, setLandedRightSectionKey] = useState(null)
  const landedLeftSectionTimeoutRef = useRef(null)
  const landedRightSectionTimeoutRef = useRef(null)
  const recoverySnapshotDirtyRef = useRef(true)
  const recoveryProjectSnapshotRef = useRef(null)

  useEffect(() => {
    if (!activeProject) setProjectOverviewSelected(false)
  }, [activeProject])

  useEffect(() => () => {
    if (landedTodoTimeoutRef.current) window.clearTimeout(landedTodoTimeoutRef.current)
    if (landedLeftSectionTimeoutRef.current) window.clearTimeout(landedLeftSectionTimeoutRef.current)
    if (landedRightSectionTimeoutRef.current) window.clearTimeout(landedRightSectionTimeoutRef.current)
  }, [])

  useEffect(() => {
    setExpandedTimelineBursts({})
  }, [activeProject?.id])

  useEffect(() => {
    if (!isBoxPopout) return
    const option = CENTER_PANEL_OPTIONS.find(item => item.key === popoutBoxKey)
    document.title = option?.label ?? 'Dashboard Box'
  }, [isBoxPopout, popoutBoxKey])

  const DEFAULT_LAYOUT = {
    leftWidth: 256,
    rightWidth: 288,
    leftCollapsed: false,
    rightCollapsed: false,
    centerTopCollapsed: false,
    centerCanvasCollapsed: false,
    centerKanbanHeight: 300,
    centerPanelSlots: DEFAULT_CENTER_PANEL_SLOTS,
    centerGridColumnWeights: [1, 1, 1],
    centerGridRowWeights: [1, 1, 1],
    centerGridColumnRowWeights: {},
    leftSectionHeights: { launchers: 150, folders: 220, active: 170 },
    leftSectionOrder: LEFT_PANEL_SECTION_KEYS,
    rightSectionHeights: { template: 320, permanentLinks: 190, filing: 280, gemini: 380, calendar: CALENDAR_PANEL_MIN_HEIGHT },
    rightSectionOrder: RIGHT_PANEL_SECTION_KEYS,
    fileNameColumnWidth: DEFAULT_FILE_NAME_COLUMN_WIDTH,
  }

  function normalizeLayout(value) {
    const source = value && typeof value === 'object' ? value : {}
    const fallbackCenterPanelSlots = Array.isArray(centerPanelSlots) && centerPanelSlots.length
      ? centerPanelSlots
      : DEFAULT_LAYOUT.centerPanelSlots
    const savedCenterPanelSlots = Array.isArray(source.centerPanelSlots)
      ? source.centerPanelSlots.filter(slot => isValidCenterPanelKey(slot))
      : []
    const rightHeights = { ...DEFAULT_LAYOUT.rightSectionHeights, ...(source.rightSectionHeights ?? {}) }
    rightHeights.calendar = Math.max(CALENDAR_PANEL_MIN_HEIGHT, Number(rightHeights.calendar ?? 0))
    const leftOrder = Array.isArray(source.leftSectionOrder)
      ? source.leftSectionOrder.filter(key => LEFT_PANEL_SECTION_KEYS.includes(key))
      : []
    const rightOrder = Array.isArray(source.rightSectionOrder)
      ? source.rightSectionOrder.filter(key => RIGHT_PANEL_SECTION_KEYS.includes(key))
      : []
    return {
      ...DEFAULT_LAYOUT,
      ...source,
      centerPanelSlots: savedCenterPanelSlots.length ? savedCenterPanelSlots : fallbackCenterPanelSlots,
      centerGridColumnWeights: Array.isArray(source.centerGridColumnWeights) ? source.centerGridColumnWeights : DEFAULT_LAYOUT.centerGridColumnWeights,
      centerGridRowWeights: Array.isArray(source.centerGridRowWeights) ? source.centerGridRowWeights : DEFAULT_LAYOUT.centerGridRowWeights,
      centerGridColumnRowWeights: source.centerGridColumnRowWeights && typeof source.centerGridColumnRowWeights === 'object' ? source.centerGridColumnRowWeights : DEFAULT_LAYOUT.centerGridColumnRowWeights,
      leftSectionHeights: { ...DEFAULT_LAYOUT.leftSectionHeights, ...(source.leftSectionHeights ?? {}) },
      leftSectionOrder: leftOrder.length === LEFT_PANEL_SECTION_KEYS.length ? leftOrder : DEFAULT_LAYOUT.leftSectionOrder,
      rightSectionHeights: rightHeights,
      rightSectionOrder: rightOrder.length === RIGHT_PANEL_SECTION_KEYS.length ? rightOrder : DEFAULT_LAYOUT.rightSectionOrder,
      fileNameColumnWidth: Math.max(110, Math.min(520, Number(source.fileNameColumnWidth ?? DEFAULT_LAYOUT.fileNameColumnWidth))),
    }
  }

  function saveLayout(projectId, patch) {
    const key = `project:${projectId}:layout`
    const existing = normalizeLayout(JSON.parse(localStorage.getItem(key) ?? '{}'))
    localStorage.setItem(key, JSON.stringify(normalizeLayout({ ...existing, ...patch })))
  }

  function loadLayout(projectId) {
    try {
      const stored = JSON.parse(localStorage.getItem(`project:${projectId}:layout`) ?? '{}')
      return normalizeLayout(stored)
    } catch {
      return normalizeLayout(DEFAULT_LAYOUT)
    }
  }

  function applyLayout(layout) {
    const next = normalizeLayout(layout)
    setLeftWidth(next.leftWidth)
    setRightWidth(next.rightWidth)
    setLeftCollapsed(Boolean(next.leftCollapsed))
    setRightCollapsed(Boolean(next.rightCollapsed))
    setCenterTopCollapsed(Boolean(next.centerTopCollapsed))
    setCenterCanvasCollapsed(Boolean(next.centerCanvasCollapsed))
    setCenterKanbanHeight(next.centerKanbanHeight)
    setCenterPanelSlots(next.centerPanelSlots.length ? [...next.centerPanelSlots] : DEFAULT_CENTER_PANEL_SLOTS)
    setCenterGridColumnWeights(Array.isArray(next.centerGridColumnWeights) ? [...next.centerGridColumnWeights] : DEFAULT_LAYOUT.centerGridColumnWeights)
    setCenterGridRowWeights(Array.isArray(next.centerGridRowWeights) ? [...next.centerGridRowWeights] : DEFAULT_LAYOUT.centerGridRowWeights)
    setCenterGridColumnRowWeights(next.centerGridColumnRowWeights && typeof next.centerGridColumnRowWeights === 'object' ? { ...next.centerGridColumnRowWeights } : DEFAULT_LAYOUT.centerGridColumnRowWeights)
    setLeftSectionHeights({ ...next.leftSectionHeights })
    setLeftSectionOrder(Array.isArray(next.leftSectionOrder) && next.leftSectionOrder.length ? [...next.leftSectionOrder] : LEFT_PANEL_SECTION_KEYS)
    setRightSectionHeights({ ...next.rightSectionHeights })
    setRightSectionOrder(Array.isArray(next.rightSectionOrder) && next.rightSectionOrder.length ? [...next.rightSectionOrder] : RIGHT_PANEL_SECTION_KEYS)
    setFileNameColumnWidth(next.fileNameColumnWidth)
  }

  function resetViewerLayout() {
    const project = activeProjectRef.current ?? activeProject
    const next = normalizeLayout(DEFAULT_LAYOUT)
    if (project?.id) {
      localStorage.removeItem(`project:${project.id}:layout`)
      saveLayout(project.id, next)
    }
    applyLayout(next)
  }

  useEffect(() => {
    if (!activeProject) return
    if (layoutReadyProjectIdRef.current !== activeProject.id) return
    saveLayout(activeProject.id, {
      leftWidth,
      rightWidth,
      leftCollapsed,
      rightCollapsed,
      centerTopCollapsed,
      centerCanvasCollapsed,
      centerKanbanHeight,
      centerPanelSlots,
      centerGridColumnWeights,
      centerGridRowWeights,
      centerGridColumnRowWeights,
      leftSectionHeights,
      leftSectionOrder,
      rightSectionHeights,
      rightSectionOrder,
      fileNameColumnWidth,
    })
  }, [activeProject?.id, leftWidth, rightWidth, leftCollapsed, rightCollapsed, centerTopCollapsed, centerCanvasCollapsed, centerKanbanHeight, centerPanelSlots, centerGridColumnWeights, centerGridRowWeights, centerGridColumnRowWeights, leftSectionHeights, leftSectionOrder, rightSectionHeights, rightSectionOrder, fileNameColumnWidth])

  useEffect(() => {
    window.api.projectsList().then(async list => {
      setProjects(list)
      if (list.length > 0) {
        const activeFromMain = await window.api.projectsGetActive()
        const preferredProject = list.find(project => String(project.id) === String(initialProjectId))
          ?? list.find(project => project.id === activeFromMain?.id)
          ?? list[0]
        activateProject(preferredProject)
      } else {
        setShowNewProject(true)
      }
    })
    window.api.templatesList().then(setTemplates)
    window.api.settingsGetAll().then(data => {
      const settings = Object.fromEntries((data.settings ?? []).map(row => [row.key, row.value]))
      const registry = parseLauncherRegistry(settings.launcher_registry)
      setLauncherApps(registry.map(app => ({ ...app, path: settings[app.pathKey] ?? '' })))
      setSidePanelHiddenSections(parseSidePanelHiddenSections(settings.dashboard_side_panel_hidden_sections))
      setRecoveryBackupIntervalMinutes(normalizeRecoveryBackupIntervalMinutes(settings.recovery_backup_interval_minutes))
    })
    window.api.settingsGetProjectInfoLists().then(result => {
      if (result?.success) setProjectInfoLists(normalizeProjectInfoLists(result.lists))
    })
  }, [initialProjectId])

  useEffect(() => {
    const loadLaunchers = () => {
      window.api.settingsGetAll().then(data => {
        const settings = Object.fromEntries((data.settings ?? []).map(row => [row.key, row.value]))
        const registry = parseLauncherRegistry(settings.launcher_registry)
        setLauncherApps(registry.map(app => ({ ...app, path: settings[app.pathKey] ?? '' })))
      })
    }

    const unsubscribe = window.api.on('settings:launchersChanged', loadLaunchers)
    return unsubscribe
  }, [])

  useEffect(() => {
    return window.api.on('settings:sidePanelVisibilityChanged', hiddenSections => {
      setSidePanelHiddenSections(normalizeSidePanelHiddenSections(hiddenSections))
    })
  }, [])

  useEffect(() => {
    return window.api.on('settings:recoveryBackupIntervalChanged', minutes => {
      setRecoveryBackupIntervalMinutes(normalizeRecoveryBackupIntervalMinutes(minutes))
    })
  }, [])

  useEffect(() => {
    if (!activeProject) return
    const current = normalizeProjectInfo(projectInfoByProject[activeProject.id] ?? DEFAULT_PROJECT_INFO)
    const inferred = inferJobNumberFromRootPath(activeProject.root_path)
    if (!inferred) return
    if (current.jobNumber === inferred || isBeJobNumber(current.jobNumber)) return
    setProjectInfoByProject(prev => ({
      ...prev,
      [activeProject.id]: normalizeProjectInfo({
        ...(prev[activeProject.id] ?? DEFAULT_PROJECT_INFO),
        jobNumber: inferred,
      }),
    }))
  }, [activeProject?.id, activeProject?.root_path])

  const activeProjectRef = useRef(null)
  useEffect(() => { activeProjectRef.current = activeProject }, [activeProject])

  const activeSubprojectRef = useRef(null)
  useEffect(() => { activeSubprojectRef.current = activeSubproject }, [activeSubproject])

  const handleReportRef = useRef(null)
  const quickLinkSyncTimerRef = useRef(null)
  const quickLinkSyncInFlightRef = useRef(false)

  function scheduleQuickLinksSync(rootPath) {
    if (!rootPath) return
    if (quickLinkSyncTimerRef.current) window.clearTimeout(quickLinkSyncTimerRef.current)
    quickLinkSyncTimerRef.current = window.setTimeout(() => {
      quickLinkSyncTimerRef.current = null
      syncQuickLinksWithFilesystem(rootPath)
    }, 10000)
  }

  useEffect(() => {
    const unsubKanban = window.api.on('kanban:update', d => {
      setKanban(d)
      const sub = activeSubprojectRef.current
      const project = activeProjectRef.current
      if (sub) {
        const entries = buildImmediateEntriesFromProjectFiles(project, sub.subproject_path, ['todo', 'inProgress', 'done', 'unclassified'].flatMap(bucket => d?.[bucket] ?? []))
        setSubprojectKanban(buildSubprojectKanban(entries))
        scheduleQuickLinksSync(sub.subproject_path)
      }
    })
    const unsubGemini = window.api.on('gemini:result', d => {
      setGeminiResults(d)
      setGeminiLastTime(new Date().toLocaleTimeString())
    })
      const unsubOpenDeleteModal = window.api.on('projects:openDeleteModal', async () => {
        const list = await window.api.projectsList()
        setProjects(list)
        setProjectToDeleteId(activeProject?.id ?? list[0]?.id ?? null)
        setDeleteProjectError(null)
        setShowDeleteProject(true)
      })
      const unsubProjectsDeleted = window.api.on('projects:deleted', payload => {
        const nextProjects = payload?.projects ?? []
        setProjects(nextProjects)
        setShowDeleteProject(false)
        setProjectToDeleteId(null)
        setDeleteProjectError(null)

        if (!payload?.activeProjectId) {
          setActiveProject(null)
          setActiveSubproject(null)
          setSelectedTreeFolderPath(null)
          setFileSearchQuery('')
          setFileSearchResults([])
          setFileRevealPath(null)
          setSubprojects([])
          setKanban({ todo: [], inProgress: [], done: [], unclassified: [] })
          return
        }

        const nextActiveProject = nextProjects.find(project => project.id === payload.activeProjectId)
        if (!nextActiveProject) return

        setActiveProject(nextActiveProject)
        setSelectedTreeFolderPath(null)
        setProjectPhaseKey(nextActiveProject.current_phase ?? 'masterplan')
        setActiveSubproject(null)
        setSubprojectPhaseKey('masterplan')
      })
      const unsubReport = window.api.on('report:trigger', () => { handleReportRef.current?.() })
        const unsubRefreshActive = window.api.on('view:refreshActive', () => { refreshActiveProjectSubprojects() })
        const unsubResetViewer = window.api.on('view:resetViewer', () => { resetViewerLayout() })
        return () => {
          if (quickLinkSyncTimerRef.current) window.clearTimeout(quickLinkSyncTimerRef.current)
          unsubKanban(); unsubGemini(); unsubOpenDeleteModal(); unsubProjectsDeleted(); unsubReport(); unsubRefreshActive(); unsubResetViewer()
        }
  }, [])

  async function syncQuickLinksWithFilesystem(rootPath = activeSubprojectRef.current?.subproject_path) {
    if (!rootPath) return
    // Single-flight: SharePoint roots are cloud-backed and a sync walks the whole
    // tree. Never let watcher churn stack overlapping scans.
    if (quickLinkSyncInFlightRef.current) return

    const pending = []
    for (const [scopeKey, links] of Object.entries(quickLinksByProjectRef.current ?? {})) {
      for (const link of links ?? []) {
        if (link.dev !== null && link.dev !== undefined && link.ino !== null && link.ino !== undefined) {
          pending.push({ scopeKey, link })
        }
      }
    }
    if (pending.length === 0) return

    quickLinkSyncInFlightRef.current = true
    try {
      // One tree walk resolves every identity at once — not one full scan per link.
      const identities = pending.map(item => ({ dev: item.link.dev, ino: item.link.ino }))
      const foundList = await window.api.fsFindEntriesByIdentity({ rootPath, identities })
      const foundByKey = new Map((foundList ?? []).map(entry => [`${entry.dev}:${entry.ino}`, entry]))

      setQuickLinksByProject(current => {
        let changed = false
        const next = { ...current }
        for (const { scopeKey, link } of pending) {
          const found = foundByKey.get(`${link.dev}:${link.ino}`)
          if (!found) continue
          const list = next[scopeKey] ?? []
          const index = list.findIndex(item => item.path === link.path || (item.dev === link.dev && item.ino === link.ino))
          if (index < 0) continue
          const currentItem = list[index]
          if (currentItem.path === found.fullPath && currentItem.name === found.name && currentItem.isDirectory === found.isDirectory) continue
          const updated = [...list]
          updated[index] = {
            ...currentItem,
            path: found.fullPath,
            name: found.name,
            isDirectory: found.isDirectory,
            dev: found.dev,
            ino: found.ino,
          }
          next[scopeKey] = updated
          changed = true
        }
        return changed ? next : current
      })
    } finally {
      quickLinkSyncInFlightRef.current = false
    }
  }

  useEffect(() => {
    if (!filingToast) return
    const t = setTimeout(() => setFilingToast(null), 4000)
    return () => clearTimeout(t)
  }, [filingToast])

  useEffect(() => {
    if (!tplToast) return
    const t = setTimeout(() => setTplToast(null), 4000)
    return () => clearTimeout(t)
  }, [tplToast])

  useEffect(() => {
    if (!launcherToast) return
    const t = setTimeout(() => setLauncherToast(null), 4000)
    return () => clearTimeout(t)
  }, [launcherToast])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('docketos.selectedSubfolderName')
      if (saved) setSelectedSubfolderName(saved)
    } catch {
      // Ignore malformed local storage values.
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('docketos.todosByScope', JSON.stringify(todosByScope))
  }, [todosByScope])

  useEffect(() => {
    window.localStorage.setItem('docketos.todoListsByScope', JSON.stringify(todoListsByScope))
  }, [todoListsByScope])

  useEffect(() => {
    window.localStorage.setItem('docketos.activeTodoListBySlot', JSON.stringify(activeTodoListBySlot))
  }, [activeTodoListBySlot])

  useEffect(() => {
    window.localStorage.setItem('docketos.todoViewModeBySlot', JSON.stringify(todoViewModeBySlot))
  }, [todoViewModeBySlot])

  useEffect(() => {
    if (!selectedSubfolderName) return
    window.localStorage.setItem('docketos.selectedSubfolderName', selectedSubfolderName)
  }, [selectedSubfolderName])

  useEffect(() => {
    window.localStorage.setItem('docketos.quickLinksBySubproject', JSON.stringify(quickLinksByProject))
  }, [quickLinksByProject])

  useEffect(() => {
    const allLinks = Object.values(quickLinksByProject).flat()
    if (!allLinks.length) return
    let cancelled = false
    Promise.all(allLinks.map(link =>
      window.api.fsStatFile({ filePath: link.path }).then(stat => ({ path: link.path, stat }))
    )).then(results => {
      if (cancelled) return
      setQuickLinkStats(Object.fromEntries(results.filter(r => r.stat).map(r => [r.path, r.stat])))
    })
    return () => { cancelled = true }
  }, [quickLinksByProject])

  useEffect(() => {
    window.localStorage.setItem('docketos.permanentQuickLinks', JSON.stringify(permanentQuickLinks))
  }, [permanentQuickLinks])

  useEffect(() => {
    window.localStorage.setItem('docketos.noteSectionsByScope', JSON.stringify(noteSectionsByScope))
  }, [noteSectionsByScope])

  useEffect(() => {
    window.localStorage.setItem('docketos.activeNoteByScope', JSON.stringify(activeNoteByScope))
  }, [activeNoteByScope])

  useEffect(() => {
    window.localStorage.setItem('docketos.calendarNotes', JSON.stringify(calendarNotes))
  }, [calendarNotes])

  useEffect(() => {
    window.localStorage.setItem('docketos.centerPanelSlots', JSON.stringify(centerPanelSlots))
  }, [centerPanelSlots])

  useEffect(() => {
    window.localStorage.setItem('docketos.projectInfoByProject', JSON.stringify(projectInfoByProject))
  }, [projectInfoByProject])

  useEffect(() => {
    window.localStorage.setItem('docketos.plainNotesByBox', JSON.stringify(plainNotesByBox))
  }, [plainNotesByBox])

  useEffect(() => {
    window.localStorage.setItem('docketos.timesheetEntriesByProject', JSON.stringify(timesheetEntriesByProject))
  }, [timesheetEntriesByProject])

  useEffect(() => {
    window.localStorage.setItem('docketos.timesheetTimersByProject', JSON.stringify(timesheetTimersByProject))
  }, [timesheetTimersByProject])

  useEffect(() => {
    window.localStorage.setItem('docketos.fileFlagsByProject', JSON.stringify(fileFlagsByProject))
  }, [fileFlagsByProject])

  useEffect(() => {
    const hasRunningTimer = Object.values(timesheetTimersByProject).some(timer => timer?.startedAt)
    if (!hasRunningTimer) return undefined
    const timer = window.setInterval(() => setTimesheetNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [timesheetTimersByProject])

  useEffect(() => {
    window.localStorage.setItem('docketos.projectActivityByProject', JSON.stringify(projectActivityByProject))
  }, [projectActivityByProject])

  useEffect(() => {
    window.localStorage.setItem('docketos.projectTimelineClearedAtByProject', JSON.stringify(projectTimelineClearedAtByProject))
  }, [projectTimelineClearedAtByProject])

  useEffect(() => {
    window.localStorage.setItem('docketos.quickFilingCustomPath', quickFilingCustomPath)
  }, [quickFilingCustomPath])

  useEffect(() => {
    recoverySnapshotDirtyRef.current = true
    recoveryProjectSnapshotRef.current = activeProject ? {
      id: activeProject.id,
      name: activeProject.name,
      rootPath: activeProject.root_path,
      subprojectId: activeSubproject?.id ?? null,
      subprojectLabel: activeSubproject?.display_name ?? null,
    } : null
  }, [activeProject?.id, activeProject?.name, activeProject?.root_path, activeSubproject?.id, activeSubproject?.display_name, todosByScope, todoListsByScope, activeTodoListBySlot, todoViewModeBySlot, noteSectionsByScope, activeNoteByScope, plainNotesByBox, calendarNotes, timesheetEntriesByProject, timesheetTimersByProject, fileFlagsByProject, projectInfoByProject, quickLinksByProject, permanentQuickLinks, projectActivityByProject, projectTimelineClearedAtByProject])

  useEffect(() => {
    if (!window.api?.backupCreateRecoverySnapshot) return undefined
    const intervalMs = normalizeRecoveryBackupIntervalMinutes(recoveryBackupIntervalMinutes) * 60 * 1000
    const timer = window.setInterval(async () => {
      if (!recoverySnapshotDirtyRef.current) return
      recoverySnapshotDirtyRef.current = false
      const result = await window.api.backupCreateRecoverySnapshot({
        reason: 'dashboard-scheduled-auto-save',
        project: recoveryProjectSnapshotRef.current,
        localStorage: collectDocketOsLocalStorageSnapshot(),
      })
      if (!result?.success) {
        recoverySnapshotDirtyRef.current = true
        console.warn('Recovery snapshot failed:', result?.error ?? 'Unknown error')
      }
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [recoveryBackupIntervalMinutes])

  // Sync state when another window (e.g. a popped-out box) writes to localStorage.
  // The storage event fires only in OTHER windows, so this won't loop back on itself.
  // Functional setState with JSON.stringify comparison bails out when content is unchanged,
  // preventing a second round-trip write that would re-trigger the event.
  useEffect(() => {
    function onStorage(event) {
      if (!event.key || event.newValue === null) return
      try {
        const val = JSON.parse(event.newValue)
        const sync = (setter) => setter(prev =>
          JSON.stringify(prev) === event.newValue ? prev : val
        )
        switch (event.key) {
          case 'docketos.todosByScope':
            if (val && typeof val === 'object') sync(setTodosByScope); break
          case 'docketos.todoListsByScope':
            if (val && typeof val === 'object') sync(setTodoListsByScope); break
          case 'docketos.activeTodoListBySlot':
            if (val && typeof val === 'object') sync(setActiveTodoListBySlot); break
          case 'docketos.todoViewModeBySlot':
            if (val && typeof val === 'object') sync(setTodoViewModeBySlot); break
          case 'docketos.noteSectionsByScope':
            if (val && typeof val === 'object') sync(setNoteSectionsByScope); break
          case 'docketos.activeNoteByScope':
            if (val && typeof val === 'object') sync(setActiveNoteByScope); break
          case 'docketos.plainNotesByBox':
            if (val && typeof val === 'object') sync(setPlainNotesByBox); break
          case 'docketos.timesheetEntriesByProject':
            if (val && typeof val === 'object') sync(setTimesheetEntriesByProject); break
          case 'docketos.timesheetTimersByProject':
            if (val && typeof val === 'object') sync(setTimesheetTimersByProject); break
          case 'docketos.fileFlagsByProject':
            if (val && typeof val === 'object') sync(setFileFlagsByProject); break
          case 'docketos.projectActivityByProject':
            if (val && typeof val === 'object') sync(setProjectActivityByProject); break
          case 'docketos.projectTimelineClearedAtByProject':
            if (val && typeof val === 'object') sync(setProjectTimelineClearedAtByProject); break
          case 'docketos.calendarNotes':
            if (Array.isArray(val)) sync(setCalendarNotes); break
          case 'docketos.quickLinksBySubproject':
            if (val && typeof val === 'object') sync(setQuickLinksByProject); break
          case 'docketos.permanentQuickLinks':
            if (Array.isArray(val)) sync(setPermanentQuickLinks); break
          case 'docketos.projectInfoByProject':
            if (val && typeof val === 'object') sync(setProjectInfoByProject); break
        }
      } catch {}
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!selectedTreeFolderPath) {
      setSelectedTreeFolderEntries([])
      setSelectedTreeFolderLoading(false)
      return
    }

    let disposed = false
    const folderPath = selectedTreeFolderPath
    setSelectedTreeFolderLoading(true)
    window.api.fsScanDir({ dirPath: folderPath }).then(entries => {
      if (disposed || selectedTreeFolderPath !== folderPath) return
      setSelectedTreeFolderEntries(entries)
    }).catch(() => {
      if (!disposed) setSelectedTreeFolderEntries([])
    }).finally(() => {
      if (!disposed) setSelectedTreeFolderLoading(false)
    })

    return () => {
      disposed = true
    }
  }, [selectedTreeFolderPath])

  useEffect(() => {
    if (!activeSubproject) {
      setSubprojectKanban(null)
      setSubfolderOptions([])
      setSelectedSubfolderPath('')
      setFolderChildrenByPath({})
      setExpandedFolderPaths({})
      setLoadingFolderPaths({})
      return
    }

    let disposed = false
    const subprojectPath = activeSubproject.subproject_path

    window.api.fsListFolders({ dirPath: subprojectPath }).then(folders => {
      if (disposed) return
      if (activeSubprojectRef.current?.subproject_path !== subprojectPath) return
      setSubfolderOptions(folders)
      if (!folders.length) {
        setSelectedSubfolderPath('')
        setFolderChildrenByPath({})
        setExpandedFolderPaths({})
        setLoadingFolderPaths({})
        return
      }

      const preferred = selectedSubfolderName
        ? folders.find(folder => folder.name.toLowerCase() === selectedSubfolderName.toLowerCase())
        : null
      const nextSelected = (preferred ?? folders[0]).fullPath
      setSelectedSubfolderPath(nextSelected)
    })

    window.api.fsScanDir({ dirPath: subprojectPath }).then(entries => {
      if (disposed) return
      if (activeSubprojectRef.current?.subproject_path !== subprojectPath) return
      setSubprojectKanban(buildSubprojectKanban(entries))
    })

    return () => {
      disposed = true
    }
  }, [activeProject, activeSubproject, selectedSubfolderName])

  useEffect(() => {
    if (!selectedSubfolderPath) return
    let disposed = false
    const selectedPath = selectedSubfolderPath
    setLoadingFolderPaths(prev => ({ ...prev, [selectedPath]: true }))
    window.api.fsScanDir({ dirPath: selectedPath }).then(entries => {
      if (disposed) return
      setFolderChildrenByPath(prev => ({ ...prev, [selectedPath]: entries }))
      setExpandedFolderPaths(prev => ({ ...prev, [selectedPath]: true }))
      setLoadingFolderPaths(prev => ({ ...prev, [selectedPath]: false }))
    })

    return () => {
      disposed = true
    }
  }, [selectedSubfolderPath])

  useEffect(() => {
    if (!activeProject) {
      setSubprojects([])
      setSubprojectDiscovery(null)
      return
    }

    let disposed = false
    setSubprojectDiscovery({ status: 'loading', rootPath: activeProject.root_path })
    listSubprojectsForProject(activeProject, window.api.fsListFolders).then(result => {
      if (disposed) return
      setSubprojects(result.subprojects)
      setSubprojectDiscovery({
        status: 'ready',
        rootPath: activeProject.root_path,
        technicalPath: result.technicalPath,
        count: result.subprojects.length,
      })
    }).catch(() => {
      if (!disposed) {
        setSubprojects([])
        setSubprojectDiscovery({ status: 'error', rootPath: activeProject.root_path })
      }
    })

    return () => {
      disposed = true
    }
  }, [activeProject])

  useEffect(() => {
    if (!activeProject || !activeSubproject) return
    if (isDirectTechnicalSubproject(activeProject, activeSubproject.subproject_path)) return
    setActiveSubproject(null)
    setSubprojectPhaseKey('masterplan')
  }, [activeProject, activeSubproject])

  useEffect(() => {
    if (!folderContextMenu) return
    function handleCloseMenu() {
      setFolderContextMenu(null)
    }
    window.addEventListener('mousedown', handleCloseMenu)
    return () => window.removeEventListener('mousedown', handleCloseMenu)
  }, [folderContextMenu])

  useEffect(() => {
    if (!todoContextMenu) return
    function handleCloseMenu() {
      setTodoContextMenu(null)
    }
    window.addEventListener('mousedown', handleCloseMenu)
    return () => window.removeEventListener('mousedown', handleCloseMenu)
  }, [todoContextMenu])

  useEffect(() => {
    if (!noteContextMenu) return
    function handleCloseMenu() {
      setNoteContextMenu(null)
    }
    window.addEventListener('mousedown', handleCloseMenu)
    return () => window.removeEventListener('mousedown', handleCloseMenu)
  }, [noteContextMenu])

  useEffect(() => {
    const applyCenterGridMove = pointer => {
      if (!dragState.current) return

      if (dragState.current.type === 'center-grid-column') {
        const { index, startX, startWeights, width } = dragState.current
        const totalWeight = startWeights.reduce((sum, weight) => sum + weight, 0)
        const deltaWeight = ((pointer.clientX - startX) / Math.max(width, 1)) * totalWeight
        setCenterGridColumnWeights(prev => {
          const next = [...prev]
          const leftStart = startWeights[index] ?? 1
          const rightStart = startWeights[index + 1] ?? 1
          const pairTotal = leftStart + rightStart
          const nextLeft = Math.max(0.35, Math.min(pairTotal - 0.35, leftStart + deltaWeight))
          next[index] = nextLeft
          next[index + 1] = pairTotal - nextLeft
          return next
        })
      }

      if (dragState.current.type === 'center-grid-row') {
        const { index, columnIndex, startY, startWeights, height } = dragState.current
        const totalWeight = startWeights.reduce((sum, weight) => sum + weight, 0)
        const deltaWeight = ((pointer.clientY - startY) / Math.max(height, 1)) * totalWeight
        setCenterGridColumnRowWeights(prev => {
          const nextWeights = [...startWeights]
          const upperStart = startWeights[index] ?? 1
          const lowerStart = startWeights[index + 1] ?? 1
          const pairTotal = upperStart + lowerStart
          const nextUpper = Math.max(0.35, Math.min(pairTotal - 0.35, upperStart + deltaWeight))
          nextWeights[index] = nextUpper
          nextWeights[index + 1] = pairTotal - nextUpper
          return { ...prev, [columnIndex]: nextWeights }
        })
      }
    }

    const scheduleCenterGridMove = event => {
      pendingCenterGridPointerRef.current = { clientX: event.clientX, clientY: event.clientY }
      if (centerGridResizeFrameRef.current !== null) return
      centerGridResizeFrameRef.current = window.requestAnimationFrame(() => {
        centerGridResizeFrameRef.current = null
        const pointer = pendingCenterGridPointerRef.current
        pendingCenterGridPointerRef.current = null
        if (pointer) applyCenterGridMove(pointer)
      })
    }

    const handleMove = event => {
      if (!dragState.current) return

      if (dragState.current.type === 'left-panel-width') {
        const rightSpace = rightCollapsed ? 0 : rightWidth
        const nextWidth = Math.max(220, Math.min(event.clientX, window.innerWidth - rightSpace - 420))
        setLeftWidth(nextWidth)
      }

      if (dragState.current.type === 'right-panel-width') {
        const leftSpace = leftCollapsed ? 0 : leftWidth
        const nextWidth = Math.max(260, Math.min(window.innerWidth - event.clientX - 8, window.innerWidth - leftSpace - 420))
        setRightWidth(nextWidth)
      }

      if (dragState.current.type === 'file-name-column') {
        const { startX, startWidth } = dragState.current
        const nextWidth = Math.max(110, Math.min(520, startWidth + event.clientX - startX))
        setFileNameColumnWidth(nextWidth)
      }

      if (dragState.current.type === 'left-panel-vertical') {
        const { upperKey, startY, startUpperHeight } = dragState.current
        const delta = event.clientY - startY
        const nextUpper = Math.max(80, startUpperHeight + delta)
        setLeftSectionHeights(prev => ({ ...prev, [upperKey]: nextUpper }))
      }

      if (dragState.current.type === 'right-panel-vertical') {
        const { upperKey, startY, startUpperHeight } = dragState.current
        const delta = event.clientY - startY
        const nextUpper = Math.max(80, startUpperHeight + delta)
        setRightSectionHeights(prev => ({ ...prev, [upperKey]: nextUpper }))
      }

      if (dragState.current.type === 'left-panel-footer') {
        const { startY, startHeight, sectionKey } = dragState.current
        const min = 180
        const max = Math.max(min, window.innerHeight - 380)
        const nextHeight = Math.max(min, Math.min(startHeight + (event.clientY - startY), max))
        setLeftSectionHeights(prev => ({ ...prev, [sectionKey]: nextHeight }))
      }

      if (dragState.current.type === 'center-split') {
        const { startY, startHeight, maxHeight } = dragState.current
        const delta = event.clientY - startY
        const newHeight = Math.min(maxHeight - 120, Math.max(120, startHeight + delta))
        setCenterKanbanHeight(newHeight)
      }

      if (dragState.current.type === 'center-grid-column') {
        scheduleCenterGridMove(event)
      }

      if (dragState.current.type === 'center-grid-row') {
        scheduleCenterGridMove(event)
      }
    }

    const handleUp = () => {
      if (centerGridResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(centerGridResizeFrameRef.current)
        centerGridResizeFrameRef.current = null
      }
      if (pendingCenterGridPointerRef.current) {
        applyCenterGridMove(pendingCenterGridPointerRef.current)
        pendingCenterGridPointerRef.current = null
      }
      dragState.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      if (centerGridResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(centerGridResizeFrameRef.current)
        centerGridResizeFrameRef.current = null
      }
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [])

  useEffect(() => {
    function handleCommandPaletteKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setShowCommandPalette(true)
      }
    }
    window.addEventListener('keydown', handleCommandPaletteKey)
    return () => window.removeEventListener('keydown', handleCommandPaletteKey)
  }, [])

  function beginResizeLeft(event) {
    event.preventDefault()
    if (leftCollapsed) {
      const rightSpace = rightCollapsed ? 0 : rightWidth
      const initialWidth = Math.max(220, Math.min(event.clientX, window.innerWidth - rightSpace - 420))
      setLeftCollapsed(false)
      setLeftWidth(initialWidth)
    }
    dragState.current = { type: 'left-panel-width' }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function beginResizeRight(event) {
    event.preventDefault()
    if (rightCollapsed) {
      const leftSpace = leftCollapsed ? 0 : leftWidth
      const initialWidth = Math.max(260, Math.min(window.innerWidth - event.clientX - 8, window.innerWidth - leftSpace - 420))
      setRightCollapsed(false)
      setRightWidth(initialWidth)
    }
    dragState.current = { type: 'right-panel-width' }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function beginFileNameColumnResize(event) {
    event.preventDefault()
    event.stopPropagation()
    dragState.current = {
      type: 'file-name-column',
      startX: event.clientX,
      startWidth: fileNameColumnWidth,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function getFileNameColumnTextStyle(extra = {}) {
    const overlap = Math.max(0, fileNameColumnWidth - DEFAULT_FILE_NAME_COLUMN_WIDTH)
    const maskBackground = extra.backgroundColor ?? S.panel.backgroundColor
    return {
      minWidth: 0,
      width: `${fileNameColumnWidth}px`,
      flex: `0 0 ${fileNameColumnWidth}px`,
      maxWidth: `${fileNameColumnWidth}px`,
      marginRight: overlap ? `-${overlap}px` : 0,
      position: 'relative',
      zIndex: 2,
      backgroundColor: maskBackground,
      boxShadow: `8px 0 0 ${maskBackground}`,
      ...extra,
    }
  }

  function FileNameColumnHandle() {
    return (
      <span
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize filename column"
        onMouseDown={beginFileNameColumnResize}
        onClick={event => { event.preventDefault(); event.stopPropagation() }}
        className="shrink-0 cursor-col-resize rounded opacity-0 transition-colors group-hover:opacity-100 hover:bg-[#7A5CFF]/60"
        style={{ width: 6, height: 18, backgroundColor: 'rgba(122, 92, 255, 0.16)', transform: `translateX(${Math.max(0, fileNameColumnWidth - DEFAULT_FILE_NAME_COLUMN_WIDTH)}px)`, zIndex: 3 }}
      />
    )
  }

  function toggleLeftPanel() {
    setLeftCollapsed(prev => {
      if (prev) setLeftWidth(width => Math.max(220, width || DEFAULT_LAYOUT.leftWidth))
      return !prev
    })
  }

  function toggleRightPanel() {
    setRightCollapsed(prev => {
      if (prev) setRightWidth(width => Math.max(260, width || DEFAULT_LAYOUT.rightWidth))
      return !prev
    })
  }

  function beginVerticalResize(type, upperKey, lowerKey, event, heights, setHeights) {
    event.preventDefault()
    dragState.current = {
      type,
      upperKey,
      lowerKey,
      startY: event.clientY,
      startUpperHeight: heights[upperKey],
      startLowerHeight: heights[lowerKey],
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  function beginCenterSplitResize(event) {
    if (centerCanvasCollapsed || centerTopCollapsed) return
    event.preventDefault()
    const parentHeight = event.currentTarget.parentElement?.getBoundingClientRect().height ?? window.innerHeight
    dragState.current = {
      type: 'center-split',
      startY: event.clientY,
      startHeight: centerKanbanHeight,
      maxHeight: parentHeight,
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  function beginFooterResize(sectionKey, event) {
    event.preventDefault()
    dragState.current = {
      type: 'left-panel-footer',
      sectionKey,
      startY: event.clientY,
      startHeight: leftSectionHeights[sectionKey],
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  function moveSectionOrder(setOrder, dragKey, dropKey) {
    if (!dragKey || !dropKey || dragKey === dropKey) return
    setOrder(prev => {
      const from = prev.indexOf(dragKey)
      const to = prev.indexOf(dropKey)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function beginSectionDrag(event, key, setDraggingKey) {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
    setDraggingKey(key)
  }

  function handleSectionDragOver(event, draggingKey, dropKey, setOrder, setDraggingKey, setDropTargetKey) {
    if (!draggingKey || draggingKey === dropKey) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetKey(dropKey)
    moveSectionOrder(setOrder, draggingKey, dropKey)
  }

  function finishSectionDrag(draggingKey, setDraggingKey, setDropTargetKey, setLandedKey) {
    if (draggingKey) {
      const timeoutRef = setLandedKey === setLandedLeftSectionKey ? landedLeftSectionTimeoutRef : landedRightSectionTimeoutRef
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      setLandedKey(draggingKey)
      timeoutRef.current = window.setTimeout(() => {
        setLandedKey(null)
        timeoutRef.current = null
      }, 420)
    }
    setDraggingKey(null)
    setDropTargetKey(null)
  }

  function getPanelSectionStyle(baseStyle, isDragging, isDropTarget, isLanded = false) {
    return {
      ...baseStyle,
      position: 'relative',
      marginTop: isDropTarget ? 10 : 0,
      marginBottom: isDropTarget ? 10 : 0,
      transition: 'margin 150ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, box-shadow 180ms ease, filter 180ms ease, border-color 180ms ease',
      transform: isLanded ? 'scale(1.018)' : isDragging ? 'translateY(-2px) scale(1.01)' : isDropTarget ? 'translateY(2px)' : 'scale(1)',
      opacity: isDragging ? 0.72 : 1,
      boxShadow: isDragging
        ? '0 0 0 1px rgba(122,92,255,0.55), 0 16px 34px rgba(0,0,0,0.38)'
        : isLanded
          ? '0 0 0 1px rgba(122,92,255,0.45), 0 8px 24px rgba(122,92,255,0.16)'
          : isDropTarget
            ? '0 0 0 1px rgba(122,92,255,0.35), 0 8px 24px rgba(122,92,255,0.10)'
          : 'none',
      filter: isDropTarget || isLanded ? 'brightness(1.06)' : 'none',
      willChange: 'transform, opacity, margin',
    }
  }

  function getSectionHandleStyle(isDragging) {
    return {
      color: isDragging ? S.accent : S.zinc,
      transform: isDragging ? 'scale(1.08)' : 'scale(1)',
      transition: 'transform 140ms ease, color 140ms ease',
    }
  }

  function getDropIndicatorStyle(show) {
    return {
      position: 'absolute',
      left: 10,
      right: 10,
      top: 0,
      height: 2,
      borderRadius: 999,
      backgroundColor: S.accent,
      opacity: show ? 1 : 0,
      transform: show ? 'scaleX(1)' : 'scaleX(0.35)',
      transformOrigin: 'center',
      transition: 'opacity 140ms ease, transform 160ms cubic-bezier(0.22, 1, 0.36, 1)',
      pointerEvents: 'none',
    }
  }

  function toggleCenterCanvas() {
    setCenterCanvasCollapsed(prev => {
      if (!prev && centerTopCollapsed) setCenterTopCollapsed(false)
      return !prev
    })
  }

  function toggleCenterTop() {
    setCenterTopCollapsed(prev => {
      if (!prev && centerCanvasCollapsed) setCenterCanvasCollapsed(false)
      return !prev
    })
  }

  async function activateProject(project) {
    setDocAnalysisPending(null)
    setFileSearchResults([])
    setFileSearchQuery('')
    setFolderChildrenByPath({})
    setExpandedFolderPaths({})
    setFolderContextMenu(null)
    layoutReadyProjectIdRef.current = null
    if (!isBoxPopout) {
      const result = await window.api.projectsSetActive(project.id)
      if (result && !result.success) return
    }
    const layout = loadLayout(project.id)
    applyLayout(layout)
    layoutReadyProjectIdRef.current = project.id
    setActiveProject(project)
    setSelectedTreeFolderPath(null)
    setProjectPhaseKey(project.current_phase ?? 'masterplan')
    setActiveSubproject(null)
    setProjectOverviewSelected(false)
    setSubprojectPhaseKey('masterplan')
  }

  async function handleSetActive(project) {
    setShowDropdown(false)
    await activateProject(project)
  }

  async function handleProjectCreated(project) {
    setProjects(prev => [...prev, project])
    setShowNewProject(false)
    await activateProject(project)
  }

  function handleOpenEditProject() {
    if (!activeProject) return
    setEditProjectForm({
      name: activeProject.name ?? '',
      description: activeProject.description ?? '',
      root_path: activeProject.root_path ?? '',
    })
    setEditProjectError(null)
    setShowDropdown(false)
    setShowEditProject(true)
  }

  async function handleBrowseEditProjectRoot() {
    const picked = await window.api.folderBrowse()
    if (picked) setEditProjectForm(prev => ({ ...prev, root_path: picked }))
  }

  async function handleSaveEditProject() {
    if (!activeProject) return
    const name = editProjectForm.name.trim()
    const rootPath = editProjectForm.root_path.trim()
    if (!name || !rootPath) {
      setEditProjectError('Name and starting folder are required.')
      return
    }
    setEditProjectLoading(true)
    setEditProjectError(null)
    try {
      const result = await window.api.projectsUpdate({
        id: activeProject.id,
        name,
        description: editProjectForm.description.trim() || null,
        root_path: rootPath,
      })
      if (!result?.success) {
        setEditProjectError(result?.error ?? 'Project update failed')
        return
      }
      setProjects(prev => prev.map(project => project.id === result.project.id ? result.project : project).sort((a, b) => a.name.localeCompare(b.name)))
      setShowEditProject(false)
      await activateProject(result.project)
    } catch (e) {
      setEditProjectError(e.message)
    } finally {
      setEditProjectLoading(false)
    }
  }

  async function handleDeleteSelectedProject() {
    if (!projectToDeleteId) return
    const result = await window.api.projectsDelete({ id: projectToDeleteId })
    if (!result?.success) {
      setDeleteProjectError(result?.error ?? 'Failed to delete project')
    }
  }

  async function refreshActiveProjectSubprojects() {
    const project = activeProjectRef.current ?? activeProject
    if (!project) return
    setSubprojectDiscovery({ status: 'loading', rootPath: project.root_path })
    try {
      const [projectList, result, kanbanColumns] = await Promise.all([
        window.api.projectsList(),
        listSubprojectsForProject(project, window.api.fsListFolders),
        window.api.kanbanGetColumns().catch(() => null),
      ])
      setProjects(projectList)
      const refreshedProject = projectList.find(item => item.id === project.id) ?? project
      setActiveProject(refreshedProject)
      if (kanbanColumns) setKanban(kanbanColumns)

      const currentSubproject = activeSubprojectRef.current
      let nextSubprojects = result.subprojects
      if (currentSubproject) {
        const refreshedSubproject = result.subprojects.find(item => item.subproject_path === currentSubproject.subproject_path)
        if (refreshedSubproject) {
          const ensured = await window.api.subprojectsEnsure({
            projectId: refreshedProject.id,
            subprojectPath: refreshedSubproject.subproject_path,
            displayName: refreshedSubproject.display_name,
          })
          setProjectOverviewSelected(false)
          setActiveSubproject(ensured)
          setSubprojectPhaseKey(ensured.current_phase ?? 'masterplan')
          nextSubprojects = result.subprojects.map(item => item.subproject_path === ensured.subproject_path ? ensured : item)
        }
      }

      setSubprojects(nextSubprojects)
      setSubprojectDiscovery({
        status: 'ready',
        rootPath: refreshedProject.root_path,
        technicalPath: result.technicalPath,
        count: result.subprojects.length,
      })
    } catch {
      setSubprojects([])
      setSubprojectDiscovery({ status: 'error', rootPath: project.root_path })
    }
  }

  async function handleFolderSelect(folder) {
    if (!activeProject) return
    setSelectedTreeFolderPath(folder.fullPath)
    if (isTechnicalFolderName(folder.name)) {
      const folders = await window.api.fsListFolders({ dirPath: folder.fullPath })
      const nextSubprojects = makeSubprojectsFromFolders(activeProject, folders)
      setSubprojects(nextSubprojects)
      setSubprojectDiscovery({
        status: 'ready',
        rootPath: activeProject.root_path,
        technicalPath: folder.fullPath,
        count: nextSubprojects.length,
      })
      return
    }
    const nestedTechnicalFolder = await findTechnicalFolder(folder.fullPath, window.api.fsListFolders)
    if (nestedTechnicalFolder?.fullPath) {
      const folders = await window.api.fsListFolders({ dirPath: nestedTechnicalFolder.fullPath })
      const nextSubprojects = makeSubprojectsFromFolders(activeProject, folders)
      setSubprojects(nextSubprojects)
      setSubprojectDiscovery({
        status: 'ready',
        rootPath: activeProject.root_path,
        technicalPath: nestedTechnicalFolder.fullPath,
        count: nextSubprojects.length,
      })
      return
    }
  }

  async function handleActivateSubproject(subproject) {
    if (!activeProject) return
    if (!isDirectTechnicalSubproject(activeProject, subproject.subproject_path)) return
    const ensured = await window.api.subprojectsEnsure({
      projectId: activeProject.id,
      subprojectPath: subproject.subproject_path,
      displayName: subproject.display_name,
    })
    setProjectOverviewSelected(false)
    setActiveSubproject(ensured)
    setSubprojectPhaseKey(ensured.current_phase ?? 'masterplan')
    setSubprojects(prev => prev.map(item => item.subproject_path === ensured.subproject_path ? ensured : item))
  }

  function handleActivateProjectOverview() {
    if (!activeProject) return
    setActiveSubproject(null)
    setProjectOverviewSelected(true)
    setSubprojectPhaseKey('masterplan')
  }

  function handleClearActiveSelection() {
    setActiveSubproject(null)
    setProjectOverviewSelected(false)
    setSubprojectPhaseKey('masterplan')
  }

  async function handleSetPhase(phaseKey) {
    const phaseLabel = PHASES.find(phase => phase.key === phaseKey)?.label ?? phaseKey
    if (activeSubproject) {
      setSubprojectPhaseKey(phaseKey)
      await window.api.subprojectsUpdatePhase({ id: activeSubproject.id, phase: phaseKey })
    } else if (activeProject) {
      setProjectPhaseKey(phaseKey)
      await window.api.projectsUpdatePhase({ id: activeProject.id, phase: phaseKey })
      appendProjectActivityItems({
        kind: 'event',
        changeType: 'phase',
        title: 'Project phase changed',
        detail: phaseLabel,
      })
    }
  }

  async function handleExecuteScript() {
    if (!filingName.trim()) return
    setFilingLoading(true)
    try {
      const sourcePaths = quickFilingQueue.map(item => item.path)
      const result = await window.api.filingCreateFolder({
        name: filingName.trim(),
        sourcePaths,
        mode: quickFilingMode,
        destinationKey: quickFilingDestination,
        customDestinationPath: quickFilingCustomPath,
      })
      if (result.success) {
        if (result.filedCount > 0) clearQuickFilingQueue()
        const action = result.mode === 'move' ? 'moved' : 'copied'
        const filedMessage = result.filedCount > 0 ? ` · ${result.filedCount} item${result.filedCount === 1 ? '' : 's'} ${action}` : ''
        setFilingToast({ type: 'ok', message: `✓ ${result.folderName}${filedMessage}` })
        const filedItems = Array.isArray(result.files) ? result.files : []
        appendProjectActivityItems(filedItems.length > 0
          ? filedItems.map(item => ({
            kind: 'event',
            changeType: 'filed',
            title: `${item.name ?? getPathName(item.destinationPath) ?? 'File'} ${action}`,
            detail: `${item.sourcePath ?? item.name ?? 'File'} -> ${item.destinationPath ?? result.folderPath ?? result.folderName}`,
            path: item.destinationPath ?? result.folderPath ?? null,
            meta: { destination: item.destinationFolder ?? result.folderPath ?? result.folderName },
          }))
          : {
            kind: 'event',
            changeType: 'filed',
            title: 'Filing folder created',
            detail: `${result.folderName} -> ${result.folderPath ?? 'Filing destination'}`,
            path: result.folderPath ?? null,
          })
      } else {
        setFilingToast({ type: 'error', message: result.error || 'Unknown error' })
      }
    } catch (e) {
      setFilingToast({ type: 'error', message: e.message })
    } finally {
      setFilingLoading(false)
      setFilingName('')
    }
  }

  function handleQuickFilingDragStart(event, paths) {
    const sourcePaths = (Array.isArray(paths) ? paths : [paths]).filter(Boolean)
    if (!sourcePaths.length) return
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData(QUICK_FILING_DRAG_MIME, JSON.stringify(sourcePaths))
    event.dataTransfer.setData('text/plain', sourcePaths.join('\n'))
  }

  function handleFileMoveDragEnd() {
    setFileMoveDropTargetPath(null)
  }

  function hasFileMoveDragPayload(event) {
    const types = Array.from(event.dataTransfer?.types ?? [])
    return types.includes(TEMPLATE_FILE_DRAG_MIME)
      || types.includes(TEMPLATE_FILE_DRAG_MIME_ALT)
      || types.includes(QUICK_FILING_DRAG_MIME)
      || types.includes('Files')
      || types.includes('text/plain')
  }

  function handleFileMoveDragOver(event) {
    // Always allow drop on folder targets; the drop handler decides what to do
    // with the payload. Sniffing dataTransfer.types during dragover is fragile
    // across Chromium/Electron versions, especially for custom MIME types.
    event.preventDefault()
    event.stopPropagation()
    const types = Array.from(event.dataTransfer?.types ?? [])
    const isTemplate = types.includes(TEMPLATE_FILE_DRAG_MIME) || types.includes(TEMPLATE_FILE_DRAG_MIME_ALT)
    if (event.dataTransfer) event.dataTransfer.dropEffect = isTemplate ? 'copy' : 'move'
    const currentTargetPath = event.currentTarget?.dataset?.dropPath ?? null
    if (currentTargetPath && currentTargetPath !== fileMoveDropTargetPath) {
      setFileMoveDropTargetPath(currentTargetPath)
    }
    return true
  }

  function handleFileMoveDragLeave(event) {
    const currentTargetPath = event.currentTarget?.dataset?.dropPath ?? null
    if (!currentTargetPath || fileMoveDropTargetPath !== currentTargetPath) return
    if (event.currentTarget?.contains?.(event.relatedTarget)) return
    setFileMoveDropTargetPath(null)
  }

  async function handleFileMoveDrop(event, destinationPath) {
    if (!destinationPath) return

    const tplPayload = event.dataTransfer?.getData(TEMPLATE_FILE_DRAG_MIME)
      || event.dataTransfer?.getData(TEMPLATE_FILE_DRAG_MIME_ALT)
    if (tplPayload) {
      try {
        const { sourcePath, destName, stagingId } = JSON.parse(tplPayload)
        event.preventDefault()
        setFileMoveDropTargetPath(null)
        const result = await window.api.fsCopyFile({ from: sourcePath, to: destinationPath, destName })
        if (result.success) {
          setTplStagingItems(prev => prev.filter(s => s.id !== stagingId))
          setTplToast({ type: 'ok', message: `Copied ${destName || sourcePath.split(/[\\/]/).pop()} ✓` })
          refreshFolderListing(destinationPath)
        } else {
          setTplToast({ type: 'error', message: result.error ?? 'Copy failed' })
        }
      } catch {}
      return
    }

    const sourcePaths = getQuickFilingDropPaths(event)
    if (!sourcePaths.length) return
    event.preventDefault()
    event.stopPropagation()
    setFileMoveDropTargetPath(null)

    const moveResults = []
    for (const sourcePath of sourcePaths) {
      if (!sourcePath || sourcePath === destinationPath) continue
      const result = await window.api.fsMoveFile({ from: sourcePath, to: destinationPath, confirmed: true })
      moveResults.push({ sourcePath, result })
    }

    const failures = moveResults.filter(item => !item.result?.success)
    if (failures.length > 0) {
      setFilingToast({ type: 'error', message: failures[0]?.result?.error ?? 'Failed to move file' })
      return
    }

    if (moveResults.length > 0) {
      const movedCount = moveResults.length
      setFilingToast({ type: 'ok', message: `Moved ${movedCount} file${movedCount === 1 ? '' : 's'}` })
      appendProjectActivityItems(moveResults.map(({ sourcePath, result }) => {
        const movedPath = result.fullPath ?? destinationPath
        const fileName = getPathName(movedPath) || getPathName(sourcePath) || 'File'
        return {
          kind: 'event',
          changeType: 'moved',
          title: `${fileName} moved`,
          detail: `${sourcePath} -> ${movedPath}`,
          path: movedPath,
          meta: { destination: destinationPath },
        }
      }))
      const refreshPaths = new Set([destinationPath, ...sourcePaths.map(getParentPath).filter(Boolean)])
      await Promise.all([...refreshPaths].map(refreshFolderListing))
      if (selectedTreeFolderPath && refreshPaths.has(selectedTreeFolderPath)) {
        const entries = await window.api.fsScanDir({ dirPath: selectedTreeFolderPath })
        setSelectedTreeFolderEntries(entries)
      }
    }
  }

  function getQuickFilingDropPaths(event) {
    const internalPayload = event.dataTransfer?.getData(QUICK_FILING_DRAG_MIME)
    if (internalPayload) {
      try {
        const parsed = JSON.parse(internalPayload)
        if (Array.isArray(parsed)) return parsed.filter(Boolean)
      } catch {}
    }
    const filePaths = Array.from(event.dataTransfer?.files ?? [])
      .map(file => file.path)
      .filter(Boolean)
    if (filePaths.length) return filePaths
    const textPaths = String(event.dataTransfer?.getData('text/plain') ?? '')
      .split(/\r?\n/)
      .map(path => path.trim())
      .filter(Boolean)
    return textPaths
  }

  function makeQuickFilingQueueItem(path, source = {}) {
    return {
      path,
      name: source.name ?? getPathName(path),
      isDirectory: !!source.isDirectory,
    }
  }

  function addQuickFilingQueueItems(items) {
    const nextItems = items
      .map(item => typeof item === 'string' ? makeQuickFilingQueueItem(item) : makeQuickFilingQueueItem(item.fullPath ?? item.path, item))
      .filter(item => item.path)
    if (!nextItems.length) {
      setFilingToast({ type: 'error', message: 'No file paths found' })
      return
    }

    setQuickFilingQueue(prev => {
      const seen = new Set(prev.map(item => item.path.toLowerCase()))
      const additions = nextItems.filter(item => {
        const key = item.path.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (!additions.length) return prev
      return [...prev, ...additions]
    })
    setFilingToast({ type: 'ok', message: `Added ${nextItems.length} item${nextItems.length === 1 ? '' : 's'} to Quick Filing` })
  }

  function removeQuickFilingQueueItem(path) {
    setQuickFilingQueue(prev => prev.filter(item => item.path !== path))
  }

  function clearQuickFilingQueue() {
    setQuickFilingQueue([])
  }

  async function handleQuickFilingDrop(event) {
    event.preventDefault()
    event.stopPropagation()
    setQuickFilingDragging(false)
    addQuickFilingQueueItems(getQuickFilingDropPaths(event))
  }

  function handleSendEntryToQuickFiling(entry) {
    const path = entry?.fullPath ?? entry?.path
    if (!path) return
    setFolderContextMenu(null)
    addQuickFilingQueueItems([{ ...entry, path }])
  }

  async function handleOpenTemplate() {
    if (!selectedTpl) return
    const id = Number(selectedTpl)
    const result = await window.api.templatesOpenFile({ id })
    if (result.success) {
      setTplToast({ type: 'ok', message: 'Template opened' })
    } else {
      setTplToast({ type: 'error', message: result.error })
    }
  }

  async function handleRunAudit() {
    if (geminiAuditRunning || !activeProject) return
    setGeminiAuditRunning(true)
    try {
      await window.api.geminiRunManual()
    } finally {
      setGeminiAuditRunning(false)
    }
  }

  async function handleSmartMove(filePath) {
    const item = geminiResults.find(r => r.filePath === filePath)
    if (!item) return
    const result = await window.api.fsMoveFile({ from: item.filePath, to: item.suggestedPath, confirmed: true })
    if (result.success) {
      setGeminiResults(prev => prev.map(r => r.filePath === filePath ? { ...r, _moved: true } : r))
      appendProjectActivityItems({
        kind: 'event',
        changeType: 'moved',
        title: 'File moved by Gemini suggestion',
        detail: `${item.filePath} -> ${result.fullPath ?? item.suggestedPath}`,
        path: result.fullPath ?? item.suggestedPath,
      })
    } else {
      setGeminiResults(prev => prev.map(r => r.filePath === filePath ? { ...r, _moveError: result.error } : r))
    }
    setGeminiConfirm(null)
  }

  async function handleReport() {
    if (!activeProject) return
    const projectPrefix = `${activeProject.id}:`
    await window.api.reportGenerate({
      projectId: activeProject.id,
      projectInfo: activeProjectInfo,
      calendarNotes,
      timelineItems,
      timesheetEntries,
      projectTasks: buildReportProjectTasks(),
      noteSectionsByScope: Object.fromEntries(Object.entries(noteSectionsByScope).filter(([k]) => k.startsWith(projectPrefix))),
      plainNotesByBox: Object.fromEntries(Object.entries(plainNotesByBox).filter(([k]) => k.startsWith(projectPrefix))),
    })
    appendProjectActivityItems({ kind: 'event', changeType: 'report', title: 'Project report generated', detail: activeProject.name })
  }
  handleReportRef.current = handleReport

  async function handleDocAnalyse() {
    if (!docAnalysisDialog?.filePath) return
    const { filePath, fileName, question: rawQuestion, length, model } = docAnalysisDialog
    const lengthInstruction = length === 'detailed'
      ? '\n\nProvide a detailed, structured response with clear sections and headings.'
      : '\n\nBe concise — one short paragraph.'
    const question = `${rawQuestion}${lengthInstruction}`
    setDocAnalysisDialog(null)
    setDocAnalysisPending({ fileName })
    const res = await window.api.geminiAnalyseDocument({ filePath, question, model })
    setDocAnalysisPending(null)
    if (res.success) {
      const entry = { id: crypto.randomUUID(), fileName, filePath, result: res.result, question: rawQuestion, length, model, time: new Date().toLocaleTimeString() }
      setDocAnalysisHistory(prev => [entry, ...prev])
      setDocAnalysisResult({ id: entry.id, fileName, filePath, result: res.result, question: rawQuestion, length })
    } else {
      setDocAnalysisDialog({ filePath, fileName, question: rawQuestion, length, model, loading: false, error: res.error ?? 'Analysis failed' })
    }
  }

  function handleClearDocAnalysisEntry(id) {
    setDocAnalysisHistory(prev => prev.filter(entry => entry.id !== id))
    setDocAnalysisResult(prev => (prev?.id === id ? null : prev))
  }

  async function handleCommandIndex() {
    if (!activeProject) return
    const result = await window.api.documentsIndexProject({ projectId: activeProject.id })
    setFilingToast(result?.success ? { type: 'ok', message: `Indexed ${result.count} files` } : { type: 'error', message: result?.error ?? 'Index failed' })
    if (result?.success) appendProjectActivityItems({ kind: 'event', changeType: 'indexed', title: 'Documents indexed', detail: `${result.count} file${result.count === 1 ? '' : 's'}` })
  }

  async function handleCommandImport() {
    if (!activeProject) return
    const result = await window.api.intakeImportFromDialog({ projectId: activeProject.id })
    if (result?.canceled) return
    setFilingToast(result?.success ? { type: 'ok', message: `Imported ${result.importedCount} items` } : { type: 'error', message: result?.error ?? 'Import failed' })
    if (result?.success) appendProjectActivityItems({ kind: 'event', changeType: 'imported', title: 'Files imported', detail: `${result.importedCount} item${result.importedCount === 1 ? '' : 's'}` })
  }

  async function handleCommandExport() {
    if (!activeProject) return
    const result = await window.api.backupCreate({ projectId: activeProject.id })
    setFilingToast(result?.success ? { type: 'ok', message: 'Local backup exported' } : { type: 'error', message: result?.error ?? 'Export failed' })
    if (result?.success) appendProjectActivityItems({ kind: 'event', changeType: 'exported', title: 'Local backup exported', detail: activeProject.name })
  }

  async function handleCommandBrief() {
    if (!activeProject) return
    const result = await window.api.briefsGenerate({ projectId: activeProject.id })
    setFilingToast(result?.success ? { type: 'ok', message: 'Project brief generated' } : { type: 'error', message: result?.error ?? 'Brief failed' })
    if (result?.success) appendProjectActivityItems({ kind: 'event', changeType: 'brief', title: 'Project brief generated', detail: activeProject.name })
  }

  function updateCalendarNote(date, patch) {
    const key = formatCalendarDateKey(date)
    setCalendarNotes(prev => {
      const existing = prev[key] ?? { note: '', color: CALENDAR_NOTE_COLORS[0] }
      return {
        ...prev,
        [key]: { ...existing, ...patch },
      }
    })
    if (patch.note !== undefined) {
      appendProjectActivityItems({
        kind: 'event',
        changeType: 'calendar',
        title: 'Calendar note updated',
        detail: key,
        coalesceKey: `calendar:${key}:note`,
      })
    }
  }

  function clearCalendarNote(date) {
    const key = formatCalendarDateKey(date)
    setCalendarNotes(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'calendar',
      title: 'Calendar note cleared',
      detail: key,
    })
  }

  const alertCount = geminiResults.filter(r => r.status === 'error' || r.status === 'warning').length
  const activePhaseKey = activeSubproject ? subprojectPhaseKey : projectPhaseKey
  const activePhaseIndex = PHASES.findIndex(p => p.key === activePhaseKey)
  const activeScopeLabel = activeSubproject ? `Subproject: ${activeSubproject.display_name}` : 'Project-level'
  const activeProjectInfo = activeProject
    ? normalizeProjectInfo(projectInfoByProject[activeProject.id] ?? DEFAULT_PROJECT_INFO)
    : DEFAULT_PROJECT_INFO
  const councilOptions = mergeSelectOptions(projectInfoLists.councils, activeProjectInfo.council)
  const projectManagerOptions = mergeSelectOptions(projectInfoLists.projectManagers, activeProjectInfo.projectManager)
  const waterAuthorityOptions = mergeSelectOptions(projectInfoLists.waterAuthorities, activeProjectInfo.waterAuthority)
  const todoScopeKey = activeProject ? `${activeProject.id}:${activeSubproject?.id ?? 'project'}` : null
  const todoLists = getTodoLists(todoScopeKey)
  const noteScopeKey = activeProject
    ? `${activeProject.id}:${String(activeSubproject?.subproject_path ?? 'project').toLowerCase()}`
    : null
  const plainNotesScopeKey = noteScopeKey
  const noteSections = normalizeNoteSections(noteScopeKey ? noteSectionsByScope[noteScopeKey] : [DEFAULT_NOTE_SECTION])
  const activeNoteId = noteScopeKey ? (activeNoteByScope[noteScopeKey] ?? noteSections[0]?.id ?? DEFAULT_NOTE_SECTION.id) : DEFAULT_NOTE_SECTION.id
  const activeNote = noteSections.find(note => note.id === activeNoteId) ?? noteSections[0] ?? DEFAULT_NOTE_SECTION
  const activeNoteCanvasKey = activeNote ? `note:${activeNote.id}` : 'note:project-notes'
  const quickLinksScopeKey = activeProject
    ? `${activeProject.id}:${String(activeSubproject?.subproject_path ?? 'project').toLowerCase()}`
    : null
  const quickLinks = quickLinksScopeKey ? (quickLinksByProject[quickLinksScopeKey] ?? []) : []
  const selectedTreeFolderParentPath = selectedTreeFolderPath ? getParentPath(selectedTreeFolderPath) : ''
  const canDropToSelectedTreeFolderParent = Boolean(
    selectedTreeFolderParentPath
    && activeProject?.root_path
    && selectedTreeFolderParentPath.toLowerCase().startsWith(activeProject.root_path.toLowerCase())
    && selectedTreeFolderParentPath !== selectedTreeFolderPath
  )
  const timesheetProjectKey = activeProject?.id ?? null
  const timesheetEntries = timesheetProjectKey ? (timesheetEntriesByProject[timesheetProjectKey] ?? []) : []
  const timesheetDraft = timesheetProjectKey
    ? (timesheetDraftByProject[timesheetProjectKey] ?? { date: formatCalendarDateKey(new Date()), task: '', hours: '', note: '' })
    : { date: formatCalendarDateKey(new Date()), task: '', hours: '', note: '' }
  const timesheetTimer = timesheetProjectKey ? (timesheetTimersByProject[timesheetProjectKey] ?? null) : null
  const timesheetTimerElapsedMs = timesheetTimer ? getTimesheetElapsedMs(timesheetTimer, timesheetNowMs) : 0
  const timesheetTotalHours = timesheetEntries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0)
  const timesheetGroups = groupTimesheetEntriesByDay(timesheetEntries)
  const dashboardKanban = subprojectKanban ?? kanban
  const dashboardFiles = ['todo', 'inProgress', 'done', 'unclassified']
    .flatMap(bucket => (dashboardKanban[bucket] ?? []).map(entry => ({ ...entry, _bucket: bucket })))
  const activeProjectFileFlags = activeProject?.id ? (fileFlagsByProject[activeProject.id] ?? {}) : {}

  function getFileFlag(path) {
    const key = normalizePathFlagKey(path)
    return key ? (activeProjectFileFlags[key] ?? null) : null
  }

  function setFileFlag(entry, color) {
    const rawPath = entry?.fullPath ?? entry?.path
    if (!activeProject?.id || !rawPath || !FILE_FLAG_KEYS.has(color)) return
    const path = String(rawPath)
    const key = normalizePathFlagKey(path)
    if (!key) return
    const option = FILE_FLAG_BY_KEY[color]
    const flag = {
      path,
      name: String(entry.name ?? getPathName(path) ?? '').trim() || getPathName(path),
      isDirectory: Boolean(entry.isDirectory),
      color,
      flaggedAt: Date.now(),
    }
    setFileFlagsByProject(prev => ({
      ...prev,
      [activeProject.id]: {
        ...(prev[activeProject.id] ?? {}),
        [key]: flag,
      },
    }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'flag',
      title: 'File flag set',
      detail: `${flag.name} · ${option?.label ?? color}`,
      path,
      meta: { flag: option?.label ?? color },
      coalesceKey: `file-flag:${key}`,
    })
    setFolderContextMenu(null)
  }

  function clearFileFlag(entry) {
    const rawPath = entry?.fullPath ?? entry?.path
    if (!activeProject?.id || !rawPath) return
    const path = String(rawPath)
    const key = normalizePathFlagKey(path)
    if (!key) return
    const current = activeProjectFileFlags[key]
    setFileFlagsByProject(prev => {
      const projectFlags = { ...(prev[activeProject.id] ?? {}) }
      delete projectFlags[key]
      return { ...prev, [activeProject.id]: projectFlags }
    })
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'flag',
      title: 'File flag cleared',
      detail: current?.name ?? getPathName(path),
      path,
      coalesceKey: `file-flag:${key}`,
    })
    setFolderContextMenu(null)
  }

  function getFlaggedItems(color, sort = 'type-name') {
    const items = Object.values(activeProjectFileFlags).filter(flag => flag?.color === color)
    switch (sort) {
      case 'name-asc':
        return items.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
      case 'name-desc':
        return items.sort((a, b) => String(b.name ?? '').localeCompare(String(a.name ?? '')))
      case 'date-desc':
        return items.sort((a, b) => Number(b.flaggedAt ?? 0) - Number(a.flaggedAt ?? 0))
      case 'date-asc':
        return items.sort((a, b) => Number(a.flaggedAt ?? 0) - Number(b.flaggedAt ?? 0))
      case 'type-name':
      default:
        return items.sort((a, b) => {
          if (Boolean(a.isDirectory) !== Boolean(b.isDirectory)) return a.isDirectory ? -1 : 1
          return String(a.name ?? '').localeCompare(String(b.name ?? ''))
        })
    }
  }

  function getFlaggedColor(slotIndex) {
    const color = flaggedColorBySlot[slotIndex]
    return FILE_FLAG_KEYS.has(color) ? color : FILE_FLAG_OPTIONS[0].key
  }

  function getFlaggedSort(slotIndex) {
    return flaggedSortBySlot[slotIndex] ?? 'type-name'
  }

  function getFlaggedShowAll(slotIndex) {
    return Boolean(flaggedShowAllBySlot[slotIndex])
  }

  function appendProjectActivityItems(items) {
    if (!activeProject?.id) return
    const contextMeta = {
      project: activeProject.name,
      scope: activeScopeLabel,
      subproject: activeSubproject?.display_name ?? '',
    }
    const nextItems = (Array.isArray(items) ? items : [items])
      .filter(Boolean)
      .map((item, index) => ({
        id: item.id ?? `activity-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        kind: item.kind ?? 'event',
        changeType: item.changeType ?? 'event',
        title: item.title ?? 'Project activity',
        detail: item.detail ?? '',
        path: item.path ?? null,
        bucket: item.bucket ?? null,
        coalesceKey: item.coalesceKey ?? null,
        meta: normalizeProjectActivityMeta({
          ...contextMeta,
          ...item.meta,
          action: item.title ?? 'Project activity',
        }),
        ts: Number(item.ts ?? Date.now()),
      }))
      .filter(isRelevantProjectActivityEntry)
    if (!nextItems.length) return
    setProjectActivityByProject(prev => {
      const existing = normalizeProjectActivityLog(prev[activeProject.id] ?? [])
      const next = [...existing]
      for (const item of nextItems) {
        const coalesceIndex = item.coalesceKey
          ? next.findIndex(existingItem => existingItem.coalesceKey === item.coalesceKey && Math.abs(Number(item.ts) - Number(existingItem.ts)) < 5000)
          : -1
        if (coalesceIndex >= 0) next[coalesceIndex] = { ...next[coalesceIndex], ...item }
        else next.unshift(item)
      }
      return {
        ...prev,
        [activeProject.id]: normalizeProjectActivityLog(next),
      }
    })
  }

  useEffect(() => {
    timelineHasSnapshotRef.current = false
    previousFileSnapshotRef.current = new Map()
    setTimelineChangeByPath({})
    setTimelineDeletedEvents([])
  }, [activeProject?.id, activeSubproject?.id])

  useEffect(() => {
    const currentMap = new Map()
    for (const entry of dashboardFiles) {
      if (entry.isDirectory) continue
      const key = getTimelineFileKey(entry)
      currentMap.set(key, {
        name: entry.name,
        path: entry.fullPath ?? entry.relativePath ?? null,
        detail: entry.relativePath ?? entry.fullPath ?? 'Project file',
        sizeBytes: Number(entry.sizeBytes ?? 0),
        mtime: entry.mtime ?? null,
      })
    }

    if (!timelineHasSnapshotRef.current) {
      timelineHasSnapshotRef.current = true
      previousFileSnapshotRef.current = currentMap
      return
    }

    const previousMap = previousFileSnapshotRef.current
    const nextChangeByPath = {}
    const now = Date.now()
    const activityEvents = []

    for (const [key, currentEntry] of currentMap.entries()) {
      const previousEntry = previousMap.get(key)
      if (!previousEntry) {
        nextChangeByPath[key] = 'new'
        activityEvents.push({
          kind: 'file',
          changeType: 'new',
          title: currentEntry.name || 'File added',
          detail: currentEntry.detail || currentEntry.path || 'Project file added',
          path: currentEntry.path,
          ts: now,
        })
        continue
      }

      const mtimeChanged = String(previousEntry.mtime ?? '') !== String(currentEntry.mtime ?? '')
      const sizeChanged = Number(previousEntry.sizeBytes ?? 0) !== Number(currentEntry.sizeBytes ?? 0)
      if (mtimeChanged || sizeChanged) {
        nextChangeByPath[key] = 'edited'
        activityEvents.push({
          kind: 'file',
          changeType: 'edited',
          title: currentEntry.name || 'File modified',
          detail: currentEntry.detail || currentEntry.path || 'Project file modified',
          path: currentEntry.path,
          ts: now,
        })
      }
    }

    const deletedEvents = []
    for (const [key, previousEntry] of previousMap.entries()) {
      if (currentMap.has(key)) continue
      deletedEvents.push({
        id: `deleted-${key}-${now}-${deletedEvents.length}`,
        kind: 'deleted',
        changeType: 'deleted',
        title: previousEntry.name || 'Deleted file',
        detail: previousEntry.detail || previousEntry.path || 'Project file removed',
        time: 'Just now',
        ts: now,
      })
    }
    activityEvents.push(...deletedEvents)

    setTimelineChangeByPath(prev => {
      const prevKeys = Object.keys(prev)
      const nextKeys = Object.keys(nextChangeByPath)
      if (prevKeys.length === nextKeys.length && prevKeys.every(key => prev[key] === nextChangeByPath[key])) {
        return prev
      }
      return nextChangeByPath
    })
    if (deletedEvents.length > 0) {
      setTimelineDeletedEvents(prev => [...deletedEvents, ...prev].slice(0, 10))
    }
    appendProjectActivityItems(activityEvents)

    previousFileSnapshotRef.current = currentMap
  }, [dashboardKanban])

  const recentFiles = dashboardFiles
    .filter(entry => !entry.isDirectory)
    .sort((a, b) => new Date(b.mtime ?? 0).getTime() - new Date(a.mtime ?? 0).getTime())
    .slice(0, 5)

  // Opened-files log filtered to current scope
  const openedFilesForPanel = (() => {
    const scopedLog = recentFilesShowAll
      ? openedFilesLog.filter(e => e.projectId === (activeProject?.id ?? null))
      : openedFilesLog.filter(e =>
          e.projectId === (activeProject?.id ?? null) &&
          e.subprojectId === (activeSubproject?.id ?? null)
        )
    // Dedupe by path — most recent open already wins since log is newest-first
    const seen = new Set()
    return scopedLog.filter(e => {
      if (seen.has(e.path)) return false
      seen.add(e.path)
      return true
    })
  })()
  const timelineClearedAt = activeProject?.id ? Number(projectTimelineClearedAtByProject[activeProject.id] ?? 0) : 0
  const projectActivityLog = activeProject?.id ? normalizeProjectActivityLog(projectActivityByProject[activeProject.id] ?? []) : []
  const timelineItems = [
    ...projectActivityLog.map(entry => ({ ...entry, time: formatRelativeTime(entry.ts) })),
    ...recentFiles.slice(0, 5).map(entry => ({
      id: `file-${entry.fullPath ?? entry.relativePath ?? entry.name}`,
      kind: 'file',
      changeType: timelineChangeByPath[getTimelineFileKey(entry)] ?? 'existing',
      bucket: entry._bucket,
      title: entry.name,
      detail: entry.relativePath ?? entry.fullPath ?? 'Project file',
      path: entry.fullPath ?? entry.relativePath ?? null,
      time: formatRelativeTime(entry.mtime),
      ts: entry.mtime ? new Date(entry.mtime).getTime() : Date.now(),
    })),
    ...timelineDeletedEvents,
    ...(geminiLastTime ? [{ id: 'gemini-last', kind: 'event', title: 'Gemini audit completed', detail: `${geminiResults.length} result${geminiResults.length === 1 ? '' : 's'}`, time: geminiLastTime, ts: Date.now() }] : []),
  ]
    .filter(item => !timelineClearedAt || (Number(item.ts) || 0) > timelineClearedAt)
    .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
    .slice(0, 24)

  function clearProjectTimeline() {
    if (!activeProject?.id) return
    const clearedAt = Date.now()
    setProjectTimelineClearedAtByProject(prev => ({ ...prev, [activeProject.id]: clearedAt }))
    setProjectActivityByProject(prev => ({ ...prev, [activeProject.id]: [] }))
    setTimelineChangeByPath({})
    setTimelineDeletedEvents([])
    setGeminiLastTime(null)
    timelineHasSnapshotRef.current = false
    previousFileSnapshotRef.current = new Map()
  }

  function getTimelineItemColor(item) {
    if (item.kind === 'deleted' || item.changeType === 'deleted') return '#FF453A'
    if (item.changeType === 'moved' || item.changeType === 'filed') return '#30D158'
    if (item.changeType === 'task' || item.changeType === 'calendar' || item.changeType === 'timesheet') return '#7A5CFF'
    if (item.changeType === 'note' || item.changeType === 'link' || item.changeType === 'layout') return '#BF5AF2'
    if (item.changeType === 'created' || item.changeType === 'imported' || item.changeType === 'indexed') return '#30D158'
    if (item.changeType === 'renamed' || item.changeType === 'updated' || item.changeType === 'report' || item.changeType === 'brief' || item.changeType === 'exported') return '#0A84FF'
    if (item.changeType === 'opened' || item.changeType === 'selected') return '#64D2FF'
    if (item.changeType === 'phase') return '#FF9F0A'
    if (item.kind === 'event') return '#7A5CFF'
    if (item.changeType === 'new') return '#30D158'
    if (item.changeType === 'edited') return '#0A84FF'
    if (item.bucket === 'done') return '#30D158'
    if (item.bucket === 'inProgress') return '#FF9F0A'
    if (item.bucket === 'todo') return '#7A5CFF'
    return '#8E8E93'
  }

  function getTimelineBadgeLabel(item) {
    if (item.kind === 'deleted' || item.changeType === 'deleted') return 'REMOVED'
    if (item.changeType === 'moved') return 'MOVED'
    if (item.changeType === 'filed') return 'FILED'
    if (item.changeType === 'task') return 'TASK'
    if (item.changeType === 'calendar') return 'CALENDAR'
    if (item.changeType === 'timesheet') return 'TIME'
    if (item.changeType === 'note') return 'NOTE'
    if (item.changeType === 'link') return 'LINK'
    if (item.changeType === 'layout') return 'LAYOUT'
    if (item.changeType === 'created') return 'CREATED'
    if (item.changeType === 'renamed') return 'RENAMED'
    if (item.changeType === 'updated') return 'UPDATED'
    if (item.changeType === 'indexed') return 'INDEXED'
    if (item.changeType === 'imported') return 'IMPORTED'
    if (item.changeType === 'exported') return 'EXPORTED'
    if (item.changeType === 'report') return 'REPORT'
    if (item.changeType === 'brief') return 'BRIEF'
    if (item.changeType === 'opened') return 'OPENED'
    if (item.changeType === 'selected') return 'SELECTED'
    if (item.changeType === 'phase') return 'PHASE'
    if (item.kind === 'event') return 'EVENT'
    if (item.changeType === 'new') return 'CREATED'
    if (item.changeType === 'edited') return 'MODIFIED'
    if (item.bucket === 'done') return 'DONE'
    if (item.bucket === 'inProgress') return 'WIP'
    if (item.bucket === 'todo') return 'INBOX'
    return 'FILE'
  }

  function getTimelineDetailRows(item, badge) {
    const meta = normalizeProjectActivityMeta(item.meta)
    const rows = [['When', formatTimelineExactTime(item.ts)]]
    if (item.changeType === 'timesheet') {
      if (meta.task) rows.push(['Task', meta.task])
      if (meta.hours) rows.push(['Hours', meta.hours])
      if (meta.date) rows.push(['Date', meta.date])
    }
    if (meta.field) {
      rows.push(['Field', meta.field])
      if (meta.to) rows.push(['To', meta.to])
    } else if (meta.section) rows.push(['Section', meta.section])
    else if (item.path) rows.push(['Path', item.path])
    else if (meta.subproject) rows.push(['Subproject', meta.subproject])
    else if (meta.scope) rows.push(['Scope', meta.scope])
    else if (item.bucket) rows.push(['Board', item.bucket])
    if (item.bucket && !rows.some(([label]) => label === 'Board')) rows.push(['Board', item.bucket])
    else if (meta.scope && !rows.some(([label]) => label === 'Scope')) rows.push(['Scope', meta.scope])
    return rows.filter(([, value]) => String(value ?? '').trim()).slice(0, 3)
  }

  function getTimelineBurstTitle(items) {
    if (!Array.isArray(items) || items.length === 0) return 'Grouped activity'
    const firstChangeType = String(items[0]?.changeType ?? '')
    const allFiled = firstChangeType === 'filed' && items.every(item => String(item?.changeType ?? '') === 'filed')
    if (allFiled) return `${items.length} filed item${items.length === 1 ? '' : 's'}`
    const allMoved = firstChangeType === 'moved' && items.every(item => String(item?.changeType ?? '') === 'moved')
    if (allMoved) return `${items.length} moved item${items.length === 1 ? '' : 's'}`
    const firstTitle = String(items[0]?.title ?? '').trim()
    const allFlagged = firstChangeType === 'flag' && firstTitle === 'File flag set' && items.every(item => String(item?.title ?? '').trim() === firstTitle)
    if (allFlagged) return `${items.length} files flagged`
    const allClearedFlags = firstChangeType === 'flag' && firstTitle === 'File flag cleared' && items.every(item => String(item?.title ?? '').trim() === firstTitle)
    if (allClearedFlags) return `${items.length} file flags cleared`
    const allSameTitle = firstTitle && items.every(item => String(item?.title ?? '').trim() === firstTitle)
    if (allSameTitle) return `${firstTitle} (${items.length})`
    const badge = getTimelineBadgeLabel(items[0]).toLowerCase()
    return `${items.length} ${badge} events`
  }

  function shouldGroupTimelineBurst(buffer) {
    if (!Array.isArray(buffer) || buffer.length === 0) return false
    const firstChangeType = String(buffer[0]?.changeType ?? '')
    const allSameChangeType = buffer.every(item => String(item?.changeType ?? '') === firstChangeType)
    if (allSameChangeType && (firstChangeType === 'filed' || firstChangeType === 'moved')) return buffer.length >= 2
    const firstTitle = String(buffer[0]?.title ?? '').trim()
    if (allSameChangeType && firstChangeType === 'flag' && firstTitle && buffer.every(item => String(item?.title ?? '').trim() === firstTitle)) return buffer.length >= 2
    return buffer.length >= TIMELINE_BURST_MIN_ITEMS
  }

  function groupTimelineForDisplay(items) {
    const groups = []
    let buffer = []

    function flush() {
      if (buffer.length === 0) return
      if (shouldGroupTimelineBurst(buffer)) {
        const first = buffer[0]
        const last = buffer[buffer.length - 1]
        groups.push({
          kind: 'burst',
          key: `burst:${first.id}:${last.id}:${buffer.length}`,
          items: [...buffer],
          title: getTimelineBurstTitle(buffer),
        })
      } else {
        for (const item of buffer) groups.push({ kind: 'item', key: `item:${item.id}`, item })
      }
      buffer = []
    }

    for (const item of items) {
      if (buffer.length === 0) {
        buffer.push(item)
        continue
      }
      const prev = buffer[buffer.length - 1]
      const itemTs = Number(item?.ts) || 0
      const prevTs = Number(prev?.ts) || 0
      const sameChangeType = String(item?.changeType ?? '') === String(prev?.changeType ?? '')
      const sameKind = String(item?.kind ?? '') === String(prev?.kind ?? '')
      const changeType = String(item?.changeType ?? '')
      const burstWindowMs = sameChangeType && changeType === 'moved'
        ? TIMELINE_MOVE_BURST_WINDOW_MS
        : sameChangeType && changeType === 'flag'
          ? TIMELINE_FLAG_BURST_WINDOW_MS
          : TIMELINE_BURST_WINDOW_MS
      const closeInTime = Math.abs(prevTs - itemTs) <= burstWindowMs
      const sameFlagAction = changeType !== 'flag' || String(item?.title ?? '').trim() === String(prev?.title ?? '').trim()
      if (closeInTime && sameChangeType && sameKind && sameFlagAction) buffer.push(item)
      else {
        flush()
        buffer.push(item)
      }
    }
    flush()
    return groups
  }

  function toggleTimelineBurst(groupKey) {
    setExpandedTimelineBursts(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }

  function renderTimelineItemRow(item, keyPrefix = '') {
    const RowTag = item.path ? 'button' : 'div'
    const color = getTimelineItemColor(item)
    const badge = getTimelineBadgeLabel(item)
    const detailRows = getTimelineDetailRows(item, badge)
    return (
      <li key={`${keyPrefix}${item.id}`} className="flex gap-2 items-stretch">
        <div
          aria-hidden="true"
          className="shrink-0 grid place-items-center rounded-md relative"
          style={{
            width: 28,
            height: 28,
            marginTop: 2,
            backgroundColor: color,
            boxShadow: `0 0 0 2px ${S.panel.backgroundColor}, 0 0 12px ${color}55`,
            zIndex: 1,
          }}
        >
          <TimelineIcon kind={item.kind} />
        </div>
        <RowTag
          {...(item.path ? {
            draggable: true,
            onClick: () => handleOpenListEntry(item.path, { recordOpenedFilesLog: false }),
            onDragStart: event => handleQuickFilingDragStart(event, item.path),
            onContextMenu: event => {
              event.preventDefault()
              event.stopPropagation()
              setFolderContextMenu({
                x: event.clientX,
                y: event.clientY,
                entry: {
                  fullPath: item.path,
                  name: item.title,
                  isDirectory: false,
                },
                parentPath: null,
              })
            },
            title: item.path,
          } : {})}
          className={`flex-1 min-w-0 relative rounded-md overflow-hidden text-left transition ${item.path ? 'hover:bg-[#1A1A1E]' : ''}`}
          style={{
            backgroundColor: '#121214',
            border: '1px solid #1F1F23',
            padding: '8px 10px 8px 14px',
          }}
        >
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 bottom-0"
            style={{ width: 3, backgroundColor: color }}
          />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <p className="text-xs font-semibold leading-snug truncate" style={{ color: '#F5F5F7' }}>{item.title}</p>
              <span className="mono text-[10px] tabular-nums shrink-0" style={{ color: S.zinc }}>{formatTimelineClock(item.ts)}</span>
            </div>
            <span
              className="mono text-[10px] tabular-nums shrink-0 rounded px-1.5 py-0.5"
              style={{ color: S.muted, backgroundColor: '#0D0D0F', border: '1px solid #1F1F23' }}
            >
              {item.time}
            </span>
          </div>
          {item.detail && (
            <p className="mono mt-1 leading-snug break-words" style={{ fontSize: '10px', color: S.zinc }}>{item.detail}</p>
          )}
          <div className="mt-2 grid gap-1">
            {detailRows.map(([label, value]) => (
              <div key={`${item.id}-${label}`} className="grid grid-cols-[68px_minmax(0,1fr)] gap-2 items-start">
                <span className="mono text-[9px] uppercase tracking-wider" style={{ color: S.dim }}>{label}</span>
                <span className="mono text-[9px] leading-snug break-words" style={{ color: S.muted }}>{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span
              className="mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color: color,
                backgroundColor: color + '14',
                border: `1px solid ${color}44`,
              }}
            >
              {badge}
            </span>
            {item.path && (
              <span className="mono text-[9px]" style={{ color: S.dim }}>↗ open</span>
            )}
          </div>
        </RowTag>
      </li>
    )
  }

  function groupTimelineByDay(items) {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfYesterday = startOfToday - 86400000
    const buckets = { Today: [], Yesterday: [], Earlier: [] }
    for (const item of items) {
      const ts = typeof item.ts === 'number' ? item.ts : Date.now()
      if (ts >= startOfToday) buckets.Today.push(item)
      else if (ts >= startOfYesterday) buckets.Yesterday.push(item)
      else buckets.Earlier.push(item)
    }
    return [
      { label: 'Today', items: buckets.Today },
      { label: 'Yesterday', items: buckets.Yesterday },
      { label: 'Earlier', items: buckets.Earlier },
    ].filter(group => group.items.length > 0)
  }

  function buildSubprojectKanban(entries) {
    const k = { todo: [], inProgress: [], done: [], unclassified: [] }
    for (const entry of entries) {
      const n = entry.name.toLowerCase()
      if (n === 'incoming' || n === 'inbox') k.todo.push(entry)
      else if (n === 'wip' || n === 'in-progress') k.inProgress.push(entry)
      else if (n === 'outgoing' || n === 'issued' || n === 'archive') k.done.push(entry)
      else k.inProgress.push(entry)
    }
    return k
  }

  function getTodoLists(scopeKey = todoScopeKey) {
    if (!scopeKey) return [DEFAULT_TODO_LIST]
    const stored = todoListsByScope[scopeKey]
    if (!Array.isArray(stored) || stored.length === 0) return [DEFAULT_TODO_LIST]
    const clean = stored
      .filter(list => list && typeof list.id === 'string' && typeof list.name === 'string' && list.name.trim())
      .map(list => ({ id: list.id, name: list.name.trim() }))
    return clean.some(list => list.id === DEFAULT_TODO_LIST.id)
      ? clean
      : [DEFAULT_TODO_LIST, ...clean]
  }

  function updateProjectInfoField(field, value) {
    if (!activeProject) return
    const fieldLabel = PROJECT_INFO_FIELD_LABELS[field] ?? field
    const previousRaw = String(activeProjectInfo[field] ?? '')
    const nextRaw = String(value ?? '')
    if (previousRaw === nextRaw) return
    const previousValue = previousRaw.trim()
    const nextValue = nextRaw.trim()
    setProjectInfoByProject(prev => ({
      ...prev,
      [activeProject.id]: normalizeProjectInfo({
        ...(prev[activeProject.id] ?? DEFAULT_PROJECT_INFO),
        [field]: value,
      }),
    }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'updated',
      title: 'Project information updated',
      detail: `${fieldLabel}: ${previousValue || 'blank'} -> ${nextValue || 'blank'}`,
      meta: { field: fieldLabel, from: previousValue || 'blank', to: nextValue || 'blank' },
      coalesceKey: `project-info:${field}`,
    })
  }

  function updateTimesheetDraft(field, value) {
    if (!timesheetProjectKey) return
    setTimesheetDraftByProject(prev => ({
      ...prev,
      [timesheetProjectKey]: {
        ...(prev[timesheetProjectKey] ?? { date: formatCalendarDateKey(new Date()), task: '', hours: '', note: '' }),
        [field]: value,
      },
    }))
  }

  function addTimesheetEntry() {
    if (!timesheetProjectKey) return
    const task = String(timesheetDraft.task ?? '').trim()
    const hours = Number(timesheetDraft.hours)
    if (!task || !Number.isFinite(hours) || hours <= 0) return
    const entry = {
      id: crypto.randomUUID(),
      date: timesheetDraft.date || formatCalendarDateKey(new Date()),
      task,
      hours: Math.round(hours * 100) / 100,
      note: String(timesheetDraft.note ?? '').trim(),
    }
    setTimesheetEntriesByProject(prev => ({
      ...prev,
      [timesheetProjectKey]: [entry, ...(prev[timesheetProjectKey] ?? [])],
    }))
    setTimesheetDraftByProject(prev => ({
      ...prev,
      [timesheetProjectKey]: { date: entry.date, task: '', hours: '', note: '' },
    }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'timesheet',
      title: 'Timesheet entry added',
      detail: `${entry.date} · ${entry.task} · ${entry.hours}h`,
      meta: { date: entry.date, task: entry.task, hours: `${entry.hours}h` },
    })
  }

  function startTimesheetTimer() {
    if (!timesheetProjectKey || timesheetTimer) return
    const task = String(timesheetDraft.task ?? '').trim()
    if (!task) return
    const timer = {
      date: timesheetDraft.date || formatCalendarDateKey(new Date()),
      task,
      note: String(timesheetDraft.note ?? '').trim(),
      startedAt: new Date().toISOString(),
    }
    setTimesheetTimersByProject(prev => ({ ...prev, [timesheetProjectKey]: timer }))
    setTimesheetNowMs(Date.now())
  }

  function endTimesheetTimer() {
    if (!timesheetProjectKey || !timesheetTimer) return
    const endedAt = new Date()
    const elapsedMs = getTimesheetElapsedMs(timesheetTimer, endedAt.getTime())
    const hours = Math.max(0.01, Math.round((elapsedMs / 3600000) * 100) / 100)
    const entry = {
      id: crypto.randomUUID(),
      date: timesheetTimer.date || formatCalendarDateKey(endedAt),
      task: String(timesheetTimer.task ?? '').trim(),
      hours,
      note: String(timesheetTimer.note ?? '').trim(),
      startTime: timesheetTimer.startedAt,
      endTime: endedAt.toISOString(),
    }
    if (!entry.task) return
    setTimesheetEntriesByProject(prev => ({
      ...prev,
      [timesheetProjectKey]: [entry, ...(prev[timesheetProjectKey] ?? [])],
    }))
    setTimesheetTimersByProject(prev => {
      const next = { ...prev }
      delete next[timesheetProjectKey]
      return next
    })
    setTimesheetDraftByProject(prev => ({
      ...prev,
      [timesheetProjectKey]: { date: entry.date, task: '', hours: '', note: '' },
    }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'timesheet',
      title: 'Timesheet timer recorded',
      detail: `${entry.date} · ${entry.task} · ${entry.hours}h`,
      meta: { date: entry.date, task: entry.task, hours: `${entry.hours}h` },
    })
  }

  function cancelTimesheetTimer() {
    if (!timesheetProjectKey || !timesheetTimer) return
    setTimesheetTimersByProject(prev => {
      const next = { ...prev }
      delete next[timesheetProjectKey]
      return next
    })
  }

  function removeTimesheetEntry(entryId) {
    if (!timesheetProjectKey) return
    const removed = (timesheetEntriesByProject[timesheetProjectKey] ?? []).find(entry => entry.id === entryId)
    setTimesheetEntriesByProject(prev => ({
      ...prev,
      [timesheetProjectKey]: (prev[timesheetProjectKey] ?? []).filter(entry => entry.id !== entryId),
    }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'timesheet',
      title: 'Timesheet entry removed',
      detail: removed ? `${removed.date} · ${removed.task}` : entryId,
    })
  }

  function updateTimesheetEntry(entryId, field, value) {
    if (!timesheetProjectKey) return
    const current = (timesheetEntriesByProject[timesheetProjectKey] ?? []).find(entry => entry.id === entryId)
    setTimesheetEntriesByProject(prev => ({
      ...prev,
      [timesheetProjectKey]: (prev[timesheetProjectKey] ?? []).map(entry => {
        if (entry.id !== entryId) return entry
        if (field === 'hours') {
          const hours = Number(value)
          return { ...entry, hours: Number.isFinite(hours) ? Math.max(0, Math.round(hours * 100) / 100) : 0 }
        }
        return { ...entry, [field]: value }
      }),
    }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'timesheet',
      title: 'Timesheet entry updated',
      detail: `${current?.task ?? 'Entry'} · ${field}`,
      coalesceKey: `timesheet:${entryId}:${field}`,
    })
  }

  function getTodoListStorageKey(scopeKey, listId) {
    if (!scopeKey) return null
    return listId === DEFAULT_TODO_LIST.id ? scopeKey : `${scopeKey}:taskList:${listId}`
  }

  function getTodoSlotKey(slotIndex) {
    return todoScopeKey ? `${todoScopeKey}:slot:${slotIndex}` : null
  }

  function getTodoViewMode(slotIndex) {
    const slotKey = getTodoSlotKey(slotIndex)
    const mode = slotKey ? todoViewModeBySlot[slotKey] : null
    return mode === 'all' ? 'all' : 'isolated'
  }

  function setTodoViewMode(slotIndex, mode) {
    const slotKey = getTodoSlotKey(slotIndex)
    if (!slotKey) return
    setTodoViewModeBySlot(prev => ({ ...prev, [slotKey]: mode === 'all' ? 'all' : 'isolated' }))
  }

  function getTodoDoneHidden(slotIndex) {
    const slotKey = getTodoSlotKey(slotIndex)
    return Boolean(slotKey && todoDoneHiddenBySlot[slotKey])
  }

  function toggleTodoDoneHidden(slotIndex) {
    const slotKey = getTodoSlotKey(slotIndex)
    if (!slotKey) return
    const nextHidden = !todoDoneHiddenBySlot[slotKey]
    setTodoDoneHiddenBySlot(prev => ({ ...prev, [slotKey]: nextHidden }))
  }

  function getSelectedTodoListId(slotIndex) {
    const slotKey = getTodoSlotKey(slotIndex)
    const selectedId = slotKey ? activeTodoListBySlot[slotKey] : null
    return todoLists.some(list => list.id === selectedId) ? selectedId : todoLists[0].id
  }

  function getTodoItems(listId) {
    const storageKey = getTodoListStorageKey(todoScopeKey, listId)
    return storageKey ? (todosByScope[storageKey] ?? []) : []
  }

  function getTodoGroups(viewMode, selectedListId, hideDone = false) {
    const lists = viewMode === 'all'
      ? todoLists
      : todoLists.filter(list => list.id === selectedListId)
    return lists.map(list => {
      const items = getTodoItems(list.id)
      return { ...list, items: hideDone ? items.filter(item => !item.done) : items }
    })
  }

  function buildReportProjectTasks() {
    if (!activeProject?.id) return []
    const projectPrefix = `${activeProject.id}:`
    const scopeKeys = new Set([`${activeProject.id}:project`])
    Object.keys(todoListsByScope).forEach(key => {
      if (key.startsWith(projectPrefix)) scopeKeys.add(key)
    })
    Object.keys(todosByScope).forEach(key => {
      if (!key.startsWith(projectPrefix)) return
      scopeKeys.add(key.includes(':taskList:') ? key.split(':taskList:')[0] : key)
    })

    const scopeLabel = scopeKey => {
      const scopeId = scopeKey.slice(projectPrefix.length)
      if (scopeId === 'project') return 'Project-level'
      return subprojects.find(subproject => String(subproject.id) === scopeId)?.display_name ?? scopeId
    }

    return [...scopeKeys].flatMap(scopeKey => getTodoLists(scopeKey).map(list => {
      const storageKey = getTodoListStorageKey(scopeKey, list.id)
      const items = storageKey ? (todosByScope[storageKey] ?? []) : []
      return {
        id: `${scopeKey}:${list.id}`,
        scope: scopeLabel(scopeKey),
        list: list.name,
        items: items
          .filter(item => item?.title)
          .map(item => ({ id: item.id, title: String(item.title), done: Boolean(item.done) })),
      }
    })).filter(group => group.items.length > 0)
  }

  function selectTodoList(slotIndex, listId) {
    const slotKey = getTodoSlotKey(slotIndex)
    if (!slotKey) return
    setActiveTodoListBySlot(prev => ({ ...prev, [slotKey]: listId }))
  }

  function addTodoItem(slotIndex, listId) {
    const storageKey = getTodoListStorageKey(todoScopeKey, listId)
    if (!storageKey) return
    const title = (todoInputBySlot[slotIndex] ?? '').trim()
    if (!title) return

    const nextItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      done: false,
    }

    setTodosByScope(prev => ({
      ...prev,
      [storageKey]: [...(prev[storageKey] ?? []), nextItem],
    }))
    setTodoInputBySlot(prev => ({ ...prev, [slotIndex]: '' }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'task',
      title: 'Task added',
      detail: `${todoLists.find(list => list.id === listId)?.name ?? 'Task List'} · ${title}`,
    })
  }

  function renameTodoList(listId, nextNameRaw) {
    if (!todoScopeKey || !listId) return
    const nextName = String(nextNameRaw ?? '').trim()
    if (!nextName) return
    const currentLists = getTodoLists(todoScopeKey)
    const current = currentLists.find(list => list.id === listId)
    if (!current || current.name === nextName) return
    setTodoListsByScope(prev => ({
      ...prev,
      [todoScopeKey]: currentLists.map(list => (list.id === listId ? { ...list, name: nextName } : list)),
    }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'task',
      title: 'Task list renamed',
      detail: `${current.name} -> ${nextName}`,
      coalesceKey: `todo-list-name:${todoScopeKey}:${listId}`,
    })
  }

  function renameTodoItem(listId, todoId, nextTitleRaw) {
    const storageKey = getTodoListStorageKey(todoScopeKey, listId)
    if (!storageKey || !todoId) return
    const nextTitle = String(nextTitleRaw ?? '').trim()
    if (!nextTitle) return
    const current = (todosByScope[storageKey] ?? []).find(item => item.id === todoId)
    if (!current || current.title === nextTitle) return
    setTodosByScope(prev => ({
      ...prev,
      [storageKey]: (prev[storageKey] ?? []).map(item =>
        item.id === todoId ? { ...item, title: nextTitle } : item
      ),
    }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'task',
      title: 'Task renamed',
      detail: `${current.title} -> ${nextTitle}`,
      coalesceKey: `todo-item-title:${storageKey}:${todoId}`,
    })
  }

  function beginEditTodoItem(listId, item) {
    if (!item?.id) return
    setEditingTodoItemKey(`${listId}:${item.id}`)
    setEditingTodoDraft(item.title ?? '')
  }

  function cancelEditTodoItem() {
    setEditingTodoItemKey(null)
    setEditingTodoDraft('')
  }

  function commitEditTodoItem(listId, todoId) {
    renameTodoItem(listId, todoId, editingTodoDraft)
    cancelEditTodoItem()
  }

  function getTodoDropPosition(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  function reorderTodoItemToDropTarget(source, target) {
    if (!source?.listId || !source?.todoId || !target?.listId || !target?.todoId) return
    if (source.listId !== target.listId || source.todoId === target.todoId) return
    const storageKey = getTodoListStorageKey(todoScopeKey, source.listId)
    if (!storageKey) return
    setTodosByScope(prev => {
      const currentItems = [...(prev[storageKey] ?? [])]
      const fromIndex = currentItems.findIndex(item => item.id === source.todoId)
      const toIndex = currentItems.findIndex(item => item.id === target.todoId)
      if (fromIndex < 0 || toIndex < 0) return prev
      const [moved] = currentItems.splice(fromIndex, 1)
      let insertIndex = target.position === 'after' ? toIndex + 1 : toIndex
      if (fromIndex < insertIndex) insertIndex -= 1
      insertIndex = Math.max(0, Math.min(insertIndex, currentItems.length))
      if (insertIndex === fromIndex) return prev
      currentItems.splice(insertIndex, 0, moved)
      draggedTodoMovedRef.current = true
      return { ...prev, [storageKey]: currentItems }
    })
  }

  function finishTodoDrag() {
    if (draggedTodoMovedRef.current && draggingTodoItem?.listId && draggingTodoItem?.title) {
      const storageKey = getTodoListStorageKey(todoScopeKey, draggingTodoItem.listId)
      const landedKey = `${draggingTodoItem.listId}:${draggingTodoItem.todoId}`
      if (landedTodoTimeoutRef.current) window.clearTimeout(landedTodoTimeoutRef.current)
      setLandedTodoItemKey(landedKey)
      landedTodoTimeoutRef.current = window.setTimeout(() => {
        setLandedTodoItemKey(null)
        landedTodoTimeoutRef.current = null
      }, 420)
      appendProjectActivityItems({
        kind: 'event',
        changeType: 'task',
        title: 'Tasks reordered',
        detail: draggingTodoItem.title,
        coalesceKey: `todo-item-order:${storageKey}`,
      })
    }
    draggedTodoMovedRef.current = false
    setDraggingTodoItem(null)
    setDragOverTodoTarget(null)
  }

  function toggleTodoItem(listId, todoId) {
    const storageKey = getTodoListStorageKey(todoScopeKey, listId)
    if (!storageKey) return
    const current = (todosByScope[storageKey] ?? []).find(item => item.id === todoId)
    setTodosByScope(prev => ({
      ...prev,
      [storageKey]: (prev[storageKey] ?? []).map(item =>
        item.id === todoId ? { ...item, done: !item.done } : item
      ),
    }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'task',
      title: current?.done ? 'Task reopened' : 'Task completed',
      detail: current?.title ?? todoId,
    })
  }

  function deleteTodoItem(listId, todoId) {
    const storageKey = getTodoListStorageKey(todoScopeKey, listId)
    if (!storageKey) return
    const current = (todosByScope[storageKey] ?? []).find(item => item.id === todoId)
    setTodosByScope(prev => ({
      ...prev,
      [storageKey]: (prev[storageKey] ?? []).filter(item => item.id !== todoId),
    }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'task',
      title: 'Task deleted',
      detail: current?.title ?? todoId,
    })
  }

  function addTodoList(slotIndex) {
    if (!todoScopeKey) return
    const name = (newTodoListNameBySlot[slotIndex] ?? '').trim()
    if (!name) return
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setTodoListsByScope(prev => ({
      ...prev,
      [todoScopeKey]: [...getTodoLists(todoScopeKey), { id, name }],
    }))
    selectTodoList(slotIndex, id)
    setNewTodoListNameBySlot(prev => ({ ...prev, [slotIndex]: '' }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'task',
      title: 'Task list created',
      detail: name,
    })
  }

  function removeTodoList(slotIndex, listId) {
    if (!todoScopeKey || listId === DEFAULT_TODO_LIST.id || todoLists.length <= 1) return
    const storageKey = getTodoListStorageKey(todoScopeKey, listId)
    const removedList = todoLists.find(list => list.id === listId)
    setTodoListsByScope(prev => ({
      ...prev,
      [todoScopeKey]: getTodoLists(todoScopeKey).filter(list => list.id !== listId),
    }))
    setTodosByScope(prev => {
      const next = { ...prev }
      delete next[storageKey]
      return next
    })
    setActiveTodoListBySlot(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(key => {
        if (key.startsWith(`${todoScopeKey}:slot:`) && next[key] === listId) next[key] = DEFAULT_TODO_LIST.id
      })
      return next
    })
    selectTodoList(slotIndex, DEFAULT_TODO_LIST.id)
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'task',
      title: 'Task list removed',
      detail: removedList?.name ?? listId,
    })
  }

  function handleTodoContextDelete() {
    if (!todoContextMenu) return
    if (todoContextMenu.type === 'task') {
      deleteTodoItem(todoContextMenu.listId, todoContextMenu.todoId)
    }
    if (todoContextMenu.type === 'list' && todoContextMenu.canDelete) {
      removeTodoList(todoContextMenu.slotIndex, todoContextMenu.listId)
    }
    setTodoContextMenu(null)
  }

  function formatTaskGroupsForExport(groups) {
    const lines = []
    for (const group of groups) {
      lines.push(group.name)
      if (group.items.length) {
        for (const item of group.items) {
          lines.push(`- ${item.done ? '[x]' : '[ ]'} ${item.title}`)
        }
      } else {
        lines.push('- No tasks')
      }
      lines.push('')
    }
    return `${lines.join('\n').trimEnd()}\n`
  }

  async function exportTextFile({ defaultFileName, contents, successTitle, activityType = 'task' }) {
    const result = await window.api.fsExportTextFile({ defaultFileName, contents })
    if (result?.canceled) return
    if (result?.success) {
      setFilingToast({ type: 'ok', message: `${successTitle} exported` })
      appendProjectActivityItems({
        kind: 'event',
        changeType: activityType,
        title: successTitle,
        detail: result.outputPath ?? defaultFileName,
      })
      return
    }
    setFilingToast({ type: 'error', message: result?.error ?? 'Export failed' })
  }

  async function handleTodoContextExport() {
    if (!todoContextMenu || todoContextMenu.type !== 'list') return
    const viewMode = getTodoViewMode(todoContextMenu.slotIndex)
    const selectedListId = getSelectedTodoListId(todoContextMenu.slotIndex)
    const groups = viewMode === 'all'
      ? getTodoGroups('all', selectedListId)
      : getTodoGroups('isolated', todoContextMenu.listId)
    const exportLabel = viewMode === 'all' ? 'All Task Lists' : (groups[0]?.name ?? todoContextMenu.label ?? 'Task List')
    setTodoContextMenu(null)
    await exportTextFile({
      defaultFileName: sanitizeExportFileName(`${exportLabel} Tasks`),
      contents: formatTaskGroupsForExport(groups),
      successTitle: exportLabel,
      activityType: 'task',
    })
  }

  function selectNoteSection(noteId) {
    if (!noteScopeKey) return
    setActiveNoteByScope(prev => ({ ...prev, [noteScopeKey]: noteId }))
  }

  function addNoteSection() {
    if (!noteScopeKey) return
    const title = newNoteTitle.trim()
    if (!title) return
    const nextNote = {
      id: crypto.randomUUID(),
      name: title,
    }
    setNoteSectionsByScope(prev => ({
      ...prev,
      [noteScopeKey]: [...(prev[noteScopeKey] ?? [DEFAULT_NOTE_SECTION]), nextNote],
    }))
    setActiveNoteByScope(prev => ({ ...prev, [noteScopeKey]: nextNote.id }))
    setNewNoteTitle('')
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'note',
      title: 'Note section created',
      detail: title,
      meta: { section: title },
    })
  }

  function renameNoteSection(noteId, nextName) {
    if (!noteScopeKey) return
    const name = String(nextName ?? '').trim()
    if (!name) return
    const current = normalizeNoteSections(noteSectionsByScope[noteScopeKey] ?? [DEFAULT_NOTE_SECTION])
    const existing = current.find(note => note.id === noteId)
    if (!existing || existing.name === name) return
    setNoteSectionsByScope(prev => ({
      ...prev,
      [noteScopeKey]: current.map(note => note.id === noteId ? { ...note, name } : note),
    }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'note',
      title: 'Note section renamed',
      detail: `${existing.name} -> ${name}`,
      meta: { section: name },
    })
  }

  function deleteNoteSection(noteId) {
    if (!noteScopeKey) return
    const current = noteSectionsByScope[noteScopeKey] ?? [DEFAULT_NOTE_SECTION]
    if (current.length <= 1) return
    const next = current.filter(note => note.id !== noteId)
    setNoteSectionsByScope(prev => ({ ...prev, [noteScopeKey]: next }))
    if (activeNoteId === noteId) {
      setActiveNoteByScope(prev => ({ ...prev, [noteScopeKey]: next[0]?.id ?? DEFAULT_NOTE_SECTION.id }))
    }
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'note',
      title: 'Note section deleted',
      detail: current.find(note => note.id === noteId)?.name ?? noteId,
      meta: { section: current.find(note => note.id === noteId)?.name ?? noteId },
    })
  }

  function handleNoteContextDelete() {
    if (!noteContextMenu) return
    if (noteContextMenu.canDelete) deleteNoteSection(noteContextMenu.noteId)
    setNoteContextMenu(null)
  }

  async function handleNoteContextExport() {
    if (!noteContextMenu) return
    const label = noteContextMenu.label ?? DEFAULT_NOTE_SECTION.name
    const contents = `${label}\n\n${String(noteContextMenu.text ?? '').trimEnd()}\n`
    setNoteContextMenu(null)
    await exportTextFile({
      defaultFileName: sanitizeExportFileName(label),
      contents,
      successTitle: label,
      activityType: 'note',
    })
  }

  function getPlainNotesBoxKey(slotIndex, noteId = activeNoteId) {
    return plainNotesScopeKey ? `${plainNotesScopeKey}:note:${noteId}:slot:${slotIndex}` : null
  }

  function getLegacyPlainNotesBoxKey(slotIndex) {
    return plainNotesScopeKey ? `${plainNotesScopeKey}:slot:${slotIndex}` : null
  }

  function updatePlainNotesBox(slotIndex, value) {
    const storageKey = getPlainNotesBoxKey(slotIndex)
    if (!storageKey) return
    setPlainNotesByBox(prev => ({ ...prev, [storageKey]: value }))
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'note',
      title: 'Note updated',
      detail: activeNote?.name ?? DEFAULT_NOTE_SECTION.name,
      meta: { section: activeNote?.name ?? DEFAULT_NOTE_SECTION.name },
      coalesceKey: `note-update:${storageKey}`,
    })
  }

  function addCenterPanelBox() {
    setCenterPanelSlots(prev => [...prev, CENTER_PANEL_OPTIONS[0].key])
  }

  function updateCenterPanelBox(slotIndex, nextKey) {
    setCenterPanelSlots(prev => prev.map((slotKey, index) => index === slotIndex ? nextKey : slotKey))
  }

  function removeCenterPanelBox(slotIndex) {
    setCenterPanelSlots(prev => prev.length <= 1 ? prev : prev.filter((_, index) => index !== slotIndex))
  }

  async function openCenterPanelBoxWindow(boxKey, slotIndex) {
    const option = CENTER_PANEL_OPTIONS.find(item => item.key === boxKey) ?? CENTER_PANEL_OPTIONS[0]
    const result = await window.api.dashboardOpenBoxWindow({
      boxKey,
      slotIndex,
      projectId: activeProject?.id ?? null,
      title: option.label,
    })
    if (!result?.success) setFilingToast({ type: 'error', message: result?.error ?? 'Could not open dashboard box' })
  }

  function getCenterPanelBoxLayoutStyle(slotIndex, totalSlots) {
    if (totalSlots === 2) {
      return { gridRow: 'span 2' }
    }
    const hasSingleBoxFinalRow = totalSlots > 3 && totalSlots % 3 === 1
    const hasTwoBoxFinalRow = totalSlots > 3 && totalSlots % 3 === 2
    if (hasSingleBoxFinalRow) {
      const previousRowStart = totalSlots - 4
      if (slotIndex === previousRowStart + 1 || slotIndex === previousRowStart + 2) {
        return { gridRow: 'span 2' }
      }
    }
    if (hasTwoBoxFinalRow) {
      const previousRowStart = totalSlots - 5
      if (slotIndex === previousRowStart + 2) {
        return { gridRow: 'span 2' }
      }
    }
    return {}
  }

  function getCenterPanelColumnCount(totalSlots) {
    return Math.min(Math.max(totalSlots, 1), 3)
  }

  function getCenterPanelRowCount(totalSlots) {
    if (totalSlots === 2) return 2
    const columnCount = getCenterPanelColumnCount(totalSlots)
    return Math.max(1, Math.ceil(totalSlots / columnCount))
  }

  function getSizedWeights(weights, count) {
    return Array.from({ length: count }, (_, index) => Math.max(0.35, Number(weights[index] ?? 1)))
  }

  function getCenterPanelGridStyle(totalSlots) {
    const columnCount = getCenterPanelColumnCount(totalSlots)
    const rowCount = getCenterPanelRowCount(totalSlots)
    const columnWeights = getSizedWeights(centerGridColumnWeights, columnCount)
    const rowWeights = getSizedWeights(centerGridRowWeights, rowCount)
    return {
      gridTemplateColumns: columnWeights.map(weight => `minmax(0, ${weight}fr)`).join(' '),
      gridTemplateRows: rowWeights.map(weight => `minmax(${CENTER_GRID_MIN_ROW_HEIGHT}px, ${weight}fr)`).join(' '),
      gridAutoRows: `minmax(${CENTER_GRID_MIN_ROW_HEIGHT}px, 1fr)`,
    }
  }

  function getCenterGridRowWeightsForColumn(columnIndex, rowCount, source = centerGridColumnRowWeights) {
    const saved = source?.[columnIndex]
    return getSizedWeights(Array.isArray(saved) ? saved : centerGridRowWeights, rowCount)
  }

  function getCenterPanelBoxPlacement(slotIndex, totalSlots) {
    const columnCount = getCenterPanelColumnCount(totalSlots)
    const rowCount = getCenterPanelRowCount(totalSlots)
    const columnIndex = slotIndex % columnCount
    const rowIndex = Math.floor(slotIndex / columnCount)
    const layoutStyle = getCenterPanelBoxLayoutStyle(slotIndex, totalSlots)
    const rowSpanMatch = String(layoutStyle.gridRow ?? '').match(/span\s+(\d+)/)
    const rowSpan = Math.max(1, Math.min(Number(rowSpanMatch?.[1] ?? 1), rowCount - rowIndex))
    return { columnIndex, rowIndex, rowSpan }
  }

  function getTrackRatio(weights, startIndex, span = 0) {
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1
    return weights.slice(0, startIndex + span).reduce((sum, weight) => sum + weight, 0) / total
  }

  function getCenterPanelBoxPositionStyle(slotIndex, totalSlots) {
    const { columnIndex, rowIndex, rowSpan } = getCenterPanelBoxPlacement(slotIndex, totalSlots)
    const columnWeights = getSizedWeights(centerGridColumnWeights, getCenterPanelColumnCount(totalSlots))
    const rowWeights = getCenterGridRowWeightsForColumn(columnIndex, getCenterPanelRowCount(totalSlots))
    const columnStart = getTrackRatio(columnWeights, columnIndex)
    const columnEnd = getTrackRatio(columnWeights, columnIndex, 1)
    const rowStart = getTrackRatio(rowWeights, rowIndex)
    const rowEnd = getTrackRatio(rowWeights, rowIndex, rowSpan)
    const leftInset = columnIndex === 0 ? 0 : 4
    const rightInset = columnIndex === columnWeights.length - 1 ? 0 : 4
    const topInset = rowIndex === 0 ? 0 : 4
    const bottomInset = rowIndex + rowSpan >= rowWeights.length ? 0 : 4

    return {
      position: 'absolute',
      left: `calc(8px + (100% - 16px) * ${columnStart} + ${leftInset}px)`,
      right: `calc(8px + (100% - 16px) * ${1 - columnEnd} + ${rightInset}px)`,
      top: `calc((100% - 8px) * ${rowStart} + ${topInset}px)`,
      bottom: `calc(8px + (100% - 8px) * ${1 - rowEnd} + ${bottomInset}px)`,
    }
  }

  function getCenterPanelCompactHeight(totalSlots) {
    const rowCount = getCenterPanelRowCount(totalSlots)
    return CENTER_GRID_TOP_CHROME_HEIGHT
      + CENTER_GRID_VERTICAL_PADDING
      + rowCount * CENTER_GRID_MIN_ROW_HEIGHT
      + Math.max(0, rowCount - 1) * CENTER_GRID_ROW_GAP
  }

  function beginCenterGridColumnResize(index, event) {
    event.preventDefault()
    event.stopPropagation()
    const rect = centerGridRef.current?.getBoundingClientRect()
    dragState.current = {
      type: 'center-grid-column',
      index,
      startX: event.clientX,
      startWeights: getSizedWeights(centerGridColumnWeights, getCenterPanelColumnCount(centerPanelSlots.length)),
      width: rect?.width ?? 1,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function beginCenterGridRowResize(index, columnIndex, event) {
    event.preventDefault()
    event.stopPropagation()
    const rect = centerGridRef.current?.getBoundingClientRect()
    dragState.current = {
      type: 'center-grid-row',
      index,
      columnIndex,
      startY: event.clientY,
      startWeights: getCenterGridRowWeightsForColumn(columnIndex, getCenterPanelRowCount(centerPanelSlots.length)),
      height: rect?.height ?? 1,
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  function moveCenterPanelBox(fromIndex, toIndex) {
    if (fromIndex === null || fromIndex === toIndex) return
    setCenterPanelSlots(prev => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
    setDraggingCenterPanelIndex(toIndex)
  }

  function toggleFolderNode(folderPath) {
    const isOpen = !!expandedFolderPaths[folderPath]
    if (isOpen) {
      setExpandedFolderPaths(prev => ({ ...prev, [folderPath]: false }))
      return
    }

    setExpandedFolderPaths(prev => ({ ...prev, [folderPath]: true }))
    if (folderChildrenByPath[folderPath]) return

    setLoadingFolderPaths(prev => ({ ...prev, [folderPath]: true }))
    window.api.fsScanDir({ dirPath: folderPath }).then(entries => {
      setFolderChildrenByPath(prev => ({ ...prev, [folderPath]: entries }))
      setLoadingFolderPaths(prev => ({ ...prev, [folderPath]: false }))
    })
  }

  async function handleFolderMenuOpenInExplorer() {
    if (!folderContextMenu?.entry?.fullPath) return
    await window.api.fsOpenInExplorer({ dirPath: folderContextMenu.entry.fullPath })
    setFolderContextMenu(null)
  }

  async function handleFolderMenuShowInExplorer() {
    if (!folderContextMenu?.entry?.fullPath) return
    await window.api.fsShowInExplorer({ filePath: folderContextMenu.entry.fullPath })
    setFolderContextMenu(null)
  }

  async function handleOpenListEntry(path, options = {}) {
    if (!path) return
    const { recordOpenedFilesLog = true } = options
    const hasDrivePrefix = /^[A-Za-z]:[\\/]/.test(path)
    const isUncPath = /^\\\\/.test(path)
    const normalizedPath = (hasDrivePrefix || isUncPath)
      ? path
      : (activeProject?.root_path
        ? `${activeProject.root_path}\\${path}`
        : path)
    await window.api.fsOpenInExplorer({ dirPath: normalizedPath.replace(/\//g, '\\') })
    // Record file opens (not directories) in the opened-files log
    const isFile = normalizedPath.includes('.') && !normalizedPath.endsWith('\\') && !normalizedPath.endsWith('/')
    if (recordOpenedFilesLog && isFile) {
      const fileName = normalizedPath.split(/[\\/]/).pop()
      const entry = {
        path: normalizedPath,
        name: fileName,
        projectId: activeProject?.id ?? null,
        subprojectId: activeSubproject?.id ?? null,
        openedAt: Date.now(),
      }
      setOpenedFilesLog(prev => {
        const filtered = prev.filter(e => e.path !== normalizedPath)
        const next = [entry, ...filtered].slice(0, 200)
        try { localStorage.setItem('docketos.openedFilesLog', JSON.stringify(next)) } catch {}
        return next
      })
    }
  }

  async function handleFolderMenuNewSubfolder() {
    if (!folderContextMenu?.entry?.fullPath) return
    setFolderEditDialog({
      mode: 'create',
      entry: folderContextMenu.entry,
      parentPath: folderContextMenu.entry.fullPath,
      value: '',
      error: null,
    })
    setFolderContextMenu(null)
  }

  async function handleFolderMenuRename() {
    if (!folderContextMenu?.entry?.fullPath) return
    setFolderEditDialog({
      mode: 'rename',
      entry: folderContextMenu.entry,
      parentPath: folderContextMenu.parentPath,
      value: folderContextMenu.entry.name,
      error: null,
    })
    setFolderContextMenu(null)
  }

  async function refreshFolderListing(parentPath) {
    if (!parentPath) return
    const entries = await window.api.fsScanDir({ dirPath: parentPath })
    setFolderChildrenByPath(prev => ({ ...prev, [parentPath]: entries }))
    setQuickLinkChildrenByPath(prev => ({ ...prev, [parentPath]: entries }))
    if (parentPath === selectedSubfolderPath) {
      setFolderChildrenByPath(prev => ({ ...prev, [selectedSubfolderPath]: entries }))
    }
  }

  async function commitFolderEditDialog() {
    if (!folderEditDialog) return
    const name = folderEditDialog.value.trim()
    if (!name) {
      setFolderEditDialog(prev => prev ? { ...prev, error: 'Enter a folder name.' } : prev)
      return
    }

    if (folderEditDialog.mode === 'create') {
      const parentPath = folderEditDialog.parentPath
      const result = await window.api.fsCreateFolder({ parentPath, name })
      if (!result?.success) {
        setFolderEditDialog(prev => prev ? { ...prev, error: result?.error ?? 'Failed to create folder.' } : prev)
        return
      }
      setExpandedFolderPaths(prev => ({ ...prev, [parentPath]: true }))
      await refreshFolderListing(parentPath)
      setFolderEditDialog(null)
      appendProjectActivityItems({
        kind: 'event',
        changeType: 'created',
        title: 'Folder created',
        detail: name,
        path: result.fullPath ?? null,
      })
      return
    }

    if (folderEditDialog.mode === 'rename') {
      if (name === folderEditDialog.entry.name) {
        setFolderEditDialog(null)
        return
      }
      const result = await window.api.fsRenameFolder({ oldPath: folderEditDialog.entry.fullPath, newName: name })
      if (!result?.success) {
        setFolderEditDialog(prev => prev ? { ...prev, error: result?.error ?? 'Failed to rename folder.' } : prev)
        return
      }
      updateQuickLinksAfterPathRename(folderEditDialog.entry.fullPath, result.fullPath, name)
      await refreshFolderListing(folderEditDialog.parentPath)
      setFolderEditDialog(null)
      appendProjectActivityItems({
        kind: 'event',
        changeType: 'renamed',
        title: 'Folder renamed',
        detail: `${folderEditDialog.entry.name} -> ${name}`,
        path: result.fullPath ?? null,
      })
    }
  }

  function updateQuickLinksAfterPathRename(oldPath, newPath, newName) {
    if (!oldPath || !newPath) return
    const oldPrefix = `${oldPath}\\`
    const newPrefix = `${newPath}\\`
    setQuickLinksByProject(prev => {
      let changed = false
      const next = {}
      for (const [scopeKey, links] of Object.entries(prev)) {
        next[scopeKey] = (links ?? []).map(link => {
          if (link.path === oldPath) {
            changed = true
            return { ...link, path: newPath, name: newName }
          }
          if (link.path?.startsWith(oldPrefix)) {
            changed = true
            return { ...link, path: link.path.replace(oldPrefix, newPrefix) }
          }
          return link
        })
      }
      return changed ? next : prev
    })
  }

  function handleAddQuickLink(entry) {
    if (!quickLinksScopeKey || !entry?.fullPath) return
    const nextItem = {
      path: entry.fullPath,
      name: entry.name,
      isDirectory: !!entry.isDirectory,
      dev: entry.dev ?? null,
      ino: entry.ino ?? null,
    }
    setQuickLinksByProject(prev => {
      const current = prev[quickLinksScopeKey] ?? []
      if (current.some(item => item.path === nextItem.path)) return prev
      return { ...prev, [quickLinksScopeKey]: [...current, nextItem] }
    })
  }

  function handleFolderMenuAddQuickLink() {
    if (!folderContextMenu?.entry) return
    handleAddQuickLink(folderContextMenu.entry)
    setFolderContextMenu(null)
  }

  function handleRemoveQuickLink(path) {
    if (!quickLinksScopeKey) return
    const removed = (quickLinksByProject[quickLinksScopeKey] ?? []).find(item => item.path === path)
    setQuickLinksByProject(prev => ({
      ...prev,
      [quickLinksScopeKey]: (prev[quickLinksScopeKey] ?? []).filter(item => item.path !== path),
    }))
    setExpandedQuickLinkFolders(prev => {
      const next = { ...prev }
      delete next[path]
      return next
    })
    setQuickLinkChildrenByPath(prev => {
      const next = { ...prev }
      delete next[path]
      return next
    })
    setLoadingQuickLinkFolders(prev => {
      const next = { ...prev }
      delete next[path]
      return next
    })
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'link',
      title: 'Quick link removed',
      detail: removed?.name ?? path,
      path,
    })
  }

  function handleMoveQuickLink(dragPath, dropPath) {
    if (!quickLinksScopeKey || !dragPath || !dropPath || dragPath === dropPath) return
    setQuickLinksByProject(prev => {
      const current = [...(prev[quickLinksScopeKey] ?? [])]
      const dragIndex = current.findIndex(item => item.path === dragPath)
      const dropIndex = current.findIndex(item => item.path === dropPath)
      if (dragIndex < 0 || dropIndex < 0) return prev
      const [moved] = current.splice(dragIndex, 1)
      current.splice(dropIndex, 0, moved)
      return { ...prev, [quickLinksScopeKey]: current }
    })
    appendProjectActivityItems({
      kind: 'event',
      changeType: 'link',
      title: 'Quick links reordered',
      detail: getPathName(dragPath) || dragPath,
      path: dragPath,
      coalesceKey: `quicklink-order:${quickLinksScopeKey}`,
    })
  }

  async function handleOpenQuickLink(path) {
    if (!path) return
    await window.api.fsOpenInExplorer({ dirPath: path })
  }

  async function handleAddPermanentQuickLink({ label, type = 'folder', id = null }) {
    const picked = type === 'file'
      ? await window.api.systemBrowseFile()
      : await window.api.folderBrowse()
    if (!picked) return
    const nextLink = {
      id: id ?? crypto.randomUUID(),
      label: label || getPathName(picked),
      path: picked,
      type: type === 'file' ? 'file' : 'folder',
    }
    setPermanentQuickLinks(prev => {
      const withoutDuplicatePath = prev.filter(link => link.path !== nextLink.path)
      if (id && withoutDuplicatePath.some(link => link.id === id)) {
        return withoutDuplicatePath.map(link => link.id === id ? nextLink : link)
      }
      return [...withoutDuplicatePath, nextLink]
    })
  }

  async function handleOpenPermanentQuickLink(link) {
    if (!link?.path) return
    const result = await window.api.systemOpenPath({ targetPath: link.path })
    if (!result?.success) setFilingToast({ type: 'error', message: result?.error ?? 'Failed to open link' })
  }

  function handleRemovePermanentQuickLink(id) {
    setPermanentQuickLinks(prev => prev.filter(link => link.id !== id))
  }

  function toggleQuickLinkFolder(folderPath) {
    const isOpen = !!expandedQuickLinkFolders[folderPath]
    if (isOpen) {
      setExpandedQuickLinkFolders(prev => ({ ...prev, [folderPath]: false }))
      return
    }

    setExpandedQuickLinkFolders(prev => ({ ...prev, [folderPath]: true }))
    if (quickLinkChildrenByPath[folderPath]) return

    setLoadingQuickLinkFolders(prev => ({ ...prev, [folderPath]: true }))
    window.api.fsScanDir({ dirPath: folderPath }).then(entries => {
      setQuickLinkChildrenByPath(prev => ({ ...prev, [folderPath]: entries }))
      setLoadingQuickLinkFolders(prev => ({ ...prev, [folderPath]: false }))
    })
  }

  function renderQuickLinkChildren(entries, depth = 1) {
    if (!entries?.length) {
      return (
        <p className="mono p-1" style={{ fontSize: '10px', color: S.dim, marginLeft: `${depth * 14}px` }}>Empty</p>
      )
    }

    return entries.map(entry => {
      const isDir = !!entry.isDirectory
      const isOpen = !!expandedQuickLinkFolders[entry.fullPath]
      const isLoading = !!loadingQuickLinkFolders[entry.fullPath]
      const children = quickLinkChildrenByPath[entry.fullPath] ?? []
      const isDropTarget = fileMoveDropTargetPath === entry.fullPath

      return (
        <div key={entry.fullPath ?? `${entry.name}-${depth}`}>
          <div
            draggable
            className="group flex items-center gap-2 py-1.5 px-2 rounded border"
            data-drop-path={isDir ? entry.fullPath : undefined}
            onDragEnd={handleFileMoveDragEnd}
            style={{
              ...S.panel,
              marginLeft: `${depth * 14}px`,
              borderColor: isDropTarget ? '#7A5CFF' : S.border,
              backgroundColor: isDropTarget ? '#1C1629' : S.panel.backgroundColor,
              boxShadow: isDropTarget ? '0 0 0 1px #7A5CFF88 inset' : 'none',
            }}
            onDragStart={event => handleQuickFilingDragStart(event, entry.fullPath)}
            onDragOver={event => { if (isDir) handleFileMoveDragOver(event) }}
            onDragLeave={event => { if (isDir) handleFileMoveDragLeave(event) }}
            onDrop={event => { if (isDir) handleFileMoveDrop(event, entry.fullPath) }}
            onDoubleClick={() => {
              if (isDir) return
              handleOpenQuickLink(entry.fullPath)
            }}
            onContextMenu={event => {
              if (!entry.fullPath) return
              event.preventDefault()
              event.stopPropagation()
              setFolderContextMenu({
                x: event.clientX,
                y: event.clientY,
                entry,
                parentPath: null,
              })
            }}
          >
            <FileFlagDot flag={getFileFlag(entry.fullPath)} />
            {isDir ? (
              <button
                onClick={() => toggleQuickLinkFolder(entry.fullPath)}
                className="mono text-xs"
                style={{ color: S.zinc, width: '14px' }}
                title={isOpen ? 'Collapse' : 'Expand'}
              >
                {isLoading ? '…' : isOpen ? '▾' : '▸'}
              </button>
            ) : (
              <span className="mono text-xs" style={{ color: S.zinc, width: '14px' }}>•</span>
            )}
            <span style={{ fontSize: '12px' }}>{isDir ? '📁' : getFileIcon(entry.name)}</span>
            <p className="text-xs truncate" style={getFileNameColumnTextStyle({ color: '#E4E4E7' })}>{entry.name}</p>
            <FileNameColumnHandle />
          </div>
          {isDir && isOpen && (
            <div className="mt-1 space-y-1">
              {renderQuickLinkChildren(children, depth + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  function sortEntries(entries, sort) {
    if (!entries?.length) return entries
    const arr = [...entries]
    switch (sort) {
      case 'name-asc':  return arr.sort((a, b) => a.name.localeCompare(b.name))
      case 'name-desc': return arr.sort((a, b) => b.name.localeCompare(a.name))
      case 'date-desc': return arr.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))
      case 'date-asc':  return arr.sort((a, b) => (a.mtime ?? 0) - (b.mtime ?? 0))
      case 'type-name':
      default:
        return arr.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
    }
  }

  const SORT_OPTIONS = [
    { value: 'type-name', label: 'Type' },
    { value: 'name-asc',  label: 'A→Z' },
    { value: 'name-desc', label: 'Z→A' },
    { value: 'date-desc', label: 'Newest' },
    { value: 'date-asc',  label: 'Oldest' },
  ]

  function SortBar({ sort, onSort }) {
    return (
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <span className="mono shrink-0" style={{ fontSize: 9, color: S.muted }}>Sort:</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onSort(opt.value)}
            className="mono rounded px-1.5 py-0.5 transition"
            style={{
              fontSize: 9,
              backgroundColor: sort === opt.value ? S.accent : '#1A1A1E',
              color: sort === opt.value ? '#fff' : S.zinc,
              border: `1px solid ${sort === opt.value ? S.accent : S.border}`,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    )
  }

  function getFileIcon(name) {
    const ext = (name || '').split('.').pop().toLowerCase()
    if (ext === 'pdf') return '📕'
    if (ext === 'dwg' || ext === 'dxf') return '📐'
    if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'xlsb' || ext === 'csv') return '📊'
    if (ext === 'docx' || ext === 'doc' || ext === 'docm' || ext === 'odt' || ext === 'rtf') return '📝'
    return '📄'
  }

  function renderFolderEntries(entries, depth = 0, parentPath = selectedSubfolderPath) {
    const visible = hiddenExtensions.length
      ? (entries ?? []).filter(e => e.isDirectory || !hiddenExtensions.includes(e.ext || ''))
      : (entries ?? [])
    if (!visible?.length) {
      return (
        <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>Empty</p>
      )
    }

    return visible.map(entry => {
      const isDir = !!entry.isDirectory
      const isOpen = !!expandedFolderPaths[entry.fullPath]
      const children = folderChildrenByPath[entry.fullPath] ?? []
      const isLoading = !!loadingFolderPaths[entry.fullPath]
      const isDropTarget = fileMoveDropTargetPath === entry.fullPath

      return (
        <div key={entry.fullPath ?? `${entry.name}-${depth}`}>
          <div
            draggable
            className="group flex items-center gap-2 py-1.5 px-2 rounded border"
            data-drop-path={isDir ? entry.fullPath : undefined}
            onDragEnd={handleFileMoveDragEnd}
            style={{
              ...S.panel,
              marginLeft: `${depth * 14}px`,
              borderColor: isDropTarget ? '#7A5CFF' : S.border,
              backgroundColor: isDropTarget ? '#1C1629' : S.panel.backgroundColor,
              boxShadow: isDropTarget ? '0 0 0 1px #7A5CFF88 inset' : 'none',
            }}
            onDragStart={event => handleQuickFilingDragStart(event, entry.fullPath)}
            onDragOver={event => { if (isDir) handleFileMoveDragOver(event) }}
            onDragLeave={event => { if (isDir) handleFileMoveDragLeave(event) }}
            onDrop={event => { if (isDir) handleFileMoveDrop(event, entry.fullPath) }}
            onDoubleClick={() => {
              if (isDir) return
              handleOpenListEntry(entry.fullPath)
            }}
            onContextMenu={event => {
              if (!entry.fullPath) return
              event.preventDefault()
              event.stopPropagation()
              setFolderContextMenu({
                x: event.clientX,
                y: event.clientY,
                entry,
                parentPath,
              })
            }}
            title="Right-click for actions"
          >
            <FileFlagDot flag={getFileFlag(entry.fullPath)} />
            {isDir ? (
              <button
                onClick={() => toggleFolderNode(entry.fullPath)}
                className="mono text-xs"
                style={{ color: S.zinc, width: '14px' }}
                title={isOpen ? 'Collapse' : 'Expand'}
              >
                {isLoading ? '…' : isOpen ? '▾' : '▸'}
              </button>
            ) : (
              <span className="mono text-xs" style={{ color: S.zinc, width: '14px' }}>•</span>
            )}
            <span style={{ fontSize: '12px' }}>{isDir ? '📁' : getFileIcon(entry.name)}</span>
            <span className="text-xs truncate" style={getFileNameColumnTextStyle({ color: '#E4E4E7' })}>{entry.name}</span>
            <FileNameColumnHandle />
            <span className="min-w-0 flex-1" />
            {!isDir && entry.sizeBytes > 0 && (
              <span className="mono text-[10px] shrink-0" style={{ color: S.muted }}>{formatFileSize(entry.sizeBytes)}</span>
            )}
            <span
              className="mono text-[10px] shrink-0 max-w-[150px] truncate"
              style={{ color: S.zinc }}
              title={`Last edited: ${formatLastEditedDate(entry.mtime)}`}
            >
              {formatLastEditedDate(entry.mtime)}
            </span>
          </div>

          {isDir && isOpen && (
            <div className="mt-1 space-y-1">
              {renderFolderEntries(children, depth + 1, entry.fullPath)}
            </div>
          )}
        </div>
      )
    })
  }

  const centerPanelRenderItems = isBoxPopout
    ? [{ key: popoutBoxKey, slotIndex: normalizedPopoutSlotIndex, renderIndex: 0 }]
    : centerPanelSlots.map((key, slotIndex) => ({ key, slotIndex, renderIndex: slotIndex }))
  const centerPanelRenderCount = centerPanelRenderItems.length
  const shouldLoadCenterBoxes = isBoxPopout || Boolean(activeSubproject) || Boolean(activeProject && projectOverviewSelected)
  const centerGridColumnCount = getCenterPanelColumnCount(centerPanelRenderCount)
  const centerGridRowCount = getCenterPanelRowCount(centerPanelRenderCount)
  const centerGridColumnsForRender = getSizedWeights(centerGridColumnWeights, centerGridColumnCount)
  const centerGridRowsForRender = getSizedWeights(centerGridRowWeights, centerGridRowCount)
  const centerGridRowsByColumnForRender = centerGridColumnsForRender.map((_, columnIndex) => getCenterGridRowWeightsForColumn(columnIndex, centerGridRowCount))
  const centerGridColumnTotal = centerGridColumnsForRender.reduce((sum, weight) => sum + weight, 0)
  const selectedCalendarKey = formatCalendarDateKey(selectedCalendarDate)
  const selectedCalendarNote = calendarNotes[selectedCalendarKey] ?? { note: '', color: CALENDAR_NOTE_COLORS[0] }
  const sidePanelHiddenSet = new Set(sidePanelHiddenSections)
  const visibleLeftSectionOrder = leftSectionOrder.filter(key => !sidePanelHiddenSet.has(key))
  const visibleRightSectionOrder = rightSectionOrder.filter(key => !sidePanelHiddenSet.has(key))
  const leftSectionOrderByKey = Object.fromEntries(visibleLeftSectionOrder.map((key, index) => [key, index]))
  const rightSectionOrderByKey = Object.fromEntries(visibleRightSectionOrder.map((key, index) => [key, index]))
  const leftAdjacentPairs = visibleLeftSectionOrder.slice(0, -1).map((key, index) => [key, visibleLeftSectionOrder[index + 1]])
  const rightAdjacentPairs = visibleRightSectionOrder.slice(0, -1).map((key, index) => [key, visibleRightSectionOrder[index + 1]])
  const leftBottomSectionKey = visibleLeftSectionOrder[visibleLeftSectionOrder.length - 1] ?? null
  const todayKeyDate = startOfDay(new Date())
  const upcomingCalendarEvents = Object.entries(calendarNotes)
    .map(([key, entry]) => ({ key, date: parseCalendarDateKey(key), ...entry }))
    .filter(event => event.date && event.note?.trim() && startOfDay(event.date) >= todayKeyDate)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#080809', color: S.text }}>

      {/* HEADER */}
      {!isBoxPopout && (
      <header className="relative h-14 flex items-center justify-between px-4 border-b shrink-0" style={S.panel}>
        <div className="flex items-center gap-3">
          {/* Project selector */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(p => !p)}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-sm border hover:border-[#3A3A40] transition"
              style={S.elevated}
            >
              <span className="mono text-xs" style={{ color: S.accent }}>[Ω]</span>
              <span className="max-w-[200px] truncate">{activeProject?.name ?? 'Select Project'}</span>
              <span className="mono text-xs" style={{ color: S.muted }}>▼</span>
            </button>
            {showDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 border rounded shadow-2xl z-50" style={S.panel}>
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSetActive(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#1A1A1E] transition"
                    style={p.id === activeProject?.id ? { color: S.accent } : {}}
                  >
                    {p.name}
                  </button>
                ))}
                {projects.length === 0 && (
                  <p className="px-3 py-2 text-xs" style={{ color: S.muted }}>No projects yet</p>
                )}
                <div className="border-t my-1" style={{ borderColor: S.border }} />
                <button
                  onClick={() => { setShowDropdown(false); setShowNewProject(true) }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[#1A1A1E] transition"
                  style={{ color: S.accent }}
                >
                  + New Project
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleOpenEditProject}
            disabled={!activeProject}
            className="mono text-[10px] px-2.5 py-1.5 rounded border transition disabled:opacity-40 hover:border-[#3A3A40]"
            style={{ ...S.elevated, color: S.zinc }}
          >
            Edit
          </button>

        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 min-w-0 max-w-[42vw] -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="truncate text-lg font-semibold" style={{ color: S.text }}>
            {activeSubproject?.display_name ?? (projectOverviewSelected ? 'Project Overview' : '')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border rounded px-2.5 py-1" style={S.deeper}>
            <span className={`w-2 h-2 rounded-full ${geminiKeySet ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
            <span className={`mono text-xs ${geminiKeySet ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {geminiKeySet ? 'Gemini Core Linked' : 'Gemini Not Connected'}
            </span>
          </div>
          <button
            onClick={() => setShowCommandPalette(true)}
            className="border rounded px-3 py-1.5 text-xs font-medium hover:border-[#3A3A40] transition"
            style={S.elevated}
          >
            Ctrl+K
          </button>
        </div>
      </header>
      )}

      {/* BODY */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT PANEL */}
        <aside className="shrink-0 flex flex-col overflow-hidden border-r" style={{ ...S.panel, width: isBoxPopout || leftCollapsed ? '0px' : `${leftWidth}px`, borderRightWidth: isBoxPopout ? 0 : undefined }}>
          <div className="shrink-0 p-4 pb-2">

            {/* Project Information */}
            <section className="rounded border p-3" style={S.panel}>
              <h3 className="mono text-xs uppercase tracking-widest mb-2" style={{ color: S.muted }}>📋 Project Information</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex gap-1">
                  <input
                    value={activeProjectInfo.jobNumber}
                    onChange={event => updateProjectInfoField('jobNumber', event.target.value)}
                    placeholder="Job number"
                    disabled={!activeProject}
                    className="flex-1 min-w-0 rounded border text-xs outline-none disabled:opacity-40"
                    style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                  />
                  <button
                    type="button"
                    disabled={!activeProject}
                    title="Auto-detect job number from project path"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      const inferred = inferJobNumberFromRootPath(activeProject?.root_path)
                      if (inferred) updateProjectInfoField('jobNumber', inferred)
                    }}
                    className="shrink-0 rounded border px-2 text-xs hover:border-[#7A5CFF] transition disabled:opacity-40"
                    style={{ ...S.elevated, color: S.muted }}
                  >
                    ⟳
                  </button>
                </div>
                <input
                  value={activeProjectInfo.clientName}
                  onChange={event => updateProjectInfoField('clientName', event.target.value)}
                  placeholder="Client name"
                  disabled={!activeProject}
                  className="rounded border text-xs outline-none disabled:opacity-40"
                  style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                />
                <ProjectInfoCombobox
                  value={activeProjectInfo.council}
                  onChange={nextValue => updateProjectInfoField('council', nextValue)}
                  placeholder="Council"
                  options={councilOptions}
                  disabled={!activeProject}
                />
                <ProjectInfoCombobox
                  value={activeProjectInfo.waterAuthority}
                  onChange={nextValue => updateProjectInfoField('waterAuthority', nextValue)}
                  placeholder="Water authority"
                  options={waterAuthorityOptions}
                  disabled={!activeProject}
                />
                <ProjectInfoCombobox
                  value={activeProjectInfo.projectManager}
                  onChange={nextValue => updateProjectInfoField('projectManager', nextValue)}
                  placeholder="Project manager"
                  options={projectManagerOptions}
                  disabled={!activeProject}
                />
              </div>
            </section>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 flex flex-col">

            {/* System Launchers */}
            <section
              className="flex flex-col shrink-0 overflow-hidden"
              style={getPanelSectionStyle({ height: `${leftSectionHeights.launchers}px`, order: (leftSectionOrderByKey.launchers ?? 0) * 2, display: sidePanelHiddenSet.has('launchers') ? 'none' : undefined }, draggingLeftSectionKey === 'launchers', leftDropTargetKey === 'launchers' && draggingLeftSectionKey !== 'launchers', landedLeftSectionKey === 'launchers')}
              onDragOver={event => handleSectionDragOver(event, draggingLeftSectionKey, 'launchers', setLeftSectionOrder, setDraggingLeftSectionKey, setLeftDropTargetKey)}
              onDrop={event => { event.preventDefault(); finishSectionDrag(draggingLeftSectionKey, setDraggingLeftSectionKey, setLeftDropTargetKey, setLandedLeftSectionKey) }}
              onDragLeave={() => { if (leftDropTargetKey === 'launchers') setLeftDropTargetKey(null) }}
            >
              <div style={getDropIndicatorStyle(leftDropTargetKey === 'launchers' && draggingLeftSectionKey !== 'launchers')} />
              <div className="shrink-0 mb-3 flex items-center justify-between gap-2">
                <h3 className="mono text-xs uppercase tracking-widest" style={{ color: S.muted }}>⚡ System Launchers</h3>
                <span
                  draggable
                  onDragStart={event => beginSectionDrag(event, 'launchers', setDraggingLeftSectionKey)}
                  onDragEnd={() => finishSectionDrag(draggingLeftSectionKey, setDraggingLeftSectionKey, setLeftDropTargetKey, setLandedLeftSectionKey)}
                  className="mono text-xs cursor-grab active:cursor-grabbing"
                  style={getSectionHandleStyle(draggingLeftSectionKey === 'launchers')}
                  title="Drag to reorder panel sections"
                >
                  ⋮⋮
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {launcherApps.map(({ id, label, path }) => (
                    <button
                      key={id}
                      onClick={() =>
                        window.api.launcherOpen({ appKey: id }).then(r => {
                          if (r && !r.success) setLauncherToast(r.error || 'Failed to launch')
                        })
                      }
                      className="text-left p-2.5 rounded border hover:border-[#7A5CFF] transition group"
                      style={S.elevated}
                    >
                      <div className="text-xs font-medium text-white group-hover:text-[#7A5CFF] transition">{label}</div>
                      <div className="mono mt-0.5 truncate" style={{ fontSize: '10px', color: S.zinc }}>{getPathName(path) || 'No path'}</div>
                    </button>
                  ))}
                </div>
                {launcherToast && (
                  <p className="mt-2 mono text-xs" style={{ color: '#FF453A' }}>{launcherToast}</p>
                )}
              </div>
            </section>

            {/* Project Folder Tree */}
            <section
              className="flex flex-col shrink-0 overflow-hidden"
              style={getPanelSectionStyle({ height: `${leftSectionHeights.folders}px`, order: (leftSectionOrderByKey.folders ?? 0) * 2, display: sidePanelHiddenSet.has('folders') ? 'none' : undefined }, draggingLeftSectionKey === 'folders', leftDropTargetKey === 'folders' && draggingLeftSectionKey !== 'folders', landedLeftSectionKey === 'folders')}
              onDragOver={event => handleSectionDragOver(event, draggingLeftSectionKey, 'folders', setLeftSectionOrder, setDraggingLeftSectionKey, setLeftDropTargetKey)}
              onDrop={event => { event.preventDefault(); finishSectionDrag(draggingLeftSectionKey, setDraggingLeftSectionKey, setLeftDropTargetKey, setLandedLeftSectionKey) }}
              onDragLeave={() => { if (leftDropTargetKey === 'folders') setLeftDropTargetKey(null) }}
            >
              <div style={getDropIndicatorStyle(leftDropTargetKey === 'folders' && draggingLeftSectionKey !== 'folders')} />
              <div className="shrink-0 flex items-center justify-between mb-2">
                <h3 className="mono text-xs uppercase tracking-widest" style={{ color: S.muted }}>📁 Project Folders</h3>
                <div className="flex items-center gap-2">
                  {activeProject && (
                    <button
                      onClick={() => window.api.fsOpenInExplorer({ dirPath: activeProject.root_path })}
                      className="mono text-xs hover:text-white transition"
                      style={{ color: S.zinc, fontSize: '10px' }}
                    >
                      Open Root ↗
                    </button>
                  )}
                  <span
                    draggable
                    onDragStart={event => beginSectionDrag(event, 'folders', setDraggingLeftSectionKey)}
                    onDragEnd={() => finishSectionDrag(draggingLeftSectionKey, setDraggingLeftSectionKey, setLeftDropTargetKey, setLandedLeftSectionKey)}
                    className="mono text-xs cursor-grab active:cursor-grabbing"
                    style={getSectionHandleStyle(draggingLeftSectionKey === 'folders')}
                    title="Drag to reorder panel sections"
                  >
                    ⋮⋮
                  </span>
                </div>
              </div>
              <div className="shrink-0 mb-2">
                <input
                  type="text"
                  value={fileSearchQuery}
                  onChange={e => setFileSearchQuery(e.target.value)}
                  placeholder="Search files…"
                  disabled={!activeProject?.root_path}
                  className="w-full rounded border text-xs outline-none disabled:opacity-40"
                  style={{ backgroundColor: '#1A1A1E', borderColor: fileSearchQuery ? '#7A5CFF' : S.border, color: S.text, padding: '5px 8px' }}
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto pb-2">
                {fileSearchQuery.trim() ? (
                  <div className="space-y-0.5 pr-1">
                    {fileSearchLoading && (
                      <p className="mono px-1 py-2 text-[10px]" style={{ color: S.dim }}>Searching…</p>
                    )}
                    {!fileSearchLoading && fileSearchResults.length === 0 && (
                      <p className="mono px-1 py-2 text-[10px]" style={{ color: S.dim }}>No files found.</p>
                    )}
                    {fileSearchResults.map(result => (
                      <button
                        key={result.fullPath}
                        onClick={() => {
                          const sep = result.fullPath.includes('\\') ? '\\' : '/'
                          const parentPath = result.fullPath.substring(0, result.fullPath.lastIndexOf(sep))
                          const parentName = parentPath.split(sep).pop() ?? ''
                          handleFolderSelect({ fullPath: parentPath, name: parentName })
                          setFileRevealPath(result.fullPath)
                          setFileSearchQuery('')
                        }}
                        onContextMenu={event => {
                          event.preventDefault()
                          event.stopPropagation()
                          setFolderContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            entry: { fullPath: result.fullPath, name: result.name, isDirectory: false },
                            parentPath: getParentPath(result.fullPath),
                          })
                        }}
                        className="group w-full rounded border border-transparent px-2 py-1.5 text-left transition hover:border-[#7A5CFF] hover:bg-[#18181B]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileFlagDot flag={getFileFlag(result.fullPath)} />
                          <p className="truncate text-xs font-medium" style={getFileNameColumnTextStyle({ color: S.text })}>{result.name}</p>
                          <FileNameColumnHandle />
                        </div>
                        <p className="mono mt-0.5 truncate text-[10px]" style={{ color: S.zinc }}>{result.relativePath}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <FolderTree
                    rootPath={activeProject?.root_path ?? null}
                    onSelectFolder={handleFolderSelect}
                    selectedPath={selectedTreeFolderPath}
                    onAddQuickLink={handleAddQuickLink}
                    onQuickFile={handleSendEntryToQuickFiling}
                    revealPath={fileRevealPath}
                    nameColumnWidth={fileNameColumnWidth}
                    onBeginNameColumnResize={beginFileNameColumnResize}
                      flagOptions={FILE_FLAG_OPTIONS}
                      getFileFlag={getFileFlag}
                      onSetFileFlag={setFileFlag}
                      onClearFileFlag={clearFileFlag}
                  />
                )}
              </div>
            </section>

            {/* Active Subproject */}
            <section
              className="flex flex-col shrink-0 overflow-hidden rounded border p-3"
              style={getPanelSectionStyle({ ...S.deeper, height: `${leftSectionHeights.active}px`, order: (leftSectionOrderByKey.active ?? 0) * 2, display: sidePanelHiddenSet.has('active') ? 'none' : undefined }, draggingLeftSectionKey === 'active', leftDropTargetKey === 'active' && draggingLeftSectionKey !== 'active', landedLeftSectionKey === 'active')}
              onDragOver={event => handleSectionDragOver(event, draggingLeftSectionKey, 'active', setLeftSectionOrder, setDraggingLeftSectionKey, setLeftDropTargetKey)}
              onDrop={event => { event.preventDefault(); finishSectionDrag(draggingLeftSectionKey, setDraggingLeftSectionKey, setLeftDropTargetKey, setLandedLeftSectionKey) }}
              onDragLeave={() => { if (leftDropTargetKey === 'active') setLeftDropTargetKey(null) }}
            >
              <div style={getDropIndicatorStyle(leftDropTargetKey === 'active' && draggingLeftSectionKey !== 'active')} />
              <div className="shrink-0 flex items-center justify-between gap-2 mb-2">
                <h3 className="mono text-xs uppercase tracking-widest" style={{ color: S.muted }}>📌 Active Subproject</h3>
                <div className="flex items-center gap-2">
                  {activeProject && (
                    <button
                      onClick={refreshActiveProjectSubprojects}
                      className="mono text-[10px] hover:text-white transition"
                      style={{ color: S.zinc }}
                    >
                      Refresh
                    </button>
                  )}
                  {(activeSubproject || projectOverviewSelected) && (
                  <button
                    onClick={handleClearActiveSelection}
                    className="mono text-[10px] hover:text-white transition"
                    style={{ color: S.zinc }}
                  >
                    Clear
                  </button>
                  )}
                  <span
                    draggable
                    onDragStart={event => beginSectionDrag(event, 'active', setDraggingLeftSectionKey)}
                    onDragEnd={() => finishSectionDrag(draggingLeftSectionKey, setDraggingLeftSectionKey, setLeftDropTargetKey, setLandedLeftSectionKey)}
                    className="mono text-xs cursor-grab active:cursor-grabbing"
                    style={getSectionHandleStyle(draggingLeftSectionKey === 'active')}
                    title="Drag to reorder panel sections"
                  >
                    ⋮⋮
                  </span>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                {activeProject && (
                  <button
                    onClick={handleActivateProjectOverview}
                    className="w-full text-left px-2 py-2 rounded border transition"
                    style={projectOverviewSelected
                      ? { backgroundColor: '#1A1A1E', borderColor: S.accent, color: S.text }
                      : { backgroundColor: '#101013', borderColor: S.border, color: S.text }
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate">Project overview</span>
                      <span className="mono text-[10px]" style={{ color: projectOverviewSelected ? S.accent : S.zinc }}>
                        {projectOverviewSelected ? 'Active' : 'Use'}
                      </span>
                    </div>
                    <p className="mono mt-1 truncate" style={{ fontSize: '10px', color: S.zinc }}>{activeProject.root_path}</p>
                  </button>
                )}
                <p className="mono mt-2 text-xs" style={{ color: S.dim }}>Select a stage folder under the Technical folder.</p>

                <div className="mt-3 flex-1 min-h-0 border-t pt-3" style={{ borderColor: S.border }}>
                  <p className="mono mb-2" style={{ fontSize: '10px', color: S.muted }}>Subprojects in this project</p>
                  <div className="space-y-1 h-full min-h-0 overflow-y-auto pr-1">
                    {subprojects.length === 0 && (
                      <div className="space-y-2">
                        <p className="mono text-xs" style={{ color: S.dim }}>No subprojects yet. Click Refresh or select the Technical folder.</p>
                        {subprojectDiscovery && (
                          <div className="mono rounded border p-2" style={{ backgroundColor: '#080809', borderColor: S.border, color: S.zinc, fontSize: '10px' }}>
                            <p>Status: {subprojectDiscovery.status}</p>
                            {subprojectDiscovery.rootPath && <p className="truncate" title={subprojectDiscovery.rootPath}>Root: {subprojectDiscovery.rootPath}</p>}
                            {subprojectDiscovery.technicalPath
                              ? <p className="truncate" title={subprojectDiscovery.technicalPath}>Technical: {subprojectDiscovery.technicalPath}</p>
                              : <p>Technical: not found</p>}
                            {Number.isFinite(subprojectDiscovery.count) && <p>Folders found: {subprojectDiscovery.count}</p>}
                          </div>
                        )}
                      </div>
                    )}
                    {subprojects.map(subproject => {
                      const isCurrent = activeSubproject?.id === subproject.id
                      return (
                        <button
                          key={subproject.id}
                          onClick={() => handleActivateSubproject(subproject)}
                          className="w-full text-left px-2 py-2 rounded border transition"
                          style={isCurrent
                            ? { backgroundColor: '#1A1A1E', borderColor: S.accent, color: S.text }
                            : { backgroundColor: '#101013', borderColor: S.border, color: S.text }
                          }
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm truncate">{subproject.display_name}</span>
                            <span className="mono text-[10px]" style={{ color: isCurrent ? S.accent : S.zinc }}>
                              {isCurrent ? 'Active' : 'Use'}
                            </span>
                          </div>
                          <p className="mono mt-1 truncate" style={{ fontSize: '10px', color: S.zinc }}>{subproject.subproject_path}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </section>

            {leftAdjacentPairs.map(([firstKey, secondKey], index) => (
              <div
                key={`left-section-separator-${firstKey}-${secondKey}`}
                role="separator"
                aria-orientation="horizontal"
                title="Drag to resize adjacent sections"
                onMouseDown={event => beginVerticalResize('left-panel-vertical', firstKey, secondKey, event, leftSectionHeights)}
                className="my-2 shrink-0 cursor-row-resize hover:bg-[#1F1F23] transition-colors rounded"
                style={{ height: '8px', backgroundColor: '#080809', order: index * 2 + 1 }}
              />
            ))}
            {leftBottomSectionKey && (
              <div
                role="separator"
                aria-orientation="horizontal"
                title="Drag to resize the bottom left section downward"
                onMouseDown={event => beginFooterResize(leftBottomSectionKey, event)}
                className="my-2 shrink-0 cursor-row-resize hover:bg-[#1F1F23] transition-colors rounded"
                style={{ height: '8px', backgroundColor: '#080809', order: visibleLeftSectionOrder.length * 2 }}
              />
            )}
          </div>

        </aside>

        <div
          role="separator"
          aria-orientation="vertical"
          title={leftCollapsed ? 'Expand left panel' : 'Drag to resize the left panel'}
          onMouseDown={beginResizeLeft}
          className={`shrink-0 ${leftCollapsed ? 'cursor-pointer' : 'cursor-col-resize'} hover:bg-[#1F1F23] transition-colors flex items-center justify-center`}
          style={{ width: isBoxPopout ? '0px' : `${SIDE_PANEL_RESIZER_WIDTH}px`, backgroundColor: '#080809' }}
        >
          {!isBoxPopout && <button
            onMouseDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation()
              toggleLeftPanel()
            }}
            className="mono w-full h-16 text-sm leading-none flex items-center justify-center"
            style={{ color: S.zinc }}
            title={leftCollapsed ? 'Expand left panel' : 'Collapse left panel'}
          >
            {leftCollapsed ? '›' : '‹'}
          </button>}
        </div>

        {/* CENTER PANEL */}
        <main className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: '#080809' }}>

          {/* Kanban */}
          {(isBoxPopout || !centerTopCollapsed) && (
            <div className={isBoxPopout || centerCanvasCollapsed ? 'flex-1 min-h-0 flex flex-col' : 'shrink-0 flex flex-col'} style={{ height: isBoxPopout || centerCanvasCollapsed ? undefined : `${centerKanbanHeight}px`, borderColor: S.border }}>
            {!isBoxPopout && shouldLoadCenterBoxes && <div className="flex items-center justify-end px-2 pt-2 pb-1">
              <button
                onClick={addCenterPanelBox}
                className="mono text-[10px] px-2.5 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition"
                style={{ backgroundColor: '#0D0D0F', borderColor: S.border, color: S.zinc }}
                title="Add another dashboard box"
              >
                + Add Box
              </button>
            </div>}
            <div
              ref={centerGridRef}
              className="relative flex-1 min-h-0 overflow-auto"
              style={{ minHeight: isBoxPopout ? '100%' : shouldLoadCenterBoxes ? getCenterPanelCompactHeight(centerPanelRenderCount) : 220 }}
            >
              {!shouldLoadCenterBoxes ? (
                <div className="absolute inset-2 grid place-items-center rounded border" style={{ ...S.deeper, borderColor: S.border }}>
                  <div className="max-w-sm text-center px-6">
                    <p className="text-sm font-medium" style={{ color: S.text }}>Select Project overview or a subproject</p>
                    <p className="mono mt-2 text-xs leading-relaxed" style={{ color: S.dim }}>Choose Project overview for the parent dashboard, or choose a subproject to show its tasks, notes, timeline, filing, and review tools.</p>
                  </div>
                </div>
              ) : centerPanelRenderItems.map(({ key, slotIndex, renderIndex }) => {
                const panelOption = CENTER_PANEL_OPTIONS.find(option => option.key === key) ?? CENTER_PANEL_OPTIONS[0]
                const activeKanban = subprojectKanban ?? kanban
                const files  = activeKanban[key] ?? []
                const extras = (!subprojectKanban && key === 'inProgress') ? (activeKanban.unclassified ?? []) : []
                const selectedTodoListId = key === 'todo' ? getSelectedTodoListId(slotIndex) : DEFAULT_TODO_LIST.id
                const todoViewMode = key === 'todo' ? getTodoViewMode(slotIndex) : 'isolated'
                const todoDoneHidden = key === 'todo' ? getTodoDoneHidden(slotIndex) : false
                const flaggedColor = key === 'flagged' ? getFlaggedColor(slotIndex) : FILE_FLAG_OPTIONS[0].key
                const flaggedSort = key === 'flagged' ? getFlaggedSort(slotIndex) : 'type-name'
                const flaggedShowAll = key === 'flagged' ? getFlaggedShowAll(slotIndex) : false
                const flaggedItems = key === 'flagged' ? getFlaggedItems(flaggedColor, flaggedSort) : []
                const flaggedGroups = key === 'flagged'
                  ? FILE_FLAG_OPTIONS
                    .map(option => ({ option, items: getFlaggedItems(option.key, flaggedSort) }))
                    .filter(group => group.items.length > 0)
                  : []
                const flaggedTotal = flaggedShowAll
                  ? flaggedGroups.reduce((sum, group) => sum + group.items.length, 0)
                  : flaggedItems.length
                const allTodoGroups = key === 'todo' ? getTodoGroups(todoViewMode, selectedTodoListId) : []
                const todoGroups = key === 'todo' ? getTodoGroups(todoViewMode, selectedTodoListId, todoDoneHidden) : []
                const completedTodoCount = allTodoGroups.reduce((sum, group) => sum + group.items.filter(item => item.done).length, 0)
                const scopedTodos = todoGroups.flatMap(group => group.items)
                const plainNotesBoxKey = key === 'plainNotes' ? getPlainNotesBoxKey(slotIndex) : null
                const legacyPlainNotesBoxKey = key === 'plainNotes' ? getLegacyPlainNotesBoxKey(slotIndex) : null
                const legacyPlainNotesText = activeNoteId === DEFAULT_NOTE_SECTION.id && legacyPlainNotesBoxKey
                  ? plainNotesByBox[legacyPlainNotesBoxKey]
                  : undefined
                const plainNotesText = plainNotesBoxKey
                  ? (plainNotesByBox[plainNotesBoxKey] ?? legacyPlainNotesText ?? '')
                  : ''
                const boxPositionStyle = isBoxPopout
                  ? { position: 'absolute', inset: 8 }
                  : getCenterPanelBoxPositionStyle(renderIndex, centerPanelRenderCount)
                const total = key === 'quickLinks'
                  ? quickLinks.length
                  : key === 'selectedFolder'
                    ? selectedTreeFolderEntries.length
                    : key === 'recentFiles'
                      ? openedFilesForPanel.length
                      : key === 'flagged'
                        ? flaggedTotal
                        : key === 'templates'
                          ? templates.length
                          : key === 'timeline'
                            ? timelineItems.length
                            : key === 'timesheet'
                              ? `${timesheetTotalHours.toFixed(1)}h`
                              : key === 'plainNotes'
                                    ? (plainNotesText.trim() ? 1 : 0)
                                    : key === 'inProgress' && projectOverviewSelected
                                      ? 0
                                      : files.length + extras.length + scopedTodos.length
                return (
                <div
                  key={`center-panel-${isBoxPopout ? 'popout' : slotIndex}`}
                  className="min-w-0 min-h-[150px] rounded border flex flex-col transition-colors duration-150"
                  style={!isBoxPopout && draggingCenterPanelIndex === renderIndex
                    ? { ...S.deeper, ...boxPositionStyle, opacity: 0.58, borderColor: S.accent, transform: 'scale(0.985)' }
                    : { ...S.deeper, ...boxPositionStyle }
                  }
                  onDragOver={event => {
                    if (isBoxPopout || draggingCenterPanelIndex === null) return
                    event.preventDefault()
                    moveCenterPanelBox(draggingCenterPanelIndex, renderIndex)
                  }}
                  onDrop={event => {
                    if (isBoxPopout || draggingCenterPanelIndex === null) return
                    event.preventDefault()
                    setDraggingCenterPanelIndex(null)
                  }}
                >
                  {!isBoxPopout && <div className="p-3 border-b flex items-center gap-2" style={{ ...S.panel, borderColor: S.border }}>
                    <span
                      draggable={!isBoxPopout}
                      onDragStart={event => {
                        if (isBoxPopout) return
                        event.stopPropagation()
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', String(renderIndex))
                        setDraggingCenterPanelIndex(renderIndex)
                      }}
                      onDragEnd={() => setDraggingCenterPanelIndex(null)}
                      className={`mono grid h-6 w-5 shrink-0 place-items-center rounded border ${isBoxPopout ? '' : 'cursor-grab active:cursor-grabbing'}`}
                      style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.zinc }}
                      title={isBoxPopout ? 'Popped out box' : 'Drag to move this box'}
                    >
                      {isBoxPopout ? '□' : '⋮⋮'}
                    </span>
                    <span className="shrink-0" style={{ fontSize: '13px' }}>{panelOption.icon}</span>
                    <select
                      value={key}
                      onChange={event => updateCenterPanelBox(slotIndex, event.target.value)}
                      disabled={isBoxPopout}
                      className="min-w-0 flex-1 rounded border mono text-xs uppercase tracking-wider outline-none"
                      style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.labeltext, padding: '4px 6px' }}
                      title={`Choose content for box ${slotIndex + 1}`}
                    >
                      {CENTER_PANEL_OPTIONS.map(option => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                    <span className="mono text-xs px-2 py-0.5 rounded shrink-0" style={{ backgroundColor: '#1A1A1E', color: S.labeltext }}>{total}</span>
                    {!isBoxPopout && (
                      <button
                        onClick={() => openCenterPanelBoxWindow(key, slotIndex)}
                        className="mono text-[10px] px-1.5 py-0.5 rounded border hover:text-white transition shrink-0"
                        style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.zinc }}
                        title={`Open ${panelOption.label} in a separate window`}
                      >
                        Pop Out
                      </button>
                    )}
                    {!isBoxPopout && centerPanelSlots.length > 1 && (
                      <button
                        onClick={() => removeCenterPanelBox(slotIndex)}
                        className="mono text-[10px] px-1.5 py-0.5 rounded border hover:text-white transition shrink-0"
                        style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.zinc }}
                        title={`Remove box ${slotIndex + 1}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>}
                  <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                    {key === 'inProgress' && projectOverviewSelected && (
                      <div className="min-h-[120px] grid place-items-center rounded border p-4" style={S.panel}>
                        <div className="max-w-sm text-center">
                          <p className="text-sm font-medium" style={{ color: S.text }}>Select a subproject</p>
                          <p className="mono mt-2 text-xs leading-relaxed" style={{ color: S.dim }}>Choose a subproject to show its tasks, notes, timeline, filing, and review tools.</p>
                        </div>
                      </div>
                    )}

                    {key === 'inProgress' && activeSubproject && (
                      <div className="mb-2 space-y-2">
                        <select
                          value={selectedSubfolderPath}
                          onChange={event => {
                            const nextPath = event.target.value
                            setSelectedSubfolderPath(nextPath)
                            const selectedFolder = subfolderOptions.find(folder => folder.fullPath === nextPath)
                            setSelectedSubfolderName(selectedFolder?.name ?? '')
                            setExpandedFolderPaths({})
                          }}
                          className="w-full rounded border text-xs outline-none"
                          style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                        >
                          {!subfolderOptions.length && <option value="">No subfolders available</option>}
                          {subfolderOptions.map(folder => (
                            <option key={folder.fullPath} value={folder.fullPath}>{folder.name}</option>
                          ))}
                        </select>

                        <div className="rounded border p-2 space-y-1" style={S.elevated}>
                          {!selectedSubfolderPath && (
                            <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>
                              Select a folder to browse its contents.
                            </p>
                          )}
                          {selectedSubfolderPath && (
                            <>
                              <SortBar sort={subprojectBrowserSort} onSort={setSubprojectBrowserSort} />
                              <div
                                data-drop-path={selectedSubfolderPath}
                                onDragOver={handleFileMoveDragOver}
                                onDragLeave={handleFileMoveDragLeave}
                                onDrop={event => handleFileMoveDrop(event, selectedSubfolderPath)}
                                onDoubleClick={() => handleOpenListEntry(selectedSubfolderPath)}
                                onContextMenu={event => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  setFolderContextMenu({
                                    x: event.clientX,
                                    y: event.clientY,
                                    entry: { fullPath: selectedSubfolderPath, name: getPathName(selectedSubfolderPath), isDirectory: true },
                                    parentPath: getParentPath(selectedSubfolderPath),
                                  })
                                }}
                                className="group flex items-center gap-2 rounded border px-2 py-1.5"
                                style={{
                                  ...S.panel,
                                  borderColor: fileMoveDropTargetPath === selectedSubfolderPath ? '#7A5CFF' : S.border,
                                  backgroundColor: fileMoveDropTargetPath === selectedSubfolderPath ? '#1C1629' : S.panel.backgroundColor,
                                  boxShadow: fileMoveDropTargetPath === selectedSubfolderPath ? '0 0 0 1px #7A5CFF88 inset' : 'none',
                                }}
                                title={selectedSubfolderPath}
                              >
                                <span className="mono text-xs" style={{ color: S.zinc, width: '14px' }}>↳</span>
                                <FileFlagDot flag={getFileFlag(selectedSubfolderPath)} />
                                <span style={{ fontSize: '12px' }}>📁</span>
                                <p className="text-xs font-medium truncate" style={{ color: '#E4E4E7' }}>{getPathName(selectedSubfolderPath)}</p>
                                <span className="mono ml-auto text-[10px] shrink-0" style={{ color: S.zinc }}>Move Here</span>
                              </div>
                              {renderFolderEntries(sortEntries(folderChildrenByPath[selectedSubfolderPath] ?? [], subprojectBrowserSort))}
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {key === 'todo' && (
                      <div className="mb-2 space-y-2">
                        <div className="flex gap-2">
                          <select
                            value={selectedTodoListId}
                            onChange={event => selectTodoList(slotIndex, event.target.value)}
                            onContextMenu={event => {
                              event.preventDefault()
                              event.stopPropagation()
                              const list = todoLists.find(item => item.id === selectedTodoListId)
                              setTodoContextMenu({
                                x: event.clientX,
                                y: event.clientY,
                                type: 'list',
                                slotIndex,
                                listId: selectedTodoListId,
                                label: list?.name ?? 'Task list',
                                canDelete: selectedTodoListId !== DEFAULT_TODO_LIST.id && todoLists.length > 1,
                              })
                            }}
                            onDoubleClick={() => {
                              const currentName = todoLists.find(list => list.id === selectedTodoListId)?.name ?? ''
                              const nextName = window.prompt('Rename task list', currentName)
                              if (nextName !== null) renameTodoList(selectedTodoListId, nextName)
                            }}
                            className="min-w-[120px] max-w-[160px] rounded border text-xs outline-none"
                            style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                            title="Choose task list for this box. Double-click to rename."
                          >
                            {todoLists.map(list => (
                              <option key={list.id} value={list.id}>{list.name}</option>
                            ))}
                          </select>
                          <input
                            value={newTodoListNameBySlot[slotIndex] ?? ''}
                            onChange={event => setNewTodoListNameBySlot(prev => ({ ...prev, [slotIndex]: event.target.value }))}
                            onKeyDown={event => event.key === 'Enter' && addTodoList(slotIndex)}
                            placeholder="Add task list"
                            className="flex-1 rounded border text-xs outline-none"
                            style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                          />
                          <button
                            onClick={() => toggleTodoDoneHidden(slotIndex)}
                            disabled={completedTodoCount === 0}
                            className="mono text-[10px] px-2 rounded border transition disabled:opacity-40"
                            style={todoDoneHidden
                              ? { backgroundColor: '#1A1A1E', borderColor: S.accent, color: S.text }
                              : { backgroundColor: '#1A1A1E', borderColor: S.border, color: S.zinc }
                            }
                            title="Show or hide completed tasks without deleting them"
                          >
                            {todoDoneHidden ? 'Show Done' : 'Hide Done'}
                          </button>
                          <button
                            onClick={() => setTodoViewMode(slotIndex, todoViewMode === 'isolated' ? 'all' : 'isolated')}
                            className="mono text-[10px] px-2 rounded border transition"
                            style={todoViewMode === 'isolated'
                              ? { backgroundColor: '#1A1A1E', borderColor: S.accent, color: S.text }
                              : { backgroundColor: '#1A1A1E', borderColor: S.border, color: S.zinc }
                            }
                            title="Toggle task list view mode"
                          >
                            {todoViewMode === 'isolated' ? 'Isolated List' : 'All Lists'}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={todoInputBySlot[slotIndex] ?? ''}
                            onChange={event => setTodoInputBySlot(prev => ({ ...prev, [slotIndex]: event.target.value }))}
                            onKeyDown={event => event.key === 'Enter' && addTodoItem(slotIndex, selectedTodoListId)}
                            placeholder="Add task"
                            className="flex-1 rounded border text-xs outline-none"
                            style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                          />
                        </div>
                      </div>
                    )}

                    {key === 'quickLinks' && (
                      <div className="space-y-2">
                        <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>
                          {activeSubproject
                            ? 'Quick links are scoped to the active subproject.'
                            : 'No active subproject selected — using project quick links.'}
                        </p>
                        {quickLinks.map(link => (
                          <div
                            key={link.path}
                            draggable
                            onDragStart={event => {
                              setDraggingQuickLinkPath(link.path)
                              handleQuickFilingDragStart(event, link.path)
                            }}
                            onDragOver={event => event.preventDefault()}
                            onDrop={event => {
                              event.preventDefault()
                              handleMoveQuickLink(draggingQuickLinkPath, link.path)
                            }}
                            onDragEnd={() => setDraggingQuickLinkPath(null)}
                            onContextMenu={event => {
                              event.preventDefault()
                              event.stopPropagation()
                              setFolderContextMenu({
                                x: event.clientX,
                                y: event.clientY,
                                entry: {
                                  fullPath: link.path,
                                  name: link.name,
                                  isDirectory: !!link.isDirectory,
                                },
                                parentPath: null,
                              })
                            }}
                            className="p-2 rounded border"
                            style={draggingQuickLinkPath === link.path
                              ? { ...S.panel, opacity: 0.55 }
                              : S.panel
                            }
                            title="Drag to reorder"
                          >
                            <div className="group flex items-center gap-2">
                              <span className="mono" style={{ fontSize: '11px', color: S.zinc }}>⋮⋮</span>
                              <FileFlagDot flag={getFileFlag(link.path)} />
                              {link.isDirectory ? (
                                <button
                                  onClick={() => toggleQuickLinkFolder(link.path)}
                                  className="mono text-xs"
                                  style={{ color: S.zinc, width: '14px' }}
                                  title={expandedQuickLinkFolders[link.path] ? 'Collapse' : 'Expand'}
                                >
                                  {loadingQuickLinkFolders[link.path] ? '…' : expandedQuickLinkFolders[link.path] ? '▾' : '▸'}
                                </button>
                              ) : (
                                <span className="mono text-xs" style={{ color: S.zinc, width: '14px' }}>•</span>
                              )}
                              <span style={{ fontSize: '12px' }}>{link.isDirectory ? '📁' : getFileIcon(link.name)}</span>
                              <p className="text-xs font-medium truncate" style={getFileNameColumnTextStyle({ color: '#E4E4E7' })}>{link.name}</p>
                              <FileNameColumnHandle />
                              <span className="min-w-0 flex-1" />
                              {!link.isDirectory && quickLinkStats[link.path]?.sizeBytes > 0 && (
                                <span className="mono text-[10px] shrink-0" style={{ color: S.muted }}>{formatFileSize(quickLinkStats[link.path].sizeBytes)}</span>
                              )}
                              {quickLinkStats[link.path]?.mtime && (
                                <span className="mono text-[10px] shrink-0" style={{ color: S.zinc }}>{formatLastEditedDate(quickLinkStats[link.path].mtime)}</span>
                              )}
                              <button
                                draggable={false}
                                onMouseDown={event => event.stopPropagation()}
                                onClick={event => {
                                  event.stopPropagation()
                                  handleRemoveQuickLink(link.path)
                                }}
                                className="mono text-[10px] hover:text-white transition"
                                style={{ color: S.zinc }}
                              >
                                Remove
                              </button>
                            </div>
                            <p className="mono mt-1 truncate" style={{ fontSize: '10px', color: S.zinc }}>{link.path}</p>
                            {link.isDirectory && expandedQuickLinkFolders[link.path] && (
                              <div className="mt-2 space-y-1">
                                {renderQuickLinkChildren(quickLinkChildrenByPath[link.path] ?? [], 1)}
                              </div>
                            )}
                          </div>
                        ))}
                        {quickLinks.length === 0 && (
                          <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>
                            Right-click a file or folder and choose Add to Quick Links.
                          </p>
                        )}
                      </div>
                    )}

                    {key === 'selectedFolder' && (
                      <div className="space-y-2">
                        {!selectedTreeFolderPath && (
                          <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>
                            Select a folder in the project tree to inspect its contents here.
                          </p>
                        )}
                        {selectedTreeFolderPath && (
                          <div
                            draggable
                            data-drop-path={selectedTreeFolderPath}
                            onDragStart={event => handleQuickFilingDragStart(event, selectedTreeFolderPath)}
                            onDragEnd={handleFileMoveDragEnd}
                            onDragOver={handleFileMoveDragOver}
                            onDragLeave={handleFileMoveDragLeave}
                            onDrop={event => handleFileMoveDrop(event, selectedTreeFolderPath)}
                            onContextMenu={event => {
                              event.preventDefault()
                              event.stopPropagation()
                              setFolderContextMenu({
                                x: event.clientX,
                                y: event.clientY,
                                entry: {
                                  fullPath: selectedTreeFolderPath,
                                  name: getPathName(selectedTreeFolderPath),
                                  isDirectory: true,
                                },
                                parentPath: null,
                              })
                            }}
                            className="rounded border p-2"
                            onDoubleClick={() => handleOpenListEntry(selectedTreeFolderPath)}
                            style={{
                              ...S.panel,
                              borderColor: fileMoveDropTargetPath === selectedTreeFolderPath ? '#7A5CFF' : S.border,
                              backgroundColor: fileMoveDropTargetPath === selectedTreeFolderPath ? '#1C1629' : S.panel.backgroundColor,
                              boxShadow: fileMoveDropTargetPath === selectedTreeFolderPath ? '0 0 0 1px #7A5CFF88 inset' : 'none',
                            }}
                          >
                            <div className="group flex items-center gap-2">
                              <FileFlagDot flag={getFileFlag(selectedTreeFolderPath)} />
                              <span style={{ fontSize: '12px' }}>📁</span>
                              <p className="text-xs font-medium truncate" style={getFileNameColumnTextStyle({ color: '#E4E4E7' })}>{getPathName(selectedTreeFolderPath)}</p>
                              <FileNameColumnHandle />
                            </div>
                            <p className="mono mt-1 truncate" style={{ fontSize: '10px', color: S.zinc }}>{selectedTreeFolderPath}</p>
                          </div>
                        )}
                        {selectedTreeFolderPath && (
                          <div className="rounded border p-2 space-y-1" style={S.elevated}>
                            {selectedTreeFolderLoading
                              ? <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>Loading folder...</p>
                              : (
                                <>
                                  <SortBar sort={selectedFolderSort} onSort={setSelectedFolderSort} />
                                  {canDropToSelectedTreeFolderParent && (
                                    <div
                                      data-drop-path={selectedTreeFolderParentPath}
                                      onDragOver={handleFileMoveDragOver}
                                      onDragLeave={handleFileMoveDragLeave}
                                      onDrop={event => handleFileMoveDrop(event, selectedTreeFolderParentPath)}
                                      onDoubleClick={() => handleFolderSelect({ fullPath: selectedTreeFolderParentPath, name: getPathName(selectedTreeFolderParentPath) })}
                                      onContextMenu={event => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        setFolderContextMenu({
                                          x: event.clientX,
                                          y: event.clientY,
                                          entry: { fullPath: selectedTreeFolderParentPath, name: getPathName(selectedTreeFolderParentPath), isDirectory: true },
                                          parentPath: getParentPath(selectedTreeFolderParentPath),
                                        })
                                      }}
                                      className="group flex items-center gap-2 rounded border px-2 py-1.5"
                                      style={{
                                        ...S.panel,
                                        borderColor: fileMoveDropTargetPath === selectedTreeFolderParentPath ? '#7A5CFF' : S.border,
                                        backgroundColor: fileMoveDropTargetPath === selectedTreeFolderParentPath ? '#1C1629' : S.panel.backgroundColor,
                                        boxShadow: fileMoveDropTargetPath === selectedTreeFolderParentPath ? '0 0 0 1px #7A5CFF88 inset' : 'none',
                                      }}
                                      title={selectedTreeFolderParentPath}
                                    >
                                      <span className="mono text-xs" style={{ color: S.zinc, width: '14px' }}>↰</span>
                                      <FileFlagDot flag={getFileFlag(selectedTreeFolderParentPath)} />
                                      <span style={{ fontSize: '12px' }}>📁</span>
                                      <p className="text-xs font-medium truncate" style={{ color: '#E4E4E7' }}>{getPathName(selectedTreeFolderParentPath)}</p>
                                      <span className="mono ml-auto text-[10px] shrink-0" style={{ color: S.zinc }}>Parent</span>
                                    </div>
                                  )}
                                  {renderFolderEntries(sortEntries(selectedTreeFolderEntries, selectedFolderSort), 0, selectedTreeFolderPath)}
                                </>
                              )}
                          </div>
                        )}
                      </div>
                    )}

                    {key === 'recentFiles' && (
                      <div className="space-y-2">
                        {/* Toggle: subproject vs whole project */}
                        <div className="flex items-center justify-between mb-1">
                          <span className="mono text-[10px]" style={{ color: S.zinc }}>
                            {recentFilesShowAll ? 'All project opens' : (activeSubproject ? activeSubproject.name ?? 'Subproject' : 'Project') + ' opens'}
                          </span>
                          <button
                            onClick={() => setRecentFilesShowAll(v => !v)}
                            className="mono text-[10px] rounded border px-2 py-0.5 transition hover:border-[#7A5CFF]"
                            style={{ borderColor: recentFilesShowAll ? '#7A5CFF' : S.border, color: recentFilesShowAll ? '#7A5CFF' : S.zinc, backgroundColor: 'transparent' }}
                            title={recentFilesShowAll ? 'Showing all project opens — click to scope to subproject' : 'Showing subproject opens — click to show all project opens'}
                          >
                            {recentFilesShowAll ? 'Project' : 'Subproject'}
                          </button>
                        </div>
                        {openedFilesForPanel.map(entry => (
                          <button
                            key={entry.path}
                            onClick={() => handleOpenListEntry(entry.path)}
                            onContextMenu={event => {
                              event.preventDefault()
                              event.stopPropagation()
                              setFolderContextMenu({
                                x: event.clientX,
                                y: event.clientY,
                                entry: { fullPath: entry.path, name: entry.name, isDirectory: false },
                                parentPath: getParentPath(entry.path),
                              })
                            }}
                            className="group w-full p-2 rounded border text-left hover:border-[#7A5CFF] transition"
                            style={S.panel}
                            title={entry.path}
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <FileFlagDot flag={getFileFlag(entry.path)} />
                                <span style={{ fontSize: '11px' }}>{getFileIcon(entry.name)}</span>
                                <p className="text-xs font-medium truncate" style={getFileNameColumnTextStyle({ color: '#E4E4E7' })}>{entry.name}</p>
                                <FileNameColumnHandle />
                              </div>
                              <span className="min-w-0 flex-1" />
                              <span className="mono text-[10px] shrink-0" style={{ color: S.zinc }}>{formatRelativeTime(entry.openedAt)}</span>
                            </div>
                            <p className="mono mt-1 truncate" style={{ fontSize: '10px', color: S.zinc }}>{entry.path}</p>
                          </button>
                        ))}
                        {openedFilesForPanel.length === 0 && (
                          <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>No files opened yet{activeSubproject && !recentFilesShowAll ? ' in this subproject' : ''}.</p>
                        )}
                      </div>
                    )}

                    {key === 'flagged' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={flaggedColor}
                            onChange={event => {
                              setFlaggedColorBySlot(prev => ({ ...prev, [slotIndex]: event.target.value }))
                              setFlaggedShowAllBySlot(prev => ({ ...prev, [slotIndex]: false }))
                            }}
                            className="w-full rounded border text-xs outline-none"
                            style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                          >
                            {FILE_FLAG_OPTIONS.map(option => (
                              <option key={option.key} value={option.key}>{option.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setFlaggedShowAllBySlot(prev => ({ ...prev, [slotIndex]: !prev[slotIndex] }))}
                            className="mono shrink-0 rounded border px-2 py-1 text-[10px] transition hover:border-[#7A5CFF] hover:text-white"
                            style={{ backgroundColor: flaggedShowAll ? S.elevated.backgroundColor : S.panel.backgroundColor, borderColor: flaggedShowAll ? S.accent : S.border, color: flaggedShowAll ? S.text : S.zinc }}
                            title="Show all flagged colours grouped by colour"
                          >
                            All
                          </button>
                          <span
                            aria-hidden="true"
                            className="shrink-0 rounded-full"
                            style={{ width: 12, height: 12, backgroundColor: flaggedShowAll ? S.text : (FILE_FLAG_BY_KEY[flaggedColor]?.color ?? S.accent), boxShadow: `0 0 10px ${flaggedShowAll ? S.text : (FILE_FLAG_BY_KEY[flaggedColor]?.color ?? S.accent)}66` }}
                          />
                        </div>
                        <SortBar
                          sort={flaggedSort}
                          onSort={nextSort => setFlaggedSortBySlot(prev => ({ ...prev, [slotIndex]: nextSort }))}
                        />
                        <div className="space-y-1">
                          {(flaggedShowAll ? flaggedGroups.flatMap(group => [
                            <div key={`heading:${group.option.key}`} className="flex items-center gap-2 px-1 pt-2 first:pt-0">
                              <span
                                aria-hidden="true"
                                className="rounded-full"
                                style={{ width: 9, height: 9, backgroundColor: group.option.color, boxShadow: `0 0 8px ${group.option.color}66` }}
                              />
                              <p className="mono text-[10px] uppercase tracking-[0.08em]" style={{ color: S.zinc }}>{group.option.label}</p>
                              <span className="mono text-[10px]" style={{ color: S.dim }}>{group.items.length}</span>
                            </div>,
                            ...group.items.map(item => (
                              <button
                                key={normalizePathFlagKey(item.path)}
                                onClick={() => handleOpenListEntry(item.path)}
                                onContextMenu={event => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  setFolderContextMenu({
                                    x: event.clientX,
                                    y: event.clientY,
                                    entry: { ...item, fullPath: item.path },
                                    parentPath: getParentPath(item.path),
                                  })
                                }}
                                className="group w-full p-2 rounded border text-left hover:border-[#7A5CFF] transition"
                                style={S.panel}
                                title={item.path}
                              >
                                <div className="flex items-center gap-2">
                                  <FileFlagDot flag={item} />
                                  <span style={{ fontSize: '12px' }}>{item.isDirectory ? '📁' : getFileIcon(item.name)}</span>
                                  <p className="text-xs font-medium truncate" style={getFileNameColumnTextStyle({ color: '#E4E4E7' })}>{item.name}</p>
                                  <FileNameColumnHandle />
                                </div>
                                <p className="mono mt-1 truncate" style={{ fontSize: '10px', color: S.zinc }}>{item.path}</p>
                              </button>
                            )),
                          ]) : flaggedItems.map(item => (
                            <button
                              key={normalizePathFlagKey(item.path)}
                              onClick={() => handleOpenListEntry(item.path)}
                              onContextMenu={event => {
                                event.preventDefault()
                                event.stopPropagation()
                                setFolderContextMenu({
                                  x: event.clientX,
                                  y: event.clientY,
                                  entry: { ...item, fullPath: item.path },
                                  parentPath: getParentPath(item.path),
                                })
                              }}
                              className="group w-full p-2 rounded border text-left hover:border-[#7A5CFF] transition"
                              style={S.panel}
                              title={item.path}
                            >
                              <div className="flex items-center gap-2">
                                <FileFlagDot flag={item} />
                                <span style={{ fontSize: '12px' }}>{item.isDirectory ? '📁' : getFileIcon(item.name)}</span>
                                <p className="text-xs font-medium truncate" style={getFileNameColumnTextStyle({ color: '#E4E4E7' })}>{item.name}</p>
                                <FileNameColumnHandle />
                              </div>
                              <p className="mono mt-1 truncate" style={{ fontSize: '10px', color: S.zinc }}>{item.path}</p>
                            </button>
                          )))}
                          {flaggedTotal === 0 && (
                            <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>{flaggedShowAll ? 'No flagged files or folders yet.' : 'No files or folders flagged with this colour.'}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {key === 'plainNotes' && (
                      <div className="h-full min-h-[180px] flex flex-col gap-2">
                        <div className="shrink-0 flex gap-2">
                          <select
                            value={activeNote?.id ?? DEFAULT_NOTE_SECTION.id}
                            onChange={event => selectNoteSection(event.target.value)}
                            onContextMenu={event => {
                              event.preventDefault()
                              event.stopPropagation()
                              setNoteContextMenu({
                                x: event.clientX,
                                y: event.clientY,
                                noteId: activeNote?.id ?? DEFAULT_NOTE_SECTION.id,
                                label: activeNote?.name ?? DEFAULT_NOTE_SECTION.name,
                                text: plainNotesText,
                                canDelete: noteSections.length > 1,
                              })
                            }}
                            onDoubleClick={() => {
                              const currentName = activeNote?.name ?? ''
                              const nextName = window.prompt('Rename note section', currentName)
                              if (nextName !== null) renameNoteSection(activeNote?.id, nextName)
                            }}
                            disabled={!activeProject}
                            className="min-w-[120px] max-w-[180px] rounded border text-xs outline-none disabled:opacity-40"
                            style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                            title="Choose note section. Right-click to delete, double-click to rename."
                          >
                            {noteSections.map(note => (
                              <option key={note.id} value={note.id}>{note.name}</option>
                            ))}
                          </select>
                          <input
                            value={newNoteTitle}
                            onChange={event => setNewNoteTitle(event.target.value)}
                            onKeyDown={event => event.key === 'Enter' && addNoteSection()}
                            placeholder="Add note section"
                            disabled={!activeProject}
                            className="min-w-0 flex-1 rounded border text-xs outline-none disabled:opacity-40"
                            style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                          />
                          <button
                            onClick={addNoteSection}
                            disabled={!newNoteTitle.trim() || !activeProject}
                            className="text-xs px-2 rounded border transition disabled:opacity-40"
                            style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text }}
                          >
                            Add
                          </button>
                        </div>
                        <textarea
                          value={plainNotesText}
                          onChange={event => updatePlainNotesBox(slotIndex, event.target.value)}
                          placeholder={`Write ${activeNote?.name ?? 'project'} notes here...`}
                          disabled={!activeProject}
                          className="w-full flex-1 min-h-[120px] resize-none rounded border text-xs outline-none leading-relaxed disabled:opacity-40"
                          style={{ backgroundColor: '#121214', borderColor: S.border, color: S.text, padding: '10px 12px' }}
                          spellCheck="true"
                        />
                      </div>
                    )}

                    {key === 'timeline' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 px-1">
                          <span className="mono text-[10px] uppercase tracking-widest" style={{ color: S.muted }}>Activity</span>
                          <button
                            onClick={clearProjectTimeline}
                            disabled={!activeProject || timelineItems.length === 0}
                            className="mono text-[10px] px-2 py-1 rounded border transition disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ backgroundColor: '#0D0D0F', borderColor: S.border, color: S.zinc }}
                            title="Clear the visible Project Timeline list"
                          >
                            Clear List
                          </button>
                        </div>
                        <div className="rounded-md border" style={{ ...S.panel, padding: '10px 8px' }}>
                            {groupTimelineByDay(timelineItems).map((group, gIdx, allGroups) => (
                              <div key={group.label} className={gIdx > 0 ? 'mt-4' : ''}>
                                <div className="flex items-center gap-2 px-1 mb-2">
                                  <span className="mono text-[10px] uppercase tracking-widest" style={{ color: S.muted }}>{group.label}</span>
                                  <span className="flex-1 h-px" style={{ background: 'linear-gradient(to right, #1F1F23, transparent)' }} />
                                  <span className="mono text-[9px] tabular-nums" style={{ color: S.dim }}>{group.items.length}</span>
                                </div>
                                <div className="relative">
                                  <span
                                    aria-hidden="true"
                                    className="absolute"
                                    style={{
                                      left: 17,
                                      top: 14,
                                      bottom: 14,
                                      width: 2,
                                      borderRadius: 1,
                                      background: `linear-gradient(to bottom, ${getTimelineItemColor(group.items[0])}cc, ${getTimelineItemColor(group.items[group.items.length - 1])}33)`,
                                    }}
                                  />
                                  <ul className="space-y-2">
                                    {groupTimelineForDisplay(group.items).map(node => {
                                      if (node.kind === 'item') return renderTimelineItemRow(node.item)
                                      const burstItems = node.items
                                      const burstFirst = burstItems[0]
                                      const burstLast = burstItems[burstItems.length - 1]
                                      const burstColor = getTimelineItemColor(burstFirst)
                                      const burstBadge = getTimelineBadgeLabel(burstFirst)
                                      const isExpanded = Boolean(expandedTimelineBursts[node.key])
                                      return (
                                        <li key={node.key} className="flex gap-2 items-stretch">
                                          <div
                                            aria-hidden="true"
                                            className="shrink-0 grid place-items-center rounded-md relative"
                                            style={{
                                              width: 28,
                                              height: 28,
                                              marginTop: 2,
                                              backgroundColor: burstColor,
                                              boxShadow: `0 0 0 2px ${S.panel.backgroundColor}, 0 0 12px ${burstColor}55`,
                                              zIndex: 1,
                                            }}
                                          >
                                            <span className="mono text-[10px] font-semibold" style={{ color: '#F5F5F7' }}>{burstItems.length}</span>
                                          </div>
                                          <div
                                            className="flex-1 min-w-0 relative rounded-md overflow-hidden"
                                            style={{
                                              backgroundColor: '#121214',
                                              border: '1px solid #1F1F23',
                                              padding: '8px 10px 8px 14px',
                                            }}
                                          >
                                            <span
                                              aria-hidden="true"
                                              className="absolute left-0 top-0 bottom-0"
                                              style={{ width: 3, backgroundColor: burstColor }}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => toggleTimelineBurst(node.key)}
                                              className="w-full text-left"
                                            >
                                              <div className="flex items-start justify-between gap-2">
                                                <p className="text-xs font-semibold leading-snug truncate" style={{ color: '#F5F5F7' }}>{node.title}</p>
                                                <span
                                                  className="mono text-[10px] tabular-nums shrink-0 rounded px-1.5 py-0.5"
                                                  style={{ color: S.muted, backgroundColor: '#0D0D0F', border: '1px solid #1F1F23' }}
                                                >
                                                  {burstFirst.time}
                                                </span>
                                              </div>
                                              <p className="mono mt-1 leading-snug" style={{ fontSize: '10px', color: S.zinc }}>
                                                {formatTimelineExactTime(burstLast.ts)} - {formatTimelineExactTime(burstFirst.ts)}
                                              </p>
                                              <div className="mt-1.5 flex items-center gap-1.5">
                                                <span
                                                  className="mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                                                  style={{
                                                    color: burstColor,
                                                    backgroundColor: burstColor + '14',
                                                    border: `1px solid ${burstColor}44`,
                                                  }}
                                                >
                                                  {burstBadge}
                                                </span>
                                                <span className="mono text-[9px]" style={{ color: S.dim }}>{isExpanded ? 'Collapse' : 'Expand'}</span>
                                              </div>
                                            </button>
                                            {isExpanded && (
                                              <ul className="mt-2 space-y-2">
                                                {burstItems.map(item => renderTimelineItemRow(item, `${node.key}:`))}
                                              </ul>
                                            )}
                                          </div>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                </div>
                              </div>
                            ))}
                        </div>

                        {timelineItems.length === 0 && (
                          <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>No timeline activity yet.</p>
                        )}
                      </div>
                    )}

                    {key === 'timesheet' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-[125px_1fr_78px_minmax(150px,0.8fr)_auto] gap-2 items-start">
                          <input
                            type="date"
                            value={timesheetDraft.date}
                            onChange={event => updateTimesheetDraft('date', event.target.value)}
                            disabled={!activeProject}
                            className="min-w-0 rounded border text-xs outline-none disabled:opacity-40"
                            style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                          />
                          <input
                            value={timesheetDraft.task}
                            onChange={event => updateTimesheetDraft('task', event.target.value)}
                            onKeyDown={event => event.key === 'Enter' && addTimesheetEntry()}
                            placeholder="Task / activity"
                            disabled={!activeProject}
                            className="min-w-0 rounded border text-xs outline-none disabled:opacity-40"
                            style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            value={timesheetDraft.hours}
                            onChange={event => updateTimesheetDraft('hours', event.target.value)}
                            onKeyDown={event => event.key === 'Enter' && addTimesheetEntry()}
                            placeholder="Hours"
                            disabled={!activeProject}
                            className="min-w-0 rounded border text-xs outline-none disabled:opacity-40"
                            style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                          />
                          <textarea
                            value={timesheetDraft.note}
                            onChange={event => updateTimesheetDraft('note', event.target.value)}
                            placeholder="Optional note"
                            disabled={!activeProject}
                            rows={getTimesheetNoteRows(timesheetDraft.note)}
                            className="min-w-0 resize-none rounded border text-xs outline-none disabled:opacity-40"
                            style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px', lineHeight: '16px' }}
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={addTimesheetEntry}
                              disabled={!activeProject || !String(timesheetDraft.task ?? '').trim() || !(Number(timesheetDraft.hours) > 0)}
                              className="text-xs px-2 rounded border transition disabled:opacity-40"
                              style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text }}
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={startTimesheetTimer}
                              disabled={!activeProject || Boolean(timesheetTimer) || !String(timesheetDraft.task ?? '').trim()}
                              className="text-xs px-2 rounded border transition disabled:opacity-40"
                              style={{ backgroundColor: S.accent, borderColor: S.accent, color: 'white' }}
                            >
                              Start
                            </button>
                          </div>
                        </div>
                        {timesheetTimer && (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-2" style={S.panel}>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="mono text-[9px] uppercase tracking-widest" style={{ color: S.dim }}>Running</span>
                                <span className="min-w-0 truncate text-sm font-semibold" style={{ color: S.text }}>{timesheetTimer.task}</span>
                                <span className="mono text-xs tabular-nums" style={{ color: S.accent }}>{formatTimesheetElapsed(timesheetTimerElapsedMs)}</span>
                              </div>
                              <p className="mono mt-1 truncate text-[10px]" style={{ color: S.zinc }}>
                                Started {formatTimesheetClock(timesheetTimer.startedAt)} · {timesheetTimer.date}
                              </p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={endTimesheetTimer}
                                className="text-xs px-2 py-1 rounded border transition"
                                style={{ backgroundColor: S.accent, borderColor: S.accent, color: 'white' }}
                              >
                                End Time
                              </button>
                              <button
                                type="button"
                                onClick={cancelTimesheetTimer}
                                className="text-xs px-2 py-1 rounded border transition"
                                style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.zinc }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-2">
                          <div className="flex min-w-0 items-center gap-2 rounded border px-2 py-1" style={S.panel}>
                            <span className="mono text-[9px] uppercase tracking-widest" style={{ color: S.dim }}>Entries</span>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: S.text }}>{timesheetEntries.length}</span>
                          </div>
                          <div className="flex min-w-0 items-center gap-2 rounded border px-2 py-1" style={S.panel}>
                            <span className="mono text-[9px] uppercase tracking-widest" style={{ color: S.dim }}>Hours</span>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: S.text }}>{timesheetTotalHours.toFixed(2)}</span>
                          </div>
                          <div className="flex min-w-0 items-center gap-2 rounded border px-2 py-1" style={S.panel}>
                            <span className="mono shrink-0 text-[9px] uppercase tracking-widest" style={{ color: S.dim }}>Project</span>
                            <span className="min-w-0 truncate text-xs font-medium" style={{ color: S.text }}>{activeProject?.name ?? 'None'}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {timesheetGroups.map(group => (
                            <div key={group.key} className="rounded border" style={S.panel}>
                              <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5" style={{ borderColor: S.border }}>
                                <span className="mono text-[10px] uppercase tracking-widest truncate" style={{ color: S.muted }}>{group.label}</span>
                                <span className="mono text-[10px] rounded px-1.5 py-0.5 shrink-0" style={{ backgroundColor: '#0D0D0F', color: S.accent, border: `1px solid ${S.border}` }}>
                                  {group.totalHours.toFixed(2)}h
                                </span>
                              </div>
                              <div className="space-y-1 p-2">
                                {group.entries.map(entry => (
                                  <div key={entry.id} className="rounded border p-2" style={S.deeper}>
                                    <div className="grid grid-cols-[1fr_78px_minmax(150px,0.8fr)_auto] gap-2 items-start">
                                      <input
                                        value={entry.task}
                                        onChange={event => updateTimesheetEntry(entry.id, 'task', event.target.value)}
                                        placeholder="Task / activity"
                                        className="min-w-0 rounded border text-xs outline-none"
                                        style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                                      />
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.25"
                                        value={entry.hours}
                                        onChange={event => updateTimesheetEntry(entry.id, 'hours', event.target.value)}
                                        placeholder="Hours"
                                        className="min-w-0 rounded border text-xs outline-none"
                                        style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px' }}
                                      />
                                      <textarea
                                        value={entry.note}
                                        onChange={event => updateTimesheetEntry(entry.id, 'note', event.target.value)}
                                        placeholder="Optional note"
                                        rows={getTimesheetNoteRows(entry.note)}
                                        className="min-w-0 resize-none rounded border text-xs outline-none"
                                        style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 8px', lineHeight: '16px' }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeTimesheetEntry(entry.id)}
                                        className="mono text-[10px] px-2 rounded border hover:text-white transition shrink-0"
                                        style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.zinc }}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                    {(entry.startTime || entry.endTime) && (
                                      <p className="mono mt-1 text-[10px]" style={{ color: S.zinc }}>
                                        {formatTimesheetClock(entry.startTime)} - {formatTimesheetClock(entry.endTime)}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          {!timesheetEntries.length && (
                            <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>No time entries yet.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {key === 'templates' && (
                      <div className="space-y-2">
                        <select
                          value={selectedTpl}
                          onChange={event => setSelectedTpl(event.target.value)}
                          className="w-full rounded border text-xs outline-none"
                          style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '7px 10px' }}
                        >
                          <option value="">Select template...</option>
                          {templates.map(template => (
                            <option key={template.id} value={template.id}>{template.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleOpenTemplate}
                          disabled={!selectedTpl}
                          className="w-full text-xs py-2 rounded font-medium transition disabled:opacity-40"
                          style={{ backgroundColor: S.accent, color: '#fff' }}
                        >
                          Copy to Project & Open
                        </button>
                        {tplToast && (
                          <p className="text-xs" style={{ color: tplToast.type === 'ok' ? '#30D158' : '#FF453A' }}>{tplToast.message}</p>
                        )}
                        {templates.length === 0 && (
                          <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>No templates yet. Add templates in Engine Backend.</p>
                        )}
                      </div>
                    )}

                    {key === 'todo' && todoGroups.map(group => (
                      <div key={group.id} className="space-y-1">
                        {todoViewMode === 'all' && (
                          <div className="flex items-center justify-between gap-2 px-1 pt-1">
                            <p
                              onContextMenu={event => {
                                event.preventDefault()
                                event.stopPropagation()
                                setTodoContextMenu({
                                  x: event.clientX,
                                  y: event.clientY,
                                  type: 'list',
                                  slotIndex,
                                  listId: group.id,
                                  label: group.name,
                                  canDelete: group.id !== DEFAULT_TODO_LIST.id && todoLists.length > 1,
                                })
                              }}
                              className="mono text-[10px] uppercase tracking-wider truncate"
                              style={{ color: S.muted }}
                              title="Right-click to delete this title"
                            >
                              {group.name}
                            </p>
                            <span className="mono text-[10px]" style={{ color: S.zinc }}>{group.items.length}</span>
                          </div>
                        )}
                        {group.items.map(item => (
                          <div
                            key={`${group.id}-${item.id}`}
                            draggable={editingTodoItemKey !== `${group.id}:${item.id}`}
                            onDragStart={event => {
                              event.dataTransfer.effectAllowed = 'move'
                              event.dataTransfer.setData('text/plain', item.id)
                              draggedTodoMovedRef.current = false
                              setDraggingTodoItem({ listId: group.id, todoId: item.id, title: item.title })
                            }}
                            onDragOver={event => {
                              if (draggingTodoItem?.listId !== group.id || draggingTodoItem?.todoId === item.id) return
                              event.preventDefault()
                              event.dataTransfer.dropEffect = 'move'
                              const position = getTodoDropPosition(event)
                              const target = { listId: group.id, todoId: item.id, position }
                              setDragOverTodoTarget(target)
                              reorderTodoItemToDropTarget(draggingTodoItem, target)
                            }}
                            onDrop={event => {
                              event.preventDefault()
                              finishTodoDrag()
                            }}
                            onDragEnd={finishTodoDrag}
                            onContextMenu={event => {
                              event.preventDefault()
                              event.stopPropagation()
                              setTodoContextMenu({
                                x: event.clientX,
                                y: event.clientY,
                                type: 'task',
                                listId: group.id,
                                todoId: item.id,
                                label: item.title,
                              })
                            }}
                            className="p-2 rounded border transition cursor-grab active:cursor-grabbing"
                            style={{
                              ...S.panel,
                              opacity: draggingTodoItem?.listId === group.id && draggingTodoItem?.todoId === item.id ? 0.55 : 1,
                              borderColor: draggingTodoItem?.listId === group.id && draggingTodoItem?.todoId === item.id || landedTodoItemKey === `${group.id}:${item.id}` ? S.accent : S.panel.borderColor,
                              boxShadow: landedTodoItemKey === `${group.id}:${item.id}` ? '0 0 0 1px rgba(122, 92, 255, 0.45), 0 8px 24px rgba(122, 92, 255, 0.16)' : 'none',
                              marginTop: dragOverTodoTarget?.listId === group.id && dragOverTodoTarget?.todoId === item.id && dragOverTodoTarget?.position === 'before' ? 12 : 0,
                              marginBottom: dragOverTodoTarget?.listId === group.id && dragOverTodoTarget?.todoId === item.id && dragOverTodoTarget?.position === 'after' ? 12 : 0,
                              transform: landedTodoItemKey === `${group.id}:${item.id}`
                                ? 'scale(1.018)'
                                : dragOverTodoTarget?.listId === group.id && dragOverTodoTarget?.todoId === item.id
                                ? `translateY(${dragOverTodoTarget.position === 'before' ? 2 : -2}px)`
                                : 'translateY(0)',
                              transition: 'margin 140ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 120ms ease, border-color 120ms ease, box-shadow 180ms ease',
                            }}
                            title="Drag to reorder"
                          >
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleTodoItem(group.id, item.id)}
                                draggable={false}
                                className="mono text-xs"
                                style={{ color: item.done ? '#30D158' : S.zinc }}
                                title={item.done ? 'Mark as not done' : 'Mark as done'}
                              >
                                {item.done ? '✓' : '○'}
                              </button>
                              {editingTodoItemKey === `${group.id}:${item.id}` ? (
                                <textarea
                                  value={editingTodoDraft}
                                  onChange={event => setEditingTodoDraft(event.target.value)}
                                  onBlur={() => commitEditTodoItem(group.id, item.id)}
                                  onKeyDown={event => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      commitEditTodoItem(group.id, item.id)
                                    }
                                    if (event.key === 'Escape') cancelEditTodoItem()
                                  }}
                                  rows={2}
                                  className="min-w-0 flex-1 resize-none rounded border text-xs font-medium outline-none leading-relaxed"
                                  style={{ backgroundColor: '#1A1A1E', borderColor: S.accent, color: S.text, padding: '4px 6px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                                  autoFocus
                                />
                              ) : (
                                <p
                                  onDoubleClick={() => beginEditTodoItem(group.id, item)}
                                  className="min-w-0 flex-1 cursor-text whitespace-normal text-xs font-medium leading-relaxed"
                                  style={{ color: item.done ? S.dim : '#E4E4E7', textDecoration: item.done ? 'line-through' : 'none', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                                  title="Double-click to edit"
                                >
                                  {item.title}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                        {todoViewMode === 'all' && group.items.length === 0 && (
                          <p className="mono px-1 pb-1" style={{ fontSize: '10px', color: S.dim }}>No tasks in this list.</p>
                        )}
                      </div>
                    ))}

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
                        <div className="group flex items-center gap-1.5">
                          <FileFlagDot flag={getFileFlag(activeProject?.root_path && entry.relativePath ? `${activeProject.root_path}\\${entry.relativePath.replace(/\//g, '\\')}` : '')} />
                          {entry.isDirectory !== undefined && (
                            <span style={{ fontSize: '12px' }}>{entry.isDirectory ? '📁' : getFileIcon(entry.name)}</span>
                          )}
                          <p className="text-xs font-medium truncate" style={getFileNameColumnTextStyle({ color: '#E4E4E7' })}>{entry.name}</p>
                          <FileNameColumnHandle />
                        </div>
                        {entry.subfolder !== undefined && (
                          <p className="mono mt-1" style={{ fontSize: '10px', color: S.zinc }}>..\{entry.subfolder}\</p>
                        )}
                      </div>
                    ))}
                    {key === 'todo' && extras.map(file => (
                      <div
                        key={file.relativePath ?? file.name}
                        className="p-3 rounded border relative"
                        style={{ backgroundColor: 'rgba(120,53,15,0.05)', borderColor: 'rgba(120,53,15,0.4)' }}
                      >
                        <div className="absolute top-2 right-2 mono" style={{ fontSize: '10px', color: '#F59E0B' }}>⚠️ Out of Place</div>
                        <div className="group flex items-center gap-1.5 pr-20">
                          <FileFlagDot flag={getFileFlag(activeProject?.root_path && file.relativePath ? `${activeProject.root_path}\\${file.relativePath.replace(/\//g, '\\')}` : '')} />
                          <p className="text-xs font-medium truncate" style={getFileNameColumnTextStyle({ color: '#E4E4E7' })}>{file.name}</p>
                          <FileNameColumnHandle />
                        </div>
                        <p className="mono mt-1" style={{ fontSize: '10px', color: 'rgba(245,158,11,0.7)' }}>..\{file.subfolder || 'Root'}\</p>
                      </div>
                    ))}
                    {key === 'todo' && total === 0 && (
                      <p className="mono p-1" style={{ fontSize: '10px', color: S.dim }}>Empty</p>
                    )}
                  </div>
                </div>
                )
              })}
              {!isBoxPopout && centerGridColumnsForRender.slice(0, -1).flatMap((_, columnIndex) => {
                const columnRatio = centerGridColumnsForRender.slice(0, columnIndex + 1).reduce((sum, weight) => sum + weight, 0) / centerGridColumnTotal
                const rowWeights = centerGridRowsByColumnForRender[columnIndex] ?? centerGridRowsForRender
                const rowTotal = rowWeights.reduce((sum, weight) => sum + weight, 0) || 1
                return rowWeights.map((__, rowIndex) => {
                  const rowStartRatio = rowWeights.slice(0, rowIndex).reduce((sum, weight) => sum + weight, 0) / rowTotal
                  const rowEndRatio = rowWeights.slice(0, rowIndex + 1).reduce((sum, weight) => sum + weight, 0) / rowTotal
                  const topInset = rowIndex === 0 ? 0 : 4
                  const bottomInset = rowIndex === rowWeights.length - 1 ? 0 : 4

                  return (
                    <div
                      key={`center-column-resize-${columnIndex}-${rowIndex}`}
                      role="separator"
                      aria-orientation="vertical"
                      title="Drag to resize this dashboard box boundary"
                      onMouseDown={event => beginCenterGridColumnResize(columnIndex, event)}
                      className="absolute z-30 cursor-col-resize rounded bg-transparent transition-colors hover:bg-[#7A5CFF]/60"
                      style={{
                        left: `calc(8px + (100% - 16px) * ${columnRatio})`,
                        top: `calc((100% - 8px) * ${rowStartRatio} + ${topInset}px)`,
                        bottom: `calc(8px + (100% - 8px) * ${1 - rowEndRatio} + ${bottomInset}px)`,
                        width: 8,
                        transform: 'translateX(-4px)',
                      }}
                    />
                  )
                })
              })}
              {!isBoxPopout && centerGridRowsForRender.slice(0, -1).flatMap((_, rowIndex) => {
                return centerGridColumnsForRender.map((__, columnIndex) => {
                  const rowWeights = centerGridRowsByColumnForRender[columnIndex] ?? centerGridRowsForRender
                  const rowTotal = rowWeights.reduce((sum, weight) => sum + weight, 0) || 1
                  const rowRatio = rowWeights.slice(0, rowIndex + 1).reduce((sum, weight) => sum + weight, 0) / rowTotal
                  const columnStartRatio = centerGridColumnsForRender.slice(0, columnIndex).reduce((sum, weight) => sum + weight, 0) / centerGridColumnTotal
                  const columnEndRatio = centerGridColumnsForRender.slice(0, columnIndex + 1).reduce((sum, weight) => sum + weight, 0) / centerGridColumnTotal
                  const leftInset = columnIndex === 0 ? 0 : 4
                  const rightInset = columnIndex === centerGridColumnsForRender.length - 1 ? 0 : 4

                  return (
                    <div
                      key={`center-row-resize-${rowIndex}-${columnIndex}`}
                      role="separator"
                      aria-orientation="horizontal"
                      title="Drag to resize this dashboard box boundary"
                      onMouseDown={event => beginCenterGridRowResize(rowIndex, columnIndex, event)}
                      className="absolute z-30 cursor-row-resize rounded bg-transparent transition-colors hover:bg-[#7A5CFF]/60"
                      style={{
                        left: `calc(8px + (100% - 16px) * ${columnStartRatio} + ${leftInset}px)`,
                        right: `calc(8px + (100% - 16px) * ${1 - columnEndRatio} + ${rightInset}px)`,
                        top: `calc((100% - 8px) * ${rowRatio})`,
                        height: 8,
                        transform: 'translateY(-4px)',
                      }}
                    />
                  )
                })
              })}
            </div>
            </div>
          )}

          {/* Center divider */}
          {!isBoxPopout && <div
            role="separator"
            aria-orientation="horizontal"
            title={centerCanvasCollapsed || centerTopCollapsed ? 'Expand center sections' : 'Drag to resize center split'}
            onMouseDown={centerCanvasCollapsed || centerTopCollapsed ? undefined : beginCenterSplitResize}
            className={`shrink-0 ${(centerCanvasCollapsed || centerTopCollapsed) ? 'cursor-pointer' : 'cursor-row-resize'} hover:bg-[#1F1F23] transition-colors flex items-center justify-center gap-1`}
            style={{ height: '10px', backgroundColor: '#080809', borderTop: '1px solid #1F1F23', borderBottom: '1px solid #1F1F23' }}
          >
            <button
              onMouseDown={event => event.stopPropagation()}
              onClick={toggleCenterTop}
              className="mono h-full text-[10px] leading-none px-1.5"
              style={{ color: centerTopCollapsed ? S.accent : S.zinc }}
              title={centerTopCollapsed ? 'Expand top panels' : 'Collapse top panels'}
            >
              {centerTopCollapsed ? '▾' : '▴'}
            </button>
            <button
              onMouseDown={event => event.stopPropagation()}
              onClick={toggleCenterCanvas}
              className="mono h-full text-[10px] leading-none px-1.5"
              style={{ color: centerCanvasCollapsed ? S.accent : S.zinc }}
              title={centerCanvasCollapsed ? 'Expand canvas' : 'Collapse canvas'}
            >
              {centerCanvasCollapsed ? '▴' : '▾'}
            </button>
          </div>}

          {/* Canvas */}
          {!isBoxPopout && !centerCanvasCollapsed && (
            <NoteCanvas
              projectId={activeProject?.id ?? null}
              projectRoot={activeProject?.root_path ?? null}
              subprojectId={activeSubproject?.id ?? null}
              subprojectLabel={activeSubproject?.display_name ?? null}
              phase={activeNoteCanvasKey}
              phaseLabel={activeNote?.name ?? DEFAULT_NOTE_SECTION.name}
              onAddQuickLink={handleAddQuickLink}
              onFolderRenamed={updateQuickLinksAfterPathRename}
            />
          )}
        </main>

        {/* RIGHT PANEL */}
        <div
          role="separator"
          aria-orientation="vertical"
          title={rightCollapsed ? 'Expand right panel' : 'Drag to resize the right panel'}
          onMouseDown={beginResizeRight}
          className={`shrink-0 ${rightCollapsed ? 'cursor-pointer' : 'cursor-col-resize'} hover:bg-[#1F1F23] transition-colors flex items-center justify-center`}
          style={{ width: isBoxPopout ? '0px' : `${SIDE_PANEL_RESIZER_WIDTH}px`, backgroundColor: '#080809' }}
        >
          {!isBoxPopout && <button
            onMouseDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation()
              toggleRightPanel()
            }}
            className="mono w-full h-16 text-sm leading-none flex items-center justify-center"
            style={{ color: S.zinc }}
            title={rightCollapsed ? 'Expand right panel' : 'Collapse right panel'}
          >
            {rightCollapsed ? '‹' : '›'}
          </button>}
        </div>

        <aside className="w-72 shrink-0 flex flex-col overflow-hidden border-l" style={{ ...S.panel, width: isBoxPopout || rightCollapsed ? '0px' : `${rightWidth}px`, borderLeftWidth: isBoxPopout ? 0 : undefined }}>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">

            {/* Templates */}
            <section
              className="flex flex-col shrink-0 overflow-hidden"
              style={getPanelSectionStyle({ height: `${rightSectionHeights.template}px`, order: (rightSectionOrderByKey.template ?? 0) * 2, display: sidePanelHiddenSet.has('template') ? 'none' : undefined }, draggingRightSectionKey === 'template', rightDropTargetKey === 'template' && draggingRightSectionKey !== 'template', landedRightSectionKey === 'template')}
              onDragOver={event => handleSectionDragOver(event, draggingRightSectionKey, 'template', setRightSectionOrder, setDraggingRightSectionKey, setRightDropTargetKey)}
              onDrop={event => { event.preventDefault(); finishSectionDrag(draggingRightSectionKey, setDraggingRightSectionKey, setRightDropTargetKey, setLandedRightSectionKey) }}
              onDragLeave={() => { if (rightDropTargetKey === 'template') setRightDropTargetKey(null) }}
            >
              <div style={getDropIndicatorStyle(rightDropTargetKey === 'template' && draggingRightSectionKey !== 'template')} />
              <div className="p-4 border-b flex-1 min-h-0 overflow-y-auto" style={{ borderColor: S.border }}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="mono text-xs uppercase tracking-widest" style={{ color: S.muted }}>📄 Open Template</h3>
                  <span
                    draggable
                    onDragStart={event => beginSectionDrag(event, 'template', setDraggingRightSectionKey)}
                    onDragEnd={() => finishSectionDrag(draggingRightSectionKey, setDraggingRightSectionKey, setRightDropTargetKey, setLandedRightSectionKey)}
                    className="mono text-xs cursor-grab active:cursor-grabbing"
                    style={getSectionHandleStyle(draggingRightSectionKey === 'template')}
                    title="Drag to reorder panel sections"
                  >
                    ⋮⋮
                  </span>
                </div>
                <select
                  value=""
                  onChange={e => {
                    const val = e.target.value
                    if (!val) return
                    const f = templateFiles.find(f => f.id === val)
                    if (f) {
                      setTplStagingItems(prev => [
                        ...prev,
                        { id: crypto.randomUUID(), sourcePath: f.path, sourceName: f.name, destName: f.name }
                      ])
                    }
                  }}
                  className="w-full rounded border text-sm mb-2 outline-none"
                  style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '7px 10px' }}
                >
                  <option value="">Select template file to stage...</option>
                  {templateFiles.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                {templateFiles.length === 0 && (
                  <p className="mono text-xs mb-2" style={{ color: S.dim }}>No template files — add in Engine Backend → Template Files</p>
                )}
                {tplToast && (
                  <p className="mt-2 text-xs" style={{ color: tplToast.type === 'ok' ? '#30D158' : '#FF453A' }}>
                    {tplToast.message}
                  </p>
                )}

                {tplStagingItems.length > 0 && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: S.border }}>
                    <p className="mono text-[10px] uppercase tracking-widest mb-2" style={{ color: S.muted }}>Staged — drag into a folder</p>
                    <div className="space-y-1.5">
                      {tplStagingItems.map(item => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={event => {
                            event.dataTransfer.effectAllowed = 'copy'
                            const templatePayload = JSON.stringify({
                              sourcePath: item.sourcePath,
                              destName: item.destName,
                              stagingId: item.id,
                            })
                            event.dataTransfer.setData(TEMPLATE_FILE_DRAG_MIME, templatePayload)
                            event.dataTransfer.setData(TEMPLATE_FILE_DRAG_MIME_ALT, templatePayload)
                            event.dataTransfer.setData('text/plain', item.sourcePath)
                          }}
                          className="flex items-center gap-2 rounded border px-2 py-1.5 cursor-grab active:cursor-grabbing"
                          style={{ backgroundColor: '#1A1A1E', borderColor: S.border }}
                        >
                          <span style={{ fontSize: '12px' }}>📄</span>
                          <input
                            type="text"
                            value={item.destName}
                            onChange={e => setTplStagingItems(prev => prev.map(s => s.id === item.id ? { ...s, destName: e.target.value } : s))}
                            className="flex-1 min-w-0 text-xs bg-transparent outline-none border-b"
                            style={{ color: S.text, borderColor: S.border }}
                            onClick={e => e.stopPropagation()}
                            onMouseDown={e => e.stopPropagation()}
                          />
                          <button
                            type="button"
                            onClick={() => setTplStagingItems(prev => prev.filter(s => s.id !== item.id))}
                            className="mono text-[10px] shrink-0 hover:text-white transition"
                            style={{ color: S.zinc }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Permanent Links */}
            <section
              className="flex flex-col shrink-0 overflow-hidden"
              style={getPanelSectionStyle({ height: `${rightSectionHeights.permanentLinks}px`, order: (rightSectionOrderByKey.permanentLinks ?? 0) * 2, display: sidePanelHiddenSet.has('permanentLinks') ? 'none' : undefined }, draggingRightSectionKey === 'permanentLinks', rightDropTargetKey === 'permanentLinks' && draggingRightSectionKey !== 'permanentLinks', landedRightSectionKey === 'permanentLinks')}
              onDragOver={event => handleSectionDragOver(event, draggingRightSectionKey, 'permanentLinks', setRightSectionOrder, setDraggingRightSectionKey, setRightDropTargetKey)}
              onDrop={event => { event.preventDefault(); finishSectionDrag(draggingRightSectionKey, setDraggingRightSectionKey, setRightDropTargetKey, setLandedRightSectionKey) }}
              onDragLeave={() => { if (rightDropTargetKey === 'permanentLinks') setRightDropTargetKey(null) }}
            >
              <div style={getDropIndicatorStyle(rightDropTargetKey === 'permanentLinks' && draggingRightSectionKey !== 'permanentLinks')} />
              <div className="p-3 border-b overflow-y-auto" style={{ borderColor: S.border }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="mono text-xs uppercase tracking-widest" style={{ color: S.muted }}>🔗 Permanent Links</h3>
                  <span
                    draggable
                    onDragStart={event => beginSectionDrag(event, 'permanentLinks', setDraggingRightSectionKey)}
                    onDragEnd={() => finishSectionDrag(draggingRightSectionKey, setDraggingRightSectionKey, setRightDropTargetKey, setLandedRightSectionKey)}
                    className="mono text-xs cursor-grab active:cursor-grabbing"
                    style={getSectionHandleStyle(draggingRightSectionKey === 'permanentLinks')}
                    title="Drag to reorder panel sections"
                  >
                    ⋮⋮
                  </span>
                </div>

                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => handleAddPermanentQuickLink({ label: '', type: 'folder' })}
                    className="flex-1 mono rounded border px-2 py-1.5 text-[10px] transition hover:border-[#7A5CFF]"
                    style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.labeltext }}
                  >
                    + Add Folder
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddPermanentQuickLink({ label: '', type: 'file' })}
                    className="flex-1 mono rounded border px-2 py-1.5 text-[10px] transition hover:border-[#7A5CFF]"
                    style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.labeltext }}
                  >
                    + Add File
                  </button>
                </div>

                <div className="space-y-1">
                  {permanentQuickLinks.map(link => (
                    <div key={link.id} className="flex items-center gap-2 rounded border px-2 py-1.5" style={S.deeper}>
                      <span className="shrink-0" style={{ fontSize: '12px' }}>{link.type === 'file' ? getFileIcon(link.label) : '📁'}</span>
                      <button
                        type="button"
                        onClick={() => handleOpenPermanentQuickLink(link)}
                        className="min-w-0 flex-1 text-left"
                        title={link.path}
                      >
                        <p className="truncate text-xs font-medium" style={{ color: S.text }}>{link.label}</p>
                        <p className="mono truncate" style={{ fontSize: '9px', color: S.dim }}>{link.path}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePermanentQuickLink(link.id)}
                        className="mono shrink-0 text-[10px] transition hover:text-white"
                        style={{ color: S.zinc }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {!permanentQuickLinks.length && (
                    <p className="mono rounded border px-2 py-2" style={{ ...S.deeper, fontSize: '10px', color: S.dim }}>
                      Add standards and technical document folders once. These links stay available across projects.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Quick Filing */}
            <section
              className="flex flex-col shrink-0 overflow-hidden"
              style={getPanelSectionStyle({ height: `${rightSectionHeights.filing}px`, order: (rightSectionOrderByKey.filing ?? 0) * 2, display: sidePanelHiddenSet.has('filing') ? 'none' : undefined }, draggingRightSectionKey === 'filing', rightDropTargetKey === 'filing' && draggingRightSectionKey !== 'filing', landedRightSectionKey === 'filing')}
              onDragOver={event => handleSectionDragOver(event, draggingRightSectionKey, 'filing', setRightSectionOrder, setDraggingRightSectionKey, setRightDropTargetKey)}
              onDrop={event => { event.preventDefault(); finishSectionDrag(draggingRightSectionKey, setDraggingRightSectionKey, setRightDropTargetKey, setLandedRightSectionKey) }}
              onDragLeave={() => { if (rightDropTargetKey === 'filing') setRightDropTargetKey(null) }}
            >
              <div style={getDropIndicatorStyle(rightDropTargetKey === 'filing' && draggingRightSectionKey !== 'filing')} />
              <div className="p-3 border-b overflow-y-auto" style={{ borderColor: S.border }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="mono text-xs uppercase tracking-widest" style={{ color: S.muted }}>📤 Quick Filing</h3>
                  <span
                    draggable
                    onDragStart={event => beginSectionDrag(event, 'filing', setDraggingRightSectionKey)}
                    onDragEnd={() => finishSectionDrag(draggingRightSectionKey, setDraggingRightSectionKey, setRightDropTargetKey, setLandedRightSectionKey)}
                    className="mono text-xs cursor-grab active:cursor-grabbing"
                    style={getSectionHandleStyle(draggingRightSectionKey === 'filing')}
                    title="Drag to reorder panel sections"
                  >
                    ⋮⋮
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
                  <select
                    value={quickFilingDestination}
                    onChange={event => setQuickFilingDestination(event.target.value)}
                    disabled={!activeProject || filingLoading}
                    className="rounded border text-xs outline-none disabled:opacity-40"
                    style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '6px 9px' }}
                  >
                    {QUICK_FILING_DESTINATIONS.map(destination => (
                      <option key={destination.key} value={destination.key}>{destination.label}</option>
                    ))}
                  </select>
                  <div className="flex rounded border overflow-hidden" style={{ borderColor: S.border }}>
                    {['copy', 'move'].map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setQuickFilingMode(mode)}
                        disabled={filingLoading}
                        className="mono px-3 text-[10px] uppercase transition disabled:opacity-40"
                        style={{
                          backgroundColor: quickFilingMode === mode ? S.accent : '#1A1A1E',
                          color: quickFilingMode === mode ? '#fff' : S.zinc,
                        }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                {quickFilingDestination === 'custom' && (
                  <div className="flex gap-2 mb-2">
                    <input
                      value={quickFilingCustomPath}
                      onChange={event => setQuickFilingCustomPath(event.target.value)}
                      disabled={!activeProject || filingLoading}
                      placeholder="Custom filing folder"
                      className="min-w-0 flex-1 rounded border text-xs outline-none disabled:opacity-40"
                      style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '7px 9px' }}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const picked = await window.api.folderBrowse()
                        if (picked) setQuickFilingCustomPath(picked)
                      }}
                      disabled={!activeProject || filingLoading}
                      className="mono text-[10px] px-3 rounded border transition disabled:opacity-40 hover:border-[#3A3A40]"
                      style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.zinc }}
                    >
                      Browse
                    </button>
                  </div>
                )}
                <div
                  onDragEnter={event => { event.preventDefault(); setQuickFilingDragging(true) }}
                  onDragOver={event => event.preventDefault()}
                  onDragLeave={event => { event.preventDefault(); setQuickFilingDragging(false) }}
                  onDrop={handleQuickFilingDrop}
                  className="mb-2 flex min-h-[52px] flex-col items-center justify-center rounded border border-dashed px-3 py-2 text-center transition"
                  style={{
                    backgroundColor: quickFilingDragging ? 'rgba(122, 92, 255, 0.16)' : '#0D0D0F',
                    borderColor: quickFilingDragging ? S.accent : S.border,
                    color: S.text,
                  }}
                >
                  <p className="text-xs font-medium" style={{ color: S.text }}>
                    {filingLoading ? 'Filing files...' : 'Drop files into Quick Filing'}
                  </p>
                  <p className="mono mt-0.5" style={{ fontSize: '10px', color: S.dim }}>
                    {quickFilingQueue.length} queued for {quickFilingMode} to {quickFilingDestination === 'custom' ? (getPathName(quickFilingCustomPath) || 'custom path') : quickFilingDestination}
                  </p>
                </div>

                <div className="mb-2 rounded border" style={S.panel}>
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5" style={{ borderColor: S.border }}>
                    <span className="mono text-[10px] uppercase tracking-widest" style={{ color: S.muted }}>
                      Filing List · {quickFilingQueue.length}
                    </span>
                    <button
                      type="button"
                      onClick={clearQuickFilingQueue}
                      disabled={!quickFilingQueue.length || filingLoading}
                      className="mono text-[10px] transition disabled:opacity-40"
                      style={{ color: S.zinc }}
                    >
                      Clear
                    </button>
                  </div>
                  <div className={`${quickFilingQueue.length ? 'max-h-24 p-1' : 'hidden'} overflow-y-auto space-y-1 border-t`} style={{ borderColor: S.border }}>
                    {quickFilingQueue.map(item => (
                      <div key={item.path} className="flex items-center gap-2 rounded px-2 py-1.5" style={{ backgroundColor: '#0D0D0F' }}>
                        <span style={{ fontSize: '12px' }}>{item.isDirectory ? '📁' : getFileIcon(item.name)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs truncate" style={{ color: S.text }}>{item.name}</p>
                          <p className="mono truncate" style={{ fontSize: '9px', color: S.dim }}>{item.path}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQuickFilingQueueItem(item.path)}
                          disabled={filingLoading}
                          className="mono text-[10px] transition disabled:opacity-40"
                          style={{ color: S.zinc }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    value={filingName}
                    onChange={e => setFilingName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleExecuteScript()}
                    placeholder="Outgoing folder label"
                    className="min-w-0 rounded border text-xs outline-none"
                    style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text, padding: '7px 9px' }}
                  />
                  <button
                    onClick={handleExecuteScript}
                    disabled={filingLoading || !filingName.trim()}
                    className="text-xs px-3 rounded border font-medium transition disabled:opacity-40 whitespace-nowrap"
                    style={{ backgroundColor: '#1A1A1E', borderColor: S.border, color: S.text }}
                  >
                    {filingLoading ? 'Creating...' : 'Create'}
                  </button>
                </div>
                {filingToast && (
                  <p className="mt-2 text-xs" style={{ color: filingToast.type === 'ok' ? '#30D158' : '#FF453A' }}>
                    {filingToast.message}
                  </p>
                )}
              </div>
            </section>

            {/* Gemini Audit */}
            <section
              className="flex flex-col shrink-0 overflow-hidden"
              style={getPanelSectionStyle({ height: `${rightSectionHeights.gemini}px`, order: (rightSectionOrderByKey.gemini ?? 0) * 2, display: sidePanelHiddenSet.has('gemini') ? 'none' : undefined }, draggingRightSectionKey === 'gemini', rightDropTargetKey === 'gemini' && draggingRightSectionKey !== 'gemini', landedRightSectionKey === 'gemini')}
              onDragOver={event => handleSectionDragOver(event, draggingRightSectionKey, 'gemini', setRightSectionOrder, setDraggingRightSectionKey, setRightDropTargetKey)}
              onDrop={event => { event.preventDefault(); finishSectionDrag(draggingRightSectionKey, setDraggingRightSectionKey, setRightDropTargetKey, setLandedRightSectionKey) }}
              onDragLeave={() => { if (rightDropTargetKey === 'gemini') setRightDropTargetKey(null) }}
            >
              <div style={getDropIndicatorStyle(rightDropTargetKey === 'gemini' && draggingRightSectionKey !== 'gemini')} />
              <div className="p-4 flex-1 min-h-0 overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="mono text-xs uppercase tracking-widest" style={{ color: S.muted }}>🔍 Document Summary AI</h3>
                  <div className="flex items-center gap-2">
                    {AUDIT_AI_ENABLED && activeProject && (
                      <button
                        onClick={handleRunAudit}
                        disabled={geminiAuditRunning || !geminiKeySet}
                        className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] transition disabled:opacity-40"
                        style={{ ...S.elevated, color: geminiAuditRunning ? S.accent : S.muted }}
                        title={geminiKeySet ? 'Run file audit' : 'Gemini API key not set'}
                      >
                        {geminiAuditRunning ? 'Running…' : 'Run Audit'}
                      </button>
                    )}
                    {docAnalysisHistory.length > 0 && (
                      <button
                        onClick={() => setDocAnalysisHistory([])}
                        className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] transition"
                        style={{ ...S.elevated, color: S.muted }}
                      >
                        Clear
                      </button>
                    )}
                    <span
                      draggable
                      onDragStart={event => beginSectionDrag(event, 'gemini', setDraggingRightSectionKey)}
                      onDragEnd={() => finishSectionDrag(draggingRightSectionKey, setDraggingRightSectionKey, setRightDropTargetKey, setLandedRightSectionKey)}
                      className="mono text-xs cursor-grab active:cursor-grabbing"
                      style={getSectionHandleStyle(draggingRightSectionKey === 'gemini')}
                      title="Drag to reorder panel sections"
                    >
                      ⋮⋮
                    </span>
                  </div>
                </div>

                {docAnalysisPending && (
                  <div className="flex items-center gap-2.5 p-2.5 rounded border mb-2" style={{ ...S.elevated, borderColor: S.accent + '55' }}>
                    <div className="shrink-0 w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: S.accent, borderTopColor: 'transparent' }} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: '#E4E4E7' }}>{docAnalysisPending.fileName}</p>
                      <p className="mono text-xs" style={{ color: S.dim }}>Analysing…</p>
                    </div>
                  </div>
                )}

                {AUDIT_AI_ENABLED && geminiResults.length > 0 && (
                  <div className="mb-3">
                    <p className="mono text-xs mb-2" style={{ color: S.muted }}>
                      File Audit {geminiLastTime && <span style={{ color: S.dim }}>· {geminiLastTime}</span>}
                    </p>
                    <div className="space-y-1.5">
                      {geminiResults.map((r, i) => {
                        const statusColor = r.status === 'error' ? '#FF453A' : r.status === 'warning' ? '#FFD60A' : '#30D158'
                        return (
                          <div key={i} className="p-2 rounded border text-xs" style={{ ...S.elevated, opacity: r._moved ? 0.4 : 1 }}>
                            <div className="flex items-start gap-2">
                              <span style={{ color: statusColor, flexShrink: 0 }}>
                                {r.status === 'error' ? '✕' : r.status === 'warning' ? '!' : '✓'}
                              </span>
                              <p className="flex-1" style={{ color: '#D4D4D8' }}>{r.message}</p>
                            </div>
                            {r.suggestedPath && !r._moved && (
                              <button
                                onClick={() => handleSmartMove(r.filePath)}
                                className="mt-1.5 w-full text-xs py-1 rounded border transition hover:border-[#7A5CFF]"
                                style={{ ...S.elevated, color: S.muted }}
                              >
                                Move to {r.suggestedPath.split(/[\\/]/).slice(-2).join('/')}
                              </button>
                            )}
                            {r._moveError && <p className="mt-1 mono text-xs" style={{ color: '#FF453A' }}>{r._moveError}</p>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {docAnalysisHistory.length === 0 && !docAnalysisPending && (!AUDIT_AI_ENABLED || geminiResults.length === 0) && (
                  <p className="mono text-xs" style={{ color: S.dim }}>
                    No summaries yet — right-click a PDF or Word document and choose <span style={{ color: S.muted }}>Analyse</span> to summarise it.
                  </p>
                )}

                <div className="space-y-2">
                  {docAnalysisHistory.map(entry => (
                    <div key={entry.id} className="p-2.5 rounded border text-xs" style={S.elevated}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate" style={{ color: '#E4E4E7' }}>{entry.fileName}</p>
                          <p className="mono mt-1 truncate" style={{ fontSize: '10px', color: S.zinc }}>{entry.question}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="mono" style={{ fontSize: '10px', color: S.dim }}>{entry.time}</span>
                          <button
                            onClick={() => handleClearDocAnalysisEntry(entry.id)}
                            className="mono text-[10px] px-1.5 py-0.5 rounded border hover:border-[#7A5CFF] transition"
                            style={{ ...S.elevated, color: S.muted }}
                            title="Clear this summary"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-1">
                        <button
                          onClick={() => setDocAnalysisResult({ id: entry.id, fileName: entry.fileName, filePath: entry.filePath, result: entry.result, question: entry.question, length: entry.length })}
                          className="flex-1 text-xs py-1 rounded border transition hover:border-[#7A5CFF]"
                          style={{ ...S.elevated, color: S.muted }}
                        >
                          View
                        </button>
                        <button
                          onClick={async () => {
                            const projectName = activeProjectInfo?.jobNumber || activeProject?.name || 'Unknown Project'
                            const result = await window.api.fsSaveSummaryDoc({ projectName, fileName: entry.fileName, summary: entry.result, question: entry.question })
                            if (result.success && result.outputPath) window.api.fsOpenInExplorer({ dirPath: result.outputPath.substring(0, result.outputPath.lastIndexOf('\\')) })
                            else alert(result.error)
                          }}
                          className="flex-1 text-xs py-1 rounded border transition hover:border-[#7A5CFF]"
                          style={{ ...S.elevated, color: S.muted }}
                          title="Save as .doc to Documents/DocketOS AI"
                        >
                          Save .doc
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Calendar */}
            <section
              className="flex flex-col shrink-0 overflow-hidden"
              style={getPanelSectionStyle({ height: `${Math.max(CALENDAR_PANEL_MIN_HEIGHT, rightSectionHeights.calendar ?? 0)}px`, order: (rightSectionOrderByKey.calendar ?? 0) * 2, display: sidePanelHiddenSet.has('calendar') ? 'none' : undefined }, draggingRightSectionKey === 'calendar', rightDropTargetKey === 'calendar' && draggingRightSectionKey !== 'calendar', landedRightSectionKey === 'calendar')}
              onDragOver={event => handleSectionDragOver(event, draggingRightSectionKey, 'calendar', setRightSectionOrder, setDraggingRightSectionKey, setRightDropTargetKey)}
              onDrop={event => { event.preventDefault(); finishSectionDrag(draggingRightSectionKey, setDraggingRightSectionKey, setRightDropTargetKey, setLandedRightSectionKey) }}
              onDragLeave={() => { if (rightDropTargetKey === 'calendar') setRightDropTargetKey(null) }}
            >
              <div style={getDropIndicatorStyle(rightDropTargetKey === 'calendar' && draggingRightSectionKey !== 'calendar')} />
              <div className="px-4 py-3 flex-1 min-h-0 overflow-y-auto border-t" style={{ borderColor: S.border }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="mono text-xs uppercase tracking-widest" style={{ color: S.muted }}>📅 Calendar</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setVisibleCalendarMonth(month => addMonths(month, -1))}
                      className="mono h-6 w-6 rounded border text-xs transition hover:border-[#7A5CFF]"
                      style={{ ...S.elevated, color: S.muted }}
                      title="Previous month"
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => {
                        const today = new Date()
                        setVisibleCalendarMonth(startOfMonth(today))
                        setSelectedCalendarDate(today)
                      }}
                      className="mono h-6 px-2 rounded border text-[10px] transition hover:border-[#7A5CFF]"
                      style={{ ...S.elevated, color: S.muted }}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setVisibleCalendarMonth(month => addMonths(month, 1))}
                      className="mono h-6 w-6 rounded border text-xs transition hover:border-[#7A5CFF]"
                      style={{ ...S.elevated, color: S.muted }}
                      title="Next month"
                    >
                      ›
                    </button>
                    <span
                      draggable
                      onDragStart={event => beginSectionDrag(event, 'calendar', setDraggingRightSectionKey)}
                      onDragEnd={() => finishSectionDrag(draggingRightSectionKey, setDraggingRightSectionKey, setRightDropTargetKey, setLandedRightSectionKey)}
                      className="mono text-xs cursor-grab active:cursor-grabbing"
                      style={getSectionHandleStyle(draggingRightSectionKey === 'calendar')}
                      title="Drag to reorder panel sections"
                    >
                      ⋮⋮
                    </span>
                  </div>
                </div>

                <p className="mb-1 text-xs font-semibold" style={{ color: S.text }}>
                  {visibleCalendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </p>

                <div className="grid grid-cols-7 gap-1">
                  {CALENDAR_WEEKDAYS.map((day, index) => (
                    <div key={`${day}-${index}`} className="mono grid h-5 place-items-center text-[10px]" style={{ color: S.zinc }}>
                      {day}
                    </div>
                  ))}
                  {buildCalendarDays(visibleCalendarMonth).map(day => {
                    const isCurrentMonth = day.getMonth() === visibleCalendarMonth.getMonth()
                    const isToday = isSameCalendarDate(day, new Date())
                    const isSelected = isSameCalendarDate(day, selectedCalendarDate)
                    const dayKey = formatCalendarDateKey(day)
                    const dayNote = calendarNotes[dayKey]
                    const dayColor = dayNote?.color
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedCalendarDate(day)}
                        className="relative grid h-8 min-w-0 place-items-center rounded border text-xs font-semibold transition hover:border-[#7A5CFF]"
                        style={{
                          backgroundColor: isSelected ? '#1A1A1E' : dayColor ? `${dayColor}22` : '#101013',
                          borderColor: isSelected ? S.accent : dayColor ?? (isToday ? '#30D158' : S.border),
                          color: isCurrentMonth ? S.text : S.zinc,
                          opacity: isCurrentMonth ? 1 : 0.55,
                        }}
                        title={day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      >
                        {day.getDate()}
                        {dayNote?.note?.trim() && (
                          <span
                            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: dayColor ?? CALENDAR_NOTE_COLORS[0] }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-3 rounded border p-2" style={S.elevated}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium truncate" style={{ color: S.text }} title={selectedCalendarDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}>
                    {selectedCalendarDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <button
                      onClick={() => clearCalendarNote(selectedCalendarDate)}
                      disabled={!calendarNotes[selectedCalendarKey]}
                      className="mono text-[10px] transition hover:text-white disabled:opacity-40"
                      style={{ color: S.zinc }}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mb-2 flex items-center gap-1">
                    {CALENDAR_NOTE_COLORS.map(color => {
                      const selectedColor = selectedCalendarNote.color === color
                      return (
                        <button
                          key={color}
                          onClick={() => updateCalendarNote(selectedCalendarDate, { color })}
                          className="h-5 w-5 rounded border transition hover:scale-105"
                          style={{
                            backgroundColor: color,
                            borderColor: selectedColor ? '#FFFFFF' : S.border,
                            boxShadow: selectedColor ? `0 0 0 2px ${color}55` : 'none',
                          }}
                          title="Set day colour"
                        />
                      )
                    })}
                  </div>
                  <textarea
                    value={selectedCalendarNote.note ?? ''}
                    onChange={event => updateCalendarNote(selectedCalendarDate, { note: event.target.value })}
                    placeholder="Add note for this day"
                    className="h-16 w-full resize-none rounded border text-xs outline-none"
                    style={{ backgroundColor: '#101013', borderColor: selectedCalendarNote.color ?? S.border, color: S.text, padding: '7px 8px' }}
                  />
                </div>

                <div className="mt-3 rounded border p-2" style={S.elevated}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="mono text-[10px] uppercase tracking-widest" style={{ color: S.muted }}>Upcoming Events</h4>
                    <span className="mono text-[10px]" style={{ color: S.zinc }}>{upcomingCalendarEvents.length}</span>
                  </div>
                  {upcomingCalendarEvents.length === 0 ? (
                    <p className="mono text-[10px]" style={{ color: S.dim }}>No upcoming calendar notes.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {upcomingCalendarEvents.map(event => (
                        <button
                          key={event.key}
                          onClick={() => {
                            setSelectedCalendarDate(event.date)
                            setVisibleCalendarMonth(startOfMonth(event.date))
                          }}
                          className="w-full rounded border px-2 py-1.5 text-left transition hover:border-[#7A5CFF]"
                          style={{ backgroundColor: '#101013', borderColor: S.border }}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: event.color ?? CALENDAR_NOTE_COLORS[0] }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold" style={{ color: S.text }}>
                                {event.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-[11px]" style={{ color: '#D4D4D8' }}>
                                {event.note}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {rightAdjacentPairs.map(([firstKey, secondKey], index) => (
              <div
                key={`right-section-separator-${firstKey}-${secondKey}`}
                role="separator"
                aria-orientation="horizontal"
                title="Drag to resize adjacent sections"
                onMouseDown={event => beginVerticalResize('right-panel-vertical', firstKey, secondKey, event, rightSectionHeights)}
                className="shrink-0 cursor-row-resize hover:bg-[#1F1F23] transition-colors rounded"
                style={{ height: '8px', backgroundColor: '#080809', order: index * 2 + 1 }}
              />
            ))}
          </div>
        </aside>
      </div>

      {/* MODALS */}
      {showCommandPalette && (
        <CommandPalette
          activeProject={activeProject}
          onClose={() => setShowCommandPalette(false)}
          onRunIndex={handleCommandIndex}
          onImport={handleCommandImport}
          onExport={handleCommandExport}
          onGenerateBrief={handleCommandBrief}
          onOpenSettings={onOpenSettings}
        />
      )}

      {showNewProject && (
        <CreateProjectModal
          onCreated={handleProjectCreated}
          onClose={() => setShowNewProject(false)}
        />
      )}

      {showEditProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={event => { if (event.target === event.currentTarget) setShowEditProject(false) }}
        >
          <div className="p-6 flex flex-col gap-4" style={{ backgroundColor: '#121214', border: '1px solid #1F1F23', borderRadius: '6px', width: '520px' }}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm" style={{ color: '#F5F5F7' }}>Edit Project</span>
              <button
                onClick={() => setShowEditProject(false)}
                className="text-xs hover:text-white transition"
                style={{ color: '#8E8E93' }}
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block mb-1 text-xs" style={{ color: '#8E8E93' }}>Project Name *</label>
              <input
                value={editProjectForm.name}
                onChange={event => setEditProjectForm(prev => ({ ...prev, name: event.target.value }))}
                className="w-full rounded border text-sm outline-none"
                style={{ backgroundColor: '#1A1A1E', borderColor: '#1F1F23', color: '#F5F5F7', padding: '8px 12px' }}
                autoFocus
              />
            </div>

            <div>
              <label className="block mb-1 text-xs" style={{ color: '#8E8E93' }}>Description</label>
              <input
                value={editProjectForm.description}
                onChange={event => setEditProjectForm(prev => ({ ...prev, description: event.target.value }))}
                className="w-full rounded border text-sm outline-none"
                style={{ backgroundColor: '#1A1A1E', borderColor: '#1F1F23', color: '#F5F5F7', padding: '8px 12px' }}
              />
            </div>

            <div>
              <label className="block mb-1 text-xs" style={{ color: '#8E8E93' }}>Starting Folder *</label>
              <div className="flex gap-2">
                <input
                  value={editProjectForm.root_path}
                  onChange={event => setEditProjectForm(prev => ({ ...prev, root_path: event.target.value }))}
                  className="min-w-0 flex-1 rounded border text-sm outline-none"
                  style={{ backgroundColor: '#1A1A1E', borderColor: '#1F1F23', color: '#F5F5F7', padding: '8px 12px' }}
                />
                <button
                  onClick={handleBrowseEditProjectRoot}
                  className="text-xs px-3 py-2 rounded border hover:border-[#3A3A40] transition shrink-0"
                  style={{ backgroundColor: '#1A1A1E', borderColor: '#1F1F23', color: '#8E8E93' }}
                >
                  Browse
                </button>
              </div>
            </div>

            {editProjectError && (
              <p className="text-xs" style={{ color: '#FF453A' }}>{editProjectError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowEditProject(false)}
                className="text-xs px-4 py-2 rounded border transition"
                style={{ backgroundColor: '#1A1A1E', borderColor: '#1F1F23', color: '#8E8E93' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditProject}
                disabled={editProjectLoading}
                className="text-xs px-4 py-2 rounded font-semibold transition disabled:opacity-50"
                style={{ backgroundColor: S.accent, color: '#fff' }}
              >
                {editProjectLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={event => {
            if (event.target === event.currentTarget) {
              setShowDeleteProject(false)
              setProjectToDeleteId(null)
              setDeleteProjectError(null)
            }
          }}
        >
          <div className="p-6 flex flex-col gap-4" style={{ backgroundColor: '#121214', border: '1px solid #1F1F23', borderRadius: '6px', width: '520px' }}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm" style={{ color: '#F5F5F7' }}>Delete Project</span>
              <button
                onClick={() => {
                  setShowDeleteProject(false)
                  setProjectToDeleteId(null)
                  setDeleteProjectError(null)
                }}
                className="text-xs hover:text-white transition"
                style={{ color: '#8E8E93' }}
              >
                ✕
              </button>
            </div>

            <p className="text-xs" style={{ color: '#8E8E93' }}>
              Select a DocketOS project to remove. This does not delete files/folders on disk.
            </p>

            <div className="max-h-56 overflow-y-auto rounded border" style={{ borderColor: '#1F1F23', backgroundColor: '#0D0D0F' }}>
              {projects.map(project => {
                const isSelected = projectToDeleteId === project.id
                return (
                  <button
                    key={project.id}
                    onClick={() => {
                      setProjectToDeleteId(project.id)
                      setDeleteProjectError(null)
                    }}
                    className="w-full text-left px-3 py-2 border-b last:border-b-0 transition"
                    style={isSelected
                      ? { backgroundColor: '#1A1A1E', color: '#F5F5F7', borderColor: '#1F1F23', boxShadow: 'inset 2px 0 0 #7A5CFF' }
                      : { backgroundColor: '#0D0D0F', color: '#D4D4D8', borderColor: '#1F1F23' }
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate">{project.name}</span>
                      {activeProject?.id === project.id && (
                        <span className="mono text-[10px]" style={{ color: '#7A5CFF' }}>Active</span>
                      )}
                    </div>
                    <p className="mono mt-0.5 truncate" style={{ fontSize: '10px', color: '#52525B' }}>{project.root_path}</p>
                  </button>
                )
              })}
              {projects.length === 0 && (
                <p className="mono text-xs p-3" style={{ color: '#3F3F46' }}>No projects available.</p>
              )}
            </div>

            {deleteProjectError && (
              <p className="text-xs" style={{ color: '#FF453A' }}>{deleteProjectError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDeleteProject(false)
                  setProjectToDeleteId(null)
                  setDeleteProjectError(null)
                }}
                className="text-xs px-4 py-2 rounded border transition"
                style={{ backgroundColor: '#1A1A1E', borderColor: '#1F1F23', color: '#8E8E93' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelectedProject}
                disabled={!projectToDeleteId}
                className="text-xs px-4 py-2 rounded font-semibold transition disabled:opacity-50"
                style={{ backgroundColor: '#FF453A', color: '#fff' }}
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}

      {folderEditDialog && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
        >
          <div
            className="p-5 flex flex-col gap-3"
            style={{ backgroundColor: '#121214', border: '1px solid #1F1F23', borderRadius: '6px', width: '380px' }}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm" style={{ color: '#F5F5F7' }}>
                {folderEditDialog.mode === 'create' ? 'New Subfolder' : 'Rename Folder'}
              </span>
              <button
                type="button"
                onClick={() => setFolderEditDialog(null)}
                className="text-xs hover:text-white transition"
                style={{ color: '#8E8E93' }}
              >
                ✕
              </button>
            </div>

            <input
              autoFocus
              value={folderEditDialog.value}
              onChange={event => setFolderEditDialog(prev => prev ? { ...prev, value: event.target.value, error: null } : prev)}
              onKeyDown={event => {
                if (event.key === 'Enter') commitFolderEditDialog()
                if (event.key === 'Escape') setFolderEditDialog(null)
              }}
              placeholder="Folder name"
              className="w-full rounded border text-sm outline-none"
              style={{ backgroundColor: '#1A1A1E', borderColor: '#1F1F23', color: '#F5F5F7', padding: '8px 10px' }}
            />

            {folderEditDialog.error && (
              <p className="text-xs" style={{ color: '#FF453A' }}>{folderEditDialog.error}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFolderEditDialog(null)}
                className="text-xs px-4 py-2 rounded border transition"
                style={{ backgroundColor: '#1A1A1E', borderColor: '#1F1F23', color: '#8E8E93' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commitFolderEditDialog}
                className="text-xs px-4 py-2 rounded font-semibold transition"
                style={{ backgroundColor: '#7A5CFF', color: '#fff' }}
              >
                {folderEditDialog.mode === 'create' ? 'Create' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}

      {docAnalysisPending && (
        <div className="fixed bottom-5 right-5 z-[150] flex items-center gap-3 rounded-lg border px-4 py-3 shadow-2xl" style={{ backgroundColor: '#121214', borderColor: '#2A2A2E' }}>
          <div className="shrink-0 w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: S.accent, borderTopColor: 'transparent' }} />
          <div className="min-w-0">
            <p className="text-xs font-medium" style={{ color: '#E4E4E7' }}>Analysing with Gemini…</p>
            <p className="text-xs truncate max-w-[220px]" style={{ color: '#71717A' }}>{docAnalysisPending.fileName}</p>
          </div>
        </div>
      )}

      {docAnalysisDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onKeyDown={e => { if (e.key === 'Escape' && !docAnalysisDialog.loading) setDocAnalysisDialog(null) }}>
          <div
            className="rounded-lg border shadow-2xl w-[480px] max-w-[90vw] flex flex-col"
            style={{ backgroundColor: '#121214', borderColor: '#1F1F23' }}
          >
            <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: '#1F1F23' }}>
              <p className="text-sm font-semibold" style={{ color: '#E4E4E7' }}>🔍 Analyse with AI</p>
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
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    'Summarise this document',
                    'List key action items',
                    'What are the main risks?',
                    'Extract key dates and deadlines',
                    'What decisions are required?',
                    'List any outstanding items',
                  ].map(prompt => (
                    <button
                      key={prompt}
                      onClick={() => setDocAnalysisDialog(prev => ({ ...prev, question: prompt }))}
                      disabled={docAnalysisDialog.loading}
                      className="rounded border px-2 py-1 text-xs transition hover:border-[#7A5CFF] hover:text-white disabled:opacity-40"
                      style={{ backgroundColor: '#1A1A1E', borderColor: docAnalysisDialog.question === prompt ? '#7A5CFF' : '#2A2A2E', color: docAnalysisDialog.question === prompt ? '#C4B5FD' : '#71717A' }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <textarea
                  autoFocus
                  rows={3}
                  value={docAnalysisDialog.question}
                  onChange={e => setDocAnalysisDialog(prev => ({ ...prev, question: e.target.value }))}
                  disabled={docAnalysisDialog.loading}
                  placeholder="Or type your own question…"
                  className="w-full rounded border px-3 py-2 text-sm outline-none resize-none"
                  style={{ backgroundColor: '#1A1A1E', borderColor: '#2A2A2E', color: '#E4E4E7' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && docAnalysisDialog.question.trim() && !docAnalysisDialog.loading) {
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
              <div>
                <p className="text-xs font-medium mb-1.5" style={{ color: '#A1A1AA' }}>Model</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
                    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
                    {
                      id: 'gemini-3.5-flash',
                      label: 'Gemini 3.5 Flash',
                      paid: true,
                      hint: '1M-token context, multimodal vision, context caching — best for long engineering PDFs.',
                    },
                  ].map(m => {
                    const selected = (docAnalysisDialog.model ?? 'gemini-2.5-flash') === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setDocAnalysisDialog(prev => ({ ...prev, model: m.id }))}
                        disabled={docAnalysisDialog.loading}
                        title={m.hint ?? ''}
                        className="px-3 py-1.5 rounded text-xs font-medium transition border inline-flex items-center gap-1.5"
                        style={{
                          backgroundColor: selected ? S.accent : '#1A1A1E',
                          borderColor: selected ? S.accent : '#2A2A2E',
                          color: selected ? '#fff' : '#A1A1AA',
                        }}
                      >
                        {m.label}
                        {m.paid && (
                          <span
                            className="mono uppercase tracking-wider rounded px-1.5 py-0.5"
                            style={{
                              fontSize: '9px',
                              backgroundColor: selected ? 'rgba(255,255,255,0.18)' : '#3A2A0A',
                              color: selected ? '#fff' : '#FFD60A',
                              border: `1px solid ${selected ? 'rgba(255,255,255,0.25)' : '#5A4410'}`,
                            }}
                          >
                            Paid
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
              {docAnalysisDialog.error && (
                <p className="text-xs" style={{ color: '#FF453A' }}>{docAnalysisDialog.error}</p>
              )}
            </div>
            <div className="px-5 pb-5 flex justify-between items-center gap-2">
              <button
                onClick={() => {
                  if (docAnalysisDialog.question.trim()) {
                    navigator.clipboard.writeText(docAnalysisDialog.question)
                  }
                  const folderPath = docAnalysisDialog.filePath.replace(/[^\\/]+$/, '').replace(/[\\/]$/, '')
                  if (folderPath) window.api.fsOpenInExplorer({ dirPath: folderPath })
                  window.api.shellOpenExternal({ url: 'https://copilot.microsoft.com' })
                }}
                className="px-3 py-1.5 rounded text-xs border transition flex items-center gap-1.5"
                style={{ backgroundColor: '#1A1A1E', borderColor: '#2A2A2E', color: '#A1A1AA' }}
                title="Opens the file's folder in Explorer and Copilot in your browser — drag the file in and paste your question"
              >
                🪟 Open in Copilot
              </button>
              <div className="flex gap-2">
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
        </div>
      )}

      {docAnalysisResult && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onKeyDown={e => { if (e.key === 'Escape') { setDocAnalysisResult(null); setDocResultCopied(false) } }}>
          <div
            className="rounded-lg border shadow-2xl w-[880px] max-w-[92vw] flex flex-col max-h-[85vh]"
            style={{ backgroundColor: '#121214', borderColor: '#1F1F23' }}
          >
            <div className="px-5 pt-5 pb-3 border-b shrink-0" style={{ borderColor: '#1F1F23' }}>
              <p className="text-sm font-semibold" style={{ color: '#E4E4E7' }}>🔍 AI Analysis</p>
              <p className="text-xs mt-0.5 truncate" style={{ color: '#71717A' }}>
                {docAnalysisResult.fileName.length > 55
                  ? `${docAnalysisResult.fileName.slice(0, 52)}…`
                  : docAnalysisResult.fileName}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#D4D4D8' }}>
                {docAnalysisResult.result}
              </p>
            </div>
            <div className="px-5 pb-5 pt-3 border-t flex justify-between items-center shrink-0" style={{ borderColor: '#1F1F23' }}>
              <div className="flex gap-2">
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

      {folderContextMenu && (
        <div
          className="fixed rounded border shadow-2xl z-[110] overflow-hidden"
          style={{
            top: folderContextMenu.y,
            left: folderContextMenu.x,
            width: 'max-content',
            minWidth: 170,
            maxWidth: 'min(280px, calc(100vw - 24px))',
            backgroundColor: '#121214',
            borderColor: '#1F1F23',
          }}
          onMouseDown={event => event.stopPropagation()}
        >
          <button
            onMouseDown={event => {
              event.preventDefault()
              event.stopPropagation()
              handleSendEntryToQuickFiling(folderContextMenu.entry)
            }}
            className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm hover:bg-[#1A1A1E] transition"
            style={{ color: '#D4D4D8' }}
          >
            📤 Send to Quick Filing
          </button>
          <button
            onMouseDown={event => {
              event.preventDefault()
              event.stopPropagation()
              handleFolderMenuAddQuickLink()
            }}
            className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm hover:bg-[#1A1A1E] transition"
            style={{ color: '#D4D4D8' }}
          >
            🔗 Add to Quick Links
          </button>
          <div className="border-t border-b px-3 py-2" style={{ borderColor: '#1F1F23' }}>
            <div className="mono mb-1 text-[10px] uppercase tracking-widest" style={{ color: S.muted }}>Flag</div>
            <div className="grid grid-cols-6 gap-1.5">
              {FILE_FLAG_OPTIONS.map(option => {
                const active = getFileFlag(folderContextMenu.entry?.fullPath ?? folderContextMenu.entry?.path)?.color === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    title={option.label}
                    onMouseDown={event => {
                      event.preventDefault()
                      event.stopPropagation()
                      setFileFlag(folderContextMenu.entry, option.key)
                    }}
                    className="h-5 rounded border transition hover:scale-105"
                    style={{ backgroundColor: option.color, borderColor: active ? S.text : '#2A2A2E' }}
                  />
                )
              })}
            </div>
            {getFileFlag(folderContextMenu.entry?.fullPath ?? folderContextMenu.entry?.path) && (
              <button
                type="button"
                onMouseDown={event => {
                  event.preventDefault()
                  event.stopPropagation()
                  clearFileFlag(folderContextMenu.entry)
                }}
                className="mt-1.5 block w-full whitespace-nowrap text-left text-xs hover:text-white transition"
                style={{ color: S.zinc }}
              >
                Clear flag
              </button>
            )}
          </div>
          <button
            onMouseDown={event => {
              event.preventDefault()
              event.stopPropagation()
              handleFolderMenuOpenInExplorer()
            }}
            className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm hover:bg-[#1A1A1E] transition"
            style={{ color: '#D4D4D8' }}
          >
            {folderContextMenu.entry?.isDirectory ? '📂 Open in Explorer' : '📄 Open'}
          </button>
          {!folderContextMenu.entry?.isDirectory && (
            <button
              onMouseDown={event => {
                event.preventDefault()
                event.stopPropagation()
                handleFolderMenuShowInExplorer()
              }}
              className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm hover:bg-[#1A1A1E] transition"
              style={{ color: '#D4D4D8' }}
            >
              📂 Show in Explorer
            </button>
          )}
          {folderContextMenu.entry?.isDirectory && (
            <button
              onMouseDown={event => {
                event.preventDefault()
                event.stopPropagation()
                handleFolderMenuNewSubfolder()
              }}
              className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm hover:bg-[#1A1A1E] transition"
              style={{ color: '#D4D4D8' }}
            >
              ➕ New Subfolder
            </button>
          )}
          {folderContextMenu.entry?.isDirectory && (
            <button
              onMouseDown={event => {
                event.preventDefault()
                event.stopPropagation()
                handleFolderMenuRename()
              }}
              className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm hover:bg-[#1A1A1E] transition"
              style={{ color: '#D4D4D8' }}
            >
              ✏️ Rename
            </button>
          )}
          {isAnalysableEntry(folderContextMenu.entry) && (
            <button
              onMouseDown={event => {
                event.preventDefault()
                event.stopPropagation()
                setDocAnalysisDialog({
                  filePath: folderContextMenu.entry.fullPath,
                  fileName: folderContextMenu.entry.name,
                  question: '',
                  length: 'short',
                  model: 'gemini-2.5-flash',
                  loading: false,
                  error: null,
                })
                setFolderContextMenu(null)
              }}
              className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm hover:bg-[#1A1A1E] transition"
              style={{ color: '#D4D4D8' }}
            >
              🔍 Analyse with AI
            </button>
          )}
        </div>
      )}

      {todoContextMenu && (
        <div
          className="fixed rounded border shadow-2xl z-[110] overflow-hidden"
          style={{
            top: todoContextMenu.y,
            left: todoContextMenu.x,
            width: 'max-content',
            minWidth: 140,
            maxWidth: 'min(240px, calc(100vw - 24px))',
            backgroundColor: '#121214',
            borderColor: '#1F1F23',
          }}
          onMouseDown={event => event.stopPropagation()}
        >
          {todoContextMenu.type === 'list' && (
            <button
              onMouseDown={event => {
                event.preventDefault()
                event.stopPropagation()
                handleTodoContextExport()
              }}
              className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm transition hover:bg-[#1A1A1E]"
              style={{ color: S.text }}
              title={todoContextMenu.label}
            >
              Export .txt
            </button>
          )}
          <button
            disabled={todoContextMenu.type === 'list' && !todoContextMenu.canDelete}
            onMouseDown={event => {
              event.preventDefault()
              event.stopPropagation()
              handleTodoContextDelete()
            }}
            className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1A1A1E]"
            style={{ color: '#FF453A' }}
            title={todoContextMenu.type === 'list' && !todoContextMenu.canDelete ? 'The default or only task list cannot be deleted' : todoContextMenu.label}
          >
            {todoContextMenu.type === 'task' ? 'Delete task' : 'Delete title'}
          </button>
        </div>
      )}

      {noteContextMenu && (
        <div
          className="fixed rounded border shadow-2xl z-[110] overflow-hidden"
          style={{
            top: noteContextMenu.y,
            left: noteContextMenu.x,
            width: 'max-content',
            minWidth: 150,
            maxWidth: 'min(260px, calc(100vw - 24px))',
            backgroundColor: '#121214',
            borderColor: '#1F1F23',
          }}
          onMouseDown={event => event.stopPropagation()}
        >
          <button
            onMouseDown={event => {
              event.preventDefault()
              event.stopPropagation()
              handleNoteContextExport()
            }}
            className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm transition hover:bg-[#1A1A1E]"
            style={{ color: S.text }}
            title={noteContextMenu.label}
          >
            Export .txt
          </button>
          <button
            disabled={!noteContextMenu.canDelete}
            onMouseDown={event => {
              event.preventDefault()
              event.stopPropagation()
              handleNoteContextDelete()
            }}
            className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1A1A1E]"
            style={{ color: '#FF453A' }}
            title={noteContextMenu.canDelete ? noteContextMenu.label : 'The only note section cannot be deleted'}
          >
            Delete note section
          </button>
        </div>
      )}

    </div>
  )
}
