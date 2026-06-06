# IPC Patterns

## Channel naming

Format: `domain:action` — lowercase, colon separator, no spaces.

| Domain | What it covers |
|---|---|
| `projects:` | Project CRUD, active project, phase |
| `subprojects:` | Subproject CRUD, phase |
| `fs:` | Filesystem operations (copy, move, scan, search) |
| `canvas:` | Note canvas load/save/export |
| `settings:` | Settings read/write, path registry, rules |
| `templates:` | Template file CRUD and open |
| `documents:` | Document index, revisions, window management |
| `gemini:` | AI analysis calls |
| `intake:` | Document intake packages |
| `kanban:` | Kanban column state |
| `search:` | Full-text search |
| `outgoing:` | Outgoing transmittal log |
| `shell:` | External shell/browser opens |
| `system:` | Native dialogs (browse, open path) |
| `report:` | Report generation |
| `view:` | UI view state (hidden extensions etc.) |
| `standards:` | Standards rules checking |
| `savedViews:` | Saved view presets |
| `briefs:` | Brief draft generation |
| `checklists:` | Document checklist items |
| `comments:` | Review comments |
| `backup:` | Backup operations |
| `extraction:` | Document text extraction |

## Handler pattern (main.js)

```js
ipcMain.handle('domain:action', (_e, { param1, param2 }) => {
  // synchronous DB calls or sync file ops are fine here
  return { success: true, data: result }
  // on error: return { success: false, error: 'message' }
})
```

Always destructure the payload argument. Never use positional args.

## Preload pattern (preload.js)

```js
domainAction: (data) => ipcRenderer.invoke('domain:action', data),
```

Method name is camelCase of the channel name (`domain:action` → `domainAction`).

## Renderer call pattern

```js
const result = await window.api.domainAction({ param1, param2 })
if (!result.success) { /* handle error */ }
```

## Native save/export pattern

Renderer code formats Dashboard-local content, but native save dialogs and file writes belong in the main process. Use `fs:` channels for user-initiated file exports.

```js
// main.js
ipcMain.handle('fs:exportTextFile', async (_e, { defaultFileName, contents }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Text File',
    defaultPath,
    filters: [{ name: 'Text File', extensions: ['txt'] }],
  })
  if (canceled || !filePath) return { success: false, canceled: true }
  const outputPath = path.extname(filePath) ? filePath : `${filePath}.txt`
  fs.writeFileSync(outputPath, String(contents ?? ''), 'utf-8')
  return { success: true, outputPath }
})

// preload.js
fsExportTextFile: (data) => ipcRenderer.invoke('fs:exportTextFile', data),
```

Renderer callers should ignore `{ canceled: true }`, show inline success/error feedback for real outcomes, and avoid teaching main-process handlers about renderer-only localStorage layouts unless the export truly needs main-owned data.

## Push events (main → renderer)

For real-time updates from main to renderer, use `mainWindow.webContents.send('domain:eventName', payload)`. Subscribe in the renderer with `window.api.on('domain:eventName', handler)` (returns an unsubscribe function — always call it in the `useEffect` cleanup).

Push event names use the same `domain:` prefix as handlers.

## Error handling

- Return `{ success: false, error: 'human-readable message' }` — do not throw across IPC
- Throwing in an `ipcMain.handle` crashes the handler silently; the renderer gets a rejected promise
- Log unexpected errors with `console.error` in main before returning the error object

## The trio rule

Every IPC channel requires exactly three coordinated edits:
1. `electron/db.js` (or another module) — the logic
2. `electron/main.js` — the `ipcMain.handle` registration
3. `electron/preload.js` — the `ipcRenderer.invoke` exposure

Missing any one causes a silent failure. Use the `add-ipc` skill to scaffold all three at once.
