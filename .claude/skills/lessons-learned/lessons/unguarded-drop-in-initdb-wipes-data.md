---
name: unguarded-drop-in-initdb-wipes-data
applies-to: electron/db.js, schema migrations
severity: high
discovered: 2026-05-28
---

## What happened

A schema rewrite for `canvas_notes` put `DROP TABLE IF EXISTS canvas_notes; CREATE TABLE IF NOT EXISTS canvas_notes (...)` inside the main `db.exec()` block of `initDb()`. This block runs on every app startup, so every restart silently wiped every canvas. It went undetected because the table was empty during initial development — the bug only manifests once users put real data in.

## Why it happens

`initDb()` runs unconditionally on every main-process boot. SQL inside the `db.exec()` string is not a one-time migration — it's a startup script. `CREATE TABLE IF NOT EXISTS` is idempotent; `DROP TABLE IF EXISTS` is *syntactically* idempotent (it doesn't error) but *semantically* destructive: it deletes data every time.

The author's intent was a one-shot wipe of the previous unused stub schema. There's no migration framework, so "do this once" has to be explicit.

## What to do instead

Guard every DROP and ALTER with a check of current schema state. Drop only if the OLD shape is detected:

```javascript
const tableInfo = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='canvas_notes'"
).get()
if (tableInfo) {
  const cols = db.prepare('PRAGMA table_info(canvas_notes)').all()
  if (!cols.some(c => c.name === 'subproject_id')) {
    db.exec('DROP TABLE IF EXISTS canvas_notes')
  }
}
// Then CREATE TABLE IF NOT EXISTS rebuilds — no-op if the new shape is already in place.
```

For permanently retired tables (data discarded by design), an unguarded `DROP TABLE IF EXISTS` is fine — it's a no-op once the table is gone. That's how the existing `phase_notes` drop is correct.

See [[db-migration]] skill for the full pattern.

## Related

- Fix commit: `7e9a866`
- Original bug introduced in: `d383000`
