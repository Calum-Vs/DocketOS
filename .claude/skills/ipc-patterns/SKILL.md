---
name: ipc-patterns
description: Use when designing or reviewing any IPC channel — naming a new channel, deciding request/reply vs push event, handling errors across the process boundary. Use alongside the add-ipc skill for implementation.
---

# IPC Patterns

Read `.claude/standards/ipc-patterns.md` before proceeding.

## When this skill applies

- Naming a new IPC channel
- Deciding whether to use `ipcMain.handle` (request/reply) or `webContents.send` (push event)
- Handling errors returned from IPC calls in the renderer
- Reviewing an existing handler for correctness

## Steps

1. **Name the channel** — use `domain:action` format. Check the domain table in `ipc-patterns.md` for the right prefix. If no existing domain fits, propose a new one and add it to the doc.

2. **Choose the pattern:**
   - Renderer needs data from main → `ipcMain.handle` + `ipcRenderer.invoke` (request/reply)
   - Main needs to push state to renderer unprompted → `webContents.send` + `window.api.on` (push event)

3. **Handler return shape** — always `{ success: true, data }` or `{ success: false, error: 'message' }`. Never throw across IPC.

4. **Scaffold with add-ipc** — use the `add-ipc` skill to create all three required files (db.js logic, main.js handler, preload.js exposure) in one pass.

5. **Push event cleanup** — if subscribing to a push event in a React component, the `window.api.on(...)` call returns an unsubscribe function. Always call it in the `useEffect` return.

6. **Verify symmetry** — after editing, the `.claude/scripts/check-ipc-symmetry.mjs` hook runs automatically. Silent output means the trio is in sync.
