---
name: error-surfaces
description: Use before writing any error handling, user feedback, or confirmation flow. Ensures errors and success states are surfaced consistently — right place, right tone, right duration.
---

# Error Surfaces

Read `.claude/standards/error-surfaces.md` before proceeding.

## When this skill applies

- Adding error handling to any IPC call result
- Showing success feedback after a save or action
- Asking a user to confirm a destructive action
- Any time you would reach for `alert()`, `console.log`, or an error `throw` in renderer code

## Steps

1. **Pick the right surface** — use the decision table in `error-surfaces.md`. Inline text for form feedback, `dialog.showMessageBox` for decisions and critical errors.

2. **Inline feedback** — use the `showMsg` / toast pattern with `useState`. Success clears after 3s; errors persist until the user retries.

3. **Destructive confirmations** — always use `dialog.showMessageBox` from the main process. Default the focus to the safe button (`defaultId` pointing to Cancel).

4. **Never use `window.alert()` or `window.confirm()`** — they block the renderer thread and are visually inconsistent with the app.

5. **Never swallow errors silently** — if you write a `catch {}` with no body, stop and add at minimum a `console.error`. Production errors visible to the user need the inline or dialog surface.

6. **Colour** — success text uses `#30D158` (`status-ok`), error text uses `#FF453A` (`status-error`), info text uses `S.muted` (`#8E8E93`). No other colours for status text.
