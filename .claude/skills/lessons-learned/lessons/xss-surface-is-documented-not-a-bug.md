---
name: xss-surface-is-documented-not-a-bug
applies-to: src/components/canvas/CanvasBox.jsx, electron/report.js, contentEditable, dangerouslySetInnerHTML
severity: low
discovered: 2026-05-28
---

## What happened

The security-guidance plugin fires an "XSS via dangerouslySetInnerHTML" warning every time CanvasBox.jsx or report.js is touched. It's the same warning, every time, and an external tool once auto-fixed it by inserting an HTML sanitizer mid-session — which silently rewrote files that were under active development.

## Why it happens

The canvas rendering path uses `dangerouslySetInnerHTML` (in CanvasBox) and unescaped HTML interpolation (in report.js) to render rich-text content the user types into a `contentEditable` box. This is a real XSS surface — a paste of `<img onerror>` into the editor would execute on next render — but:

- The content originates from the user's own typing in their own local Electron app.
- There is no external input vector (no network reads, no other users, no shared data).
- Electron's `contextIsolation: true` and `nodeIntegration: false` are already in place (see CLAUDE.md security constraints).
- The accepted tradeoff is documented in `docs/superpowers/specs/2026-05-28-interactive-note-canvas-design.md` and the implementation plan.

A partial mitigation (allowlist-based sanitizer in CanvasBox) was added during the canvas work and is preserved. Full sanitization across all paths is queued as a follow-up hardening pass.

## What to do instead

When the warning fires:

1. **Acknowledge it briefly** and reference this lesson — it's not new information.
2. **Don't auto-introduce DOMPurify** or any other sanitizer change without consulting the user. Mid-session auto-fixes have rewritten files unexpectedly before; the security plugin's escape hatch ("the user explicitly asked for this and you've already surfaced the security tradeoffs") applies here.
3. **Do not remove the existing sanitizer** in `CanvasBox.jsx` (the `ALLOWED_TAGS` allowlist + `sanitizeHtml`/`cleanNode` helpers). That's the partial mitigation; it's load-bearing for the read path.
4. **If the user asks to harden everything**, that's a deliberate change — propose a sweep across CanvasBox.jsx, report.js, and the contentEditable write path, with one consistent sanitizer module.

The warning isn't wrong — it's flagging a real surface. It's just already known and accepted, and the right time to address it is a deliberate hardening pass, not a reflex to one warning.

## Related

- Spec section "Known XSS surface (carried over from PhaseNotes)" in `docs/superpowers/specs/2026-05-28-interactive-note-canvas-design.md`
- Sanitizer impl: `src/components/canvas/CanvasBox.jsx` lines 6-7 and the bottom helpers
