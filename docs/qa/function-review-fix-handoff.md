# Function Review Fix Handoff

Date: 2026-05-28  
Reviewer: Ivy, QA Engineer

## Status

QA sign-off remains blocked until the issues below are fixed and re-tested.

## Required Fixes

### 1. Restrict folder listing IPC to the active project root

**Component:** Main process filesystem IPC  
**Severity:** major  
**Files:** `electron/main.js`, `electron/preload.js`

`fs:listFolders` currently accepts any renderer-provided path and returns directory names without verifying the path is inside `activeProjectRoot`.

**Expected fix:** Apply the same active-root validation pattern used by `fs:scanDir`, including case-insensitive comparison on Windows.

**Retest:** Attempt to list a path outside the active project root. The handler should return an empty list or a structured failure without reading the external directory.

### 2. Restrict Explorer open IPC to safe project/report paths

**Component:** Main process filesystem IPC  
**Severity:** major  
**Files:** `electron/main.js`, `src/views/Dashboard.jsx`, `src/components/FolderTree.jsx`

`fs:openInExplorer` opens any renderer-provided path with `shell.openPath`.

**Expected fix:** Validate that renderer-requested paths are inside the active project root. Keep internally generated safe opens, such as generated reports and app help folders, separate from renderer-controlled `fs:openInExplorer` if needed.

**Retest:** Calls with active project paths should open. Calls with paths outside the active project should be rejected.

### 3. Fix Smart Move path resolution

**Component:** Gemini audit actions / file move IPC  
**Severity:** major  
**Files:** `src/views/Dashboard.jsx`, `electron/main.js`

Smart Move sends Gemini relative paths directly to `fs:moveFile`, but the main process resolves them against the process working directory and rejects them as outside `activeProjectRoot`.

**Expected fix:** Convert Gemini relative file paths into active-project absolute paths before moving, or make `fs:moveFile` explicitly resolve relative `from` and `to` values against `activeProjectRoot` before validation.

**Retest:** A Gemini result with `filePath: "incoming/a.dwg"` and `suggestedPath: "wip/a.dwg"` should move the file inside the active project and mark the result moved.

### 4. Wire Project Folder Tree selection

**Component:** Folder tree / subproject activation  
**Severity:** major  
**Files:** `src/components/FolderTree.jsx`, `src/views/Dashboard.jsx`

Dashboard passes `onSelectFolder={handleFolderSelect}`, but `FolderTree` does not accept or invoke that prop. Folder clicks only toggle expansion.

**Expected fix:** Add `onSelectFolder` to `FolderTree` and `FolderNode`, invoke it when a folder row is selected, and preserve expand/collapse button behavior.

**Retest:** Clicking a folder under the project tree should update the Active Subproject panel and load the subproject state.

### 5. Sanitize persisted canvas HTML before rendering

**Component:** Canvas notes renderer  
**Severity:** major  
**Files:** `src/components/canvas/CanvasBox.jsx`, optionally `electron/db.js`

Canvas boxes render persisted `box.html` using `dangerouslySetInnerHTML` without sanitization.

**Expected fix:** Sanitize note HTML with an allowlist before rendering, or store/render plain text instead of raw HTML. Because this is an Electron app with exposed IPC APIs, do not render arbitrary persisted HTML.

**Retest:** A note containing `<script>` or event-handler attributes should render inert text or sanitized markup and must not execute code.

### 6. Sanitize note HTML in generated reports

**Component:** Report generation  
**Severity:** minor to major, depending on note trust model  
**Files:** `electron/report.js`

Generated report HTML escapes most fields but inserts `b.html` directly.

**Expected fix:** Reuse the same sanitizer as the canvas renderer, or escape note bodies if rich formatting is not required.

**Retest:** Generated reports should not execute script or event-handler HTML from saved notes.

### 7. Prevent silent template overwrite

**Component:** Template open/copy  
**Severity:** minor  
**Files:** `electron/main.js`, optionally `src/views/Dashboard.jsx`

Opening a template copies it to the project root using the template filename. Existing files with the same name are overwritten by `fs.copyFileSync`.

**Expected fix:** Check whether the destination exists before copying. Return a clear error or require explicit confirmation for overwrite.

**Retest:** If `projectRoot/template.xlsx` exists, opening a template with the same basename should not overwrite it without confirmation.

### 8. Handle corrupt canvas JSON gracefully

**Component:** Canvas persistence  
**Severity:** minor  
**Files:** `electron/db.js`, optionally `src/components/NoteCanvas.jsx`

`loadCanvas` directly parses `content_json`. A malformed DB row can break canvas loading.

**Expected fix:** Catch JSON parse failures and return a default canvas payload with an error marker, or repair the row to the default content.

**Retest:** Manually corrupt a canvas row and load the canvas. The UI should remain usable and should not crash.

## Verification Required After Fixes

- Run `npm run build`.
- Re-test project creation and activation.
- Re-test folder tree selection and active subproject loading.
- Re-test folder create, rename, scan, list, and open actions inside active project root.
- Re-test rejected filesystem access outside active project root.
- Re-test Smart Move using relative Gemini paths.
- Re-test template open with both new and colliding destination filenames.
- Re-test canvas rendering with harmless rich content and hostile HTML payloads.
- Generate and open a project report after note sanitization.
