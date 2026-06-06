---
name: native-save-dialog-export-ipc
applies-to: electron/main.js, electron/preload.js, src/views/Dashboard.jsx, exports, filesystem IPC
severity: medium
discovered: 2026-06-04
---

## What happened

Task lists and note sections needed a right-click Export action that writes a `.txt` file and prompts the user for where to save it. The renderer has the selected task/note content, but only the main process can show native save dialogs and write files safely.

## Why it happens

DocketOS keeps `contextIsolation: true` and `nodeIntegration: false`, so renderer code cannot use Node filesystem APIs directly. Save/export flows cross the process boundary: renderer formats the content, main owns `dialog.showSaveDialog` and `fs.writeFileSync`, and preload exposes a narrow `window.api` method.

## What to do instead

For small user-initiated exports:

1. Add a focused `fs:` IPC channel in `electron/main.js` that calls `dialog.showSaveDialog`, handles cancellation, appends the extension if needed, writes the file, and returns `{ success, outputPath }` or `{ success: false, canceled: true }`.
2. Expose the channel in `electron/preload.js`.
3. In the renderer, format only the intended visible/selected content, call the preload method, ignore cancellation, and show inline success/error feedback.
4. Run `npm run build` and the IPC symmetry checker.

Avoid making the main process understand Dashboard-local storage shapes unless the export truly needs main-process data.

## Related

- [[add-ipc]]
- [[ipc-patterns]]
- [[error-surfaces]]
- `electron/main.js`
- `electron/preload.js`
- `src/views/Dashboard.jsx`