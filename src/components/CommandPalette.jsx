import { useEffect, useMemo, useState } from 'react'

const S = {
  panel: { backgroundColor: '#121214', borderColor: '#1F1F23' },
  elevated: { backgroundColor: '#1A1A1E', borderColor: '#1F1F23' },
  text: '#F5F5F7',
  muted: '#8E8E93',
  zinc: '#52525B',
  accent: '#7A5CFF',
}

export default function CommandPalette({ activeProject, onClose, onRunIndex, onImport, onExport, onGenerateBrief, onOpenSettings }) {
  const [query, setQuery] = useState('')

  const commands = useMemo(() => [
    { id: 'index', label: 'Index Project Documents', group: 'Document Control', run: onRunIndex, disabled: !activeProject },
    { id: 'import', label: 'Import Files or Folders', group: 'Document Control', run: onImport, disabled: !activeProject },
    { id: 'brief', label: 'Generate Project Brief', group: 'Knowledge', run: onGenerateBrief, disabled: !activeProject },
    { id: 'export', label: 'Export Local Backup', group: 'Local First', run: onExport, disabled: !activeProject },
    { id: 'settings', label: 'Open Engine Backend', group: 'System', run: onOpenSettings, disabled: false },
  ], [activeProject, onRunIndex, onImport, onExport, onGenerateBrief, onOpenSettings])

  const filtered = commands.filter(command => {
    const haystack = `${command.group} ${command.label}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function run(command) {
    if (command.disabled) return
    await command.run?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-start justify-center pt-24" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="w-[620px] rounded border shadow-2xl overflow-hidden" style={S.panel} onMouseDown={event => event.stopPropagation()}>
        <div className="p-3 border-b" style={{ borderColor: S.panel.borderColor }}>
          <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Run a DocketOS command" className="w-full rounded border outline-none text-sm" style={{ backgroundColor: '#1A1A1E', borderColor: S.panel.borderColor, color: S.text, padding: '10px 12px' }} />
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          {filtered.map(command => (
            <button key={command.id} onClick={() => run(command)} disabled={command.disabled} className="w-full text-left rounded border p-3 mb-2 transition disabled:opacity-40" style={S.elevated}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm" style={{ color: S.text }}>{command.label}</span>
                <span className="mono text-[10px]" style={{ color: command.disabled ? S.zinc : S.accent }}>{command.group}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="mono text-xs p-4" style={{ color: S.zinc }}>No commands found.</p>}
        </div>
      </div>
    </div>
  )
}
