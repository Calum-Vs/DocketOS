# Report Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the project report with subproject accordion layout, tasks, 12D project scan, calendar, timeline, and timesheet sections.

**Architecture:** The renderer passes `calendarNotes`, `timelineItems`, and `timesheetEntries` via IPC alongside `projectId`. `report.js` is a full rewrite — pure HTML/CSS generation from DB + filesystem + IPC payload. No new DB tables except one new query function.

**Tech Stack:** Electron 28, Node `fs`, better-sqlite3, vanilla HTML/CSS in a new BrowserWindow.

---

## Files Changed

| File | Change |
|---|---|
| `electron/db.js` | Add `listChecklistItemsForProject` export |
| `electron/main.js` | Update `report:generate` handler to destructure new IPC payload |
| `src/views/Dashboard.jsx` | Update `handleReport()` to pass `calendarNotes`, `timelineItems`, `timesheetEntries` |
| `electron/report.js` | Complete rewrite |

---

### Task 1: Add `listChecklistItemsForProject` to `electron/db.js`

**Files:**
- Modify: `electron/db.js`

- [ ] **Step 1: Add the export after the existing checklist functions**

Open `electron/db.js`. Find the `checklist_items` section (search for `getChecklistForDocument`). Add this function after the existing checklist exports:

```js
export function listChecklistItemsForProject(projectId) {
  return db.prepare(
    'SELECT * FROM checklist_items WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(projectId)
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 3: Commit**

```bash
cd c:/Project && git add DocketOS/electron/db.js && git commit -m "feat(report): add listChecklistItemsForProject query"
```

---

### Task 2: Update `report:generate` IPC handler in `electron/main.js`

**Files:**
- Modify: `electron/main.js` (around line 1094)

- [ ] **Step 1: Update the handler to destructure the new payload**

Find this block in `electron/main.js`:

```js
ipcMain.handle('report:generate', (_e, { projectId }) => {
  const reportWin = new BrowserWindow({
    width: 1100,
    height: 900,
    title: 'Project Report',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  reportWin.loadFile(tmpPath)
  return { success: true }
})
```

Replace it with:

```js
ipcMain.handle('report:generate', (_e, { projectId, calendarNotes = {}, timelineItems = [], timesheetEntries = [] }) => {
  const tmpPath = generateReport(projectId, { calendarNotes, timelineItems, timesheetEntries })
  if (!tmpPath) return { success: false, error: 'Project not found' }
  const reportWin = new BrowserWindow({
    width: 1100,
    height: 900,
    title: 'Project Report',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  reportWin.loadFile(tmpPath)
  return { success: true }
})
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
cd c:/Project && git add DocketOS/electron/main.js && git commit -m "feat(report): pass calendar/timeline/timesheet via IPC"
```

---

### Task 3: Update `handleReport()` in `src/views/Dashboard.jsx`

**Files:**
- Modify: `src/views/Dashboard.jsx` (around line 1927)

- [ ] **Step 1: Update handleReport to pass the three payloads**

Find this function in `src/views/Dashboard.jsx`:

```js
async function handleReport() {
  if (!activeProject) return
  await window.api.reportGenerate({ projectId: activeProject.id })
}
```

Replace it with:

```js
async function handleReport() {
  if (!activeProject) return
  await window.api.reportGenerate({
    projectId: activeProject.id,
    calendarNotes,
    timelineItems,
    timesheetEntries,
  })
}
```

(`calendarNotes`, `timelineItems`, and `timesheetEntries` are all already in scope as computed variables in the Dashboard component.)

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
cd c:/Project && git add DocketOS/src/views/Dashboard.jsx && git commit -m "feat(report): pass live data from renderer to report generator"
```

---

### Task 4: Rewrite `electron/report.js`

**Files:**
- Modify: `electron/report.js` (complete replacement)

- [ ] **Step 1: Replace the entire file with the new implementation**

```js
import os from 'os'
import path from 'path'
import fs from 'fs'
import { listProjects, listAllCanvases, listOutgoingLog, listProjectSubprojects, listChecklistItemsForProject } from './db.js'

const PHASE_LABELS = {
  masterplan: 'Masterplan',
  da: 'Development Application (DA)',
  opw: 'Operational Works (OPW)',
  ifc: 'Issued for Construction (IFC)',
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// --- Data helpers ---

function groupNotes(canvases) {
  const result = new Map()
  for (const row of canvases) {
    const scopeKey = row.subproject_id ?? 'project'
    if (!result.has(scopeKey)) result.set(scopeKey, new Map())
    let content = { boxes: [] }
    try { content = JSON.parse(row.content_json) } catch {}
    const boxes = (content.boxes || []).filter(b => (b.html ?? '').trim() !== '')
    if (boxes.length === 0) continue
    boxes.sort((a, b) => (a.updated_at || '').localeCompare(b.updated_at || ''))
    const phaseKey = row.phase ?? 'general'
    result.get(scopeKey).set(phaseKey, boxes)
  }
  return result
}

function scopeTransmittals(outgoing, projectRootPath, subprojects) {
  const result = new Map([['project', []]])
  for (const sp of subprojects) result.set(sp.id, [])
  for (const tx of outgoing) {
    const match = subprojects.find(sp => {
      const prefix = path.join(projectRootPath, sp.subproject_path)
      return tx.folder_path === prefix || tx.folder_path.startsWith(prefix + path.sep)
    })
    result.get(match ? match.id : 'project').push(tx)
  }
  return result
}

function scan12dProjects(dirPath, rootPath, results = []) {
  let entries
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }) } catch { return results }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const fullPath = path.join(dirPath, entry.name)
    if (entry.name.endsWith('.project')) {
      results.push({ name: entry.name.slice(0, -8), relativePath: path.relative(rootPath, fullPath) })
    } else {
      scan12dProjects(fullPath, rootPath, results)
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name))
}

function groupCalendar(calendarNotes) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const upcoming = [], recent = []
  for (const [key, entry] of Object.entries(calendarNotes ?? {})) {
    if (!entry?.note?.trim()) continue
    const [year, month, day] = key.split('-').map(Number)
    if (!year) continue
    const date = new Date(year, month - 1, day)
    if (date >= today) upcoming.push({ key, date, ...entry })
    else if (date >= thirtyDaysAgo) recent.push({ key, date, ...entry })
  }
  upcoming.sort((a, b) => a.date - b.date)
  recent.sort((a, b) => b.date - a.date)
  return { upcoming, recent }
}

function groupByDay(items, getTs) {
  const groups = new Map()
  for (const item of items ?? []) {
    const d = new Date(getTs(item))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!groups.has(key)) groups.set(key, { key, date: d, items: [] })
    groups.get(key).items.push(item)
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key))
}

// --- Renderers ---

function renderSection(heading, content) {
  return `<div class="section"><div class="section-heading">${esc(heading)}</div>${content}</div>`
}

function renderTasks(checklistItems) {
  if (!checklistItems?.length) return '<p class="muted">No tasks recorded.</p>'
  return `<ul class="task-list">${checklistItems.map(item => `
    <li class="task-item${item.done ? ' done' : ''}">
      <span class="task-check${item.done ? ' checked' : ''}"></span>${esc(item.label)}
    </li>`).join('')}</ul>`
}

function render12d(projects) {
  if (!projects.length) return '<p class="muted">No .project folders found.</p>'
  return `<div class="twelved-list">${projects.map(p => `
    <div class="twelved-row">
      <span class="twelved-name">&#128208; ${esc(p.name)}</span>
      <span class="twelved-path">${esc(p.relativePath)}</span>
    </div>`).join('')}</div>`
}

function renderCalendar({ upcoming, recent }) {
  const fmtFull = d => d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const fmtShort = d => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  const upHtml = upcoming.length
    ? upcoming.map(e => `
      <div class="cal-event">
        <span class="cal-dot" style="background:${esc(e.color)}"></span>
        <div>
          <div class="cal-event-date">${esc(fmtFull(e.date))}</div>
          <div class="cal-event-note">${esc(e.note)}</div>
        </div>
      </div>`).join('')
    : '<p class="muted">No upcoming events.</p>'

  const reHtml = recent.length
    ? recent.map(e => `
      <div class="cal-past-entry">
        <span class="cal-past-date">${esc(fmtShort(e.date))}</span>
        <div>
          <span class="cal-dot" style="background:${esc(e.color)};display:inline-block;vertical-align:middle;margin-right:5px"></span>
          <span class="cal-past-note">${esc(e.note)}</span>
        </div>
      </div>`).join('')
    : '<p class="muted">No entries in the last 30 days.</p>'

  return `<div class="calendar-grid">
    <div><div class="cal-col-label">Upcoming</div>${upHtml}</div>
    <div><div class="cal-col-label">Recent (last 30 days)</div>${reHtml}</div>
  </div>`
}

const CHANGE_COLOR = { added: '#16a34a', modified: '#d97706', deleted: '#dc2626', removed: '#dc2626' }

function renderTimeline(timelineItems) {
  const groups = groupByDay(timelineItems, item => item.ts ?? Date.now())
  if (!groups.length) return '<p class="muted">No file activity recorded this session.</p>'
  return groups.map(g => {
    const label = g.date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const rows = g.items.map(item => {
      const ct = item.changeType ?? 'existing'
      const col = CHANGE_COLOR[ct] ?? '#9ca3af'
      return `<div class="timeline-row">
        <span class="timeline-dot" style="background:${col}"></span>
        <div class="timeline-event">
          <div class="timeline-title">${esc(item.title)} <span style="font-size:11px;color:${col};font-weight:600">${esc(ct)}</span></div>
          ${item.detail ? `<div class="timeline-detail">${esc(item.detail)}</div>` : ''}
        </div>
        <span class="timeline-time">${esc(item.time ?? '')}</span>
      </div>`
    }).join('')
    return `<div class="timeline-day"><div class="timeline-day-label">${esc(label)}</div>${rows}</div>`
  }).join('')
}

function renderTimesheet(timesheetEntries) {
  const valid = (timesheetEntries ?? []).filter(e => Number(e.hours) > 0)
  const groups = groupByDay(valid, e => {
    const [y, m, d] = (e.date ?? '').split('-').map(Number)
    return y ? new Date(y, m - 1, d).getTime() : 0
  })
  if (!groups.length) return '<p class="muted">No timesheet entries recorded.</p>'
  return groups.map(g => {
    const total = g.items.reduce((s, e) => s + Number(e.hours ?? 0), 0)
    const label = g.date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return `<div class="timesheet-day">
      <div class="timesheet-day-header">
        <span class="timesheet-day-label">${esc(label)}</span>
        <span class="timesheet-day-total">${total.toFixed(1)}h</span>
      </div>
      ${g.items.map(e => `
      <div class="timesheet-entry">
        <span class="timesheet-hours">${Number(e.hours).toFixed(1)}h</span>
        <div>
          <div class="timesheet-task">${esc(e.task)}</div>
          ${e.note ? `<div class="timesheet-note">${esc(e.note)}</div>` : ''}
        </div>
      </div>`).join('')}
    </div>`
  }).join('')
}

function renderNotes(notesByPhase) {
  if (!notesByPhase?.size) return ''
  return [...notesByPhase.entries()].map(([phase, boxes]) => `
    <h4>${esc(PHASE_LABELS[phase] ?? (phase === 'general' ? 'General' : phase))}</h4>
    ${boxes.map(b => `
      <div class="note-entry">
        <div class="note-date">${esc((b.updated_at || '').slice(0, 16).replace('T', ' '))}</div>
        <div class="note-body">${b.html}</div>
      </div>`).join('')}
  `).join('')
}

function renderTransmittals(transmittals) {
  if (!transmittals?.length) return ''
  return `<table>
    <thead><tr><th>Folder</th><th>Path</th><th>Date</th></tr></thead>
    <tbody>${transmittals.map(o => `
      <tr>
        <td>${esc(o.folder_name)}</td>
        <td class="mono">${esc(o.folder_path)}</td>
        <td>${esc(o.created_at?.slice(0, 10) ?? '')}</td>
      </tr>`).join('')}
    </tbody>
  </table>`
}

function renderSpSection(label, isProjectLevel, phasePill, notesByPhase, transmittals) {
  const notesHtml = renderNotes(notesByPhase)
  const txHtml = renderTransmittals(transmittals)
  if (!notesHtml && !txHtml) return ''
  const cls = isProjectLevel ? 'section-project-level' : 'section-subproject'
  return `<div class="project-section ${cls}">
    <div class="sp-section-header${isProjectLevel ? ' project-level' : ''}">
      <h2>${esc(label)}</h2>
      ${phasePill ? `<span class="phase-pill">${esc(phasePill)}</span>` : ''}
    </div>
    ${notesHtml ? `<div class="sub-heading">Phase Notes</div>${notesHtml}` : ''}
    ${txHtml ? `<div class="sub-heading">Transmittal Log</div>${txHtml}` : ''}
  </div>`
}

// --- CSS ---

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; padding: 32px; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  h4 { font-size: 12px; font-weight: 600; margin: 10px 0 6px; color: #4f46e5; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 28px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .badge { background: #f5f3ff; color: #7c3aed; font-weight: 600; padding: 2px 8px; border-radius: 99px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12px; }
  th { text-align: left; padding: 6px 8px; background: #f3f4f6; border: 1px solid #e5e7eb; font-weight: 600; }
  td { padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .mono { font-family: 'Consolas', monospace; font-size: 11px; }
  .muted { color: #9ca3af; font-style: italic; font-size: 12px; }
  .strip-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #6b7280; margin-bottom: 10px; }
  .summary-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(175px, 1fr)); gap: 10px; margin-bottom: 28px; }
  .sp-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 14px; border-top: 3px solid #7c3aed; text-decoration: none; color: inherit; display: block; }
  .sp-card-name { font-weight: 600; font-size: 12px; color: #4c1d95; margin-bottom: 2px; }
  .sp-card-phase { font-size: 11px; color: #7c3aed; margin-bottom: 8px; }
  .sp-card-counts { display: flex; gap: 10px; font-size: 11px; color: #6b7280; }
  .section { margin-bottom: 28px; }
  .section-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; }
  .task-list { list-style: none; display: flex; flex-direction: column; gap: 5px; }
  .task-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #374151; }
  .task-item.done { color: #9ca3af; text-decoration: line-through; }
  .task-check { width: 14px; height: 14px; border: 2px solid #d1d5db; border-radius: 3px; flex-shrink: 0; }
  .task-check.checked { background: #7c3aed; border-color: #7c3aed; }
  .twelved-list { display: flex; flex-direction: column; gap: 4px; }
  .twelved-row { display: grid; grid-template-columns: 240px 1fr; gap: 12px; align-items: center; padding: 7px 10px; border-radius: 4px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 12px; }
  .twelved-name { font-weight: 600; color: #374151; }
  .twelved-path { font-family: monospace; font-size: 11px; color: #9ca3af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .calendar-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .cal-col-label { font-size: 11px; font-weight: 600; color: #374151; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .05em; }
  .cal-event { display: flex; align-items: flex-start; gap: 10px; padding: 7px 10px; border-radius: 5px; background: #f9fafb; border: 1px solid #e5e7eb; margin-bottom: 6px; }
  .cal-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
  .cal-event-date { font-size: 11px; font-weight: 600; color: #374151; }
  .cal-event-note { font-size: 12px; color: #6b7280; margin-top: 1px; }
  .cal-past-entry { display: flex; align-items: flex-start; gap: 10px; padding: 5px 0; border-bottom: 1px solid #f3f4f6; }
  .cal-past-date { font-size: 11px; color: #9ca3af; width: 90px; flex-shrink: 0; padding-top: 2px; }
  .cal-past-note { font-size: 12px; color: #374151; }
  .timeline-day { margin-bottom: 14px; }
  .timeline-day-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #9ca3af; margin-bottom: 6px; }
  .timeline-row { display: flex; align-items: flex-start; gap: 10px; padding: 5px 0; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
  .timeline-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .timeline-event { flex: 1; }
  .timeline-title { font-weight: 500; color: #374151; }
  .timeline-detail { font-size: 11px; color: #9ca3af; font-family: monospace; margin-top: 1px; }
  .timeline-time { font-size: 11px; color: #9ca3af; white-space: nowrap; }
  .timesheet-day { margin-bottom: 16px; }
  .timesheet-day-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .timesheet-day-label { font-size: 12px; font-weight: 600; color: #374151; }
  .timesheet-day-total { font-size: 11px; color: #7c3aed; font-weight: 600; }
  .timesheet-entry { display: grid; grid-template-columns: 52px 1fr; gap: 8px; align-items: start; padding: 5px 0; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
  .timesheet-hours { color: #7c3aed; font-weight: 700; font-size: 13px; }
  .timesheet-task { color: #374151; font-weight: 500; }
  .timesheet-note { color: #9ca3af; font-size: 11px; margin-top: 2px; }
  .project-section { margin-bottom: 0; }
  .sp-section-header { background: #f5f3ff; border-left: 5px solid #7c3aed; padding: 10px 14px; margin-bottom: 16px; border-radius: 0 4px 4px 0; display: flex; align-items: baseline; gap: 10px; }
  .sp-section-header h2 { font-size: 15px; font-weight: 700; color: #4c1d95; }
  .phase-pill { font-size: 10px; background: #ede9fe; color: #6d28d9; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
  .sp-section-header.project-level { background: #f9fafb; border-left-color: #9ca3af; }
  .sp-section-header.project-level h2 { color: #374151; }
  .sub-heading { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; margin: 16px 0 8px; }
  .note-entry { border-left: 3px solid #7c3aed; background: #faf5ff; padding: 9px 12px; border-radius: 0 4px 4px 0; margin-bottom: 8px; }
  .note-date { font-size: 10px; color: #7c3aed; font-weight: 600; margin-bottom: 4px; }
  .note-body { line-height: 1.6; }
  .note-body ul, .note-body ol { margin-left: 18px; }
  .sp-divider { border: none; border-top: 2px dashed #e5e7eb; margin: 32px 0; }
  @media print { body { padding: 16px; } .project-section { page-break-inside: avoid; } }
`

// --- Entry point ---

export function generateReport(projectId, { calendarNotes = {}, timelineItems = [], timesheetEntries = [] } = {}) {
  const projects = listProjects()
  const project = projects.find(p => p.id === projectId)
  if (!project) return null

  const canvases = listAllCanvases(projectId)
  const outgoing = listOutgoingLog(projectId)
  const subprojects = listProjectSubprojects(projectId)
  const checklistItems = listChecklistItemsForProject(projectId)

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })

  const notesByScope = groupNotes(canvases)
  const transmittalsByScope = scopeTransmittals(outgoing, project.root_path, subprojects)
  const twelvedProjects = scan12dProjects(project.root_path, project.root_path)
  const calendarGroups = groupCalendar(calendarNotes)

  const noteCount = spId => {
    const scope = notesByScope.get(spId)
    return scope ? [...scope.values()].reduce((s, boxes) => s + boxes.length, 0) : 0
  }
  const txCount = spId => (transmittalsByScope.get(spId) ?? []).length

  const spStripHtml = subprojects.map(sp => `
    <a class="sp-card" href="#sp-${esc(sp.id)}">
      <div class="sp-card-name">${esc(sp.display_name)}</div>
      <div class="sp-card-phase">${esc(PHASE_LABELS[sp.current_phase] ?? sp.current_phase ?? '')}</div>
      <div class="sp-card-counts"><span>${noteCount(sp.id)} notes</span><span>${txCount(sp.id)} sent</span></div>
    </a>`).join('')

  const spSections = subprojects
    .map(sp => {
      const html = renderSpSection(
        sp.display_name, false,
        PHASE_LABELS[sp.current_phase] ?? sp.current_phase ?? '',
        notesByScope.get(sp.id),
        transmittalsByScope.get(sp.id),
      )
      return html ? `<div id="sp-${esc(sp.id)}">${html}</div>` : ''
    })
    .filter(Boolean)
    .join('<hr class="sp-divider">')

  const projectLevel = renderSpSection(
    'Project-level', true, '',
    notesByScope.get('project'),
    transmittalsByScope.get('project'),
  )

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Project Report — ${esc(project.name)}</title>
  <style>${CSS}</style>
</head>
<body>
  <h1>${esc(project.name)}</h1>
  <div class="meta">
    ${project.description ? `${esc(project.description)} <span>·</span>` : ''}
    <span class="badge">${esc(PHASE_LABELS[project.current_phase] ?? project.current_phase ?? 'No phase')}</span>
    <span>·</span>
    <span class="mono">${esc(project.root_path)}</span>
    <span>·</span>
    <span>Generated: ${dateStr}</span>
  </div>

  <div class="strip-label">Active Subprojects</div>
  <div class="summary-strip">${spStripHtml}</div>

  ${renderSection('Project Tasks', renderTasks(checklistItems))}
  ${renderSection(`12D Projects (${twelvedProjects.length} found)`, render12d(twelvedProjects))}
  ${renderSection('Calendar', renderCalendar(calendarGroups))}
  ${renderSection('Project Timeline', renderTimeline(timelineItems))}
  ${renderSection('Project Timesheet', renderTimesheet(timesheetEntries))}

  <hr class="sp-divider">

  ${spSections}
  ${spSections && projectLevel ? '<hr class="sp-divider">' : ''}
  ${projectLevel}
</body>
</html>`

  const tmpPath = path.join(os.tmpdir(), `project-report-${projectId}.html`)
  fs.writeFileSync(tmpPath, html, 'utf-8')
  return tmpPath
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 3: Commit**

```bash
cd c:/Project && git add DocketOS/electron/report.js && git commit -m "feat(report): overhaul — subproject accordion, tasks, 12D, calendar, timeline, timesheet"
```

---

### Task 5: Run and verify

- [ ] **Step 1: Start the app in dev mode**

```bash
npm run dev
```

- [ ] **Step 2: Open a project and click Print Report**

Expected: a new window opens showing the full report with all sections populated.

Verify:
- Subproject summary strip cards appear and scroll-link to sections below
- Project Tasks section shows checklist items with checkboxes
- 12D Projects section lists any `.project` folders (or shows "No .project folders found")
- Calendar shows upcoming events and recent entries
- Project Timeline shows file activity (or "No file activity recorded this session" if none yet)
- Project Timesheet shows time entries grouped by day (or "No timesheet entries recorded")
- Each subproject section shows its notes in full (rich HTML) and transmittal log
- Project-level notes appear at the bottom if they exist

- [ ] **Step 3: Final commit if any fixups were needed**

```bash
cd c:/Project && git add -p DocketOS/ && git commit -m "fix(report): post-run fixups"
```
