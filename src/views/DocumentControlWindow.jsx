import { useEffect, useState } from 'react'
import DocumentControlPanel from '../components/DocumentControlPanel.jsx'

const S = {
  panel: { backgroundColor: '#121214', borderColor: '#1F1F23' },
  text: '#F5F5F7',
  muted: '#8E8E93',
  dim: '#3F3F46',
  accent: '#7A5CFF',
}

export default function DocumentControlWindow() {
  const [activeProject, setActiveProject] = useState(null)

  useEffect(() => {
    window.api.projectsGetActive().then(setActiveProject)
    const unsubscribe = window.api.on('projects:activeChanged', project => setActiveProject(project))
    return unsubscribe
  }, [])

  if (!activeProject) {
    return (
      <div className="h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#080809', color: S.text }}>
        <div className="rounded border p-5 text-center max-w-md" style={S.panel}>
          <h1 className="mono text-xs uppercase tracking-widest" style={{ color: S.muted }}>Document Control</h1>
          <p className="mt-3 text-sm" style={{ color: S.text }}>No active project is selected.</p>
          <p className="mono mt-2 text-xs" style={{ color: S.dim }}>Select a project in the main DocketOS window, then open Documents again.</p>
          <button
            onClick={() => window.api.documentsCloseWindow()}
            className="mt-4 rounded border px-3 py-1.5 text-xs font-medium"
            style={{ backgroundColor: '#1A1A1E', borderColor: S.panel.borderColor, color: S.text }}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return <DocumentControlPanel activeProject={activeProject} variant="window" />
}