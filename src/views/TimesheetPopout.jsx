import { useEffect, useState, useRef } from 'react'

function getTimesheetElapsedMs(timer, nowMs = Date.now()) {
  const startedMs = new Date(timer?.startedAt ?? '').getTime()
  if (!Number.isFinite(startedMs)) return 0
  return Math.max(0, nowMs - startedMs)
}

function formatTimesheetElapsed(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatCalendarDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function readTimer() {
  try { return JSON.parse(window.localStorage.getItem('docketos.timesheetTimer')) } catch { return null }
}
function readEntries() {
  try { return JSON.parse(window.localStorage.getItem('docketos.timesheetEntries')) ?? [] } catch { return [] }
}

const ACCENT = '#7A5CFF'

const btn = {
  background: '#1C1C20',
  border: '1px solid #34343A',
  borderRadius: 4,
  color: '#71717A',
  fontSize: 10,
  fontFamily: 'monospace',
  cursor: 'pointer',
  padding: '4px 8px',
  WebkitAppRegion: 'no-drag',
}

export default function TimesheetPopout() {
  const [timer, setTimer] = useState(readTimer)
  const [nowMs, setNowMs] = useState(Date.now)
  const bcRef = useRef(null)

  useEffect(() => {
    bcRef.current = new BroadcastChannel('docketos.timesheet')
    return () => bcRef.current?.close()
  }, [])

  useEffect(() => {
    if (!timer?.startedAt) return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [timer])

  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'docketos.timesheetTimer') {
        try { setTimer(JSON.parse(e.newValue)) } catch { setTimer(null) }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function endTimer() {
    if (!timer) return
    const endedAt = new Date()
    const elapsedMs = getTimesheetElapsedMs(timer, endedAt.getTime())
    const hours = Math.max(0.01, Math.round((elapsedMs / 3600000) * 100) / 100)
    const entry = {
      id: crypto.randomUUID(),
      date: timer.date || formatCalendarDateKey(endedAt),
      projectId: timer.projectId,
      projectName: timer.projectName,
      task: String(timer.task ?? '').trim(),
      hours,
      note: String(timer.note ?? '').trim(),
      startTime: timer.startedAt,
      endTime: endedAt.toISOString(),
    }
    if (!entry.task) return
    const entries = readEntries()
    window.localStorage.setItem('docketos.timesheetEntries', JSON.stringify([entry, ...entries]))
    window.localStorage.setItem('docketos.timesheetTimer', JSON.stringify(null))
    setTimer(null)
  }

  function cancelTimer() {
    window.localStorage.setItem('docketos.timesheetTimer', JSON.stringify(null))
    setTimer(null)
  }

  const elapsed = timer ? getTimesheetElapsedMs(timer, nowMs) : 0

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#111114', color: '#D4D4D8', overflow: 'hidden',
    }}>
      {/* Header — OS drag region */}
      <div style={{
        WebkitAppRegion: 'drag',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', background: '#0D0D0F',
        borderBottom: '1px solid #26262C', flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#52525B', letterSpacing: '0.06em' }}>
          TIMESHEET
        </span>
        <div style={{ WebkitAppRegion: 'no-drag', display: 'flex', gap: 4 }}>
          <button
            onClick={() => { bcRef.current?.postMessage({ type: 'open-drawer' }); window.close() }}
            style={btn}
            title="Open in drawer"
          >⤢</button>
          <button onClick={() => window.close()} style={btn}>✕</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
        {timer ? (
          <div style={{
            border: '1px solid rgba(122,92,255,0.4)', borderRadius: 6,
            padding: '10px 12px', background: '#161420',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PulseDot />
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {timer.projectName || 'No project'}
              </span>
            </div>
            <p style={{ fontFamily: 'sans-serif', fontSize: 12, fontWeight: 600, color: '#F4F4F5', margin: 0, overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.3 }}>
              {timer.task}
            </p>
            <p style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: ACCENT, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {formatTimesheetElapsed(elapsed)}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={endTimer} style={{ ...btn, flex: 1, background: ACCENT, borderColor: ACCENT, color: '#fff', padding: '5px 0', fontSize: 11 }}>
                End
              </button>
              <button onClick={cancelTimer} style={{ ...btn, padding: '5px 10px' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <p style={{ fontFamily: 'monospace', fontSize: 10, color: '#3F3F46', margin: 0 }}>No timer running</p>
          </div>
        )}
      </div>
    </div>
  )
}

function PulseDot() {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const id = setInterval(() => setOn(v => !v), 900)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{
      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
      background: on ? ACCENT : 'transparent',
      border: `1px solid ${ACCENT}`,
      transition: 'background 0.3s',
      display: 'inline-block',
    }} />
  )
}
