import { useState, useEffect, useRef, useCallback } from 'react'

const COLORS = {
  panel: '#1C1C20',
  hover: '#303038',
  selected: '#1D1B2A',
  border: '#34343A',
  borderStrong: '#2A2A30',
  accent: '#7A5CFF',
  accentSoft: '#B8AAFF',
  text: '#F5F5F7',
  muted: '#8E8E93',
  faint: '#3F3F46',
}

const MENU_ITEMS = [
  { key: 'quick-file', label: 'Send to Quick Filing', icon: ExternalIcon },
  { key: 'quick-link', label: 'Add to Quick Links', icon: LinkIcon },
  { key: 'explorer', label: 'Open in Explorer', icon: ExternalIcon },
  { key: 'new-folder', label: 'New Subfolder', icon: PlusIcon, requiresChildren: true },
  { key: 'rename', label: 'Rename', icon: EditIcon },
]

const QUICK_FILING_DRAG_MIME = 'application/x-docketos-quick-filing-paths'

function IconBase({ children, className = '', style }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <IconBase className="h-3.5 w-3.5 transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
      <path d="M6 4l4 4-4 4" />
    </IconBase>
  )
}

function FolderIcon({ open, selected }) {
  return (
    <IconBase
      className="h-4 w-4 shrink-0"
      style={{ color: selected ? COLORS.accent : open ? '#C7BFFF' : COLORS.muted }}
    >
      <path d="M2.5 5.25V4.5c0-.83.67-1.5 1.5-1.5h2.15c.38 0 .74.14 1.02.4l1.03.95H12c.83 0 1.5.67 1.5 1.5v.4" />
      <path d="M2.5 5.75h11l-.7 5.7c-.1.76-.74 1.3-1.5 1.3H4.7c-.76 0-1.4-.54-1.5-1.3l-.7-5.7z" />
    </IconBase>
  )
}

function LeafIcon() {
  return <span className="block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS.faint }} />
}

function FlagDot({ flag, flagOptions = [] }) {
  const option = flagOptions.find(item => item.key === flag?.color)
  return (
    <span
      aria-hidden="true"
      title={option ? `Flagged: ${option.label}` : 'No flag'}
      className="shrink-0 rounded-full"
      style={{
        width: 8,
        height: 8,
        backgroundColor: option?.color ?? 'transparent',
        boxShadow: option ? `0 0 0 1px ${COLORS.panel}, 0 0 8px ${option.color}66` : 'none',
      }}
    />
  )
}

function SpinnerIcon() {
  return (
    <span
      className="block h-3 w-3 animate-spin rounded-full border"
      style={{ borderColor: COLORS.faint, borderTopColor: COLORS.accent }}
      aria-label="Loading folders"
    />
  )
}

function LinkIcon(props) {
  return <IconBase {...props}><path d="M6.6 9.4l2.8-2.8" /><path d="M7.3 4.4l.7-.7a2.8 2.8 0 114 4l-.7.7" /><path d="M8.7 11.6l-.7.7a2.8 2.8 0 11-4-4l.7-.7" /></IconBase>
}

function ExternalIcon(props) {
  return <IconBase {...props}><path d="M9 3h4v4" /><path d="M8 8l5-5" /><path d="M12 9.5V12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h2.5" /></IconBase>
}

function PlusIcon(props) {
  return <IconBase {...props}><path d="M8 3.5v9" /><path d="M3.5 8h9" /></IconBase>
}

function EditIcon(props) {
  return <IconBase {...props}><path d="M9.8 3.2l3 3" /><path d="M4 12l3.1-.7 5.2-5.2a1.4 1.4 0 00-2-2L5.1 9.3 4 12z" /></IconBase>
}

function TreeInput({ value, onChange, onCommit, onCancel, placeholder }) {
  return (
    <input
      autoFocus
      value={value}
      onChange={event => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={event => {
        if (event.key === 'Enter') onCommit()
        if (event.key === 'Escape') onCancel()
      }}
      onClick={event => event.stopPropagation()}
      placeholder={placeholder}
      className="min-w-0 flex-1 rounded border px-2 py-1 text-xs outline-none transition"
      style={{
        backgroundColor: '#101013',
        borderColor: COLORS.accent,
        color: COLORS.text,
        boxShadow: `0 0 0 2px ${COLORS.accentSoft}`,
      }}
    />
  )
}

function EmptyState({ children }) {
  return (
    <div className="rounded border px-3 py-2 text-xs" style={{ backgroundColor: '#0D0D0F', borderColor: COLORS.border, color: COLORS.faint }}>
      {children}
    </div>
  )
}

function normalizeFolderLabel(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function isTechnicalFolderName(value) {
  const normalized = normalizeFolderLabel(value)
  return /^(\d{1,2})?(technical|techincal)$/.test(normalized)
}

function FolderNode({ node, depth, onRefresh, selectedPath, onSelectFolder, onAddQuickLink, onQuickFile, autoExpand = false, allowChildren = true, revealPath = null, nameColumnWidth = 190, onBeginNameColumnResize = null, flagOptions = [], getFileFlag = null, onSetFileFlag = null, onClearFileFlag = null }) {
  const [open, setOpen] = useState(depth === 0 || autoExpand)
  const [children, setChildren] = useState(null)
  const [loading, setLoading] = useState(false)
  const [menu, setMenu] = useState(null)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const menuRef = useRef(null)

  async function loadChildren() {
    if (!allowChildren) return
    setLoading(true)
    const result = await window.api.fsListFolders({ dirPath: node.fullPath })
    setChildren(result)
    setLoading(false)
  }

  async function toggle() {
    if (!allowChildren) return
    if (!open && children === null) await loadChildren()
    setOpen(current => !current)
  }

  useEffect(() => {
    if (open && children === null) loadChildren()
  }, [open, children])

  useEffect(() => {
    if (!revealPath || !allowChildren) return
    const norm = p => p.toLowerCase().replace(/\\/g, '/')
    if (norm(revealPath).startsWith(norm(node.fullPath) + '/')) {
      if (children === null) loadChildren()
      setOpen(true)
    }
  }, [revealPath])

  useEffect(() => {
    if (!menu) return
    function handler(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenu(null)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [menu])

  function handleContextMenu(event) {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  function handleNewFolder() {
    if (!allowChildren) return
    setMenu(null)
    setNewFolderName('')
    setCreating(true)
    setOpen(true)
  }

  async function commitCreate() {
    if (!newFolderName.trim()) {
      setCreating(false)
      return
    }
    const result = await window.api.fsCreateFolder({ parentPath: node.fullPath, name: newFolderName.trim() })
    setCreating(false)
    if (result.success) await loadChildren()
  }

  function handleRename() {
    setMenu(null)
    setNewName(node.name)
    setRenaming(true)
  }

  async function commitRename() {
    if (!newName.trim() || newName.trim() === node.name) {
      setRenaming(false)
      return
    }
    const result = await window.api.fsRenameFolder({ oldPath: node.fullPath, newName: newName.trim() })
    if (result.success) {
      onRefresh()
    } else {
      alert(result.error)
    }
    setRenaming(false)
  }

  function handleOpenExplorer() {
    setMenu(null)
    window.api.fsOpenInExplorer({ dirPath: node.fullPath })
  }

  function handleAddToQuickLinks() {
    setMenu(null)
    onAddQuickLink?.({
      name: node.name,
      fullPath: node.fullPath,
      isDirectory: true,
    })
  }

  function handleSendToQuickFiling() {
    setMenu(null)
    onQuickFile?.({
      name: node.name,
      fullPath: node.fullPath,
      isDirectory: true,
    })
  }

  function handleDragStart(event) {
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData(QUICK_FILING_DRAG_MIME, JSON.stringify([node.fullPath]))
    event.dataTransfer.setData('text/plain', node.fullPath)
  }

  function handleMenuAction(key) {
    if (key === 'quick-file') handleSendToQuickFiling()
    if (key === 'quick-link') handleAddToQuickLinks()
    if (key === 'explorer') handleOpenExplorer()
    if (key === 'new-folder') handleNewFolder()
    if (key === 'rename') handleRename()
  }

  const selected = selectedPath === node.fullPath
  const flag = getFileFlag?.(node.fullPath) ?? null
  const rowLeft = 6 + depth * 16
  const nameColumnOverlap = Math.max(0, nameColumnWidth - 190)
  const nameColumnMaskBackground = selected ? COLORS.selected : COLORS.panel
  const nameColumnStyle = {
    minWidth: 0,
    width: `${nameColumnWidth}px`,
    flex: `0 0 ${nameColumnWidth}px`,
    maxWidth: `${nameColumnWidth}px`,
    marginRight: nameColumnOverlap ? `-${nameColumnOverlap}px` : 0,
    position: 'relative',
    zIndex: 2,
    backgroundColor: nameColumnMaskBackground,
    boxShadow: `8px 0 0 ${nameColumnMaskBackground}`,
  }
  return (
    <div className="relative">
      <div
        draggable
        className="group flex h-8 min-w-0 cursor-pointer select-none items-center gap-1 rounded border border-transparent pr-2 transition-colors hover:bg-[#18181B]"
        style={{
          paddingLeft: `${rowLeft}px`,
          backgroundColor: selected ? COLORS.selected : undefined,
          borderColor: selected ? 'rgba(122, 92, 255, 0.35)' : 'transparent',
          color: selected ? COLORS.text : '#D4D4D8',
          boxShadow: selected ? `inset 2px 0 0 ${COLORS.accent}` : 'none',
        }}
        onDragStart={handleDragStart}
        onClick={() => onSelectFolder?.(node)}
        onContextMenu={handleContextMenu}
        title={node.fullPath}
      >
        {allowChildren ? (
          <button
            type="button"
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-[#8E8E93] transition hover:bg-[#222228] hover:text-white focus:outline-none focus:ring-1 focus:ring-[#7A5CFF]"
            onClick={event => {
              event.stopPropagation()
              toggle()
            }}
          >
            {loading ? <SpinnerIcon /> : <ChevronIcon open={open} />}
          </button>
        ) : (
          <span className="grid h-6 w-6 shrink-0 place-items-center"><LeafIcon /></span>
        )}

        <FolderIcon open={open} selected={selected} />
        <FlagDot flag={flag} flagOptions={flagOptions} />

        {renaming ? (
          <TreeInput value={newName} onChange={setNewName} onCommit={commitRename} onCancel={() => setRenaming(false)} />
        ) : (
          <span className="truncate text-xs font-medium leading-tight" style={nameColumnStyle}>{node.name}</span>
        )}

        {onBeginNameColumnResize && !renaming && (
          <span
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize filename column"
            onMouseDown={onBeginNameColumnResize}
            onClick={event => { event.preventDefault(); event.stopPropagation() }}
            className="shrink-0 cursor-col-resize rounded opacity-0 transition-colors group-hover:opacity-100 hover:bg-[#7A5CFF]/60"
            style={{ width: 6, height: 18, backgroundColor: 'rgba(122, 92, 255, 0.16)', transform: `translateX(${nameColumnOverlap}px)`, zIndex: 3 }}
          />
        )}
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="fixed overflow-hidden rounded border py-1 shadow-2xl"
          style={{
            top: menu.y,
            left: menu.x,
            zIndex: 100,
            minWidth: '190px',
            backgroundColor: COLORS.panel,
            borderColor: COLORS.borderStrong,
            boxShadow: '0 18px 42px rgba(0, 0, 0, 0.5)',
          }}
        >
          {MENU_ITEMS.filter(item => !item.requiresChildren || allowChildren).map(item => {
            const MenuIcon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition hover:bg-[#303038] focus:bg-[#303038] focus:outline-none"
                style={{ color: COLORS.text }}
                onMouseDown={() => handleMenuAction(item.key)}
              >
                <MenuIcon className="h-3.5 w-3.5 shrink-0" style={{ color: COLORS.muted }} />
                <span>{item.label}</span>
              </button>
            )
          })}
          {flagOptions.length > 0 && (
            <div className="border-t mt-1 pt-1" style={{ borderColor: COLORS.borderStrong }}>
              <div className="px-2.5 pb-1 type-overline" style={{ color: COLORS.faint }}>Flag</div>
              <div className="grid grid-cols-6 gap-1 px-2.5 pb-1.5">
                {flagOptions.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    title={option.label}
                    className="h-5 rounded border transition hover:scale-105"
                    style={{ backgroundColor: option.color, borderColor: flag?.color === option.key ? COLORS.text : COLORS.borderStrong }}
                    onMouseDown={event => {
                      event.preventDefault()
                      onSetFileFlag?.({ name: node.name, fullPath: node.fullPath, isDirectory: true }, option.key)
                      setMenu(null)
                    }}
                  />
                ))}
              </div>
              {flag && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition hover:bg-[#303038] focus:bg-[#303038] focus:outline-none"
                  style={{ color: COLORS.text }}
                  onMouseDown={event => {
                    event.preventDefault()
                    onClearFileFlag?.({ name: node.name, fullPath: node.fullPath, isDirectory: true })
                    setMenu(null)
                  }}
                >
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border" style={{ borderColor: COLORS.muted }} />
                  <span>Clear flag</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {creating && (
        <div className="flex h-8 min-w-0 items-center gap-2 pr-2" style={{ paddingLeft: `${6 + (depth + 1) * 16 + 30}px` }}>
          <FolderIcon open={false} selected={false} />
          <TreeInput
            value={newFolderName}
            onChange={setNewFolderName}
            onCommit={commitCreate}
            onCancel={() => setCreating(false)}
            placeholder="New folder name"
          />
        </div>
      )}

      {open && children && children.length > 0 && (
        <div className="relative">
          {children.map(child => (
            <FolderNode
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              onRefresh={onRefresh}
              selectedPath={selectedPath}
              onSelectFolder={onSelectFolder}
              onAddQuickLink={onAddQuickLink}
              onQuickFile={onQuickFile}
              autoExpand={isTechnicalFolderName(child.name)}
              allowChildren={allowChildren}
              revealPath={revealPath}
              nameColumnWidth={nameColumnWidth}
              onBeginNameColumnResize={onBeginNameColumnResize}
              flagOptions={flagOptions}
              getFileFlag={getFileFlag}
              onSetFileFlag={onSetFileFlag}
              onClearFileFlag={onClearFileFlag}
            />
          ))}
        </div>
      )}

      {open && children && children.length === 0 && allowChildren && (
        <div className="px-2 py-1 text-[11px]" style={{ paddingLeft: `${rowLeft + 32}px`, color: COLORS.faint }}>
          No subfolders
        </div>
      )}
    </div>
  )
}

export default function FolderTree({ rootPath, selectedPath, onSelectFolder, onAddQuickLink, onQuickFile, revealPath = null, nameColumnWidth = 190, onBeginNameColumnResize = null, flagOptions = [], getFileFlag = null, onSetFileFlag = null, onClearFileFlag = null }) {
  const [rootFolders, setRootFolders] = useState([])
  const [key, setKey] = useState(0)

  const refresh = useCallback(() => setKey(current => current + 1), [])

  useEffect(() => {
    if (!rootPath) {
      setRootFolders([])
      return
    }
    window.api.fsListFolders({ dirPath: rootPath }).then(setRootFolders)
  }, [rootPath, key])

  if (!rootPath) {
    return <EmptyState>No project active</EmptyState>
  }

  return (
    <div className="space-y-0.5 pr-1 text-xs">
      {rootFolders.map(folder => (
        <FolderNode
          key={folder.fullPath}
          node={folder}
          depth={0}
          onRefresh={refresh}
          selectedPath={selectedPath}
          onSelectFolder={onSelectFolder}
          onAddQuickLink={onAddQuickLink}
          onQuickFile={onQuickFile}
          autoExpand={isTechnicalFolderName(folder.name)}
          allowChildren={true}
          revealPath={revealPath}
          nameColumnWidth={nameColumnWidth}
          onBeginNameColumnResize={onBeginNameColumnResize}
          flagOptions={flagOptions}
          getFileFlag={getFileFlag}
          onSetFileFlag={onSetFileFlag}
          onClearFileFlag={onClearFileFlag}
        />
      ))}
      {rootFolders.length === 0 && <EmptyState>No subfolders found</EmptyState>}
    </div>
  )
}
