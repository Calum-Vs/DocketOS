---
name: db-migration
description: Writes safe, guarded SQLite migrations in electron/db.js's initDb() that won't destroy user data on every app boot. Use this skill whenever the user wants to add, drop, or modify a column or table, rename a field, change a default, restructure persisted state, or says things like "add a column to X", "migrate the schema", "rename this field", "drop this table", "update the database structure", "I need a new field on Y". Strongly preferred over hand-writing schema changes — DocketOS's initDb runs on every startup, so any naive DROP or ALTER will erase data each launch.
---

# Writing Safe SQLite Migrations in DocketOS

`electron/db.js` exports `initDb()`, which runs every time the Electron main process starts. Any unconditional `DROP TABLE`, `ALTER TABLE`, or `DELETE` inside that function will execute on every launch — that's not a migration, that's a permanent reset.

A real migration in this codebase is a **guarded one-shot**: detect whether the schema needs the change, apply it only if so, and let `CREATE TABLE IF NOT EXISTS` cover the steady state.

This file is the source of truth for the pattern. There is no separate migration framework (no node-pg-migrate, no Prisma) — discipline lives in the code itself.

## The lesson that taught this

Earlier work landed a schema rewrite that included these lines inside `db.exec(...)`:

```sql
DROP TABLE IF EXISTS phase_notes;
DROP TABLE IF EXISTS canvas_notes;
```

The first is fine — `phase_notes` was being permanently retired, so dropping it every boot is the same as dropping it once. The second was a data-loss bug: `canvas_notes` was the new table the schema then re-created. Every restart wiped every canvas. It went unnoticed because the table was empty during initial development. As soon as users would have put data in, it'd vanish on next launch.

The fix was a guarded check: drop `canvas_notes` only if it has the OLD schema (missing the new `subproject_id` column). Once the new schema is in place, the drop is skipped.

That's the canonical shape of a migration in this codebase.

## The three migration shapes

Pick the right one for the change.

### Shape A: Add a new column to an existing table

Most common. SQLite's `ALTER TABLE ... ADD COLUMN` is non-destructive but it errors if the column already exists, so guard with `PRAGMA table_info`.

```javascript
// In initDb(), BEFORE the main db.exec(`...schema...`) call:
const xCols = db.prepare('PRAGMA table_info(canvas_notes)').all()
if (!xCols.some(c => c.name === 'last_viewed_at')) {
  db.exec("ALTER TABLE canvas_notes ADD COLUMN last_viewed_at TEXT")
}
```

Why before the schema block: the `CREATE TABLE IF NOT EXISTS` in the main `db.exec` is a no-op when the table exists, so it'll never add the new column on its own. The guarded `ALTER` does the heavy lifting; future boots see the column already exists and skip.

Also add the column to the table's `CREATE TABLE IF NOT EXISTS` so fresh installs get the right shape from the start:

```javascript
CREATE TABLE IF NOT EXISTS canvas_notes (
  // ...existing columns
  last_viewed_at TEXT
);
```

### Shape B: Drop and recreate a table (destructive — confirm with user)

When the column structure changes too much for ALTER (renamed columns, type changes, removed NOT NULL constraints), you might need to drop and recreate. **This destroys data.** Get explicit user confirmation before generating this code.

Pattern: detect the old shape, drop only if old, let CREATE TABLE IF NOT EXISTS rebuild.

```javascript
const tableInfo = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='canvas_notes'"
).get()
if (tableInfo) {
  const cols = db.prepare('PRAGMA table_info(canvas_notes)').all()
  const hasNewColumn = cols.some(c => c.name === 'subproject_id')
  if (!hasNewColumn) {
    db.exec('DROP TABLE IF EXISTS canvas_notes')
  }
}
// Then the main db.exec(...) recreates it with the new schema.
```

If the table contains data that matters, prefer a real migration: read the old rows into memory, drop, recreate, re-insert with the new shape. Wrap in a transaction (`db.transaction(...)`).

### Shape C: Permanently retire a table

When you're removing a feature and discarding its data. Idempotent — `DROP TABLE IF EXISTS` is a no-op once the table is gone, so running it every boot is fine.

```javascript
// Safe to leave unconditionally in initDb — it's idempotent.
db.exec('DROP TABLE IF EXISTS phase_notes')
```

This is the only case where an unconditional DROP inside `initDb` is acceptable.

## The unique-index trick for nullable scope keys

DocketOS's `canvas_notes` is keyed by `(project_id, subproject_id, phase)` where the last two can be NULL. SQLite's default UNIQUE treats NULL as distinct from every other NULL, which would silently allow duplicate rows for the same project's "no subproject, no phase" canvas. Use `IFNULL` in the index expression:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_unique_scope
  ON canvas_notes(project_id, IFNULL(subproject_id, ''), IFNULL(phase, ''));
```

Pattern this whenever you have a nullable foreign key that participates in uniqueness.

## Workflow when the user asks for a migration

1. **Clarify the change**: what column/table, what type, what default, is data lost or migrated?
2. **Confirm destructiveness** if it's Shape B or any DELETE.
3. **Edit `electron/db.js`** in two places:
   - The guarded migration block at the top of `initDb()` (before the main `db.exec`).
   - The `CREATE TABLE IF NOT EXISTS` inside `db.exec` so fresh installs match.
4. **Update or add the corresponding exported functions** that read/write the new column (e.g., a new `updated_at` field probably needs `loadCanvas`/`saveCanvas` updated to round-trip it).
5. **If the migration changes the public function signature** — for example, adding a new required field to `loadCanvas`'s argument — the renderer call sites need updates too. Search for `window.api.<methodName>` to find them.
6. **Build**: `npm run build`. Vite/Rollup builds, no syntax errors.
7. **Don't ship without testing on a populated DB**. If the user has real data in their userData directory, the migration runs against it on next launch. Recommend they back up `%APPDATA%/<app>/<db>.db` first, or do the migration on a copy.

## Anti-patterns to refuse / fix

- `db.exec("DELETE FROM X")` inside `initDb` (unguarded) — wipes the table every boot.
- `db.exec("DROP TABLE X")` (no `IF EXISTS`, no guard) — errors on second boot.
- `db.exec("DROP TABLE IF EXISTS X")` followed by `CREATE TABLE IF NOT EXISTS X` — silent data loss every boot (the data-loss bug we hit).
- `ALTER TABLE X ADD COLUMN Y` without a `PRAGMA table_info` guard — errors on second boot ("duplicate column name").
- Migrations that destroy data without confirming with the user.

If you see any of these in existing code, flag them and propose a guarded version before the user runs the app again.
