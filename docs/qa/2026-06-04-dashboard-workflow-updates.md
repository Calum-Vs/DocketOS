# Dashboard Workflow Updates

Date: 2026-06-04
Scope: `src/views/Dashboard.jsx`, `src/components/FolderTree.jsx`

## Summary

This pass tightened the Dashboard into a denser direct-manipulation workspace. The main theme was reducing visible clutter, keeping file names readable, and making file/folder metadata easier to act on without leaving the main dashboard.

## Completed Updates

- `Ctrl+R` now refreshes subproject information without forcing the user to reselect the active subproject.
- File and folder tree rows support adjustable file-name column width.
- Widened file names mask the metadata area instead of visually overlapping it, while metadata stays fixed to the right.
- Visible `Open` buttons were removed from tree rows; opening is expected through double-click.
- Folder move workflows now allow moving a nested folder out to a parent level.
- `Document Review` and `Filing Actions` were removed from center box choices, along with their unused connected dashboard code.
- Activity timeline logging was reduced for low-value UI changes such as calendar colour changes, passive opens, view toggles, and selector changes.
- Files and folders can now be flagged with a colour from the right-click menu.
- Flag colour dots appear before flagged files/folders across dashboard list surfaces and the project folder tree.
- A `Flagged` center box was added to show files/folders by colour.
- The `Flagged` box supports sorting by type, A-Z, Z-A, newest, and oldest.
- The `Flagged` box has an `All` mode that groups all flagged items under colour headings.
- File flag timeline activity now groups rapid flag set/clear events within a five-minute window into expandable bursts.

## Persistence And Recovery

- File flags are stored per project in `localStorage` under `docketos.fileFlagsByProject`.
- Because recovery snapshots capture `docketos.*`, file flags are covered by the existing recovery backup flow.
- Flag sorting and `All` display state are local dashboard UI state and are not logged as project activity.

## Activity Timeline Rules

- User-meaningful file/folder actions should be logged.
- Passive opens, selector changes, colour-only preference changes, and visibility toggles should not create timeline noise.
- Rapid file flagging is a single workflow and should group at display time, preserving individual expanded rows instead of deleting detail.
- File flag set and file flag clear events should group separately, not mix into one burst.

## UI Learnings

- This dashboard works best as a dense working surface, not a button-heavy control panel.
- Prefer direct gestures: double-click to open, right-click for secondary actions, drag/drop for movement.
- Keep visible row controls minimal so file names remain the primary scannable content.
- Use existing compact controls such as `SortBar` rather than introducing new button styles.
- Keep metadata pinned to the right and let file-name backgrounds mask underneath content when the name column is widened.
- Group repeated activity visually instead of hiding it; users can expand when they need detail.

## Validation

After the implementation changes in this pass, `npm run build` passed repeatedly. The only warning observed was the known Vite CJS Node API deprecation notice. VS Code Problems checks for `Dashboard.jsx` and `FolderTree.jsx` were clean after the relevant edits.

## Follow-Up Notes

- The flag feature is renderer/localStorage only; no IPC or database migration was added.
- If flags later need to roam between machines or users, move them into a guarded SQLite table using the `db-migration` and `add-ipc` skills.
- The current activity grouping happens at render time in the project timeline, so stored activity entries remain detailed and recoverable.

## SharePoint Performance Pass

Later on 2026-06-04, the app was reviewed and updated for SharePoint/OneDrive-backed project folders. DocketOS must assume project roots are cloud-backed Windows paths, not fast local disk.

Implemented optimizations:

- `electron/fileWatcher.js` now runs watcher scans single-flight and queues only one follow-up scan when SharePoint emits bursts.
- The watcher ignores common Office/SharePoint noise such as `~$*`, `.tmp`, `.temp`, download conflict files, `.git`, `node_modules`, and `$Recycle.Bin`.
- `electron/db.js` now provides `syncProjectDocumentsFromFiles()`, which batches document sync in a transaction and skips unchanged files by path, size, and mtime.
- `electron/main.js` switched hot read-only filesystem IPC handlers to async timeout-based reads: `fs:listFolders`, `fs:scanDir`, `fs:searchFiles`, `fs:statFile`, and `fs:findEntryByIdentity`.
- `src/views/Dashboard.jsx` now derives active subproject browser rows from the watcher payload instead of rescanning SharePoint after every `kanban:update`.
- Quick-link filesystem reconciliation is throttled so it does not recursively search SharePoint on every watcher event.

Validation for this pass:

- `npm run build` passed.
- VS Code Problems were clean for `electron/main.js`, `electron/fileWatcher.js`, `electron/db.js`, and `src/views/Dashboard.jsx`.
- `node .claude/scripts/check-ipc-symmetry.mjs` produced no output, which means IPC remained symmetric.

Related lesson: `.claude/skills/lessons-learned/lessons/sharepoint-filesystem-is-cloud-backed.md`.
