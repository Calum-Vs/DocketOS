import { useEffect, useState } from 'react'
import Dashboard from './views/Dashboard.jsx'
import Settings from './views/Settings.jsx'
import DocumentControlWindow from './views/DocumentControlWindow.jsx'
import TimesheetPopout from './views/TimesheetPopout.jsx'

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const windowMode = params.get('window')
  const [view, setView] = useState('dashboard')

  useEffect(() => {
    return window.api.on('settings:openBackend', () => setView('settings'))
  }, [])

  if (windowMode === 'document-control') return <DocumentControlWindow />
  if (windowMode === 'timesheet-popout') return <TimesheetPopout />
  if (windowMode === 'dashboard-box') {
    return (
      <Dashboard
        onOpenSettings={() => {}}
        popoutBoxKey={params.get('boxKey')}
        popoutSlotIndex={params.get('slotIndex')}
        initialProjectId={params.get('projectId')}
      />
    )
  }

  return view === 'settings'
    ? <Settings onBack={() => setView('dashboard')} />
    : <Dashboard onOpenSettings={() => setView('settings')} />
}
