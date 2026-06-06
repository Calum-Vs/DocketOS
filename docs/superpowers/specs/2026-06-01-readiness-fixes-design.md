# Readiness Fixes Design

**Date:** 2026-06-01

Three targeted fixes identified during a readiness review. Each is independent.

---

## 1. Electron Launch Fix

**Problem:** Fresh `electron .` crashes immediately — `require("electron")` resolves to the npm package path string instead of the native module. Likely a corrupted/mis-linked Electron install on this machine.

**Fix:** Re-run the postinstall hook which executes `electron-rebuild -f -w better-sqlite3`. If that doesn't resolve it, delete `node_modules/electron` and run `npm install` again.

**Command:**
```
npm install
```
(postinstall runs `electron-rebuild` automatically per package.json)

If that fails:
```
Remove-Item node_modules/electron -Recurse -Force
npm install
```

**Validation:** `electron .` launches the app window without crashing.

---

## 2. Template Staging — Allow Duplicate Staging

**Problem:** The template panel dropdown silently ignores a pick if that file is already staged. Users need to be able to stage the same template multiple times (e.g. copy `Transmittal.xlsx` to three different subfolders in one operation, renaming each copy).

**Location:** `src/views/Dashboard.jsx` — the `onChange` handler on the template `<select>`.

**Current behaviour:**
```js
setTplStagingItems(prev =>
  prev.find(s => s.sourcePath === f.path)
    ? prev                          // ← silently ignores duplicate
    : [...prev, { id: crypto.randomUUID(), ... }]
)
```

**Fix:** Remove the deduplication guard. Every pick unconditionally appends a new staging item:
```js
setTplStagingItems(prev => [
  ...prev,
  { id: crypto.randomUUID(), sourcePath: f.path, sourceName: f.name, destName: f.name }
])
```

**No other changes** to the template panel. The dropdown already resets to placeholder after each pick (`value=""`). Already-staged file options are not greyed out (users have many templates and need duplicates).

---

## 3. Settings — Remove Save Launchers Button, Auto-Save Path Edits on Blur

**Problem:** Two inconsistencies in the Application Path Registry section:
1. Adding a new launcher auto-saves immediately (`handleAddLauncher` calls `persistLauncherSettings`).
2. Editing an existing launcher's path requires clicking "Save Launchers" — inconsistent with the add flow.
3. The "Save Launchers" button label is misleading (it saves all paths, not just launchers).

**Fix:**

### Remove the button
Delete the "Save Launchers" `<button>` element from the Application Path Registry header in `src/views/Settings.jsx`. The `handleSaveAllPaths` function and `persistLauncherSettings` helper stay — they are still used by `handleAddLauncher`.

### Auto-save on blur for existing launcher path fields
In the `LauncherRow` component (wherever the path `<input>` is rendered), add an `onBlur` prop that calls `settingsUpsertPath` for that specific key when the field loses focus. The parent passes this down.

Add a prop `onPathBlur` to `LauncherRow`. In `Settings.jsx`, wire it to call `window.api.settingsUpsertPath({ key: app.pathKey, path: paths[app.pathKey] })` directly (no global saving state needed — individual field saves are fast and silent).

### Remove pathsSaving from Add button
The `disabled={pathsSaving || ...}` on the Add button was only needed to prevent concurrent global saves. With the button gone, simplify to `disabled={!newLauncher.label.trim()}`.

### Persist drag-to-reorder automatically
`handleDropLauncher` currently only calls `setLauncherApps` (local state only). With the Save button gone, the new order would be lost on reload. Fix: after the splice, call `persistLauncherSettings(next, paths)` so the registry is saved immediately. `paths` is already in scope.

---

## Out of Scope

- Template panel visual redesign (layout, colours, panel height) — not changed
- Gemini settings, file routing rules, other settings sections — not touched
- Any changes to `electron/main.js`, `electron/preload.js`, or `electron/db.js`
