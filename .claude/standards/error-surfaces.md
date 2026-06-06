# Error Surfaces

When something goes wrong, use the right surface. Do not reach for `alert()`, `console.log`, or `throw` in renderer code.

## Decision table

| Situation | Surface | Example |
|---|---|---|
| Form save succeeded | Inline text (auto-clears) | "Saved ✓" near the button, fades after 3s |
| Form save failed | Inline text (persists until retry) | "Failed to save — check path" |
| Destructive action confirmation | `dialog.showMessageBox` (main process) | "Delete project? This cannot be undone." |
| Critical startup failure | `dialog.showErrorBox` (main process) | Electron binary launch error |
| Update check result | `dialog.showMessageBox` (main process) | "Up to date" / "Restart now" |
| Background operation result | Toast-style inline text in the relevant panel | Filing result, template copy result |
| Dev/debug only | `console.error` (never in production UI) | Unexpected IPC payloads |

## Inline feedback pattern

Use a `useState` toast with a timed clear. Keep it adjacent to the action that caused it.

```js
const [msg, setMsg] = useState(null)

function showMsg(type, text, ms = 3000) {
  setMsg({ type, text })
  setTimeout(() => setMsg(null), ms)
}

// In JSX:
{msg && (
  <p className="text-xs mt-1" style={{ color: msg.type === 'ok' ? '#30D158' : '#FF453A' }}>
    {msg.text}
  </p>
)}
```

Error text stays until the user retries (don't auto-clear errors). Success text clears after 3s.

## Main-process dialogs

Use for anything that requires a user decision or blocks a destructive action. Always called from `ipcMain.handle` — never trigger dialogs from the renderer directly.

```js
// Confirmation
const { response } = await dialog.showMessageBox(mainWindow, {
  type: 'question',
  title: 'Confirm',
  message: 'Are you sure?',
  buttons: ['Yes', 'Cancel'],
  defaultId: 1,
})
if (response !== 0) return { success: false, cancelled: true }

// Error
dialog.showErrorBox('Title', 'Detail message')
```

## What not to do

- Do not use `window.alert()` or `window.confirm()` — they block the renderer thread and look wrong
- Do not swallow errors silently — at minimum log them with `console.error`
- Do not show errors in the window title bar or status bar (no such element exists in this app)
- Do not use red backgrounds or full-screen error states for recoverable errors
