---
name: engine-backend-settings
description: Use before adding any setting, option, or configuration control to any component. Ensures all persistent user configuration lands in Engine Backend (Settings.jsx) and nowhere else.
---

# Engine Backend Settings

Read `.claude/standards/engine-backend.md` before proceeding.

## When this skill applies

- Adding a new option or toggle to any view or panel
- Persisting any user preference beyond the current session
- Asking "where should this setting live?"
- Any time you would reach for `localStorage` for something the user expects to survive app reinstall

## Steps

1. **Confirm it belongs in Engine Backend** — if it's ephemeral UI state (panel size, last-selected tab), use `localStorage`. If it persists across sessions and is user-configurable, it goes in Engine Backend.

2. **Find the right section in Settings.jsx** — check the existing sections table in `engine-backend.md`. Add to an existing section if the new setting is related; create a new section only if it is genuinely distinct.

3. **Use the DB** — call `upsertSetting(key, value)` to save, `getSetting(key)` to read. Never write settings directly to a file.

4. **Wire the IPC** — use the `add-ipc` skill to scaffold the handler trio (`db.js` → `main.js` → `preload.js`).

5. **Live update if needed** — if the dashboard must react immediately when the setting changes, send a push event from `main.js` after saving and subscribe in `Dashboard.jsx`.

6. **Do not add settings elsewhere** — if you find yourself adding a configuration control outside `Settings.jsx`, stop and move it there.
