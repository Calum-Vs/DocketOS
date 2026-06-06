# Feature Checklist

Before declaring a feature done, verify every item that applies.

## Build

- [ ] `npm run build` passes with zero errors
- [ ] No new warnings introduced (the only acceptable warning is the Vite CJS API deprecation notice)

## IPC

- [ ] Every new channel exists in all three of: `ipcMain.handle` (main.js), `ipcRenderer.invoke` (preload.js), `window.api.*` call (renderer)
- [ ] The `.claude/scripts/check-ipc-symmetry.mjs` hook reports no mismatches (silent = symmetric)
- [ ] New handlers return `{ success, data/error }` — no raw throws across IPC

## Settings

- [ ] Any new user-configurable option lives in Engine Backend (`src/views/Settings.jsx`)
- [ ] No settings controls added to Dashboard panels, modals, or other views

## UI / UX

- [ ] Buttons, inputs, and panels match the patterns in `.claude/standards/ui-components.md`
- [ ] Colours and fonts match `.claude/standards/design-language.md` — no hardcoded hex values outside the `S` object or `tailwind.config.js`
- [ ] Disabled states use `disabled:opacity-50`, not hidden or removed elements
- [ ] Error and success feedback follows `.claude/standards/error-surfaces.md`

## Data

- [ ] Schema changes to `initDb()` are guarded with `IF NOT EXISTS` or a migration transaction (see `db-migration` skill)
- [ ] No `DROP TABLE` without an explicit user-initiated backup step

## File watcher / filesystem

- [ ] No new synchronous `readdirSync` or `statSync` calls in `fileWatcher.js` — use `fs.promises` + `statSafe()`
- [ ] Any new filesystem traversal that could touch SharePoint/OneDrive paths is async

## Release

- [ ] Version bumped in `package.json` if shipping
- [ ] `npm run publish` used (not `npm run dist`) to trigger auto-update on installed clients
