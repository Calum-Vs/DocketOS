# Document AI Analysis — Design Spec

**Date:** 2026-05-30  
**Status:** Approved

## Overview

Right-click any supported document in the dashboard to invoke Gemini AI analysis. A two-step popup collects the user's question and summary length preference, then displays the result. A dedicated system prompt in Settings primes the AI with project context before each call.

---

## Supported File Types

| Extension | Gemini delivery method |
|-----------|------------------------|
| `.pdf` | Base64 inline data (`application/pdf`) — Gemini reads natively |
| `.txt`, `.md` | Plain text string |
| `.docx`, `.doc` | Text extracted via `mammoth` npm library, sent as plain text |

If `mammoth` fails on a `.doc` file (old binary format has limited support), the IPC handler returns a user-friendly error rather than crashing.

---

## UI Flow

### 1. Right-click context menu

"🔍 Analyse with AI" appears in the existing `folderContextMenu` for all surfaces where files are shown:
- Quick Links panel
- Kanban cards (todo / in-progress / done / unclassified)
- Any other file entry using `folderContextMenu`

The item is **only shown** when `entry.isDirectory === false` and `entry.name` ends with `.pdf`, `.txt`, `.md`, `.doc`, or `.docx`. Directories never show it.

### 2. Question modal (`docAnalysisDialog` state)

Triggered by clicking "Analyse with AI". Contains:

- **Filename header** — truncated to ~50 chars if needed
- **Text input** — label: "What would you like to know?", placeholder: "e.g. Summarise this document, or list the key action items"
- **Length toggle** — two buttons: `Short` (default) / `Detailed`. Visually similar to a segmented control; active button uses `accent` colour.
- **Analyse button** — disabled until text input is non-empty. Shows a spinner and locks the input while the IPC call is in flight.
- **Cancel button** — closes the modal, no IPC call made.

Length toggle appends to the user question before sending:
- `Short` → appends `"\n\nBe concise — one short paragraph."`
- `Detailed` → appends `"\n\nProvide a detailed, structured response with clear sections and headings."`

### 3. Result modal (`docAnalysisResult` state)

Replaces the question modal after a successful response:

- **Header** — filename + "AI Analysis"
- **Scrollable body** — Gemini response as plain text, preserving line breaks (`white-space: pre-wrap`)
- **Footer buttons:**
  - `Copy to Clipboard` — copies the response text, briefly shows "Copied!" label
  - `Close` — dismisses the modal

**On error:** body shows the error message in red; footer has a `Retry` button that re-opens the question modal with the same question and length pre-filled.

---

## Backend

### `electron/gemini.js` — new export

```js
export async function analyseDocument({ filePath, question, systemPrompt })
```

- Independent of `runAnalysis` — no shared `isRunning` lock, no interference with background audit
- Reads `GEMINI_API_KEY` from env; returns `{ success: false, error: '...' }` if missing
- File reading per type:
  - `.pdf` → `fs.readFileSync` → base64 → `inlineData` part with `mimeType: 'application/pdf'`
  - `.txt` / `.md` → `fs.readFileSync('utf8')` → text part
  - `.docx` / `.doc` → `mammoth.extractRawText({ path: filePath })` → `.value` string as text part; wraps in try/catch, returns error on failure
- Model: `gemini-1.5-flash`, `temperature: 0.3`
- System instruction: `systemPrompt` (from DB, see below)
- User message: the user's question with length instruction appended

### `electron/main.js` — new IPC handler

Channel: `gemini:analyseDocument`

Payload: `{ filePath, question }`

Steps:
1. Validate `filePath` is inside `activeProjectRoot` using existing `isPathInsideActiveProject` guard — returns `{ success: false, error: 'Path not in active project' }` if not
2. Read `gemini_doc_analysis_prompt` from DB via `getSetting`; fall back to built-in default if null/empty
3. Call `analyseDocument({ filePath, question, systemPrompt })`
4. Return `{ success: true, result: '...' }` or `{ success: false, error: '...' }`

**Built-in default system prompt:**
```
You are an assistant helping an engineer analyse project documents.
Answer clearly and professionally. Focus on facts present in the document.
Do not speculate beyond what the document contains.
```

### `electron/preload.js`

Expose via the existing `invoke` wrapper:
```js
geminiAnalyseDocument: (payload) => ipcRenderer.invoke('gemini:analyseDocument', payload)
```

### `package.json`

Add `mammoth` as a production dependency.

---

## Settings

`src/views/Settings.jsx` gets a second Gemini textarea beneath the existing "Gemini System Prompt" (audit) field.

- **Label:** "Document Analysis Prompt"
- **Placeholder:** "Prime the AI before each document analysis — e.g. describe the project type, naming conventions, or what to focus on"
- **Rows:** 6
- **DB key:** `gemini_doc_analysis_prompt`
- Saved/loaded alongside `gemini_system_prompt` in the same settings fetch and save flow
- Character count indicator (same pattern as existing prompt field)

---

## State

Two new state variables in `Dashboard.jsx`:

```js
const [docAnalysisDialog, setDocAnalysisDialog] = useState(null)
// null | { filePath, fileName, question, length, loading, error }

const [docAnalysisResult, setDocAnalysisResult] = useState(null)
// null | { fileName, filePath, result, question, length, error }
```

`docAnalysisDialog.loading = true` while the IPC call is in flight. On success, `setDocAnalysisDialog(null)` and `setDocAnalysisResult({ ... })`. On error, `docAnalysisDialog.error` is set and loading is cleared so the user can retry.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| No API key | Error shown in result modal: "GEMINI_API_KEY is not set" |
| File not in active project | Error: "File is outside the active project" |
| mammoth parse failure | Error: "Could not extract text from this Word document" |
| File read failure | Error: "Could not read file: [os error message]" |
| Gemini API error | Error: Gemini error message surfaced to user |
| Network timeout | Error: "Request timed out — check your connection" |

All errors show a Retry button that re-opens the question modal with the previous question and length pre-filled.

---

## What This Does Not Do

- Does not store or log analysis results — each invocation is ephemeral
- Does not add the result to the note canvas or kanban automatically
- Does not support files outside the active project root
- Does not support image files, spreadsheets, or other binary formats (can be added later)
- Does not run multiple analyses concurrently (second right-click while one is in flight opens a new dialog that starts its own independent call)
