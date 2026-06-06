import { useState, useEffect, useRef } from 'react'

const DEFAULT_LAUNCHER_APPS = [
  { id: 'autocad', label: 'AutoCAD', pathKey: 'launcher_autocad' },
  { id: '12d', label: '12D Model', pathKey: 'launcher_12d' },
  { id: 'excel', label: 'Excel', pathKey: 'launcher_excel' },
  { id: 'word', label: 'Word', pathKey: 'launcher_word' },
]

const DEFAULT_PROJECT_INFO_LISTS = {
  councils: [],
  projectManagers: [],
  waterAuthorities: [],
}

const SIDE_PANEL_SECTIONS = [
  { key: 'launchers', label: 'System Launchers', side: 'Left panel' },
  { key: 'folders', label: 'Project Folders', side: 'Left panel' },
  { key: 'template', label: 'Open Template', side: 'Right panel' },
  { key: 'permanentLinks', label: 'Permanent Links', side: 'Right panel' },
  { key: 'filing', label: 'Quick Filing', side: 'Right panel' },
  { key: 'gemini', label: 'Document Summary AI', side: 'Right panel' },
  { key: 'calendar', label: 'Calendar', side: 'Right panel' },
]

const SIDE_PANEL_SECTION_KEYS = new Set(SIDE_PANEL_SECTIONS.map(section => section.key))
const DEFAULT_RECOVERY_BACKUP_INTERVAL_MINUTES = 10
const MIN_RECOVERY_BACKUP_INTERVAL_MINUTES = 1
const MAX_RECOVERY_BACKUP_INTERVAL_MINUTES = 1440

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

function parseSidePanelHiddenSections(raw) {
  try {
    return normalizeSidePanelHiddenSections(JSON.parse(raw ?? '[]'))
  } catch {
    return []
  }
}

function normalizeRecoveryBackupIntervalMinutes(value) {
  const minutes = Math.round(Number(value))
  if (!Number.isFinite(minutes)) return DEFAULT_RECOVERY_BACKUP_INTERVAL_MINUTES
  return Math.max(MIN_RECOVERY_BACKUP_INTERVAL_MINUTES, Math.min(MAX_RECOVERY_BACKUP_INTERVAL_MINUTES, minutes))
}

function collectDocketOsLocalStorageSnapshot() {
  const snapshot = {}
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith('docketos.')) continue
      snapshot[key] = window.localStorage.getItem(key) ?? ''
    }
  } catch (err) {
    console.error('[Settings] failed to collect recovery snapshot:', err)
  }
  return snapshot
}

function restoreDocketOsLocalStorageSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {}
  const keysToRemove = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith('docketos.')) keysToRemove.push(key)
  }
  keysToRemove.forEach(key => window.localStorage.removeItem(key))
  Object.entries(source).forEach(([key, value]) => {
    if (!String(key).startsWith('docketos.')) return
    window.localStorage.setItem(key, String(value ?? ''))
  })
}

function formatRecoveryDate(value) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

function getRecoveryProjectLabel(snapshot) {
  return snapshot?.project?.name || snapshot?.project?.rootPath || 'All Dashboard data'
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

function makeLauncherId(label, existingApps = []) {
  const base = String(label || 'app').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'app'
  const existing = new Set(existingApps.map(app => app.id))
  let id = base
  let index = 2
  while (existing.has(id)) {
    id = `${base}_${index}`
    index += 1
  }
  return id
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

function TemplateRow({ tpl, onDelete }) {
  return (
    <div className="grid grid-cols-[1fr_2fr_auto] gap-2 mb-1.5 items-center">
      <span className="text-sm text-text-primary truncate">{tpl.name}</span>
      <span className="mono text-xs text-text-muted truncate">{tpl.file_path}</span>
      <button
        onClick={() => onDelete(tpl.id)}
        className="bg-status-error/10 border border-status-error/40 text-status-error text-xs rounded-app px-3 py-1.5"
      >
        Delete
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RuleRow({ rule, onUpdate, onDelete }) {
  const [ext, setExt] = useState(rule.extension)
  const [regex, setRegex] = useState(rule.regex_pattern)
  const [target, setTarget] = useState(rule.target_subfolder)

  useEffect(() => {
    setExt(rule.extension)
    setRegex(rule.regex_pattern)
    setTarget(rule.target_subfolder)
  }, [rule.extension, rule.regex_pattern, rule.target_subfolder])

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-1.5">
      <input
        value={ext}
        onChange={e => setExt(e.target.value)}
        className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
      />
      <input
        value={regex}
        onChange={e => setRegex(e.target.value)}
        className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
      />
      <input
        value={target}
        onChange={e => setTarget(e.target.value)}
        className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
      />
      <div className="flex gap-1">
        <button
          onClick={() => onUpdate({ id: rule.id, extension: ext, regex_pattern: regex, target_subfolder: target })}
          className="bg-bg-elevated border border-border-subtle text-text-muted text-xs rounded-app px-2 py-1 hover:text-text-primary"
        >
          Update
        </button>
        <button
          onClick={onDelete}
          className="bg-status-error/10 border border-status-error/40 text-status-error text-xs rounded-app px-3 py-1.5"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function PathRow({ label, value, onChange, verified, onVerify }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-sm text-text-muted w-52 shrink-0">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
      />
      <button
        onClick={onVerify}
        className="bg-bg-elevated border border-border-subtle text-text-muted text-xs rounded-app px-3 py-1.5 hover:text-text-primary shrink-0"
      >
        Verify
      </button>
      {verified === true && <span className="text-status-ok text-sm shrink-0">✓</span>}
      {verified === false && <span className="text-status-error text-sm shrink-0">✗</span>}
    </div>
  )
}

function getReorderItemStyle(baseStyle, isDragging, isDropTarget, isLanded = false) {
  return {
    ...baseStyle,
    position: 'relative',
    marginTop: isDropTarget ? 10 : 0,
    marginBottom: isDropTarget ? 10 : 0,
    transition: 'margin 150ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, box-shadow 180ms ease, filter 180ms ease, border-color 180ms ease',
    transform: isLanded
      ? 'scale(1.018)'
      : isDragging
        ? 'translateY(-2px) scale(1.01)'
        : isDropTarget
          ? 'translateY(2px)'
          : 'scale(1)',
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

function LauncherRow({ app, pathValue, verified, isDragging, isDropTarget, isLanded, onLabelChange, onPathChange, onBlur, onVerify, onDelete, onDragStart, onDragOver, onDrop, onDragEnd }) {
  function handlePathDrop(event) {
    event.preventDefault()
    event.stopPropagation()
    const filePath = event.dataTransfer.files?.[0]?.path
    if (filePath) onPathChange(filePath)
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="grid grid-cols-[28px_1fr_2fr_auto_auto] gap-2 mb-2 items-center"
      style={getReorderItemStyle({}, isDragging, isDropTarget, isLanded)}
    >
      <span className="mono text-text-muted text-xs cursor-grab select-none" title="Drag to reorder">⋮⋮</span>
      <input
        value={app.label}
        onChange={event => onLabelChange(event.target.value)}
        className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
      />
      <input
        value={pathValue ?? ''}
        onChange={event => onPathChange(event.target.value)}
        onBlur={onBlur}
        onDragOver={event => event.preventDefault()}
        onDrop={handlePathDrop}
        placeholder="C:\\Program Files\\App\\app.exe"
        className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
      />
      <button
        onClick={onVerify}
        className="bg-bg-elevated border border-border-subtle text-text-muted text-xs rounded-app px-3 py-1.5 hover:text-text-primary shrink-0"
      >
        Verify
      </button>
      <div className="flex items-center gap-2">
        {verified === true && <span className="text-status-ok text-sm shrink-0">✓</span>}
        {verified === false && <span className="text-status-error text-sm shrink-0">✗</span>}
        <button
          onClick={onDelete}
          className="bg-status-error/10 border border-status-error/40 text-status-error text-xs rounded-app px-3 py-1.5"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Settings({ onBack }) {
  // Section 1: Gemini prompt
  const [prompt, setPrompt] = useState('')
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptMsg, setPromptMsg] = useState(null)

  const [docPrompt, setDocPrompt] = useState('')
  const [docPromptSaving, setDocPromptSaving] = useState(false)
  const [docPromptMsg, setDocPromptMsg] = useState(null)
  const [templateFiles, setTemplateFiles] = useState([])
  const [apiKey, setApiKey] = useState('')
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [apiKeySaving, setApiKeySaving] = useState(false)
  const [apiKeyMsg, setApiKeyMsg] = useState(null)

  // Section 2: Rules table
  const [rules, setRules] = useState([])
  const [newRule, setNewRule] = useState({ extension: '', regex_pattern: '', target_subfolder: '' })
  const [ruleAdding, setRuleAdding] = useState(false)
  const [testFilename, setTestFilename] = useState('')

  // Section 5: Templates
  const [templates, setTemplates]       = useState([])
  const [newTplName, setNewTplName]     = useState('')
  const [newTplPath, setNewTplPath]     = useState('')
  const [tplAdding, setTplAdding]       = useState(false)

  // Section 3 & 4: Paths
  const [launcherApps, setLauncherApps] = useState(DEFAULT_LAUNCHER_APPS)
  const [newLauncher, setNewLauncher] = useState({ label: '', path: '' })
  const [draggingLauncherId, setDraggingLauncherId] = useState(null)
  const [launcherDropTargetId, setLauncherDropTargetId] = useState(null)
  const [landedLauncherId, setLandedLauncherId] = useState(null)
  const launcherMovedRef = useRef(false)
  const launcherAppsRef = useRef(DEFAULT_LAUNCHER_APPS)
  const pathsRef = useRef({})
  const landedLauncherTimeoutRef = useRef(null)
  const [paths, setPaths] = useState({
    launcher_autocad: '',
    launcher_12d: '',
    launcher_excel: '',
    launcher_word: '',
  })
  const [pathVerify, setPathVerify] = useState({})
  const [pathsSaving, setPathsSaving] = useState(false)
  const [pathsMsg, setPathsMsg] = useState(null)
  const [projectInfoLists, setProjectInfoLists] = useState(DEFAULT_PROJECT_INFO_LISTS)
  const [newProjectInfoListItems, setNewProjectInfoListItems] = useState({ councils: '', projectManagers: '', waterAuthorities: '' })
  const [projectInfoListsSaving, setProjectInfoListsSaving] = useState(false)
  const [projectInfoListsMsg, setProjectInfoListsMsg] = useState(null)
  const [sidePanelHiddenSections, setSidePanelHiddenSections] = useState([])
  const [sidePanelVisibilitySaving, setSidePanelVisibilitySaving] = useState(false)
  const [sidePanelVisibilityMsg, setSidePanelVisibilityMsg] = useState(null)
  const [recoveryRoot, setRecoveryRoot] = useState('')
  const [latestRecoverySnapshot, setLatestRecoverySnapshot] = useState(null)
  const [recoverySnapshots, setRecoverySnapshots] = useState([])
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryAction, setRecoveryAction] = useState(null)
  const [recoveryMsg, setRecoveryMsg] = useState(null)
  const [recoveryBackupIntervalMinutes, setRecoveryBackupIntervalMinutes] = useState(DEFAULT_RECOVERY_BACKUP_INTERVAL_MINUTES)
  const [recoveryBackupIntervalDraft, setRecoveryBackupIntervalDraft] = useState(String(DEFAULT_RECOVERY_BACKUP_INTERVAL_MINUTES))
  const [recoveryIntervalSaving, setRecoveryIntervalSaving] = useState(false)

  // Load all data on mount
  useEffect(() => {
    window.api.settingsGetAll()
      .then(data => {
        const map = Object.fromEntries(data.settings.map(r => [r.key, r.value]))
        const registry = parseLauncherRegistry(map.launcher_registry)
        setPrompt(map.gemini_system_prompt ?? '')
        setDocPrompt(map.gemini_doc_analysis_prompt ?? '')
        try { setTemplateFiles(map.template_files ? JSON.parse(map.template_files) : []) } catch { setTemplateFiles([]) }
        setApiKey(map.gemini_api_key ?? '')
        setSidePanelHiddenSections(parseSidePanelHiddenSections(map.dashboard_side_panel_hidden_sections))
        const recoveryInterval = normalizeRecoveryBackupIntervalMinutes(map.recovery_backup_interval_minutes)
        setRecoveryBackupIntervalMinutes(recoveryInterval)
        setRecoveryBackupIntervalDraft(String(recoveryInterval))
        setLauncherApps(registry)
        setPaths({
          ...Object.fromEntries(registry.map(app => [app.pathKey, map[app.pathKey] ?? ''])),
          launcher_autocad: map.launcher_autocad ?? '',
          launcher_12d: map.launcher_12d ?? '',
          launcher_excel: map.launcher_excel ?? '',
          launcher_word: map.launcher_word ?? '',
        })
        setRules(data.rules ?? [])
      })
      .catch(err => console.error('[Settings] failed to load settings:', err))

    window.api.templatesList().then(setTemplates)
    window.api.settingsGetProjectInfoLists().then(result => {
      if (result?.success) {
        setProjectInfoLists(normalizeProjectInfoLists(result.lists))
      }
    })
    loadRecoverySnapshots()
  }, [])

  useEffect(() => {
    launcherAppsRef.current = launcherApps
  }, [launcherApps])

  useEffect(() => {
    pathsRef.current = paths
  }, [paths])

  useEffect(() => () => {
    if (landedLauncherTimeoutRef.current) window.clearTimeout(landedLauncherTimeoutRef.current)
  }, [])

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function showMsg(setMsg, type, text) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3000)
  }

  async function loadRecoverySnapshots() {
    setRecoveryLoading(true)
    try {
      const result = await window.api.backupListRecoverySnapshots()
      if (result?.success) {
        setRecoveryRoot(result.data?.recoveryRoot ?? '')
        setLatestRecoverySnapshot(result.data?.latest ?? null)
        setRecoverySnapshots(Array.isArray(result.data?.snapshots) ? result.data.snapshots : [])
      } else {
        showMsg(setRecoveryMsg, 'error', result?.error ?? 'Failed to load recovery backups')
      }
    } catch (err) {
      console.error('[Settings] failed to load recovery backups:', err)
      showMsg(setRecoveryMsg, 'error', 'Failed to load recovery backups')
    } finally {
      setRecoveryLoading(false)
    }
  }

  function getMatchingRule(filename) {
    return rules.find(rule => {
      if (!filename.toLowerCase().endsWith(rule.extension.toLowerCase())) return false
      try {
        return new RegExp(rule.regex_pattern).test(filename)
      } catch {
        return false
      }
    }) ?? null
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

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

  async function handleSaveApiKey() {
    setApiKeySaving(true)
    try {
      await window.api.settingsUpdateApiKey({ apiKey })
      showMsg(setApiKeyMsg, 'ok', 'Saved ✓')
    } catch {
      showMsg(setApiKeyMsg, 'error', 'Save failed')
    } finally {
      setApiKeySaving(false)
    }
  }

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

  async function handleAddTemplateFile() {
    const picked = await window.api.systemBrowseFile()
    if (!picked) return
    const name = picked.split(/[\\/]/).pop()
    const next = [...templateFiles, { id: crypto.randomUUID(), name, path: picked }]
    setTemplateFiles(next)
    await window.api.settingsUpdateTemplateFiles({ files: next })
  }

  async function handleRemoveTemplateFile(id) {
    const next = templateFiles.filter(f => f.id !== id)
    setTemplateFiles(next)
    await window.api.settingsUpdateTemplateFiles({ files: next })
  }

  async function handleUpdateRule(rule) {
    const result = await window.api.settingsUpsertRule(rule)
    if (result.success) setRules(result.rules)
  }

  async function handleDeleteRule(id) {
    await window.api.settingsDeleteRule({ id })
    setRules(prev => prev.filter(r => r.id !== id))
  }

  async function handleAddRule() {
    if (!newRule.extension || !newRule.regex_pattern || !newRule.target_subfolder) return
    setRuleAdding(true)
    try {
      const result = await window.api.settingsUpsertRule({ id: null, ...newRule })
      if (result.success) {
        setRules(result.rules)
        setNewRule({ extension: '', regex_pattern: '', target_subfolder: '' })
      }
    } finally {
      setRuleAdding(false)
    }
  }

  async function handleVerifyPath(key) {
    const result = await window.api.settingsVerifyPath({ path: paths[key] })
    setPathVerify(prev => ({ ...prev, [key]: result.exists }))
  }

  function handleUpdateLauncherLabel(id, label) {
    setLauncherApps(prev => prev.map(app => app.id === id ? { ...app, label } : app))
  }

  function handleUpdateLauncherPath(pathKey, value) {
    setPaths(prev => ({ ...prev, [pathKey]: value }))
  }

  async function persistLauncherSettings(nextApps, nextPaths) {
    await Promise.all([
      ...Object.entries(nextPaths).map(([key, value]) => window.api.settingsUpsertPath({ key, path: value })),
      window.api.settingsUpsertPath({ key: 'launcher_registry', path: JSON.stringify(normalizeLauncherRegistry(nextApps)) }),
    ])
  }

  async function handleAddLauncher() {
    const label = newLauncher.label.trim()
    if (!label) return
    const pathValue = newLauncher.path.trim()
    const id = makeLauncherId(label, launcherApps)
    const pathKey = `launcher_${id}`
    const nextApps = [...launcherApps, { id, label, pathKey }]
    const nextPaths = { ...paths, [pathKey]: pathValue }

    setLauncherApps(nextApps)
    setPaths(nextPaths)
    setNewLauncher({ label: '', path: '' })

    setPathsSaving(true)
    try {
      await persistLauncherSettings(nextApps, nextPaths)
      showMsg(setPathsMsg, 'ok', 'Launcher saved ✓')
    } catch {
      showMsg(setPathsMsg, 'error', 'Failed to save launcher')
    } finally {
      setPathsSaving(false)
    }
  }

  function handleRemoveLauncher(id) {
    setLauncherApps(prev => prev.filter(app => app.id !== id))
  }

  function reorderLauncherBefore(targetId) {
    if (!draggingLauncherId || draggingLauncherId === targetId) return
    setLauncherDropTargetId(targetId)
    setLauncherApps(prev => {
      const fromIndex = prev.findIndex(app => app.id === draggingLauncherId)
      const toIndex = prev.findIndex(app => app.id === targetId)
      if (fromIndex < 0 || toIndex < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
      if (insertIndex === fromIndex) return prev
      next.splice(Math.max(0, insertIndex), 0, moved)
      launcherMovedRef.current = true
      launcherAppsRef.current = next
      return next
    })
  }

  async function finishLauncherDrag() {
    if (launcherMovedRef.current && draggingLauncherId) {
      const landedId = draggingLauncherId
      if (landedLauncherTimeoutRef.current) window.clearTimeout(landedLauncherTimeoutRef.current)
      setLandedLauncherId(landedId)
      landedLauncherTimeoutRef.current = window.setTimeout(() => {
        setLandedLauncherId(null)
        landedLauncherTimeoutRef.current = null
      }, 420)
      try {
        await persistLauncherSettings(launcherAppsRef.current, pathsRef.current)
        showMsg(setPathsMsg, 'ok', 'Launcher order saved ✓')
      } catch {
        showMsg(setPathsMsg, 'error', 'Failed to save launcher order')
      }
    }
    launcherMovedRef.current = false
    setDraggingLauncherId(null)
    setLauncherDropTargetId(null)
  }

  async function handleDeleteTemplate(id) {
    await window.api.templatesDelete({ id })
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  async function handleBrowseTemplate() {
    const picked = await window.api.templatesBrowse()
    if (picked) setNewTplPath(picked)
  }

  async function handleAddTemplate() {
    if (!newTplName.trim() || !newTplPath.trim()) return
    setTplAdding(true)
    try {
      const tpl = await window.api.templatesUpsert({ id: null, name: newTplName.trim(), filePath: newTplPath.trim() })
      setTemplates(prev => [...prev, tpl])
      setNewTplName('')
      setNewTplPath('')
    } finally {
      setTplAdding(false)
    }
  }

  async function handleSaveAllPaths() {
    setPathsSaving(true)
    try {
      await persistLauncherSettings(launcherApps, paths)
      showMsg(setPathsMsg, 'ok', 'All paths saved ✓')
      setPathVerify({})
    } catch {
      showMsg(setPathsMsg, 'error', 'Save failed')
    } finally {
      setPathsSaving(false)
    }
  }

  function handleAddProjectInfoListItem(listKey) {
    const value = (newProjectInfoListItems[listKey] ?? '').trim()
    if (!value) return
    setProjectInfoLists(prev => ({
      ...prev,
      [listKey]: normalizeStringList([...(prev[listKey] ?? []), value]),
    }))
    setNewProjectInfoListItems(prev => ({ ...prev, [listKey]: '' }))
  }

  function handleRemoveProjectInfoListItem(listKey, value) {
    setProjectInfoLists(prev => ({
      ...prev,
      [listKey]: (prev[listKey] ?? []).filter(item => item !== value),
    }))
  }

  async function handleSaveProjectInfoLists() {
    setProjectInfoListsSaving(true)
    try {
      const payload = normalizeProjectInfoLists(projectInfoLists)
      const result = await window.api.settingsUpdateProjectInfoLists(payload)
      if (result?.success) {
        setProjectInfoLists(normalizeProjectInfoLists(result.lists))
        showMsg(setProjectInfoListsMsg, 'ok', 'Project info lists saved ✓')
      } else {
        showMsg(setProjectInfoListsMsg, 'error', result?.error ?? 'Failed to save lists')
      }
    } catch {
      showMsg(setProjectInfoListsMsg, 'error', 'Failed to save lists')
    } finally {
      setProjectInfoListsSaving(false)
    }
  }

  async function handleToggleSidePanelSection(sectionKey) {
    const hiddenSet = new Set(sidePanelHiddenSections)
    if (hiddenSet.has(sectionKey)) hiddenSet.delete(sectionKey)
    else hiddenSet.add(sectionKey)
    const next = normalizeSidePanelHiddenSections([...hiddenSet])
    setSidePanelHiddenSections(next)
    setSidePanelVisibilitySaving(true)
    try {
      const result = await window.api.settingsUpdateSidePanelVisibility({ hiddenSections: next })
      if (result?.success) {
        setSidePanelHiddenSections(normalizeSidePanelHiddenSections(result.hiddenSections))
        showMsg(setSidePanelVisibilityMsg, 'ok', 'Side panels saved ✓')
      } else {
        showMsg(setSidePanelVisibilityMsg, 'error', result?.error ?? 'Failed to save side panels')
      }
    } catch {
      showMsg(setSidePanelVisibilityMsg, 'error', 'Failed to save side panels')
    } finally {
      setSidePanelVisibilitySaving(false)
    }
  }

  async function handleCreateRecoverySnapshot() {
    setRecoveryAction('create')
    try {
      const result = await window.api.backupCreateRecoverySnapshot({
        reason: 'engine-backend-manual',
        localStorage: collectDocketOsLocalStorageSnapshot(),
      })
      if (result?.success) {
        showMsg(setRecoveryMsg, 'ok', 'Recovery backup created ✓')
        await loadRecoverySnapshots()
      } else {
        showMsg(setRecoveryMsg, 'error', result?.error ?? 'Failed to create recovery backup')
      }
    } catch (err) {
      console.error('[Settings] failed to create recovery backup:', err)
      showMsg(setRecoveryMsg, 'error', 'Failed to create recovery backup')
    } finally {
      setRecoveryAction(null)
    }
  }

  async function handleSaveRecoveryBackupInterval() {
    const next = normalizeRecoveryBackupIntervalMinutes(recoveryBackupIntervalDraft)
    setRecoveryIntervalSaving(true)
    try {
      const result = await window.api.settingsUpdateRecoveryBackupInterval({ minutes: next })
      if (result?.success) {
        const saved = normalizeRecoveryBackupIntervalMinutes(result.minutes)
        setRecoveryBackupIntervalMinutes(saved)
        setRecoveryBackupIntervalDraft(String(saved))
        showMsg(setRecoveryMsg, 'ok', `Automatic backups set to every ${saved} minute${saved === 1 ? '' : 's'} ✓`)
      } else {
        showMsg(setRecoveryMsg, 'error', result?.error ?? 'Failed to save backup timing')
      }
    } catch (err) {
      console.error('[Settings] failed to save recovery backup interval:', err)
      showMsg(setRecoveryMsg, 'error', 'Failed to save backup timing')
    } finally {
      setRecoveryIntervalSaving(false)
    }
  }

  async function handleRestoreRecoverySnapshot(snapshotId) {
    setRecoveryAction(snapshotId)
    try {
      const before = await window.api.backupCreateRecoverySnapshot({
        reason: 'before-restore',
        localStorage: collectDocketOsLocalStorageSnapshot(),
      })
      if (!before?.success) {
        showMsg(setRecoveryMsg, 'error', before?.error ?? 'Failed to create before-restore backup')
        return
      }

      const result = await window.api.backupLoadRecoverySnapshot({ snapshotId })
      if (result?.canceled) return
      if (!result?.success) {
        showMsg(setRecoveryMsg, 'error', result?.error ?? 'Failed to restore recovery backup')
        return
      }

      const localStorageSnapshot = result.snapshot?.localStorage ?? {}
      restoreDocketOsLocalStorageSnapshot(localStorageSnapshot)
      await window.api.backupCreateRecoverySnapshot({
        reason: 'after-restore',
        localStorage: collectDocketOsLocalStorageSnapshot(),
      })
      showMsg(setRecoveryMsg, 'ok', `Restored ${Object.keys(localStorageSnapshot).length} Dashboard data keys. Reloading Dashboard ✓`)
      await loadRecoverySnapshots()
      window.setTimeout(() => window.location.reload(), 700)
    } catch (err) {
      console.error('[Settings] failed to restore recovery backup:', err)
      showMsg(setRecoveryMsg, 'error', 'Failed to restore recovery backup')
    } finally {
      setRecoveryAction(null)
    }
  }

  async function handleOpenRecoveryFolder() {
    if (!recoveryRoot) {
      showMsg(setRecoveryMsg, 'error', 'Recovery folder has not been created yet')
      return
    }
    const result = await window.api.systemOpenPath({ targetPath: recoveryRoot })
    if (!result?.success) showMsg(setRecoveryMsg, 'error', result?.error ?? 'Failed to open recovery folder')
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="h-screen flex flex-col bg-bg-base text-text-primary overflow-hidden">

      {/* Header */}
      <header className="h-12 flex items-center px-6 bg-bg-surface border-b border-border-subtle shrink-0">
        <button
          onClick={onBack}
          className="text-text-muted hover:text-text-primary text-sm transition-colors"
        >
          ← Back to Dashboard
        </button>
        <span className="ml-4 text-sm font-semibold text-text-primary">Backend Settings</span>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-4xl">

        {/* Gemini API Key */}
        <section>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
            Gemini API Key
          </p>
          <div className="flex gap-2">
            <input
              type={apiKeyVisible ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="flex-1 bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent font-mono"
            />
            <button
              onClick={() => setApiKeyVisible(v => !v)}
              className="border border-border-subtle rounded-app px-3 py-2 text-xs text-text-muted hover:text-text-primary transition"
            >
              {apiKeyVisible ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={handleSaveApiKey}
              disabled={apiKeySaving}
              className="bg-accent hover:bg-accent-hover text-white text-sm rounded-app px-4 py-2 disabled:opacity-50 transition-colors"
            >
              {apiKeySaving ? 'Saving...' : 'Save Key'}
            </button>
            {apiKeyMsg && (
              <span className={apiKeyMsg.type === 'ok' ? 'text-status-ok text-xs' : 'text-status-error text-xs'}>
                {apiKeyMsg.text}
              </span>
            )}
          </div>
        </section>

        {/* Section 1: Gemini System Prompt */}
        <section>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
            Gemini System Prompt
          </p>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={8}
            className="w-full bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent font-mono resize-none"
            placeholder="Enter system prompt for Gemini..."
          />
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-xs ${prompt.length > 3000 ? 'text-status-error' : 'text-text-muted'}`}>
              {prompt.length} characters
            </span>
            <button
              onClick={handleSavePrompt}
              disabled={promptSaving}
              className="bg-accent hover:bg-accent-hover text-white text-sm rounded-app px-4 py-2 disabled:opacity-50 transition-colors"
            >
              {promptSaving ? 'Saving...' : 'Save Prompt'}
            </button>
            {promptMsg && (
              <span className={promptMsg.type === 'ok' ? 'text-status-ok text-xs' : 'text-status-error text-xs'}>
                {promptMsg.text}
              </span>
            )}
          </div>
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
            <span className="text-xs text-text-muted">
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

        {/* Template Files */}
        <section>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
            Template Files
          </p>
          <p className="text-xs text-text-muted mb-3">
            Files linked here appear in the Open Template panel and can be staged and copied into any project folder.
          </p>
          <button
            onClick={handleAddTemplateFile}
            className="bg-accent hover:bg-accent-hover text-white text-sm rounded-app px-4 py-2 transition-colors mb-3"
          >
            + Add Template File
          </button>
          <div className="space-y-1">
            {templateFiles.map(f => (
              <div key={f.id} className="flex items-center gap-2 rounded border px-3 py-2 bg-bg-elevated border-border-subtle">
                <span className="text-sm shrink-0">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{f.name}</p>
                  <p className="text-xs text-text-muted font-mono truncate">{f.path}</p>
                </div>
                <button onClick={() => handleRemoveTemplateFile(f.id)} className="text-xs text-text-muted hover:text-text-primary transition shrink-0">Remove</button>
              </div>
            ))}
            {templateFiles.length === 0 && (
              <p className="text-xs text-text-muted">No template files added yet.</p>
            )}
          </div>
        </section>

        {/* Section 2: File Routing Rules */}
        <section>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
            File Routing Rules
          </p>

          {/* Rules table header */}
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-1 px-1">
            <span className="text-xs text-text-muted">Extension</span>
            <span className="text-xs text-text-muted">Regex Pattern</span>
            <span className="text-xs text-text-muted">Target Subfolder</span>
            <span />
          </div>

          {/* Existing rules */}
          {rules.map(rule => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onUpdate={handleUpdateRule}
              onDelete={() => handleDeleteRule(rule.id)}
            />
          ))}

          {/* Add new rule row */}
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mt-2">
            <input
              value={newRule.extension}
              onChange={e => setNewRule(p => ({ ...p, extension: e.target.value }))}
              placeholder=".dwg"
              className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            <input
              value={newRule.regex_pattern}
              onChange={e => setNewRule(p => ({ ...p, regex_pattern: e.target.value }))}
              placeholder=".*Design.*"
              className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            <input
              value={newRule.target_subfolder}
              onChange={e => setNewRule(p => ({ ...p, target_subfolder: e.target.value }))}
              placeholder="CAD\Design"
              className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            <button
              onClick={handleAddRule}
              disabled={ruleAdding}
              className="bg-accent hover:bg-accent-hover text-white text-sm rounded-app px-3 py-2 disabled:opacity-50 transition-colors text-xs"
            >
              {ruleAdding ? '...' : 'Add'}
            </button>
          </div>

          {/* Rule tester */}
          <div className="mt-4 p-3 bg-bg-surface border border-border-subtle rounded-app">
            <p className="text-xs text-text-muted mb-2">Test a filename</p>
            <input
              value={testFilename}
              onChange={e => setTestFilename(e.target.value)}
              placeholder="e.g. Design_v3.dwg"
              className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent w-full mb-2"
            />
            {testFilename && (() => {
              const match = getMatchingRule(testFilename)
              return match
                ? <p className="text-xs text-accent">Matches Rule #{rules.indexOf(match) + 1} → will route to {match.target_subfolder}</p>
                : <p className="text-xs text-text-muted">No rule matches — file will be Unclassified</p>
            })()}
          </div>
        </section>

        {/* Section 3: Application Path Registry */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Application Path Registry
            </p>
            <span className="mono text-[10px] text-text-muted">Drag rows to reorder dashboard launchers</span>
          </div>

          <div className="grid grid-cols-[28px_1fr_2fr_auto_auto] gap-2 mb-1 px-1">
            <span />
            <span className="text-xs text-text-muted">Name</span>
            <span className="text-xs text-text-muted">Executable Path</span>
            <span />
            <span />
          </div>

          {launcherApps.map(app => (
            <LauncherRow
              key={app.id}
              app={app}
              pathValue={paths[app.pathKey]}
              verified={pathVerify[app.pathKey]}
              onLabelChange={value => handleUpdateLauncherLabel(app.id, value)}
              onPathChange={value => handleUpdateLauncherPath(app.pathKey, value)}
              onBlur={() => window.api.settingsUpsertPath({ key: app.pathKey, path: paths[app.pathKey] })}
              onVerify={() => handleVerifyPath(app.pathKey)}
              onDelete={() => handleRemoveLauncher(app.id)}
              isDragging={draggingLauncherId === app.id}
              isDropTarget={launcherDropTargetId === app.id && draggingLauncherId !== app.id}
              isLanded={landedLauncherId === app.id}
              onDragStart={event => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', app.id)
                launcherMovedRef.current = false
                setDraggingLauncherId(app.id)
              }}
              onDragOver={event => {
                if (!draggingLauncherId || draggingLauncherId === app.id) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                reorderLauncherBefore(app.id)
              }}
              onDrop={event => {
                event.preventDefault()
                finishLauncherDrag()
              }}
              onDragEnd={finishLauncherDrag}
            />
          ))}

          <div className="grid grid-cols-[28px_1fr_2fr_auto_auto] gap-2 mt-3 items-center">
            <span />
            <input
              value={newLauncher.label}
              onChange={event => setNewLauncher(prev => ({ ...prev, label: event.target.value }))}
              placeholder="Application name"
              className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            <input
              value={newLauncher.path}
              onChange={event => setNewLauncher(prev => ({ ...prev, path: event.target.value }))}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault()
                const filePath = event.dataTransfer.files?.[0]?.path
                if (filePath) setNewLauncher(prev => ({ ...prev, path: filePath }))
              }}
              placeholder="C:\\Program Files\\App\\app.exe"
              className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            <button
              onClick={handleAddLauncher}
              disabled={!newLauncher.label.trim()}
              className="bg-accent hover:bg-accent-hover text-white text-xs rounded-app px-3 py-2 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
            <span />
          </div>
        </section>


        {/* Section 5: Project Info Dropdown Lists */}
        <section>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
            Project Info Dropdown Lists
          </p>
          <div className="space-y-4">
            {[
              { key: 'councils', label: 'Councils' },
              { key: 'projectManagers', label: 'Project Managers' },
              { key: 'waterAuthorities', label: 'Water Authorities' },
            ].map(({ key, label }) => (
              <div key={key} className="rounded-app border border-border-subtle bg-bg-surface p-3">
                <p className="text-xs text-text-muted mb-2">{label}</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(projectInfoLists[key] ?? []).map(value => (
                    <span key={value} className="inline-flex items-center gap-2 bg-bg-elevated border border-border-subtle rounded-app px-2 py-1 text-xs text-text-primary">
                      {value}
                      <button
                        onClick={() => handleRemoveProjectInfoListItem(key, value)}
                        className="text-text-muted hover:text-text-primary"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {(projectInfoLists[key] ?? []).length === 0 && (
                    <p className="mono text-[10px] text-text-muted">No values yet.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newProjectInfoListItems[key] ?? ''}
                    onChange={event => setNewProjectInfoListItems(prev => ({ ...prev, [key]: event.target.value }))}
                    onKeyDown={event => event.key === 'Enter' && handleAddProjectInfoListItem(key)}
                    placeholder={`Add ${label.slice(0, -1)}`}
                    className="flex-1 bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => handleAddProjectInfoListItem(key)}
                    className="bg-bg-elevated border border-border-subtle text-text-muted text-xs rounded-app px-3 py-2 hover:text-text-primary"
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveProjectInfoLists}
                disabled={projectInfoListsSaving}
                className="bg-accent hover:bg-accent-hover text-white text-sm rounded-app px-4 py-2 disabled:opacity-50 transition-colors"
              >
                {projectInfoListsSaving ? 'Saving...' : 'Save Project Info Lists'}
              </button>
              {projectInfoListsMsg && (
                <span className={projectInfoListsMsg.type === 'ok' ? 'text-status-ok text-xs' : 'text-status-error text-xs'}>
                  {projectInfoListsMsg.text}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Dashboard Side Panel Cards */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Dashboard Side Panel Cards
            </p>
            {sidePanelVisibilityMsg && (
              <span className={sidePanelVisibilityMsg.type === 'ok' ? 'text-status-ok text-xs' : 'text-status-error text-xs'}>
                {sidePanelVisibilityMsg.text}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mb-3">
            Choose which left and right dashboard cards are visible. Controls live here only; the dashboard will update immediately.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {SIDE_PANEL_SECTIONS.map(section => {
              const checked = !sidePanelHiddenSections.includes(section.key)
              return (
                <label
                  key={section.key}
                  className="flex items-center gap-3 rounded-app border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={sidePanelVisibilitySaving}
                    onChange={() => handleToggleSidePanelSection(section.key)}
                    className="h-4 w-4 accent-accent disabled:opacity-50"
                  />
                  <span className="min-w-0 flex-1 truncate">{section.label}</span>
                  <span className="mono text-[10px] text-text-muted shrink-0">{section.side}</span>
                </label>
              )
            })}
          </div>
        </section>

        {/* Recovery Backups */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Recovery Backups
            </p>
            {recoveryMsg && (
              <span className={recoveryMsg.type === 'ok' ? 'text-status-ok text-xs' : 'text-status-error text-xs'}>
                {recoveryMsg.text}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mb-3">
            Create and restore backups for Dashboard data such as task lists, notes, timesheets, calendar notes, quick links, project info, and timeline data.
          </p>
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-app border border-border-subtle bg-bg-elevated px-3 py-2">
            <label className="w-48 flex-1 text-xs text-text-muted">
              Automatic backup interval
              <input
                type="number"
                min={MIN_RECOVERY_BACKUP_INTERVAL_MINUTES}
                max={MAX_RECOVERY_BACKUP_INTERVAL_MINUTES}
                value={recoveryBackupIntervalDraft}
                onChange={event => setRecoveryBackupIntervalDraft(event.target.value)}
                className="mt-1 w-full bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <button
              onClick={handleSaveRecoveryBackupInterval}
              disabled={recoveryIntervalSaving || normalizeRecoveryBackupIntervalMinutes(recoveryBackupIntervalDraft) === recoveryBackupIntervalMinutes}
              className="bg-bg-elevated border border-border-subtle text-text-muted text-xs rounded-app px-3 py-1.5 hover:text-text-primary transition-colors disabled:opacity-50"
            >
              {recoveryIntervalSaving ? 'Saving...' : 'Save Timing'}
            </button>
            <span className="mono text-[10px] text-text-muted pb-1">
              Current: every {recoveryBackupIntervalMinutes} minute{recoveryBackupIntervalMinutes === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              onClick={handleCreateRecoverySnapshot}
              disabled={recoveryAction === 'create'}
              className="bg-accent hover:bg-accent-hover text-white text-xs rounded-app px-3 py-1.5 disabled:opacity-50 transition-colors"
            >
              {recoveryAction === 'create' ? 'Creating...' : 'Create Backup Now'}
            </button>
            <button
              onClick={loadRecoverySnapshots}
              disabled={recoveryLoading}
              className="bg-bg-elevated border border-border-subtle text-text-muted text-xs rounded-app px-3 py-1.5 hover:text-text-primary transition-colors disabled:opacity-50"
            >
              {recoveryLoading ? 'Refreshing...' : 'Refresh List'}
            </button>
            <button
              onClick={handleOpenRecoveryFolder}
              className="bg-bg-elevated border border-border-subtle text-text-muted text-xs rounded-app px-3 py-1.5 hover:text-text-primary transition-colors"
            >
              Open Recovery Folder
            </button>
          </div>

          {recoveryRoot && (
            <p className="mono text-[10px] text-text-muted mb-3 truncate" title={recoveryRoot}>
              {recoveryRoot}
            </p>
          )}

          <div className="space-y-2">
            {latestRecoverySnapshot && (
              <div className="rounded border border-border-subtle bg-bg-elevated px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">Latest backup</p>
                    <p className="text-xs text-text-muted truncate">{getRecoveryProjectLabel(latestRecoverySnapshot)}</p>
                    <p className="mono text-[10px] text-text-muted">{formatRecoveryDate(latestRecoverySnapshot.createdAt)} · {latestRecoverySnapshot.localStorageKeyCount} data keys</p>
                  </div>
                  <button
                    onClick={() => handleRestoreRecoverySnapshot('latest')}
                    disabled={Boolean(recoveryAction)}
                    className="bg-accent hover:bg-accent-hover text-white text-xs rounded-app px-3 py-1.5 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {recoveryAction === 'latest' ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              </div>
            )}

            {recoverySnapshots.map(snapshot => (
              <div key={snapshot.id} className="flex items-center gap-3 rounded border border-border-subtle bg-bg-elevated px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary truncate">{getRecoveryProjectLabel(snapshot)}</p>
                  <p className="mono text-[10px] text-text-muted truncate">
                    {formatRecoveryDate(snapshot.createdAt)} · {snapshot.reason} · {snapshot.localStorageKeyCount} data keys
                  </p>
                </div>
                <button
                  onClick={() => handleRestoreRecoverySnapshot(snapshot.id)}
                  disabled={Boolean(recoveryAction)}
                  className="bg-bg-elevated border border-border-subtle text-text-muted text-xs rounded-app px-3 py-1.5 hover:text-text-primary transition-colors disabled:opacity-50 shrink-0"
                >
                  {recoveryAction === snapshot.id ? 'Restoring...' : 'Restore'}
                </button>
              </div>
            ))}

            {!latestRecoverySnapshot && recoverySnapshots.length === 0 && (
              <p className="mono text-xs text-text-muted">No recovery backups yet. Create one now or return to Dashboard and DocketOS will create them automatically as data changes.</p>
            )}
          </div>
        </section>


      </div>
    </div>
  )
}
