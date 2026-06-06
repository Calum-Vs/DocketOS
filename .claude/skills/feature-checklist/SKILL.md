---
name: feature-checklist
description: Use before declaring any feature complete. Runs through build, IPC symmetry, settings placement, UI standards, data safety, and release hygiene in one pass.
---

# Feature Checklist

Read `.claude/standards/feature-checklist.md` and work through every applicable item.

## When this skill applies

- Before saying "done" on any feature or fix
- Before committing code that will be pushed
- Before building an installer for distribution

## Steps

1. **Run the build** — `npm run build`. Zero errors required. Note any new warnings.

2. **Check IPC symmetry** — the hook runs automatically on edit. If it didn't, run `.claude/scripts/check-ipc-symmetry.mjs` manually and confirm silent output.

3. **Settings placement** — any new user-configurable option must be in Engine Backend. If you added a config control anywhere else, move it before proceeding.

4. **UI standards** — spot-check buttons and inputs against `.claude/standards/ui-components.md`. One mismatched className string is worth fixing now.

5. **Design language** — no hardcoded hex values outside `tailwind.config.js` and the `S` object. No new font-family inline styles.

6. **Error surfaces** — every IPC call result has a visible success or error state. No silent catch blocks.

7. **Data safety** — any `initDb()` change uses `IF NOT EXISTS` or a transaction. No raw `DROP TABLE`.

8. **Filesystem safety** — no new synchronous `readdirSync`/`statSync` in `fileWatcher.js`.

9. **If shipping** — bump `package.json` version, run `npm run publish` (not `npm run dist`).
