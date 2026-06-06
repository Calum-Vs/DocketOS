# File Search — Design Spec
**Date:** 2026-05-31

## Overview

A file-name search bar embedded in the Project Folders section of the left panel. Lets the user quickly locate any file within the active project root by typing part of its name, then reveals it in the folder tree.

## Scope

- Searches file names only (no content search).
- Scoped to the active project root directory.
- Single project at a time; no cross-project search.
- Results capped at 50.

## UI

The search bar sits inside the PROJECT FOLDERS section header row, between the section title and the existing "Open Root" / drag-handle controls. It is a small text input with placeholder "Search files…".

- Disabled and visually greyed when no project root is set.
- While the query string is non-empty, the folder tree is replaced by a flat results list.
- Each result row shows: filename (primary, full weight) and relative path beneath it (secondary, muted mono).
- Clicking a result expands the folder tree to the file's parent directory and clears the search input.
- If the query returns no matches, shows "No files found." in place of the tree.
- Clearing the input restores the normal folder tree.

## IPC

**Channel:** `fs:searchFiles`

**Request:** `{ rootPath: string, query: string }`

**Response:** `Array<{ name: string, relativePath: string, fullPath: string }>`

Implementation in `electron/main.js`:
- Uses `fs.readdirSync(rootPath, { recursive: true, withFileTypes: true })` (Node 18+).
- Filters to entries where `entry.isFile()` and `entry.name.toLowerCase().includes(query.toLowerCase())`.
- Returns at most 50 results.
- Returns empty array on any FS error (missing root, permission denied, etc.).

Registered in `preload.js` as `window.api.fsSearchFiles({ rootPath, query })`.

## Renderer Behaviour

- 300ms debounce on the input to avoid hammering the FS on every keystroke.
- Pending search shows a subtle loading indicator (e.g. dimmed result area).
- "Reveal" on click: calls the existing folder-tree expand logic with the result's parent path, then clears the search.

## Error Handling

- IPC returns `[]` on any error; renderer shows "No files found." — no error toasts.
- Input is disabled when `activeProject?.root_path` is falsy.

## Out of Scope

- File content search.
- Cross-project search.
- Fuzzy matching (simple `includes` is sufficient).
- Keyboard navigation of results (not in initial version).
