# Report Overhaul

**Date:** 2026-05-30  
**Status:** Approved for implementation  
**Supersedes:** `2026-05-29-print-report-redesign.md`

## Overview

Full overhaul of `electron/report.js`. The report opens in a new Electron `BrowserWindow` (already implemented). This spec covers the content, layout, and data flow of the generated HTML.

## Final Section Order

```
1.  Project header           — name, description, phase, root path, generated date
2.  Active subproject strip  — compact cards, one per subproject, link-anchored to detail below
3.  Project Tasks            — checklist_items from DB (project-scoped)
4.  12D Projects             — *.project folders found by recursive fs scan of project root
5.  Calendar                 — upcoming events + last-30-days entries (from renderer localStorage)
6.  Project Timeline         — file add/modify/delete events from current session (from renderer state)
7.  Project Timesheet        — time entries grouped by day (from renderer localStorage)
    ── dashed divider ───────────────────────────────────────────────────────────────────
8.  Subproject sections      — one per subproject (ordered by display_name ASC):
      • Phase Notes (all, rich HTML rendered directly, no escaping)
      • Transmittal Log (scoped by folder path prefix)
9.  Project-level section    — notes and transmittals with no subproject scope
```

Subproject sections omitted if they have zero notes AND zero transmittals.  
QA Audit Results section removed.  
File Inventory section removed.

---

## Data Sources

| Section | Source | How |
|---|---|---|
| Project header | `projects` DB table | `listProjects()` |
| Subproject strip | `project_subprojects` DB table | `listProjectSubprojects()` |
| Project Tasks | `checklist_items` DB table | new `listChecklistItemsForProject(projectId)` query |
| 12D Projects | Filesystem | recursive `fs.readdirSync` scan for folders ending in `.project` |
| Calendar | renderer `localStorage['docketos.calendarNotes']` | passed via IPC call |
| Project Timeline | renderer React state `timelineItems` | passed via IPC call |
| Project Timesheet | renderer `localStorage['docketos.timesheetEntriesByProject']` | passed via IPC call |
| Phase Notes | `canvas_notes` DB table | `listAllCanvases(projectId)` |
| Transmittal Log | `outgoing_log` DB table | `listOutgoingLog(projectId)` |

---

## IPC Changes

### `report:generate` handler (`electron/main.js`)

Old signature: `{ projectId }`  
New signature: `{ projectId, calendarNotes, timelineItems, timesheetEntries }`

- `calendarNotes` — `{ [dateKey: string]: { note: string, color: string } }` (full localStorage object)
- `timelineItems` — array of `{ id, kind, changeType, title, detail, time, ts }` from renderer state
- `timesheetEntries` — array of `{ id, date, task, hours, note }` for the active project (pre-filtered by renderer to current project)

### `handleReport()` (`src/views/Dashboard.jsx`)

Updated to pass the three data payloads:

```js
async function handleReport() {
  if (!activeProject) return
  await window.api.reportGenerate({
    projectId: activeProject.id,
    calendarNotes,         // already in scope: loadStoredCalendarNotes() state
    timelineItems,         // already in scope: computed from watcher state
    timesheetEntries,      // already in scope: timesheetEntriesByProject[activeProject.id] ?? []
  })
}
```

All three variables are already computed in Dashboard.jsx scope — no extra loading needed.

`preload.js` — no change needed.

---

## Section Specifications

### Subproject Summary Strip

One card per subproject. Each card shows:
- `display_name`
- `current_phase` (formatted via `PHASE_LABELS`)
- Note count (count of non-empty canvas boxes for this subproject)
- Transmittal count

Card is an `<a>` anchor linking to the subproject's detail section below.

### Project Tasks

All `checklist_items` for the project, ordered by `sort_order ASC`. Each row shows a checkbox (checked/unchecked) and `label`. Completed items are struck through and dimmed.

### 12D Projects

Recursive scan of `project.root_path` for **folders** (not files) whose name ends with `.project`. Results sorted alphabetically by name. Each row shows the folder name (without `.project` extension as the display name) and the `relativePath` from project root.

### Calendar

Split two-column layout:
- **Left — Upcoming:** calendar entries where `date >= today`, sorted ascending. Shows date, colour dot, and note text.
- **Right — Recent (last 30 days):** calendar entries where `date < today AND date >= 30 days ago`, sorted descending. Shows date, colour dot, and note text.

Entries with empty note text are omitted.

### Project Timeline

File activity events grouped by day (descending). Each event shows:
- Colour-coded dot: green = added, amber = modified, red = removed
- File name + change type label
- Relative path
- Time

### Project Timesheet

Entries grouped by day (descending). Each day shows a header with date and daily total hours. Each entry shows hours, task name, and optional note. Entries with zero hours are omitted.

### Phase Notes (per subproject)

All canvas boxes for the subproject, grouped by phase (ordered by phase key), sorted by `updated_at` ascending within each phase. Rich HTML rendered directly (`b.html` — no escaping). Empty boxes omitted.

### Transmittal Log (per subproject)

Scoped by path: a transmittal belongs to a subproject if `folder_path` starts with `path.join(project.root_path, subproject.subproject_path)`. Sorted descending by `created_at`.

---

## New DB Query Needed

```js
export function listChecklistItemsForProject(projectId) {
  return db.prepare(
    'SELECT * FROM checklist_items WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(projectId)
}
```

---

## Files Changed

| File | Change |
|---|---|
| `electron/report.js` | Complete rewrite — new layout, all sections, new helpers |
| `electron/db.js` | Add `listChecklistItemsForProject()` export |
| `electron/main.js` | Update `report:generate` handler to accept and pass new IPC payload |
| `src/views/Dashboard.jsx` | Update `handleReport()` to pass `calendarNotes`, `timelineItems`, `timesheetEntries` |

## Files Unchanged

| File | Why |
|---|---|
| `electron/preload.js` | `window.api.reportGenerate` already passes arbitrary data through |
| `electron/fileWatcher.js` | No changes |
| `electron/filing.js` | No changes |
