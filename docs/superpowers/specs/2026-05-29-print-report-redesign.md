# Print Report Redesign

**Date:** 2026-05-29  
**Status:** Approved for implementation

## Purpose

The project report is used for internal record-keeping and audit trail purposes. It is generated as an HTML file, opened in the system browser, and printed from there. No PDF export or in-app preview is required.

## Problems with the current report

1. **Flat section layout** — File Inventory, Phase Notes, QA Results, and Transmittals are each independent sections. To understand what happened on a specific subproject you must jump between four sections.
2. **Notes rendering broken** — `noteBodyHtml()` escapes all HTML before writing it to the report, so rich text formatting (bold, lists, headings) is lost. Notes appear as raw escaped text.

## New report structure

The report is reorganised around subprojects. Top-to-bottom layout:

```
Project header
  name · description · root path · generated date

─── Subproject: [display_name] ─────────────────────────
  Phase Notes
  File Inventory
  Transmittal Log

─── Subproject: [display_name] ─────────────────────────
  (same three blocks)

─── Project-level ───────────────────────────────────────
  Phase Notes       (canvas_notes with subproject_id = NULL)
  File Inventory    (files not scoped to any subproject)
  Transmittal Log   (transmittals not scoped to any subproject)

─── QA Audit Results ────────────────────────────────────
  (global, unchanged)
```

Subprojects appear in the order returned by `listProjectSubprojects`. Project-level is always last before QA. A subproject section is omitted entirely if all three of its blocks are empty.

## Data scoping

### Phase Notes
No change. `canvas_notes` rows already carry `subproject_id`. Rows with `subproject_id = X` appear under subproject X; rows with `subproject_id = NULL` appear under Project-level.

### File Inventory
Each subproject record in `project_subprojects` has a `subproject_path` column (relative to `project.root_path`). A file (from `getLastKanban()`) belongs to a subproject if its `relativePath` starts with `subproject_path + path.sep`. Files that match no subproject fall through to Project-level.

### Transmittal Log
`outgoing_log` has no `subproject_id` column. `folder_path` is an absolute path. Transmittals are scoped by constructing each subproject's absolute prefix as `path.join(project.root_path, subproject.subproject_path)` and checking if `folder_path` starts with that prefix. Transmittals that match no subproject fall to Project-level. This avoids a DB migration and changes to `filing.js`.

## Notes rendering fix

`noteBodyHtml()` is removed from the report path. `b.html` is written directly into the report HTML, matching how CanvasBox renders notes in the live canvas. This is consistent with the documented XSS tradeoff: DocketOS is a local single-user Electron app with no external HTML input vector for canvas notes.

## Styling

- Existing type scale, table styles, and colour tokens are unchanged.
- Subproject section headers get a visually distinct treatment: heavier top border, coloured left accent strip, larger font — enough to clearly delimit sections when scanning a printed page.
- Project-level section uses a neutral (grey) header style to visually distinguish it from named subprojects.
- Each block within a section retains its existing empty-state message so sparse subprojects still read cleanly.

## What changes

| File | Change |
|---|---|
| `electron/report.js` | Full rewrite of `generateReport()`. New subproject-first layout, path-prefix file/transmittal scoping, direct `b.html` render, updated CSS. `noteBodyHtml()` removed. |

## What does not change

| File | Why |
|---|---|
| `electron/main.js` | IPC handler signature is unchanged (`report:generate` with `{ projectId }`). |
| `electron/preload.js` | `window.api.reportGenerate` is unchanged. |
| `src/views/Dashboard.jsx` | `handleReport()` call site is unchanged. |
| `electron/db.js` | No schema migration required. |
| `electron/filing.js` | No changes — transmittal scoping is read-only path matching. |
