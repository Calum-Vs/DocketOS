# AI Assistants in DocketOS

DocketOS uses Google Gemini for **two distinct AI features**. They are separate
prompts, separate code paths, and have separate enable/disable controls. Do not
conflate them.

---

## 1. Document Summary AI (PDF / Word) &mdash; **ENABLED**

**What it does:** Summarises or answers a question about a single document
(PDF, DOCX, etc.) on demand.

**How it is triggered:**
- Right-click a document in the kanban or folder tree &rarr; **Analyse**.
- The user types a question (or accepts the default) and picks short / detailed.
- Result appears in the right-side panel under the **Document Summary AI**
  section as a history of past summaries.

**Code path:**
- IPC channel: `gemini:analyseDocument`
- Renderer: `window.api.geminiAnalyseDocument({ filePath, question })` &mdash;
  see `handleDocAnalyse` in [src/views/Dashboard.jsx](src/views/Dashboard.jsx).
- Main: `analyseDocument()` in [electron/gemini.js](electron/gemini.js).
- System prompt: `gemini_doc_analysis_prompt` in `settings`
  (edited from [src/views/Settings.jsx](src/views/Settings.jsx)).
- **Model picker:** the Analyse dialog lets the user choose between
  `gemini-2.5-flash` (default), `gemini-2.5-flash-lite`, and
  `gemini-3.5-flash` (badged **Paid** — 1M-token context, multimodal vision,
  and context caching, recommended for long engineering PDFs). The chosen
  model id is sent through `gemini:analyseDocument` and validated against an
  allowlist in [electron/gemini.js](electron/gemini.js) before any API call.

---

## 2. File Audit AI (project-wide scan) &mdash; **DISABLED**

**What it does:** Sweeps the whole active project, classifies files against the
configured backend rules, and proposes moves / renames. Results render as a
list of pass/warn/error rows in the same right-side panel.

**Current status:** **OFF by user request.** Do not silently re-enable it.

**How it is gated:**
- Renderer flag `AUDIT_AI_ENABLED = false` near the top of
  [src/views/Dashboard.jsx](src/views/Dashboard.jsx). When `false`:
  - The **Run Audit** button in the right-panel header is hidden.
  - The "File Audit" results block is not rendered.
- The IPC channels (`gemini:runManual`, `gemini:result`) and the main-process
  `runAnalysis()` in [electron/gemini.js](electron/gemini.js) are still wired
  up, but nothing in the UI calls them while the flag is `false`.
- The file watcher does **not** auto-trigger the audit
  (see [electron/fileWatcher.js](electron/fileWatcher.js)).

**To re-enable later:** Flip `AUDIT_AI_ENABLED` to `true`. No other changes
required.

**System prompt:** `gemini_system_prompt` in `settings` (separate from the
document-summary prompt above).

---

## Rule for future agents

If asked to change AI behaviour, first identify **which** of these two AIs the
request refers to. They share a panel in the UI but are otherwise independent.
Do not enable the File Audit AI without explicit user instruction.
