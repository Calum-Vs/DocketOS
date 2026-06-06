---
name: vite-rollup-needs-real-named-exports
applies-to: electron/*, build pipeline, refactors that remove exports
severity: medium
discovered: 2026-05-28
---

## What happened

A plan assumed that removing the `listAllPhaseNotes` export from `electron/db.js` would be tolerated by `electron/report.js`'s import of it — the assumption being that Node's runtime would resolve the missing name as `undefined` and only throw at the call site (which wouldn't run during build). It didn't work: `npm run build` failed immediately with `"listAllPhaseNotes" is not exported by "electron/db.js"`.

## Why it happens

`electron/main.js` and `electron/report.js` are bundled by Vite (via Rollup) before Electron loads them. Rollup performs static named-export resolution at bundle time — if a name appears in an `import { X } from './y.js'`, Rollup checks the module's exports at build time. A missing named export is a hard build error, regardless of whether the import is ever actually called.

This is different from Node's native ESM runtime, where named imports of missing exports also fail — but only when the module is loaded, and the error surfaces at load time, not when the named binding is referenced. In a bundled build, the check happens earlier and harder.

## What to do instead

When removing an exported function, audit every importer in the same build graph first. The codebase is small enough to grep:

```bash
# Find all imports of a function before removing it
grep -rn "listAllPhaseNotes" electron/ src/
```

For each importer, either:
1. Remove the import (and any usage) in the same commit as the export removal, OR
2. Stub the export to a no-op or empty value until the importer is rewritten, OR
3. Stage the changes so the importer is rewritten first, then the export is removed.

Stubbing the import with `const x = []` and a TODO comment is acceptable when the rewrite is queued for a known follow-up commit.

## Related

- Surfaced in commit `d383000` (Task 1 of the canvas plan)
- The renderer-side imports of removed `notesList/notesUpsert/notesDelete` did not fail because they were referenced via `window.api.x`, which is just a property lookup at runtime — no static binding.
