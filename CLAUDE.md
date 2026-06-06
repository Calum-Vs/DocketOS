# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication style

Don't narrate every step. Make the change, then say what you did in one or two sentences. No "Now I'll...", no "Let me...", no per-file commentary while working.

## Working in this codebase

**Read the code before editing it.** Open the file, scan the imports and the relevant section, and confirm the shape you're about to change actually matches what you think it is. Files in this project frequently change between sessions (the user edits outside Claude, other tools touch the tree), so assumed file layouts go stale fast — and bad edits land worst when they're confidently wrong.

**Project skills live under `.claude/skills/`** — consult them before non-trivial changes:
- `add-ipc` — scaffolds a new IPC handler across `db.js / main.js / preload.js` (the trio must stay in sync or the renderer silently fails).
- `db-migration` — guarded schema changes for `initDb()`. Unguarded `DROP TABLE` inside `db.exec()` wipes user data on every restart.
- `lessons-learned` — short captured gotchas from prior sessions; read the relevant ones before risky changes.
- `engine-backend-settings` — use before adding any settings/configuration UI. All persistent options belong in Engine Backend.
- `ui-components` — use before writing any button, input, panel, or feedback element. Copy class strings from here, do not invent new ones.
- `design-language` — use before changing colours, fonts, or theme. `tailwind.config.js`, `index.css`, and the `S` object must stay in sync.
- `ipc-patterns` — use when naming or reviewing IPC channels. Channel naming, request/reply vs push events, error shape.
- `error-surfaces` — use before writing error handling or feedback. Inline text vs dialog, auto-clear vs persistent.
- `feature-checklist` — use before declaring any feature done. Build, IPC symmetry, settings placement, UI standards, data safety.

**Standards docs live under `.claude/standards/`** — these are the source of truth the skills reference:
- `engine-backend.md` — settings rule and existing section map
- `ui-components.md` — component patterns with exact Tailwind class strings
- `design-language.md` — colour palette, fonts, feel; update here first then propagate to code
- `ipc-patterns.md` — channel naming, handler shape, full channel list
- `error-surfaces.md` — decision table for feedback surfaces
- `feature-checklist.md` — pre-flight checklist

**A PostToolUse hook** (`.claude/scripts/check-ipc-symmetry.mjs`) runs on every edit and flags any `ipcMain.handle` ↔ `ipcRenderer.invoke` mismatch across the trio. Silent output = symmetric.

**`npm run build` is the only validation gate** — there are no tests, no linter, no type checker. After a non-trivial code change, run a build before declaring it done.

## Commands

```bash
# Start dev server (Electron + Vite hot-reload)
npm run dev

# Production build
npm run build

# Build installer + publish to GitHub Releases (bump version in package.json first)
# This triggers auto-update on installed clients — use this, not npm run dist
npm run publish

# Build installer locally only (no GitHub publish, no auto-update trigger)
npm run dist

# After installing dependencies — rebuilds better-sqlite3 native addon against Electron's Node
npm install   # postinstall runs electron-rebuild automatically

# If the native addon fails to load, run manually:
npx electron-rebuild -f -w better-sqlite3
```

There are no tests. There is no linter configured.

## Architecture

This is a Windows-only Electron 28 + React 18 + Vite 5 desktop app. The app manages engineering project files with AI-assisted organisation.

### Process boundary

The **main process** (`electron/`) runs in Node and handles all system access. The **renderer** (`src/`) is a standard React SPA with no Node access. They communicate exclusively via IPC:

- `electron/preload.js` — exposes `window.api` via `contextBridge`. All renderer→main calls go through typed convenience methods here (e.g. `window.api.projectsList()`), plus a generic `window.api.invoke(channel, ...args)` and `window.api.on(channel, cb)` for push events.
- `electron/main.js` — registers all `ipcMain.handle` listeners and owns `activeProjectRoot` state (used by the `fs:moveFile` path traversal guard).

### Main process modules

| File | Responsibility |
|---|---|
| `electron/db.js` | SQLite via `better-sqlite3`; all DB access is synchronous. Tables: `projects`, `project_subprojects`, `canvas_notes`, `templates`, `outgoing_log`, `backend_rules`, `settings`, plus the documents/intake/review surface (`documents`, `document_revisions`, `document_text_content`, `intake_packages`, `brief_drafts`, `review_comments`, `checklist_templates`, `checklist_items`, `standards_rules`, `saved_views`, `backup_metadata`). DB lives in Electron `userData`. |
| `electron/fileWatcher.js` | Async `fs.watch({ recursive: true })` on the active project root; 2000ms debounce; emits `kanban:update` and `watcher:update` to renderer. `scanDir` and `indexDocuments` use `fs.promises` with a `statSafe()` helper (500ms per-file timeout) so SharePoint/OneDrive cloud-only files don't block the main process. |
| `electron/gemini.js` | Calls Gemini 2.5 Flash API. 30s debounce, 20s min interval, exponential backoff on 429, input fingerprinting to skip redundant calls. `isRunning` flag prevents concurrent requests. API key from `GEMINI_API_KEY` env var or settings DB. |
| `electron/launcher.js` | Spawns configured exes (AutoCAD, 12D, Excel, Word) detached. Validates against `ALLOWED_APP_KEYS` allowlist before hitting the DB. |
| `electron/main.js` (auto-updater) | `electron-updater` checks GitHub Releases on startup (`app.isPackaged` only). The GitHub repo (`calumplinsell-dot/DocketOS`) is **public**, so installed clients fetch update metadata and installers anonymously — no `GH_TOKEN` or auth is needed on the client. Help → Check for Updates shows up-to-date / update-available / restart dialogs. `manualUpdateCheck` flag keeps the startup check silent. |
| `electron/filing.js` | Creates date-prefixed outgoing transmittal folders in `outgoing_dir`, optionally copies first `.xlsx` from `templates_dir` (non-fatal if missing), then opens in Explorer. |

### Kanban folder mapping

`fileWatcher.js` buckets files by top-level subfolder name:
- `incoming/` or `inbox/` → `todo`
- `wip/` or `in-progress/` → `inProgress`
- `outgoing/`, `issued/`, or `archive/` → `done`
- anything else → `unclassified`

### Renderer views

`src/App.jsx` is a simple two-view router (`dashboard` / `settings`) with no routing library.

- `src/views/Dashboard.jsx` — main working view: project selector, kanban board, Gemini audit panel, filing script runner, and the bottom-centre `NoteCanvas` (interactive pannable/zoomable surface with two modes: a free-form note canvas — double-click to create rich-text boxes, drag connector dots to link them, wheel-to-cursor zoom — and a folder-tree mode that mirrors the project directory). Boxes and connections persist per `(project, subproject_or_null, phase_or_null)` scope via `canvas_notes`.
- `src/views/Settings.jsx` — Gemini system prompt editor, file routing rules CRUD, application path registry, directory configuration.

### Styling

Tailwind with a custom dark theme ("Volta Dark System"). Custom tokens are defined in `tailwind.config.js` (`bg-base`, `bg-surface`, `bg-elevated`, `border-subtle`, `accent`, etc.). Dashboard also uses an inline `S` style token object for colours that don't map cleanly to Tailwind utilities.

### Native addon constraint

`better-sqlite3` is a native Node addon. It **must** be excluded from Rollup bundling — this is done in `vite.config.js` via `rollupOptions.external: ['better-sqlite3']` for the main process entry. Removing this line breaks the build.

### Security constraints

- `contextIsolation: true`, `nodeIntegration: false` — all renderer code is sandboxed.
- `fs:moveFile` enforces that both source and destination paths start with `activeProjectRoot + path.sep`.
- `settings:upsertPath` validates the key against `ALLOWED_PATH_KEYS` before writing to DB.
- `launcher:open` validates `appKey` against `ALLOWED_APP_KEYS` before reading from DB.

### Accepted XSS surface (documented, not a bug)

`src/components/canvas/CanvasBox.jsx` renders persisted note HTML via `dangerouslySetInnerHTML`, and `electron/report.js` interpolates the same HTML unescaped into the printed report. The renderer also writes `box.html` into a `contentEditable` div for editing. A partial mitigation lives in CanvasBox (allowlist sanitizer over `B/STRONG/I/EM/U/S/P/BR/UL/OL/LI/DIV/SPAN/H3`, attributes stripped); the write path and report path are not yet sanitised.

This is a documented tradeoff (single-user local Electron app with no external input vector, see `docs/superpowers/specs/2026-05-28-interactive-note-canvas-design.md`). Do NOT unilaterally introduce DOMPurify or rewrite the sanitiser in a passing edit — a full hardening sweep should land deliberately across all three paths. See `.claude/skills/lessons-learned/lessons/xss-surface-is-documented-not-a-bug.md`.

### Windows environment quirks

**Electron won't launch — `require("electron")` returns a path string:** Windows Defender is intercepting the native module. Fix (no admin needed):
```powershell
Add-MpPreference -ExclusionPath "C:\Project\DocketOS\node_modules\electron\dist"
Add-MpPreference -ExclusionPath "C:\Project\DocketOS"
```

**SharePoint / OneDrive project paths** (e.g. `C:\Users\x\Org - Documents\...`): `fileWatcher.js` handles these safely via async + `statSafe()` timeouts. Do not reintroduce synchronous `readdirSync` or `statSync` in the watcher — cloud-only files block indefinitely.

### Release version

Current: **0.1.6**. Bump `version` in `package.json` before each `npm run publish`.

The GitHub repo (`calumplinsell-dot/DocketOS`) is **public**. Auto-update therefore works for installed clients without any credentials — `electron-updater` reads `latest.yml` and the installer straight from the public GitHub Release. Publishing still requires a `GH_TOKEN` with write access on the machine running `npm run publish`.

### Git layout

The actual git repository root is `C:/Project` (the parent of `DocketOS/`). The DocketOS subdirectory was added to that parent repo only partially — many source files show as untracked when running `git status` from inside DocketOS, and the parent repo also contains an unrelated `Roamlee Vault/` tree. Consequences worth knowing:

- `git status` lists relative to cwd but operates against the parent repo. Run `git rev-parse --show-toplevel` to confirm where commits actually land.
- Commit diffs are recorded with a `DocketOS/` path prefix; small edits to previously-untracked files show as huge first-time additions, not as the actual delta.
- Do NOT bulk-stage everything in DocketOS without checking — the user's partial tracking is deliberate. And NEVER stage `../Roamlee Vault/` or `../roamlee*` paths in DocketOS commits; they belong to a different project.
