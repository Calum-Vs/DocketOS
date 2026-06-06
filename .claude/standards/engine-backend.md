# Engine Backend Settings Standard

## Rule

**All configuration and settings UI must live in Engine Backend.**

Engine Backend is the single authorised location for any option a user can persist. It is reached via `File > Settings > Engine Backend`, which sends `settings:openBackend` to the renderer and switches the view to `Settings.jsx`.

## What belongs here

- API keys and external service credentials
- Application path registry (launchers, template dirs, outgoing dirs)
- File routing rules
- Gemini / AI prompt configuration
- Project info dropdown lists
- Any toggle, threshold, or named value the user can change

## What does NOT belong here

- Ephemeral UI state (panel sizes, selected tab) — use `localStorage`
- Per-project data (phases, subproject names) — use the DB via project edit modals
- Per-file metadata — use the DB directly

## How settings are stored

All persistent settings go through `upsertSetting(key, value)` in `electron/db.js`, stored in the `settings` table (key/value text pairs). Read with `getSetting(key)`. Retrieve all with `getAllSettings()`.

## Adding a new setting — checklist

1. Add the save/read logic in `electron/main.js` as a new IPC handler (use the `add-ipc` skill)
2. Add the UI control inside `src/views/Settings.jsx`, in the appropriate section
3. Do NOT add a settings control anywhere else in the codebase
4. If the setting affects the dashboard in real time, send a push event from `main.js` after saving and subscribe in `Dashboard.jsx`

## Existing sections in Settings.jsx

| Section | What it configures |
|---|---|
| Gemini System Prompt | AI analysis prompt |
| Document Analysis Prompt | Per-document AI prompt |
| File Routing Rules | Extension + regex → subfolder routing |
| Template Files | Files available in the Open Template panel |
| Application Path Registry | Launcher executables |
| Project Info Dropdown Lists | Councils, project managers, water authorities |
| Engine Backend (misc) | Gemini API key, hidden extensions |
