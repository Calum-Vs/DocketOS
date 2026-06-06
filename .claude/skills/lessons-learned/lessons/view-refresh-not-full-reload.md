---
name: view-refresh-not-full-reload
applies-to: electron/main.js, src/views/Dashboard.jsx, menu accelerators, project/subproject state
severity: medium
discovered: 2026-06-04
---

## What happened

The default Electron reload action on Ctrl+R refreshed the whole renderer. That also reset Dashboard selection state, so the user had to reselect the active subproject after wanting only fresh project information.

## Why it happens

Electron's `role: 'reload'` is a browser reload. It recreates renderer state instead of asking the app to refresh its current data. Dashboard already knows the active project and subproject, so a full reload is heavier than the user's intent.

## What to do instead

Use an app-level refresh event for Dashboard data refreshes. In main, intercept Ctrl+R and send a push event such as `view:refreshActive`; in the renderer, refresh projects, subprojects, kanban, and folder listings while preserving the current selection.

For future menu shortcuts, check whether the shortcut should mutate app state or reload the web page. Most DocketOS shortcuts should be app actions, not Chromium defaults.

## Related

- `electron/main.js`
- `src/views/Dashboard.jsx`
- `.claude/standards/ipc-patterns.md`