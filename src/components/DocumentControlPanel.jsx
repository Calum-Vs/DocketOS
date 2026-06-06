import { useEffect, useMemo, useState } from 'react'
import IntakeWizard from './IntakeWizard.jsx'

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

function formatBytes(value) {
  const bytes = Number(value ?? 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value) {
  if (!value) return 'Unknown'
  try { return new Date(value).toLocaleString() } catch { return 'Unknown' }
}

function parseJson(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback } catch { return fallback }
}

function Inspector({ document, revisions, comments, checklist, standards, brief, onOpen, onExtract, onCommentCreate, onCommentResolve, onChecklistToggle, onGenerateBrief, onRunStandards }) {
  const [commentBody, setCommentBody] = useState('')

  if (!document) {
    return (
      <div className="h-full rounded border p-3 flex items-center justify-center text-center" style={S.deeper}>
        <p className="mono text-xs" style={{ color: S.dim }}>Select a register row to inspect QA state, revisions, comments, and project context.</p>
      </div>
    )
  }

  const metadata = parseJson(document.metadata)

  return (
    <div className="h-full rounded border flex flex-col overflow-hidden" style={S.deeper}>
      <div className="p-3 border-b" style={{ borderColor: S.panel.borderColor }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate" style={{ color: S.text }}>{document.name}</h3>
            <p className="mono mt-1 truncate" style={{ fontSize: '10px', color: S.zinc }}>{document.relative_path}</p>
          </div>
          <button onClick={() => onOpen(document)} className="mono text-[10px] px-2 py-1 rounded border" style={{ ...S.elevated, color: S.text }}>Open</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        <section className="rounded border p-2" style={S.panel}>
          <p className="type-overline mb-2" style={{ color: S.muted }}>File Inspector</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span style={{ color: S.zinc }}>Status</span><p style={{ color: S.text }}>{document.status}</p></div>
            <div><span style={{ color: S.zinc }}>Revision</span><p style={{ color: S.text }}>{document.revision || 'None'}</p></div>
            <div><span style={{ color: S.zinc }}>Size</span><p style={{ color: S.text }}>{formatBytes(document.size_bytes)}</p></div>
            <div><span style={{ color: S.zinc }}>Modified</span><p style={{ color: S.text }}>{formatDate(document.mtime)}</p></div>
            <div><span style={{ color: S.zinc }}>Family</span><p className="truncate" style={{ color: S.text }}>{document.family_key}</p></div>
            <div><span style={{ color: S.zinc }}>Type</span><p style={{ color: S.text }}>{document.ext || 'file'}</p></div>
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => onExtract(document)} className="mono text-[10px] px-2 py-1 rounded border" style={{ ...S.elevated, color: S.text }}>Extract Text</button>
            <span className="mono text-[10px] py-1" style={{ color: S.zinc }}>{revisions.length} revision record{revisions.length === 1 ? '' : 's'}</span>
          </div>
          {metadata.importedFrom && <p className="mono mt-2 truncate" style={{ fontSize: '10px', color: S.zinc }}>Imported from {metadata.importedFrom}</p>}
        </section>

        <section className="rounded border p-2" style={S.panel}>
          <p className="type-overline mb-2" style={{ color: S.muted }}>Revision History</p>
          <div className="space-y-1">
            {revisions.slice(0, 5).map(revision => (
              <div key={revision.id} className="rounded border p-2" style={S.elevated}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs" style={{ color: S.text }}>{revision.revision || 'No revision'}</span>
                  <span className="mono text-[10px]" style={{ color: S.zinc }}>{formatBytes(revision.size_bytes)}</span>
                </div>
                <p className="mono mt-1 truncate" style={{ fontSize: '10px', color: S.zinc }}>{formatDate(revision.mtime)}</p>
              </div>
            ))}
            {revisions.length === 0 && <p className="mono text-xs" style={{ color: S.dim }}>No revision history yet.</p>}
          </div>
        </section>

        <section className="rounded border p-2" style={S.panel}>
          <div className="flex items-center justify-between mb-2">
            <p className="type-overline" style={{ color: S.muted }}>QA Checklist</p>
            <span className="mono text-[10px]" style={{ color: S.zinc }}>{checklist.filter(i => i.done).length}/{checklist.length}</span>
          </div>
          <div className="space-y-1">
            {checklist.map(item => (
              <button key={item.id} onClick={() => onChecklistToggle(item)} className="w-full flex items-center gap-2 text-left text-xs p-1.5 rounded" style={S.elevated}>
                <span className="mono" style={{ color: item.done ? '#30D158' : S.zinc }}>{item.done ? '✓' : '○'}</span>
                <span style={{ color: item.done ? S.zinc : S.text }}>{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded border p-2" style={S.panel}>
          <div className="flex items-center justify-between mb-2">
            <p className="type-overline" style={{ color: S.muted }}>Review Comments</p>
            <span className="mono text-[10px]" style={{ color: S.zinc }}>{comments.filter(c => c.status !== 'closed').length} open</span>
          </div>
          <div className="space-y-2">
            {comments.map(comment => (
              <div key={comment.id} className="rounded border p-2" style={S.elevated}>
                <div className="flex items-center justify-between gap-2">
                  <span className="mono text-[10px]" style={{ color: comment.status === 'closed' ? '#30D158' : '#FF9F0A' }}>{comment.status}</span>
                  {comment.status !== 'closed' && <button onClick={() => onCommentResolve(comment)} className="mono text-[10px]" style={{ color: S.zinc }}>Close</button>}
                </div>
                <p className="text-xs mt-1" style={{ color: S.text }}>{comment.body}</p>
              </div>
            ))}
            {comments.length === 0 && <p className="mono text-xs" style={{ color: S.dim }}>No comments yet.</p>}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={commentBody} onChange={event => setCommentBody(event.target.value)} onKeyDown={event => {
              if (event.key === 'Enter' && commentBody.trim()) {
                onCommentCreate(commentBody.trim())
                setCommentBody('')
              }
            }} placeholder="Add review comment" className="flex-1 rounded border text-xs outline-none" style={{ backgroundColor: '#26262C', borderColor: S.panel.borderColor, color: S.text, padding: '6px 8px' }} />
            <button onClick={() => { if (commentBody.trim()) { onCommentCreate(commentBody.trim()); setCommentBody('') } }} disabled={!commentBody.trim()} className="text-xs px-2 rounded border disabled:opacity-40" style={{ ...S.elevated, color: S.text }}>Add</button>
          </div>
        </section>

        <section className="rounded border p-2" style={S.panel}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="type-overline" style={{ color: S.muted }}>Standards + Brief</p>
            <div className="flex gap-1">
              <button onClick={onRunStandards} className="mono text-[10px] px-2 py-1 rounded border" style={{ ...S.elevated, color: S.text }}>Check</button>
              <button onClick={onGenerateBrief} className="mono text-[10px] px-2 py-1 rounded border" style={{ ...S.elevated, color: S.text }}>Brief</button>
            </div>
          </div>
          {standards.length > 0 ? standards.slice(0, 3).map(item => (
            <p key={item.id} className="text-xs mb-1" style={{ color: item.passed ? '#30D158' : '#FF9F0A' }}>{item.passed ? 'Pass' : 'Review'}: {item.title}</p>
          )) : <p className="mono text-xs" style={{ color: S.dim }}>No standards check run.</p>}
          {brief && <p className="mono mt-2 text-[10px]" style={{ color: S.zinc }}>Latest brief generated {formatDate(brief.generated_at)}</p>}
        </section>
      </div>
    </div>
  )
}

export default function DocumentControlPanel({ activeProject, variant = 'embedded' }) {
  const [documents, setDocuments] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [savedViews, setSavedViews] = useState([])
  const [revisions, setRevisions] = useState([])
  const [comments, setComments] = useState([])
  const [checklist, setChecklist] = useState([])
  const [standards, setStandards] = useState([])
  const [brief, setBrief] = useState(null)
  const [toast, setToast] = useState(null)
  const [showIntakeWizard, setShowIntakeWizard] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const selectedDocument = useMemo(
    () => documents.find(document => document.id === selectedId) ?? documents[0] ?? null,
    [documents, selectedId]
  )

  async function refreshDocuments() {
    if (!activeProject?.id) return
    const result = await window.api.documentsList({ projectId: activeProject.id })
    setDocuments(result?.documents ?? [])
    if (!selectedId && result?.documents?.length) setSelectedId(result.documents[0].id)
  }

  async function refreshSavedViews() {
    if (!activeProject?.id) return
    const result = await window.api.savedViewsList({ projectId: activeProject.id })
    setSavedViews(result?.views ?? [])
  }

  async function refreshContext(documentId = selectedDocument?.id) {
    if (!activeProject?.id || !documentId) return
    const [nextDocument, nextComments, nextChecklist, nextBrief] = await Promise.all([
      window.api.documentsGet({ id: documentId }),
      window.api.commentsList({ projectId: activeProject.id, documentId }),
      window.api.checklistsGetForDocument({ projectId: activeProject.id, documentId }),
      window.api.briefsLatest({ projectId: activeProject.id }),
    ])
    setRevisions(nextDocument?.revisions ?? [])
    setComments(nextComments?.comments ?? [])
    setChecklist(nextChecklist?.items ?? [])
    setBrief(nextBrief?.brief ?? null)
  }

  useEffect(() => {
    setSelectedId(null)
    setSearchResults([])
    setComments([])
    setChecklist([])
    setRevisions([])
    setStandards([])
    setBrief(null)
    refreshDocuments()
    refreshSavedViews()
  }, [activeProject?.id])

  useEffect(() => {
    const unsubscribe = window.api.on('documents:changed', payload => {
      if (payload?.projectId !== activeProject?.id) return
      refreshDocuments()
      refreshContext(selectedDocument?.id)
    })
    return unsubscribe
  }, [activeProject?.id, selectedDocument?.id])

  useEffect(() => { refreshContext(selectedDocument?.id) }, [selectedDocument?.id])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!activeProject?.id || !query.trim()) {
        setSearchResults([])
        return
      }
      const result = await window.api.searchQuery({ projectId: activeProject.id, query: query.trim(), limit: 20 })
      setSearchResults(result?.results ?? [])
    }, 200)
    return () => clearTimeout(timer)
  }, [activeProject?.id, query])

  async function indexNow() {
    if (!activeProject?.id) return
    const result = await window.api.documentsIndexProject({ projectId: activeProject.id })
    setToast(result?.success ? `Indexed ${result.count} files` : result?.error ?? 'Index failed')
    await refreshDocuments()
  }

  async function importFiles() {
    setShowIntakeWizard(true)
  }

  async function importDroppedFiles(event) {
    event.preventDefault()
    setIsDragOver(false)
    if (!activeProject?.id) return
    const paths = Array.from(event.dataTransfer?.files ?? []).map(file => file.path).filter(Boolean)
    if (paths.length === 0) {
      setToast('Drop import could not read local paths. Use Import instead.')
      return
    }
    const result = await window.api.intakeImportPaths({ projectId: activeProject.id, paths })
    if (result?.success) {
      setToast(`Imported ${result.importedCount} dropped item${result.importedCount === 1 ? '' : 's'}`)
      await refreshDocuments()
    } else {
      setToast(result?.error ?? 'Drop import failed')
    }
  }

  async function exportProject() {
    if (!activeProject?.id) return
    const result = await window.api.backupCreate({ projectId: activeProject.id })
    setToast(result?.success ? `Exported to ${result.path}` : result?.error ?? 'Export failed')
  }

  async function saveView() {
    if (!activeProject?.id) return
    const name = query.trim() ? `Search: ${query.trim()}` : 'Document Register'
    const result = await window.api.savedViewsUpsert({
      projectId: activeProject.id,
      name,
      viewType: 'document-register',
      config: { query, selectedId },
    })
    setToast(result?.success ? `Saved view: ${name}` : result?.error ?? 'Could not save view')
    await refreshSavedViews()
  }

  function applySavedView(view) {
    const config = parseJson(view.config_json)
    setQuery(config.query ?? '')
    if (config.selectedId) setSelectedId(config.selectedId)
    setToast(`Applied view: ${view.name}`)
  }

  async function extractSelectedDocument(document) {
    if (!activeProject?.id || !document?.id) return
    const result = await window.api.extractionExtractDocument({ projectId: activeProject.id, documentId: document.id })
    setToast(result?.success ? `Extracted ${result.characters} characters` : result?.error ?? 'Extraction failed')
  }

  async function createComment(body) {
    if (!activeProject?.id || !selectedDocument?.id) return
    await window.api.commentsCreate({ projectId: activeProject.id, documentId: selectedDocument.id, body })
    await refreshContext(selectedDocument.id)
  }

  async function resolveComment(comment) {
    await window.api.commentsResolve({ id: comment.id })
    await refreshContext(selectedDocument?.id)
  }

  async function toggleChecklist(item) {
    await window.api.checklistsToggleItem({ id: item.id, done: !item.done })
    await refreshContext(selectedDocument?.id)
  }

  async function runStandards() {
    if (!activeProject?.id || !selectedDocument?.id) return
    const result = await window.api.standardsCheckDocument({ projectId: activeProject.id, documentId: selectedDocument.id })
    setStandards(result?.results ?? [])
  }

  async function generateBrief() {
    if (!activeProject?.id) return
    const result = await window.api.briefsGenerate({ projectId: activeProject.id })
    if (result?.brief) setBrief(result.brief)
    setToast(result?.success ? 'Project brief generated' : result?.error ?? 'Brief failed')
  }

  const rows = query.trim()
    ? searchResults.map(result => ({
        result,
        document: documents.find(document => document.id === (result.document_id ?? result.source_id)) ?? null,
      }))
    : documents.map(document => ({ result: null, document }))
  const isWindow = variant === 'window'

  return (
    <section
      className={isWindow ? 'h-screen flex flex-col relative' : 'border-t border-b shrink-0 relative'}
      style={{ ...S.panel, borderColor: isDragOver ? S.accent : S.panel.borderColor }}
      onDragOver={event => {
        event.preventDefault()
        if (activeProject) setIsDragOver(true)
      }}
      onDragLeave={event => {
        if (event.currentTarget.contains(event.relatedTarget)) return
        setIsDragOver(false)
      }}
      onDrop={importDroppedFiles}
    >
      {isDragOver && (
        <div className="absolute inset-2 z-20 rounded border flex items-center justify-center pointer-events-none" style={{ backgroundColor: 'rgba(13,13,15,0.86)', borderColor: S.accent }}>
          <p className="mono text-xs" style={{ color: S.text }}>Drop files or folders to intake</p>
        </div>
      )}
      <div className="p-3 flex items-center justify-between gap-3 border-b shrink-0" style={{ borderColor: S.panel.borderColor }}>
        <div>
          <h2 className="type-panel-title" style={{ color: S.muted }}>Document Control</h2>
          <p className="mono mt-1" style={{ fontSize: '10px', color: S.dim }}>Register, revision detection, QA comments, search, import, and local export.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value="" onChange={event => {
            const view = savedViews.find(item => item.id === event.target.value)
            if (view) applySavedView(view)
          }} disabled={!savedViews.length} className="rounded border mono text-[10px] outline-none disabled:opacity-40" style={{ backgroundColor: '#26262C', borderColor: S.panel.borderColor, color: S.text, padding: '4px 6px' }}>
            <option value="">Views</option>
            {savedViews.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
          </select>
          <button onClick={indexNow} disabled={!activeProject} className="mono text-[10px] px-2 py-1 rounded border disabled:opacity-40" style={{ ...S.elevated, color: S.text }}>Index</button>
          <button onClick={importFiles} disabled={!activeProject} className="mono text-[10px] px-2 py-1 rounded border disabled:opacity-40" style={{ ...S.elevated, color: S.text }}>Import</button>
          <button onClick={saveView} disabled={!activeProject} className="mono text-[10px] px-2 py-1 rounded border disabled:opacity-40" style={{ ...S.elevated, color: S.text }}>Save View</button>
          <button onClick={exportProject} disabled={!activeProject} className="mono text-[10px] px-2 py-1 rounded border disabled:opacity-40" style={{ ...S.elevated, color: S.text }}>Export</button>
        </div>
      </div>

      <div className="p-3 grid grid-cols-[minmax(360px,1fr)_320px] gap-3 flex-1 min-h-0" style={isWindow ? {} : { height: '360px' }}>
        <div className="rounded border flex flex-col min-w-0 overflow-hidden" style={S.deeper}>
          <div className="p-2 border-b flex items-center gap-2" style={{ borderColor: S.panel.borderColor }}>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search register, comments, extracted text" className="flex-1 rounded border text-xs outline-none" style={{ backgroundColor: '#26262C', borderColor: S.panel.borderColor, color: S.text, padding: '7px 10px' }} />
            <span className="mono text-[10px]" style={{ color: S.zinc }}>{rows.length}/{documents.length}</span>
          </div>
          <div className="grid grid-cols-[1.6fr_80px_90px_90px_90px] gap-2 px-3 py-2 border-b type-overline" style={{ borderColor: S.panel.borderColor, color: S.muted }}>
            <span>Name</span><span>Rev</span><span>Status</span><span>Size</span><span>Modified</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {rows.map(({ result, document }) => {
              const rowId = document?.id ?? result?.source_id
              const selected = document && selectedDocument?.id === document.id
              const typeLabel = result?.source_type ? result.source_type.replace('_', ' ') : document?.status
              return (
                <button key={`${result?.source_type ?? 'document'}:${rowId}`} onClick={() => document?.id && setSelectedId(document.id)} className="w-full grid grid-cols-[1.6fr_80px_90px_90px_90px] gap-2 px-3 py-2 text-left border-b transition" style={{ backgroundColor: selected ? '#26262C' : '#0D0D0F', borderColor: S.panel.borderColor, color: S.text }}>
                  <span className="min-w-0">
                    <span className="block text-xs truncate">{document?.name ?? result?.title ?? 'Search result'}</span>
                    <span className="block mono text-[10px] truncate" style={{ color: S.zinc }}>{result?.excerpt ?? document?.relative_path ?? 'No linked document'}</span>
                  </span>
                  <span className="text-xs truncate" style={{ color: S.zinc }}>{document?.revision || '-'}</span>
                  <span className="text-xs truncate" style={{ color: document?.status === 'issued' ? '#30D158' : S.zinc }}>{typeLabel}</span>
                  <span className="text-xs truncate" style={{ color: S.zinc }}>{document ? formatBytes(document.size_bytes) : '-'}</span>
                  <span className="text-xs truncate" style={{ color: S.zinc }}>{document ? formatDate(document.mtime) : '-'}</span>
                </button>
              )
            })}
            {rows.length === 0 && <p className="mono text-xs p-4" style={{ color: S.dim }}>{query.trim() ? 'No matching documents, comments, briefs, or extracted text.' : 'No indexed documents yet. Use Index or Import to populate the register.'}</p>}
          </div>
        </div>

        <Inspector
          document={selectedDocument}
          revisions={revisions}
          comments={comments}
          checklist={checklist}
          standards={standards}
          brief={brief}
          onOpen={document => window.api.fsOpenInExplorer({ dirPath: document.full_path })}
          onExtract={extractSelectedDocument}
          onCommentCreate={createComment}
          onCommentResolve={resolveComment}
          onChecklistToggle={toggleChecklist}
          onGenerateBrief={generateBrief}
          onRunStandards={runStandards}
        />
      </div>

      {toast && (
        <div className="px-3 pb-3 flex justify-between gap-3">
          <p className="mono text-[10px] truncate" style={{ color: S.zinc }}>{toast}</p>
          <button onClick={() => setToast(null)} className="mono text-[10px]" style={{ color: S.zinc }}>Dismiss</button>
        </div>
      )}

      {showIntakeWizard && (
        <IntakeWizard
          activeProject={activeProject}
          onClose={() => setShowIntakeWizard(false)}
          onImported={async result => {
            setToast(`Imported ${result.importedCount} files`)
            await refreshDocuments()
          }}
        />
      )}
    </section>
  )
}
