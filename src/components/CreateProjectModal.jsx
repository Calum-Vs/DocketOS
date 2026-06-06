import { useState } from 'react'

const S = {
  overlay:  { backgroundColor: 'rgba(0,0,0,0.7)' },
  modal:    { backgroundColor: '#121214', border: '1px solid #1F1F23', borderRadius: '6px', width: '480px' },
  input:    { backgroundColor: '#1A1A1E', border: '1px solid #1F1F23', borderRadius: '4px', color: '#F5F5F7', outline: 'none', padding: '8px 12px', fontSize: '13px', width: '100%' },
  label:    { fontSize: '12px', color: '#8E8E93', marginBottom: '4px', display: 'block' },
  accent:   '#7A5CFF',
}

export default function CreateProjectModal({ onCreated, onClose }) {
  const [name, setName]         = useState('')
  const [description, setDesc]  = useState('')
  const [rootPath, setRootPath] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  async function handleBrowse() {
    const picked = await window.api.folderBrowse()
    if (picked) setRootPath(picked)
  }

  async function handleCreate() {
    if (!name.trim() || !rootPath.trim()) {
      setError('Name and folder path are required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const project = await window.api.projectsCreate({
        name: name.trim(),
        description: description.trim() || null,
        root_path: rootPath.trim(),
      })
      onCreated(project)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={S.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={S.modal} className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm" style={{ color: '#F5F5F7' }}>New Project</span>
          <button
            onClick={onClose}
            className="text-xs hover:text-white transition"
            style={{ color: '#8E8E93' }}
          >✕</button>
        </div>

        <div>
          <label style={S.label}>Project Name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Riverside Subdivision Stage 2"
            style={S.input}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
        </div>

        <div>
          <label style={S.label}>Description</label>
          <input
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder="Optional short description"
            style={S.input}
          />
        </div>

        <div>
          <label style={S.label}>Project Root Folder *</label>
          <div className="flex gap-2">
            <input
              value={rootPath}
              onChange={e => setRootPath(e.target.value)}
              placeholder="C:\Projects\MyProject"
              style={{ ...S.input, flex: 1 }}
            />
            <button
              onClick={handleBrowse}
              className="text-xs px-3 py-2 rounded border hover:border-[#3A3A40] transition shrink-0"
              style={{ backgroundColor: '#1A1A1E', borderColor: '#1F1F23', color: '#8E8E93' }}
            >
              Browse
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs" style={{ color: '#FF453A' }}>{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded border transition"
            style={{ backgroundColor: '#1A1A1E', borderColor: '#1F1F23', color: '#8E8E93' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="text-xs px-4 py-2 rounded font-semibold transition disabled:opacity-50"
            style={{ backgroundColor: S.accent, color: '#fff' }}
          >
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
