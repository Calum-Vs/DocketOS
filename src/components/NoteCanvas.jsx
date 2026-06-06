import { useState, useEffect, useRef } from 'react'
import CanvasBox from './canvas/CanvasBox.jsx'
import CanvasConnections from './canvas/CanvasConnections.jsx'
import { useCanvasInteractions } from './canvas/useCanvasInteractions.js'

const S = {
  panel: { backgroundColor: '#1C1C20', borderColor: '#34343A' },
  elevated: { backgroundColor: '#26262C', borderColor: '#34343A' },
  deeper: { backgroundColor: '#0D0D0F', borderColor: '#34343A' },
  hover: '#303038',
  accent: '#7A5CFF',
  accentSoft: '#B8AAFF',
  text: '#F5F5F7',
  muted: '#8E8E93',
  dim: '#3F3F46',
  zinc: '#52525B',
}

function loadStoredCanvasMode() {
  try {
    const mode = window.localStorage.getItem('docketos.canvasMode')
    return mode === 'folders' ? 'folders' : 'notes'
  } catch {
    return 'notes'
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function escapeHtmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function getImageFileFromClipboard(clipboardData) {
  if (!clipboardData) return null
  const items = Array.from(clipboardData.items ?? [])
  const imageItem = items.find(item => item.kind === 'file' && item.type?.startsWith('image/'))
  if (imageItem) return imageItem.getAsFile()
  const files = Array.from(clipboardData.files ?? [])
  return files.find(file => file.type?.startsWith('image/')) ?? null
}

function basename(filePath) {
  return filePath?.split(/[\\/]/).filter(Boolean).pop() ?? 'Project'
}

const MIN_FOLDER_ZOOM = 0.18
const MAX_FOLDER_ZOOM = 1.9
const MIN_NOTES_ZOOM = 0.2
const MAX_NOTES_ZOOM = 3
const FOLDER_ROOT_WIDTH = 260
const FOLDER_ROOT_HEIGHT = 70
const FOLDER_NODE_WIDTH = 240
const FOLDER_NODE_HEIGHT = 58
const FOLDER_EMPTY_WIDTH = 180
const FOLDER_ROW_GAP = 14
const FOLDER_ROOT_GAP = 70
const FOLDER_LEVEL_GAP = 276
const FOLDER_TREE_PADDING = { top: 18, right: 48, bottom: 70, left: 32 }
const FOLDER_BRANCH_COLOR = 'rgba(245,245,247,0.64)'
const FOLDER_BRANCH_HIGHLIGHT = 'rgba(122,92,255,0.92)'
const FOLDER_BRANCH_WIDTH = 2

export default function NoteCanvas({ projectId, projectRoot, subprojectId, subprojectLabel, phase, phaseLabel, onAddQuickLink, onFolderRenamed }) {
  const [mode, setMode] = useState(loadStoredCanvasMode)
  const [canvasId, setCanvasId] = useState(null)
  const [boxes, setBoxes] = useState([])
  const [connections, setConnections] = useState([])
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [folderPan, setFolderPan] = useState({ x: 32, y: 78 })
  const [folderZoom, setFolderZoom] = useState(1)
  const [rootEntries, setRootEntries] = useState([])
  const [folderChildrenByPath, setFolderChildrenByPath] = useState({})
  const [expandedFolderPaths, setExpandedFolderPaths] = useState({})
  const [loadingFolderPaths, setLoadingFolderPaths] = useState({})
  const [selectedFolderEntry, setSelectedFolderEntry] = useState(null)
  const [folderTreeLoading, setFolderTreeLoading] = useState(false)
  const [folderContextMenu, setFolderContextMenu] = useState(null)
  const [folderEditDialog, setFolderEditDialog] = useState(null)
  // selection is { type: 'box' | 'connection', id: string } | null
  const [selection, setSelection] = useState(null)
  const [editingId, setEditingId] = useState(null)
  // dragConn: { fromBoxId, fromX, fromY, toX, toY } in canvas coords, or null
  const [dragConn, setDragConn] = useState(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState(null) // { ok: bool, msg: string } | null
  const handleExportImageRef = useRef(null)
  // Refs so endConnectionDrag hit-tests against the latest boxes, not the
  // render-time snapshot (e.g., if a file-watcher push updates boxes mid-drag).
  const boxesRef = useRef(boxes)
  useEffect(() => { boxesRef.current = boxes }, [boxes])
  const saveTimer = useRef(null)
  const initialLoad = useRef(true)
  const viewportRef = useRef(null)
  const imageInputRef = useRef(null)
  const folderViewportRef = useRef(null)
  const { spaceHeld, isPanning, panHandlers } = useCanvasInteractions({ viewportRef, pan, setPan, panOnBackground: true })
  const folderInteractions = useCanvasInteractions({ viewportRef: folderViewportRef, pan: folderPan, setPan: setFolderPan, panOnBackground: true })

  useEffect(() => {
    try { window.localStorage.setItem('docketos.canvasMode', mode) } catch {}
  }, [mode])

  useEffect(() => {
    if (!folderContextMenu) return
    function closeContextMenu() {
      setFolderContextMenu(null)
    }
    window.addEventListener('mousedown', closeContextMenu)
    return () => window.removeEventListener('mousedown', closeContextMenu)
  }, [folderContextMenu])

  // Keep ref current so the stable listener always calls the latest version
  useEffect(() => { handleExportImageRef.current = handleExportImage })

  useEffect(() => {
    return window.api.on('canvas:triggerExport', () => {
      handleExportImageRef.current?.()
    })
  }, [])

  async function handleExportImage() {
    if (!boxes.length) {
      setExportStatus({ ok: false, msg: 'Nothing to export — add some boxes first.' })
      setTimeout(() => setExportStatus(null), 3000)
      return
    }

    const PADDING = 48
    const minX = Math.min(...boxes.map(b => b.x)) - PADDING
    const minY = Math.min(...boxes.map(b => b.y)) - PADDING
    const maxX = Math.max(...boxes.map(b => b.x + (b.width ?? 220))) + PADDING
    const maxY = Math.max(...boxes.map(b => b.y + (b.height ?? 160))) + PADDING
    const contentW = maxX - minX
    const contentH = maxY - minY

    const vp = viewportRef.current
    if (!vp) return
    const vpRect = vp.getBoundingClientRect()
    const fittedZoom = Math.min(
      (vpRect.width - 16) / contentW,
      (vpRect.height - 16) / contentH,
      2,
    )
    const fittedPan = {
      x: (vpRect.width - contentW * fittedZoom) / 2 - minX * fittedZoom,
      y: (vpRect.height - contentH * fittedZoom) / 2 - minY * fittedZoom,
    }

    // Store original view, switch to fit-all, hide controls
    const prevPan = pan
    const prevZoom = zoom
    setPan(fittedPan)
    setZoom(fittedZoom)
    setIsExporting(true)

    // Wait two frames so React paints the new state
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const captureRect = vp.getBoundingClientRect()
    const name = [subprojectLabel, phaseLabel].filter(Boolean).join(' - ') || 'Canvas Export'
    const result = await window.api.canvasExportImage({
      bounds: { x: captureRect.x, y: captureRect.y, width: captureRect.width, height: captureRect.height },
      suggestedName: `${name}.png`,
    })

    // Restore view
    setPan(prevPan)
    setZoom(prevZoom)
    setIsExporting(false)

    if (result?.success) {
      setExportStatus({ ok: true, msg: 'Image saved.' })
    } else if (!result?.canceled) {
      setExportStatus({ ok: false, msg: result?.error ?? 'Export failed.' })
    }
    if (result?.success || !result?.canceled) setTimeout(() => setExportStatus(null), 3000)
  }

  useEffect(() => {
    if (!projectId) return
    clearTimeout(saveTimer.current)  // cancel any pending save for the previous scope
    initialLoad.current = true
    setCanvasId(null)
    setSelection(null)
    setEditingId(null)
    window.api.canvasLoad({ projectId, subprojectId: subprojectId ?? null, phase: phase ?? null })
      .then(({ id, content }) => {
        setCanvasId(id)
        setBoxes(content.boxes || [])
        setConnections(content.connections || [])
        setPan(content.pan || { x: 0, y: 0 })
        setZoom(typeof content.zoom === 'number' ? content.zoom : 1)
        initialLoad.current = false
      })
  }, [projectId, subprojectId, phase])

  useEffect(() => {
    setRootEntries([])
    setFolderChildrenByPath({})
    setExpandedFolderPaths({})
    setLoadingFolderPaths({})
    setSelectedFolderEntry(null)
    setFolderContextMenu(null)
    setFolderEditDialog(null)
  }, [projectRoot])

  useEffect(() => {
    if (mode !== 'folders' || !projectRoot) return
    refreshRootEntries()
  }, [mode, projectRoot])

  useEffect(() => {
    if (initialLoad.current || !canvasId) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api.canvasSave({ id: canvasId, content: { boxes, connections, pan, zoom } })
    }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [boxes, connections, pan, zoom, canvasId])

  // Window-level pointer tracking for the in-progress connection drag.
  // Active only while dragConn is non-null, so a pointer release anywhere
  // (including outside the viewport / window) reliably ends the drag and
  // prevents a "ghost drag" from persisting.
  useEffect(() => {
    if (!dragConn) return
    function onMove(e) { updateConnectionDrag(e.clientX, e.clientY) }
    function onUp(e) { endConnectionDrag(e.clientX, e.clientY) }
    function onCancel() { setDragConn(null) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [dragConn])

  useEffect(() => {
    function flushSave() {
      if (!canvasId) return
      clearTimeout(saveTimer.current)
      // Fire the save synchronously into the IPC queue; Electron will deliver
      // it to main before the window finishes unloading.
      window.api.canvasSave({ id: canvasId, content: { boxes, connections, pan, zoom } })
    }
    window.addEventListener('beforeunload', flushSave)
    return () => window.removeEventListener('beforeunload', flushSave)
  }, [canvasId, boxes, connections, pan, zoom])

  useEffect(() => {
    if (mode !== 'notes') return
    function onPaste(event) {
      if (editingId) return
      const active = document.activeElement
      if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      const imageFile = getImageFileFromClipboard(event.clipboardData)
      if (!imageFile) return
      event.preventDefault()
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result !== 'string') return
        createImageBoxFromDataUrl(reader.result, imageFile.name || 'Pasted Image')
      }
      reader.readAsDataURL(imageFile)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [mode, editingId, pan, zoom])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = document.activeElement
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (!selection) return
      e.preventDefault()
      // Inline the deletion to use only stable setters — avoids capturing a stale
      // `deleteBox` closure that could become incorrect if `deleteBox` ever reads
      // values from its outer render.
      if (selection.type === 'box') {
        const boxId = selection.id
        setBoxes(prev => prev.filter(b => b.id !== boxId))
        setConnections(prev => prev.filter(c => c.from !== boxId && c.to !== boxId))
        setSelection(null)
      } else if (selection.type === 'connection') {
        setConnections(prev => prev.filter(c => c.id !== selection.id))
        setSelection(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection])

  function deleteBox(boxId) {
    setBoxes(prev => prev.filter(b => b.id !== boxId))
    setConnections(prev => prev.filter(c => c.from !== boxId && c.to !== boxId))
    setSelection(null)
  }

  function updateBox(boxId, patch) {
    setBoxes(prev => prev.map(b => b.id === boxId ? { ...b, ...patch } : b))
  }

  function startConnectionDrag(fromBoxId, clientX, clientY) {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const from = boxes.find(b => b.id === fromBoxId)
    if (!from) return
    setDragConn({
      fromBoxId,
      fromX: from.x + from.width,
      fromY: from.y + from.height / 2,
      toX: (clientX - rect.left - pan.x) / zoom,
      toY: (clientY - rect.top - pan.y) / zoom,
    })
  }

  function updateConnectionDrag(clientX, clientY) {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    setDragConn(prev => prev ? {
      ...prev,
      toX: (clientX - rect.left - pan.x) / zoom,
      toY: (clientY - rect.top - pan.y) / zoom,
    } : prev)
  }

  function handleWheel(event) {
    event.preventDefault()
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const nextZoom = clamp(zoom * (event.deltaY > 0 ? 0.9 : 1.1), MIN_NOTES_ZOOM, MAX_NOTES_ZOOM)
    if (nextZoom === zoom) return
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const worldX = (pointerX - pan.x) / zoom
    const worldY = (pointerY - pan.y) / zoom
    setZoom(nextZoom)
    setPan({
      x: Math.round(pointerX - worldX * nextZoom),
      y: Math.round(pointerY - worldY * nextZoom),
    })
  }

  function resetNotesView() {
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }

  function endConnectionDrag(clientX, clientY) {
    setDragConn(prev => {
      if (!prev) return null
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) return null
      const cx = (clientX - rect.left - pan.x) / zoom
      const cy = (clientY - rect.top - pan.y) / zoom
      // Hit-test against the latest boxes via ref (avoids stale-closure if boxes
      // were mutated mid-drag by, e.g., an autosave reload or external push).
      const target = boxesRef.current.find(b =>
        cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height
      )
      if (target && target.id !== prev.fromBoxId) {
        // Use functional setConnections so the dup check sees latest connections.
        setConnections(cs => {
          if (cs.some(c => c.from === prev.fromBoxId && c.to === target.id)) return cs
          return [...cs, { id: crypto.randomUUID(), from: prev.fromBoxId, to: target.id }]
        })
      }
      return null
    })
  }

  function createBoxAt(clientX, clientY) {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    // Translate screen coords into canvas coords (account for pan + zoom).
    const x = (clientX - rect.left - pan.x) / zoom
    const y = (clientY - rect.top - pan.y) / zoom
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const newBox = {
      id,
      x: Math.round(x - 120),  // center the 240-wide box on the cursor
      y: Math.round(y - 60),
      width: 240,
      height: 120,
      html: '',
      updated_at: now,
    }
    setBoxes(prev => [...prev, newBox])
    setSelection({ type: 'box', id })
    setEditingId(id)
  }

  function createImageBoxFromDataUrl(dataUrl, fileName = 'Image') {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const centerX = (rect.width / 2 - pan.x) / zoom
    const centerY = (rect.height / 2 - pan.y) / zoom
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const newBox = {
      id,
      x: Math.round(centerX - 160),
      y: Math.round(centerY - 115),
      width: 320,
      height: 230,
      html: `<div><img src="${escapeHtmlAttr(dataUrl)}" alt="${escapeHtmlAttr(fileName)}" /></div>`,
      updated_at: now,
    }
    setBoxes(prev => [...prev, newBox])
    setSelection({ type: 'box', id })
    setEditingId(null)
  }

  function triggerImagePicker() {
    imageInputRef.current?.click()
  }

  function handleImageFilePicked(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      createImageBoxFromDataUrl(reader.result, file.name || 'Image')
    }
    reader.readAsDataURL(file)
  }

  async function refreshRootEntries() {
    if (!projectRoot) return
    setFolderTreeLoading(true)
    const entries = await window.api.fsScanDir({ dirPath: projectRoot })
    setRootEntries(entries)
    setFolderTreeLoading(false)
  }

  async function expandAllFolderEntries() {
    if (!projectRoot) return
    setFolderTreeLoading(true)
    const root = rootEntries.length ? rootEntries : await window.api.fsScanDir({ dirPath: projectRoot })
    const nextChildrenByPath = {}
    const nextExpandedPaths = {}

    async function loadBranch(entries) {
      await Promise.all(entries.filter(entry => entry.isDirectory && entry.fullPath).map(async entry => {
        nextExpandedPaths[entry.fullPath] = true
        const children = await window.api.fsScanDir({ dirPath: entry.fullPath })
        nextChildrenByPath[entry.fullPath] = children
        await loadBranch(children)
      }))
    }

    await loadBranch(root)
    setRootEntries(root)
    setFolderChildrenByPath(prev => ({ ...prev, ...nextChildrenByPath }))
    setExpandedFolderPaths(nextExpandedPaths)
    setLoadingFolderPaths({})
    setFolderTreeLoading(false)
  }

  function minimiseAllFolderEntries() {
    setExpandedFolderPaths({})
    setLoadingFolderPaths({})
  }

  async function refreshEntriesForPath(parentPath) {
    if (!parentPath) return
    const entries = await window.api.fsScanDir({ dirPath: parentPath })
    if (parentPath === projectRoot) {
      setRootEntries(entries)
    } else {
      setFolderChildrenByPath(prev => ({ ...prev, [parentPath]: entries }))
    }
  }

  async function toggleFolderEntry(entry) {
    if (!entry?.isDirectory || !entry.fullPath) return
    const isOpen = !!expandedFolderPaths[entry.fullPath]
    if (isOpen) {
      setExpandedFolderPaths(prev => ({ ...prev, [entry.fullPath]: false }))
      return
    }

    setExpandedFolderPaths(prev => ({ ...prev, [entry.fullPath]: true }))
    if (folderChildrenByPath[entry.fullPath]) return
    setLoadingFolderPaths(prev => ({ ...prev, [entry.fullPath]: true }))
    const entries = await window.api.fsScanDir({ dirPath: entry.fullPath })
    setFolderChildrenByPath(prev => ({ ...prev, [entry.fullPath]: entries }))
    setLoadingFolderPaths(prev => ({ ...prev, [entry.fullPath]: false }))
  }

  async function openSelectedFolderEntry() {
    if (!selectedFolderEntry?.fullPath) return
    await window.api.fsOpenInExplorer({ dirPath: selectedFolderEntry.fullPath })
  }

  async function openFolderEntry(entry) {
    if (!entry?.fullPath) return
    await window.api.fsOpenInExplorer({ dirPath: entry.fullPath })
  }

  async function openProjectRoot() {
    if (!projectRoot) return
    await window.api.fsOpenInExplorer({ dirPath: projectRoot })
  }

  function handleFolderWheel(event) {
    event.preventDefault()
    const rect = folderViewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const nextZoom = clamp(folderZoom * (event.deltaY > 0 ? 0.88 : 1.1), MIN_FOLDER_ZOOM, MAX_FOLDER_ZOOM)
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const worldX = (pointerX - folderPan.x) / folderZoom
    const worldY = (pointerY - folderPan.y) / folderZoom
    setFolderZoom(nextZoom)
    setFolderPan({
      x: Math.round(pointerX - worldX * nextZoom),
      y: Math.round(pointerY - worldY * nextZoom),
    })
  }

  function resetFolderView() {
    setFolderPan({ x: 32, y: 78 })
    setFolderZoom(1)
  }

  function openFolderContextMenu(event, entry, parentPath) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedFolderEntry(entry)
    setFolderContextMenu({ x: event.clientX, y: event.clientY, entry, parentPath })
  }

  function addFolderEntryToQuickLinks(entry = folderContextMenu?.entry) {
    if (!entry?.fullPath || !onAddQuickLink) return
    onAddQuickLink({
      name: entry.name,
      fullPath: entry.fullPath,
      isDirectory: !!entry.isDirectory,
      dev: entry.dev ?? null,
      ino: entry.ino ?? null,
    })
    setFolderContextMenu(null)
  }

  function beginCreateFolder(entry = folderContextMenu?.entry) {
    if (!entry?.isDirectory || !entry.fullPath) return
    setFolderEditDialog({ mode: 'create', parentPath: entry.fullPath, value: '', error: null })
    setExpandedFolderPaths(prev => ({ ...prev, [entry.fullPath]: true }))
    setFolderContextMenu(null)
  }

  function beginRenameEntry(entry = folderContextMenu?.entry, parentPath = folderContextMenu?.parentPath) {
    if (!entry?.fullPath) return
    setFolderEditDialog({ mode: 'rename', entry, parentPath, value: entry.name, error: null })
    setFolderContextMenu(null)
  }

  async function commitFolderEdit() {
    if (!folderEditDialog) return
    const name = folderEditDialog.value.trim()
    if (!name) {
      setFolderEditDialog(prev => prev ? { ...prev, error: 'Enter a name.' } : prev)
      return
    }

    if (folderEditDialog.mode === 'create') {
      const result = await window.api.fsCreateFolder({ parentPath: folderEditDialog.parentPath, name })
      if (!result?.success) {
        setFolderEditDialog(prev => prev ? { ...prev, error: result?.error ?? 'Failed to create folder.' } : prev)
        return
      }
      await refreshEntriesForPath(folderEditDialog.parentPath)
      setFolderEditDialog(null)
      return
    }

    if (folderEditDialog.mode === 'rename') {
      if (name === folderEditDialog.entry.name) {
        setFolderEditDialog(null)
        return
      }
      const result = await window.api.fsRenameFolder({ oldPath: folderEditDialog.entry.fullPath, newName: name })
      if (!result?.success) {
        setFolderEditDialog(prev => prev ? { ...prev, error: result?.error ?? 'Failed to rename item.' } : prev)
        return
      }
      await refreshEntriesForPath(folderEditDialog.parentPath)
      onFolderRenamed?.(folderEditDialog.entry.fullPath, result.fullPath, name)
      setSelectedFolderEntry({ ...folderEditDialog.entry, name, fullPath: result.fullPath })
      setFolderEditDialog(null)
    }
  }

  function selectFolderEntry(entry) {
    setSelectedFolderEntry(entry)
    if (entry?.isDirectory) toggleFolderEntry(entry)
  }

  function buildFolderTreeLayout() {
    const nodes = []
    const edges = []
    let row = 0

    function pushNode({ entry, depth, parentId, parentPath, empty = false }) {
      const id = empty ? `${parentId}::empty` : entry.fullPath ?? `${entry.name}-${depth}-${row}`
      const width = empty ? FOLDER_EMPTY_WIDTH : FOLDER_NODE_WIDTH
      const height = empty ? 36 : FOLDER_NODE_HEIGHT
      const x = FOLDER_ROOT_WIDTH + FOLDER_ROOT_GAP + (depth - 1) * FOLDER_LEVEL_GAP
      const y = row * (FOLDER_NODE_HEIGHT + FOLDER_ROW_GAP)
      const node = { id, entry, depth, parentId, parentPath, empty, x, y, width, height }
      nodes.push(node)
      if (parentId) edges.push({ from: parentId, to: id })
      row += 1
      return node
    }

    function walk(entries, depth, parentId, parentPath) {
      entries.forEach(entry => {
        const node = pushNode({ entry, depth, parentId, parentPath })
        const isOpen = !!expandedFolderPaths[entry.fullPath]
        const children = folderChildrenByPath[entry.fullPath] ?? []
        if (!entry.isDirectory || !isOpen) return
        if (children.length === 0) {
          pushNode({ entry: { name: 'Empty', isDirectory: false }, depth: depth + 1, parentId: node.id, parentPath: entry.fullPath, empty: true })
          return
        }
        walk(children, depth + 1, node.id, entry.fullPath)
      })
    }

    walk(rootEntries, 1, 'root', projectRoot)

    const maxX = nodes.reduce((value, node) => Math.max(value, node.x + node.width), FOLDER_ROOT_WIDTH)
    const maxY = nodes.reduce((value, node) => Math.max(value, node.y + node.height), FOLDER_ROOT_HEIGHT)
    return {
      nodes,
      edges,
      width: maxX + FOLDER_TREE_PADDING.left + FOLDER_TREE_PADDING.right,
      height: maxY + FOLDER_TREE_PADDING.top + FOLDER_TREE_PADDING.bottom,
    }
  }

  function renderFolderEdge(edge, nodeById) {
    const from = edge.from === 'root'
      ? { x: 0, y: 0, width: FOLDER_ROOT_WIDTH, height: FOLDER_ROOT_HEIGHT }
      : nodeById.get(edge.from)
    const to = nodeById.get(edge.to)
    if (!from || !to) return null

    const startX = from.x + from.width
    const startY = from.y + from.height / 2
    const endX = to.x
    const endY = to.y + to.height / 2
    const elbowX = Math.round(startX + Math.max(34, (endX - startX) * 0.5))
    const selectedEdge = selectedFolderEntry?.fullPath && (edge.from === selectedFolderEntry.fullPath || edge.to === selectedFolderEntry.fullPath)

    return (
      <path
        key={`${edge.from}-${edge.to}`}
        d={`M ${startX} ${startY} H ${elbowX} V ${endY} H ${endX}`}
        fill="none"
        stroke={selectedEdge ? FOLDER_BRANCH_HIGHLIGHT : FOLDER_BRANCH_COLOR}
        strokeWidth={selectedEdge ? FOLDER_BRANCH_WIDTH + 0.75 : FOLDER_BRANCH_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    )
  }

  function renderFolderNodeCard(node) {
    if (node.empty) {
      return (
        <div
          key={node.id}
          className="absolute mono rounded border px-3 py-2 text-xs"
          style={{
            left: node.x,
            top: node.y,
            width: node.width,
            height: node.height,
            color: S.dim,
            borderColor: S.panel.borderColor,
            backgroundColor: 'rgba(13,13,15,0.92)',
            boxShadow: '0 8px 22px rgba(0,0,0,0.22)',
          }}
        >
          Empty
        </div>
      )
    }

    const entry = node.entry
    const isDirectory = !!entry.isDirectory
    const isOpen = !!expandedFolderPaths[entry.fullPath]
    const isLoading = !!loadingFolderPaths[entry.fullPath]
    const children = folderChildrenByPath[entry.fullPath] ?? []
    const selected = selectedFolderEntry?.fullPath === entry.fullPath

    return (
      <button
        key={node.id}
        onClick={() => selectFolderEntry(entry)}
        onDoubleClick={event => {
          event.stopPropagation()
          openFolderEntry(entry)
        }}
        onContextMenu={event => openFolderContextMenu(event, entry, node.parentPath)}
        className="group absolute text-left rounded border transition"
        style={{
          left: node.x,
          top: node.y,
          width: node.width,
          minHeight: node.height,
          backgroundColor: selected ? S.elevated.backgroundColor : S.panel.backgroundColor,
          borderColor: selected ? S.accent : S.panel.borderColor,
          boxShadow: selected ? '0 0 0 1px rgba(122,92,255,0.32), 0 14px 34px rgba(0,0,0,0.3)' : '0 10px 28px rgba(0,0,0,0.25)',
        }}
        title={entry.fullPath}
      >
        <div className="flex h-full items-center gap-3 px-4 py-3">
          <span className="mono grid h-7 w-7 shrink-0 place-items-center rounded border text-sm" style={{ color: isDirectory ? S.accent : S.zinc, borderColor: selected ? 'rgba(122,92,255,0.5)' : S.panel.borderColor, backgroundColor: '#0D0D0F' }}>
            {isDirectory ? (isLoading ? '...' : isOpen ? 'v' : '>') : '-'}
          </span>
          <span className="min-w-0 flex-1 type-app-title leading-tight truncate" style={{ color: S.text }}>
            {entry.name}
          </span>
        </div>
      </button>
    )
  }

  function renderModeButton(value, label) {
    const active = mode === value
    return (
      <button
        onClick={() => setMode(value)}
        className="mono text-[10px] px-2.5 py-1 rounded border transition"
        style={{
          backgroundColor: active ? S.accent : '#0D0D0F',
          borderColor: active ? S.accent : S.panel.borderColor,
          color: active ? '#fff' : S.muted,
        }}
      >
        {label}
      </button>
    )
  }

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: '#3F3F46' }}>
        <span className="mono text-xs">Select a project to use the canvas</span>
      </div>
    )
  }

  if (mode === 'folders') {
    const folderTreeLayout = buildFolderTreeLayout()
    const folderNodeById = new Map(folderTreeLayout.nodes.map(node => [node.id, node]))

    return (
      <div
        ref={folderViewportRef}
        className="flex-1 min-h-0 relative overflow-hidden"
        style={{
          backgroundColor: '#050506',
          backgroundImage: 'linear-gradient(#101013 1px, transparent 1px), linear-gradient(90deg, #101013 1px, transparent 1px)',
          backgroundSize: `${34 * folderZoom}px ${34 * folderZoom}px`,
          backgroundPosition: `${folderPan.x}px ${folderPan.y}px`,
          cursor: folderInteractions.isPanning ? 'grabbing' : folderInteractions.spaceHeld ? 'grab' : 'default',
          userSelect: 'none',
        }}
        onPointerDown={folderInteractions.panHandlers.onPointerDown}
        onPointerMove={folderInteractions.panHandlers.onPointerMove}
        onPointerUp={folderInteractions.panHandlers.onPointerUp}
        onWheel={handleFolderWheel}
        onClick={event => {
          if (event.target === event.currentTarget || event.target.matches('[data-folder-tree-bg]')) setSelectedFolderEntry(null)
        }}
      >
        <div className="absolute top-2 left-3 z-20 flex items-center gap-2 rounded border px-2 py-1" style={S.deeper}>
          {renderModeButton('notes', 'Canvas')}
          {renderModeButton('folders', 'Folder Tree')}
          <span className="mono text-[10px] px-2" style={{ color: S.zinc }}>{subprojectLabel ? `${subprojectLabel} / ` : ''}{phaseLabel ?? 'Project'}</span>
        </div>

        <div className="absolute top-2 right-3 z-20 flex items-center gap-2">
          {selectedFolderEntry && (
            <button
              onClick={openSelectedFolderEntry}
              className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition"
              style={{ borderColor: S.panel.borderColor, color: S.muted, backgroundColor: '#0D0D0F' }}
            >
              Open
            </button>
          )}
          <button
            onClick={refreshRootEntries}
            className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition"
            style={{ borderColor: S.panel.borderColor, color: S.muted, backgroundColor: '#0D0D0F' }}
          >
            Refresh
          </button>
          <button
            onClick={expandAllFolderEntries}
            disabled={folderTreeLoading}
            className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition disabled:opacity-40"
            style={{ borderColor: S.panel.borderColor, color: S.muted, backgroundColor: '#0D0D0F' }}
          >
            Expand All
          </button>
          <button
            onClick={minimiseAllFolderEntries}
            disabled={folderTreeLoading}
            className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition disabled:opacity-40"
            style={{ borderColor: S.panel.borderColor, color: S.muted, backgroundColor: '#0D0D0F' }}
          >
            Minimise All
          </button>
          <button
            onClick={() => setFolderZoom(zoom => clamp(zoom - 0.1, MIN_FOLDER_ZOOM, MAX_FOLDER_ZOOM))}
            className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition"
            style={{ borderColor: S.panel.borderColor, color: S.muted, backgroundColor: '#0D0D0F' }}
          >
            -
          </button>
          <span className="mono text-[10px] rounded border px-2 py-1" style={{ borderColor: S.panel.borderColor, color: S.zinc, backgroundColor: '#0D0D0F' }}>
            {Math.round(folderZoom * 100)}%
          </span>
          <button
            onClick={() => setFolderZoom(zoom => clamp(zoom + 0.1, MIN_FOLDER_ZOOM, MAX_FOLDER_ZOOM))}
            className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition"
            style={{ borderColor: S.panel.borderColor, color: S.muted, backgroundColor: '#0D0D0F' }}
          >
            +
          </button>
          <button
            onClick={resetFolderView}
            className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition"
            style={{ borderColor: S.panel.borderColor, color: S.muted, backgroundColor: '#0D0D0F' }}
          >
            Reset
          </button>
        </div>

        <div
          data-folder-tree-bg
          data-pan-bg
          className="absolute inset-0"
          style={{ transform: `translate(${folderPan.x}px, ${folderPan.y}px) scale(${folderZoom})`, transformOrigin: '0 0' }}
        >
          <div
            className="relative"
            style={{
              width: folderTreeLayout.width,
              height: folderTreeLayout.height,
              marginLeft: FOLDER_TREE_PADDING.left,
              marginTop: FOLDER_TREE_PADDING.top,
            }}
          >
            <svg
              className="absolute left-0 top-0 overflow-visible pointer-events-none"
              width={folderTreeLayout.width}
              height={folderTreeLayout.height}
              aria-hidden="true"
            >
              {folderTreeLayout.edges.map(edge => renderFolderEdge(edge, folderNodeById))}
            </svg>

            <button
              onClick={openProjectRoot}
              onContextMenu={event => openFolderContextMenu(event, { name: basename(projectRoot), fullPath: projectRoot, isDirectory: true, isRoot: true }, projectRoot)}
              className="text-left rounded border shadow-lg"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: FOLDER_ROOT_WIDTH,
                minHeight: FOLDER_ROOT_HEIGHT,
                backgroundColor: S.panel.backgroundColor,
                borderColor: S.accent,
                boxShadow: '0 14px 34px rgba(0,0,0,0.3)',
              }}
              title={projectRoot}
            >
              <div className="px-3 py-3">
                <p className="type-overline" style={{ color: S.accent }}>Project Root</p>
                <p className="text-sm font-semibold truncate mt-1" style={{ color: S.text }}>{basename(projectRoot)}</p>
                <p className="mono text-[10px] truncate mt-1" style={{ color: S.zinc }}>{projectRoot}</p>
              </div>
            </button>

            {folderTreeLoading && (
              <p
                className="absolute mono text-xs rounded border px-3 py-2"
                style={{ left: FOLDER_ROOT_WIDTH + FOLDER_ROOT_GAP, top: 0, color: S.zinc, borderColor: S.panel.borderColor, backgroundColor: '#0D0D0F' }}
              >
                Loading folder tree...
              </p>
            )}
            {!folderTreeLoading && rootEntries.length === 0 && (
              <p
                className="absolute mono text-xs rounded border px-3 py-2"
                style={{ left: FOLDER_ROOT_WIDTH + FOLDER_ROOT_GAP, top: 0, color: S.dim, borderColor: S.panel.borderColor, backgroundColor: '#0D0D0F' }}
              >
                No files or folders found.
              </p>
            )}
            {!folderTreeLoading && folderTreeLayout.nodes.map(renderFolderNodeCard)}
          </div>
        </div>

        {folderContextMenu && (
          <div
            className="fixed z-50 rounded border py-1 shadow-2xl"
            style={{ top: folderContextMenu.y, left: folderContextMenu.x, width: 190, backgroundColor: S.panel.backgroundColor, borderColor: S.panel.borderColor }}
            onMouseDown={event => event.stopPropagation()}
          >
            <button onClick={() => addFolderEntryToQuickLinks()} disabled={!onAddQuickLink} className="w-full text-left px-3 py-2 text-xs hover:bg-[#303038] disabled:opacity-40" style={{ color: S.text }}>Add to Quick Links</button>
            <button onClick={() => { openFolderEntry(folderContextMenu.entry); setFolderContextMenu(null) }} className="w-full text-left px-3 py-2 text-xs hover:bg-[#303038]" style={{ color: S.text }}>Open in Explorer</button>
            {folderContextMenu.entry?.isDirectory && <button onClick={() => beginCreateFolder()} className="w-full text-left px-3 py-2 text-xs hover:bg-[#303038]" style={{ color: S.text }}>New Subfolder</button>}
            {!folderContextMenu.entry?.isRoot && <button onClick={() => beginRenameEntry()} className="w-full text-left px-3 py-2 text-xs hover:bg-[#303038]" style={{ color: S.text }}>Rename</button>}
          </div>
        )}

        {folderEditDialog && (
          <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.62)' }}>
            <div className="rounded border p-4 w-[360px]" style={S.panel}>
              <h3 className="type-panel-title" style={{ color: S.muted }}>{folderEditDialog.mode === 'create' ? 'New Subfolder' : 'Rename Item'}</h3>
              <input
                autoFocus
                value={folderEditDialog.value}
                onChange={event => setFolderEditDialog(prev => prev ? { ...prev, value: event.target.value, error: null } : prev)}
                onKeyDown={event => {
                  if (event.key === 'Enter') commitFolderEdit()
                  if (event.key === 'Escape') setFolderEditDialog(null)
                }}
                className="mt-3 w-full rounded border text-sm outline-none"
                style={{ backgroundColor: S.elevated.backgroundColor, borderColor: S.panel.borderColor, color: S.text, padding: '8px 10px', userSelect: 'text' }}
              />
              {folderEditDialog.error && <p className="mt-2 text-xs" style={{ color: '#FF453A' }}>{folderEditDialog.error}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setFolderEditDialog(null)} className="rounded border px-3 py-1.5 text-xs" style={{ ...S.elevated, color: S.text }}>Cancel</button>
                <button onClick={commitFolderEdit} className="rounded px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: S.accent, color: '#fff' }}>{folderEditDialog.mode === 'create' ? 'Create' : 'Rename'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={viewportRef}
      className="flex-1 min-h-0 relative overflow-hidden"
      style={{
        backgroundColor: '#050506',
        backgroundImage: 'radial-gradient(#34343A 1px, transparent 1px)',
        backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        cursor: isPanning ? 'grabbing' : spaceHeld ? 'grab' : 'default',
        userSelect: 'none',
      }}
      onPointerDown={panHandlers.onPointerDown}
      onPointerMove={panHandlers.onPointerMove}
      onPointerUp={panHandlers.onPointerUp}
      onWheel={handleWheel}
      onClick={e => {
        if (e.target === e.currentTarget || e.target.matches('[data-canvas-bg]')) {
          setSelection(null)
          setEditingId(null)
        }
      }}
      onDoubleClick={e => {
        if (e.target !== e.currentTarget && !e.target.matches('[data-canvas-bg]')) return
        createBoxAt(e.clientX, e.clientY)
      }}
    >
      {/* Breadcrumb */}
      {!isExporting && (
        <div className="absolute top-2 left-3 z-10 flex items-center gap-2 rounded border px-2 py-1" style={S.deeper}>
          {renderModeButton('notes', 'Canvas')}
          {renderModeButton('folders', 'Folder Tree')}
          <span className="mono text-[10px] px-2" style={{ color: S.zinc }}>
            {subprojectLabel ? `${subprojectLabel} / ` : ''}{phaseLabel ?? '—'}
          </span>
        </div>
      )}

      {/* Export status toast */}
      {exportStatus && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 rounded border px-4 py-2 text-xs mono pointer-events-none"
          style={{
            backgroundColor: S.panel.backgroundColor,
            borderColor: exportStatus.ok ? '#16a34a' : '#dc2626',
            color: exportStatus.ok ? '#16a34a' : '#ff453a',
          }}
        >
          {exportStatus.msg}
        </div>
      )}

      {/* Zoom + reset controls */}
      {!isExporting && <div className="absolute top-2 right-3 z-10 flex items-center gap-1">
        <button
          onClick={triggerImagePicker}
          className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition"
          style={{ borderColor: '#34343A', color: '#52525B', backgroundColor: '#0D0D0F' }}
          title="Add image note"
        >
          + Image
        </button>
        <button
          onClick={() => setZoom(z => clamp(z * 0.9, MIN_NOTES_ZOOM, MAX_NOTES_ZOOM))}
          className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition"
          style={{ borderColor: '#34343A', color: '#52525B', backgroundColor: '#0D0D0F' }}
          title="Zoom out"
        >
          −
        </button>
        <span className="mono text-[10px] rounded border px-2 py-1" style={{ borderColor: '#34343A', color: '#8E8E93', backgroundColor: '#0D0D0F' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(z => clamp(z * 1.1, MIN_NOTES_ZOOM, MAX_NOTES_ZOOM))}
          className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition"
          style={{ borderColor: '#34343A', color: '#52525B', backgroundColor: '#0D0D0F' }}
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={resetNotesView}
          className="mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition"
          style={{ borderColor: '#34343A', color: '#52525B', backgroundColor: '#0D0D0F' }}
          title="Reset view to origin"
        >
          ⌂ Reset
        </button>
      </div>}

      {/* Pan + zoom layer */}
      <div
        data-canvas-bg
        data-pan-bg
        className="absolute inset-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
      >
        <CanvasConnections
          boxes={boxes}
          connections={connections}
          selectionId={selection?.type === 'connection' ? selection.id : null}
          onSelect={id => { setSelection({ type: 'connection', id }); setEditingId(null) }}
          onDelete={id => {
            setConnections(prev => prev.filter(c => c.id !== id))
            setSelection(null)
          }}
          dragConnection={dragConn}
        />
        {boxes.map(box => (
          <CanvasBox
            key={box.id}
            box={box}
            selected={selection?.type === 'box' && selection.id === box.id}
            editing={editingId === box.id}
            onSelect={() => setSelection({ type: 'box', id: box.id })}
            onStartEdit={() => { setSelection({ type: 'box', id: box.id }); setEditingId(box.id) }}
            onStopEdit={() => setEditingId(null)}
            onDelete={() => deleteBox(box.id)}
            onUpdate={patch => updateBox(box.id, patch)}
            onConnectorDown={(clientX, clientY) => startConnectionDrag(box.id, clientX, clientY)}
            zoom={zoom}
          />
        ))}
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFilePicked}
      />
    </div>
  )
}
