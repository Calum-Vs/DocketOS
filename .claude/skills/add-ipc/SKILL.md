---
name: add-ipc
description: Adds a new IPC handler to DocketOS spanning the db.js → main.js → preload.js trio in one consistent edit. Use this skill whenever the user wants to add a new IPC channel, expose a new main-process function to the renderer, add a new `window.api.*` method, persist new state via better-sqlite3, or says things like "add an IPC for X", "I need the renderer to call X", "wire up a new handler for X", or "scaffold a new channel". Strongly preferred over hand-editing the three files separately — the trio must stay in sync or the renderer will silently fail.
---

# Adding a New IPC Handler

In DocketOS, every renderer→main call lives in three coordinated places. Skipping any one of them produces a silent failure: the renderer reads `undefined` off `window.api`, or `ipcRenderer.invoke` rejects with "No handler registered". This skill walks through the canonical pattern so all three files end up consistent.

## The three layers

| File | Role |
|---|---|
| `electron/db.js` (or another `electron/*.js` module) | The actual logic. Synchronous better-sqlite3 calls, file ops, etc. Exported as a plain function. |
| `electron/main.js` | `ipcMain.handle('channel:name', (event, payload) => moduleFn(payload))`. Translates the IPC call into the module function call. |
| `electron/preload.js` | `apiMethod: (data) => ipcRenderer.invoke('channel:name', data)`. The renderer-facing surface. |

The channel name (`'channel:name'`) is the contract between main and preload — they MUST match. The `apiMethod` name is what the renderer types as `window.api.apiMethod(...)`.

## Before writing code, capture the requirements

Ask the user (or extract from context) and confirm before generating:

1. **Channel name** — kebab-case with a colon prefix grouping by domain. Examples already in the codebase: `canvas:load`, `canvas:save`, `notes:upsert`, `projects:list`. Pick a prefix that matches an existing domain or proposes a new one.
2. **Renderer-facing method name** — camelCase, descriptive. Examples: `canvasLoad`, `notesUpsert`, `projectsList`.
3. **Input shape** — object with named fields, even for single-arg calls. The pattern in this codebase is `(_e, { foo, bar }) => moduleFn({ foo, bar })`. Keeps the contract self-documenting.
4. **Return shape** — what the renderer should receive. Common patterns: `{ ok: true, ...result }` for mutations, the raw result object for reads, `{ success: false, error: '...' }` for graceful failures.
5. **Storage layer** — does this touch SQLite? If yes, the function goes in `electron/db.js`. If it's file I/O, it likely belongs in a more specific module (`filing.js`, `fileWatcher.js`, etc.) — check which module's responsibility it overlaps with before defaulting to db.js.

## The pattern, with a concrete example

Suppose the user wants `window.api.canvasDuplicate({ id })` to copy a canvas row. Walk through it like this:

### 1. Add the function to the module (db.js)

```javascript
// electron/db.js (append near other canvas functions)
export function duplicateCanvas({ id }) {
  const src = db.prepare('SELECT * FROM canvas_notes WHERE id = ?').get(id)
  if (!src) return { ok: false, error: 'not found' }
  const newId = randomUUID()
  db.prepare(
    'INSERT INTO canvas_notes (id, project_id, subproject_id, phase, content_json) VALUES (?, ?, ?, ?, ?)'
  ).run(newId, src.project_id, src.subproject_id, src.phase, src.content_json)
  return { ok: true, id: newId }
}
```

Use named-arg destructuring at the top of every exported function. Returning `{ ok, ... }` envelopes is the existing convention for mutations that can fail recoverably.

### 2. Register the IPC handler (main.js)

Two coordinated edits:

a) Add the import alongside the existing db imports:

```javascript
import {
  // ...existing imports
  duplicateCanvas,
} from './db.js'
```

b) Register the handler in the appropriate section (find the comment header that matches the domain — `// Canvas`, `// Projects`, etc.):

```javascript
ipcMain.handle('canvas:duplicate', (_e, payload) => duplicateCanvas(payload))
```

If the channel is in a new domain, add a section comment first.

### 3. Expose it in the renderer surface (preload.js)

```javascript
// In the matching section of the `api` object:
canvasDuplicate: (data) => ipcRenderer.invoke('canvas:duplicate', data),
```

### 4. Verify symmetry

After saving the three files, the PostToolUse hook at `.claude/scripts/check-ipc-symmetry.mjs` runs automatically. It scans every top-level `electron/*.js` file for `ipcMain.handle('channel', ...)` calls (so handlers registered indirectly via `setupLauncherHandlers(ipcMain)` and the like are picked up too, not just those in main.js), reads `electron/preload.js` for `ipcRenderer.invoke('channel', ...)` bindings, and reports any channel that exists on one side but not the other. The hook stays silent when everything is in sync — only orphans surface.

If you want to dry-run it from the shell, you need to feed it a stdin payload that looks like a hook event so it doesn't bail at the file-path filter:

```bash
echo '{"tool_input":{"file_path":"electron/db.js"}}' | node .claude/scripts/check-ipc-symmetry.mjs
```

Reading the script source (~85 lines) is also a fast way to understand what it checks.

### 5. Use it in the renderer

```jsx
const result = await window.api.canvasDuplicate({ id: someBox.id })
if (result.ok) { /* ... */ }
```

The renderer never imports anything from `electron/` — it only knows the `window.api` surface.

## Common variations

**Push events from main to renderer** (the opposite direction — main emits, renderer subscribes):

main.js: `mainWindow.webContents.send('canvas:update', payload)` from inside a watcher callback. No `ipcMain.handle` needed.
preload.js: already exposes `on: (channel, callback) => { ipcRenderer.on(channel, ...) ; return () => ipcRenderer.removeListener(...) }`. Renderer uses `window.api.on('canvas:update', cb)`.

Push channels are NOT checked by the symmetry hook (they live in `webContents.send`, not `ipcMain.handle`).

**Security-gated channels** (paths, app launchers):

Already-existing patterns use an allowlist Set checked before the handler does anything. Examples:
- `ALLOWED_PATH_KEYS` in main.js gates `settings:upsertPath`
- `ALLOWED_APP_KEYS` in launcher.js gates `launcher:open`

If your new channel takes a user-supplied key that maps to a sensitive resource (file path, executable), add an allowlist before calling the module function. Don't skip this — context isolation only protects against the renderer being compromised; it doesn't protect against a logic bug exposing arbitrary paths.

## After scaffolding

1. **Build to catch typos**: `npm run build` should produce three clean Vite passes (renderer, main, preload). Import errors here surface as `"X" is not exported by Y` from Rollup.
2. **Look at the symmetry hook output**: if it complains, fix the imbalance — usually a typo in the channel string.
3. **Don't forget the renderer call site** — adding the trio is half the job. The user almost certainly wants you to wire it into a component too. Ask if they want you to do that, or whether they'll wire it themselves.
