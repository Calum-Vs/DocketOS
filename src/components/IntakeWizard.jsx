import { useState } from 'react'

const S = {
  panel: { backgroundColor: '#1C1C20', borderColor: '#34343A' },
  elevated: { backgroundColor: '#26262C', borderColor: '#34343A' },
  deeper: { backgroundColor: '#0D0D0F', borderColor: '#34343A' },
  hover: '#303038',
  text: '#F5F5F7',
  muted: '#8E8E93',
  zinc: '#52525B',
  accent: '#7A5CFF',
  accentSoft: '#B8AAFF',
}

export default function IntakeWizard({ activeProject, onClose, onImported }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  async function runImport() {
    if (!activeProject?.id || loading) return
    setLoading(true)
    try {
      const nextResult = await window.api.intakeImportFromDialog({ projectId: activeProject.id })
      if (nextResult?.canceled) return
      setResult(nextResult)
      setStep(3)
      if (nextResult?.success) await onImported?.(nextResult)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }} onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="w-[560px] rounded border shadow-2xl overflow-hidden" style={S.panel} onMouseDown={event => event.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between gap-3" style={{ borderColor: S.panel.borderColor }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: S.text }}>Incoming Package Intake</h2>
            <p className="mono mt-1" style={{ fontSize: '10px', color: S.zinc }}>{activeProject?.name ?? 'No active project'}</p>
          </div>
          <button onClick={onClose} className="mono text-xs" style={{ color: S.zinc }}>Close</button>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded border px-4 py-3" style={{ ...S.deeper, backgroundColor: '#101013' }}>
            <div className="flex items-start">
            {['Prepare', 'Select', 'Review'].map((label, index) => {
              const stepNumber = index + 1
              const active = step === stepNumber
              const complete = step > stepNumber
              const tone = active || complete ? S.accent : S.zinc
              return (
                <div key={label} className="flex flex-1 items-start last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="mono flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors"
                      style={{
                        backgroundColor: active ? S.accent : complete ? 'rgba(122,92,255,0.18)' : '#16161A',
                        borderColor: tone,
                        color: active ? '#FFFFFF' : tone,
                        boxShadow: active ? '0 0 0 4px rgba(122,92,255,0.14)' : 'none',
                      }}
                    >
                      {complete ? '✓' : stepNumber}
                    </div>
                    <p className="text-[11px] font-medium" style={{ color: active ? S.text : tone }}>{label}</p>
                  </div>
                  {index < 2 && (
                    <div className="mx-3 mt-[13px] h-px flex-1" style={{ backgroundColor: step > stepNumber ? S.accent : '#27272F' }} />
                  )}
                </div>
              )
            })}
            </div>
          </div>

          {step === 1 && (
            <div className="rounded border p-3 space-y-3" style={S.deeper}>
              <p className="text-sm" style={{ color: S.text }}>Files and folders will be copied into the active project's incoming folder, then indexed into the document register.</p>
              <div className="rounded border p-2" style={S.elevated}>
                <p className="type-overline" style={{ color: S.muted }}>Destination</p>
                <p className="mono mt-1 truncate" style={{ fontSize: '11px', color: S.text }}>{activeProject?.root_path ? `${activeProject.root_path}\\incoming` : 'No active project'}</p>
              </div>
              <button onClick={() => setStep(2)} disabled={!activeProject} className="w-full text-xs py-2 rounded border disabled:opacity-40" style={{ ...S.elevated, color: S.text }}>Continue</button>
            </div>
          )}

          {step === 2 && (
            <div className="rounded border p-3 space-y-3" style={S.deeper}>
              <p className="text-sm" style={{ color: S.text }}>Choose one or more source files or folders. Existing destination names are protected and will not be overwritten.</p>
              <button onClick={runImport} disabled={loading || !activeProject} className="w-full text-xs py-2 rounded font-semibold disabled:opacity-40" style={{ backgroundColor: S.accent, color: '#fff' }}>{loading ? 'Importing...' : 'Choose Files or Folders'}</button>
              <button onClick={() => setStep(1)} className="w-full text-xs py-2 rounded border" style={{ ...S.elevated, color: S.text }}>Back</button>
            </div>
          )}

          {step === 3 && (
            <div className="rounded border p-3 space-y-3" style={S.deeper}>
              {result?.success ? (
                <>
                  <p className="text-sm" style={{ color: '#30D158' }}>Import complete.</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded border p-2" style={S.elevated}><span style={{ color: S.zinc }}>Imported</span><p style={{ color: S.text }}>{result.importedCount}</p></div>
                    <div className="rounded border p-2" style={S.elevated}><span style={{ color: S.zinc }}>Indexed</span><p style={{ color: S.text }}>{result.indexedCount}</p></div>
                  </div>
                </>
              ) : (
                <p className="text-sm" style={{ color: '#FF453A' }}>{result?.error ?? 'Import failed'}</p>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setStep(2)} className="text-xs px-3 py-2 rounded border" style={{ ...S.elevated, color: S.text }}>Import More</button>
                <button onClick={onClose} className="text-xs px-3 py-2 rounded" style={{ backgroundColor: S.accent, color: '#fff' }}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
