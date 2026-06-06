---
name: dashboard-direct-manipulation-ui
applies-to: src/views/Dashboard.jsx, src/components/FolderTree.jsx, dashboard panels, file trees, task lists, notes
severity: medium
discovered: 2026-06-04
---

## What happened

Dashboard controls started with several visible command buttons and inline close buttons: Open buttons on tree rows, x buttons on note tabs, and row controls that took space away from the content. Later dashboard passes also showed that preference changes and repeated file flag events can flood the activity timeline. The user repeatedly steered the UI toward direct manipulation, scannable rows, and grouped activity.

## Why it happens

DocketOS is used as a dense working surface, not a marketing-style app. Extra buttons make repeated scanning slower and crowd the file names, task titles, and note text that matter most. Timeline noise has the same cost: it buries the project actions the user actually cares about. The user's expected model is: select from dropdowns, double-click to open or rename, right-click titles/rows for management actions, and drag/drop directly where the file or folder should go.

## What to do instead

- Prefer double-click to open files/folders and remove visible Open buttons from trees and file rows.
- Use dropdowns for task-list and note-section selectors; put the selector on the first row beside creation controls.
- Put destructive and secondary title actions in the title's right-click menu, not inline x buttons.
- For move-out workflows, show the drop target in the exact panel where the user is dragging, such as a parent or Move Here row.
- Keep file metadata pinned to the right, and let widened names mask metadata with an opaque background instead of overlapping readable text.
- Put file/folder management actions such as colour flags in right-click menus, then show a small dot inline before the name so the row stays scannable.
- Reuse compact controls such as `SortBar` for filtered boxes; avoid inventing one-off sort or filter UI.
- Do not log preference-only changes or passive opens as project activity. Group repeated workflow actions, such as rapid file flagging, at display time so details remain expandable without flooding the timeline.

## Related

- `.claude/standards/ui-components.md`
- `docs/qa/2026-06-04-dashboard-workflow-updates.md`
- `src/views/Dashboard.jsx`
- `src/components/FolderTree.jsx`