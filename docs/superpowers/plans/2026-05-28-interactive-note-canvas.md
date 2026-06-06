# Interactive Note Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder dot-grid panel and the `PhaseNotes` date-journal modal with an interactive infinite canvas: double-click to create text boxes, single-click to select, double-click to edit, drag to move/resize, draw arrow connections between boxes.

**Architecture:** Three-layer DOM/SVG canvas inside `Dashboard.jsx`'s bottom-center panel. Pan layer (`transform: translate`) contains an SVG connections layer (under) and absolutely-positioned `<div>` boxes (over). Per-canvas state is one JSON blob in `canvas_notes` keyed by `(project_id, subproject_id, phase)`. Autosave debounced 600ms.

**Tech Stack:** React 18 + Vite 5 + Electron 28 + better-sqlite3. No new dependencies. Tailwind for class names; inline `style` for canvas-specific values.

**Testing note:** This project has no test framework. Each task ends with manual verification via `npm run dev`. Do NOT introduce Jest, Vitest, or any test framework — the project explicitly omits one.

**Known XSS surface (carried over from PhaseNotes):** Box content is rendered with `dangerouslySetInnerHTML` and assigned via `innerHTML` on the contentEditable. The existing `PhaseNotes` component, the unchanged `electron/report.js`, and this plan all use the same pattern. The content originates from the user's own typing inside their local Electron app — there is no external input vector — but a malicious paste (e.g. an `<img onerror>` from clipboard) could execute in the renderer. Out of scope for this feature; should be addressed in a future hardening pass by piping all HTML reads/writes through a sanitizer like DOMPurify. Do NOT introduce DOMPurify in this plan — keep parity with the existing pattern so the canvas behaves identically to today's notes during the swap, and harden everywhere in one follow-up.

**Reference spec:** [docs/superpowers/specs/2026-05-28-interactive-note-canvas-design.md](../specs/2026-05-28-interactive-note-canvas-design.md)

---

## File Map (created or modified across all tasks)

| File | Action | Tasks |
|---|---|---|
| `electron/db.js` | Modify | 1, 15 |
| `electron/main.js` | Modify | 1, 2 |
| `electron/preload.js` | Modify | 1, 2 |
| `src/views/Dashboard.jsx` | Modify | 2, 3 |
| `src/components/PhaseNotes.jsx` | Delete | 2 |
| `src/components/NoteCanvas.jsx` | Create | 3 |
| `src/components/canvas/CanvasBox.jsx` | Create | 3, 6, 7, 8, 9 |
| `src/components/canvas/useCanvasInteractions.js` | Create | 4 |
| `src/components/canvas/CanvasConnections.jsx` | Create | 11, 13 |
| `electron/report.js` | Modify | 15 |

---

## Task 1: Database schema + load/save functions

**Files:**
- Modify: `electron/db.js` (lines 24-31, 100-103, plus add new functions at the bottom)

- [ ] **Step 1.1: Replace the canvas_notes CREATE TABLE block and drop phase_notes**

In `electron/db.js`, find the `db.exec(\`...\`)` block (around lines 15-83) and modify the schema string. Replace the existing `canvas_notes` CREATE TABLE statement (lines 24-31) and the entire `phase_notes` CREATE TABLE statement (lines 33-42) with this single block:

```javascript
db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT,
      root_path     TEXT NOT NULL,
      current_phase TEXT DEFAULT 'masterplan'
    );

    DROP TABLE IF EXISTS phase_notes;
    DROP TABLE IF EXISTS canvas_notes;

    CREATE TABLE IF NOT EXISTS canvas_notes (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      subproject_id TEXT,
      phase         TEXT,
      content_json  TEXT NOT NULL DEFAULT '{"boxes":[],"connections":[],"pan":{"x":0,"y":0}}',
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_unique_scope
      ON canvas_notes(project_id, IFNULL(subproject_id, ''), IFNULL(phase, ''));

    CREATE TABLE IF NOT EXISTS project_subprojects (
      id            TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      subproject_path TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      current_phase TEXT DEFAULT 'masterplan',
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_subprojects_unique
      ON project_subprojects(project_id, subproject_path);

    CREATE TABLE IF NOT EXISTS templates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      file_path  TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS outgoing_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      folder_name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS backend_rules (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      extension        TEXT NOT NULL,
      regex_pattern    TEXT NOT NULL,
      target_subfolder TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
```

- [ ] **Step 1.2: Delete the phase_notes ALTER TABLE migration block**

Delete these lines (originally db.js:100-103):

```javascript
  const phaseColumns = db.prepare('PRAGMA table_info(phase_notes)').all()
  if (!phaseColumns.some(column => column.name === 'subproject_id')) {
    db.exec('ALTER TABLE phase_notes ADD COLUMN subproject_id TEXT')
  }
```

The `phase_notes` table no longer exists; the block would fail.

- [ ] **Step 1.3: Delete the four phase-notes functions**

Delete these functions from `electron/db.js` (originally lines 170-207):

- `listPhaseNotes`
- `listAllPhaseNotes`
- `upsertPhaseNote`
- `deletePhaseNote`

- [ ] **Step 1.4: Add canvas load/save/list functions**

Append to `electron/db.js`:

```javascript
// Canvas Notes

export function loadCanvas({ projectId, subprojectId = null, phase = null }) {
  let row = db.prepare(
    `SELECT * FROM canvas_notes
     WHERE project_id = ?
       AND IFNULL(subproject_id, '') = IFNULL(?, '')
       AND IFNULL(phase, '') = IFNULL(?, '')`
  ).get(projectId, subprojectId, phase)

  if (!row) {
    const id = randomUUID()
    db.prepare(
      'INSERT INTO canvas_notes (id, project_id, subproject_id, phase) VALUES (?, ?, ?, ?)'
    ).run(id, projectId, subprojectId, phase)
    row = db.prepare('SELECT * FROM canvas_notes WHERE id = ?').get(id)
  }

  return { id: row.id, content: JSON.parse(row.content_json) }
}

export function saveCanvas({ id, content }) {
  const json = JSON.stringify(content)
  const updated_at = new Date().toISOString()
  db.prepare(
    'UPDATE canvas_notes SET content_json = ?, updated_at = ? WHERE id = ?'
  ).run(json, updated_at, id)
  return { ok: true, updated_at }
}

export function listAllCanvases(projectId) {
  return db.prepare(
    'SELECT * FROM canvas_notes WHERE project_id = ? ORDER BY subproject_id, phase'
  ).all(projectId)
}
```

- [ ] **Step 1.5: Add IPC handlers in main.js**

In `electron/main.js`, update the import at lines 5-11. Replace:

```javascript
import {
  initDb, listProjects, createProject, ensureProjectByRootPath, listProjectSubprojects, ensureProjectSubproject, updateProjectSubprojectPhase, updateProjectPhase,
  getAllSettings, getSetting, upsertSetting, upsertRule, deleteRule, listRules,
  listPhaseNotes, upsertPhaseNote, deletePhaseNote,
  listTemplates, upsertTemplate, deleteTemplate,
  listOutgoingLog,
} from './db.js'
```

With:

```javascript
import {
  initDb, listProjects, createProject, ensureProjectByRootPath, listProjectSubprojects, ensureProjectSubproject, updateProjectSubprojectPhase, updateProjectPhase,
  getAllSettings, getSetting, upsertSetting, upsertRule, deleteRule, listRules,
  loadCanvas, saveCanvas,
  listTemplates, upsertTemplate, deleteTemplate,
  listOutgoingLog,
} from './db.js'
```

Then delete the existing `// Phase Notes` block (originally main.js:209-220):

```javascript
// Phase Notes

ipcMain.handle('notes:list', (_e, { projectId, subprojectId, phase }) =>
  listPhaseNotes(projectId, phase, subprojectId)
)

ipcMain.handle('notes:upsert', (_e, data) => upsertPhaseNote(data))

ipcMain.handle('notes:delete', (_e, { id }) => {
  deletePhaseNote(id)
  return { success: true }
})
```

And replace with:

```javascript
// Canvas

ipcMain.handle('canvas:load', (_e, payload) => loadCanvas(payload))

ipcMain.handle('canvas:save', (_e, payload) => saveCanvas(payload))
```

- [ ] **Step 1.6: Update preload.js**

In `electron/preload.js`, replace lines 35-38:

```javascript
  // Phase Notes
  notesList:   (data) => ipcRenderer.invoke('notes:list', data),
  notesUpsert: (data) => ipcRenderer.invoke('notes:upsert', data),
  notesDelete: (data) => ipcRenderer.invoke('notes:delete', data),
```

With:

```javascript
  // Canvas
  canvasLoad: (data) => ipcRenderer.invoke('canvas:load', data),
  canvasSave: (data) => ipcRenderer.invoke('canvas:save', data),
```

- [ ] **Step 1.7: Manually verify the DB layer compiles**

Run: `npm run dev`

Expected: Electron starts. **The app will crash in the renderer** because `Dashboard.jsx` still references `notesList/notesUpsert/notesDelete` — that's fine, we fix it in Task 2 and Task 3. Confirm only that:

- The Electron main process logs `[db] initialised at ...` without throwing.
- DevTools console shows IPC errors like `Cannot read properties of undefined (reading 'notesList')` — this proves the old IPC names are gone and the new schema applied.

If the main process throws on startup (e.g. SQL syntax error), stop and fix before moving on.

- [ ] **Step 1.8: Commit**

```bash
git add electron/db.js electron/main.js electron/preload.js
git commit -m "feat(canvas): replace phase_notes schema with canvas_notes; add load/save IPC"
```

---

## Task 2: Delete PhaseNotes UI and clean Dashboard.jsx

**Files:**
- Delete: `src/components/PhaseNotes.jsx`
- Modify: `src/views/Dashboard.jsx`

- [ ] **Step 2.1: Delete the PhaseNotes component file**

```bash
git rm src/components/PhaseNotes.jsx
```

- [ ] **Step 2.2: Remove the PhaseNotes import in Dashboard.jsx**

In `src/views/Dashboard.jsx`, delete line 4:

```javascript
import PhaseNotes from '../components/PhaseNotes.jsx'
```

- [ ] **Step 2.3: Remove the notes state and modal handler**

In `src/views/Dashboard.jsx`:

Delete lines 55-56 (the two state declarations):

```javascript
  const [showNotes,       setShowNotes]      = useState(false)
  const [notesPhase,      setNotesPhase]     = useState('masterplan')
```

Delete the `handlePhaseClick` function (lines 213-216):

```javascript
  async function handlePhaseClick(phaseKey) {
    setNotesPhase(phaseKey)
    setShowNotes(true)
  }
```

Update the sidebar phase button handler. Find this line (originally Dashboard.jsx:445):

```javascript
                        onClick={() => handlePhaseClick(phase.key)}
```

Replace with a no-op (the phase row's `→` button on line 459 still calls `handleSetPhase` to change the active phase; the row itself doesn't need to do anything since clicking will become a normal noop while the canvas already shows whatever the active phase is). Use:

```javascript
                        onClick={() => handleSetPhase(phase.key)}
```

This means clicking a phase row now sets it as active, which causes the canvas (mounted in Task 3) to re-scope. The separate `→` button at line 459 still also calls `handleSetPhase`; that's fine — both routes now do the same thing.

Now delete the entire `→` button block (originally lines 457-466) since it's redundant:

```javascript
                      {!isCurrent && (
                        <button
                          onClick={() => handleSetPhase(phase.key)}
                          title="Set as current phase"
                          className="text-xs px-1 hover:text-white transition"
                          style={{ color: S.dim, fontSize: '10px' }}
                        >
                          →
                        </button>
                      )}
```

Update the help text below (line 472):

```javascript
              <p className="mono mt-2" style={{ fontSize: '10px', color: S.dim }}>
                Click phase name to open notes for the current scope · → to set active
              </p>
```

Replace with:

```javascript
              <p className="mono mt-2" style={{ fontSize: '10px', color: S.dim }}>
                Click a phase to scope the canvas
              </p>
```

- [ ] **Step 2.4: Remove the PhaseNotes modal render**

In `src/views/Dashboard.jsx`, delete lines 709-717 (the PhaseNotes modal):

```javascript
      {showNotes && activeProject && (
        <PhaseNotes
          projectId={activeProject.id}
          subprojectId={activeSubproject?.id ?? null}
          scopeLabel={activeSubproject ? `${activeProject.name} · ${activeSubproject.display_name}` : activeProject.name}
          initialPhase={notesPhase}
          onClose={() => setShowNotes(false)}
        />
      )}
```

- [ ] **Step 2.5: Update the placeholder panel button**

The placeholder div at Dashboard.jsx:550-572 still has a button that opens the notes modal. Leave the placeholder alone for now (it will be replaced entirely in Task 3) but change the button's onClick so the file still compiles. Find:

```javascript
              {activeProject && (
                <button
                  onClick={() => { setNotesPhase(activePhaseKey); setShowNotes(true) }}
```

Replace with:

```javascript
              {activeProject && (
                <button
                  onClick={() => {}}
```

- [ ] **Step 2.6: Manually verify the app builds and runs**

Run: `npm run dev`

Expected:
- App opens, no console errors.
- Sidebar phase rows are clickable; clicking one updates the "Phase:" label in the header. Click does NOT open a modal.
- The bottom dot-grid panel still shows the placeholder text "📓 Phase Notes Journal". The "Open Current ..." button does nothing now.

- [ ] **Step 2.7: Commit**

```bash
git add src/views/Dashboard.jsx src/components/PhaseNotes.jsx
git commit -m "feat(canvas): remove PhaseNotes modal; rewire sidebar phase buttons to set active phase"
```

---

## Task 3: NoteCanvas shell + read-only box rendering + autosave

**Files:**
- Create: `src/components/NoteCanvas.jsx`
- Create: `src/components/canvas/CanvasBox.jsx`
- Modify: `src/views/Dashboard.jsx` (replace placeholder panel with NoteCanvas)

- [ ] **Step 3.1: Create CanvasBox.jsx (minimal read-only version)**

Create `src/components/canvas/CanvasBox.jsx`:

```jsx
export default function CanvasBox({ box }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        backgroundColor: '#121214',
        border: '1px solid #1F1F23',
        borderRadius: '6px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 24,
          borderBottom: '1px solid #1F1F23',
          backgroundColor: '#0D0D0F',
        }}
      />
      <div
        style={{
          flex: 1,
          padding: '8px 12px',
          color: '#D4D4D8',
          fontSize: '13px',
          lineHeight: '1.65',
          overflow: 'auto',
        }}
        dangerouslySetInnerHTML={{ __html: box.html || '<span style="color:#3F3F46">(empty)</span>' }}
      />
    </div>
  )
}
```

- [ ] **Step 3.2: Create NoteCanvas.jsx**

Create `src/components/NoteCanvas.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react'
import CanvasBox from './canvas/CanvasBox.jsx'

const PHASE_LABELS = {
  masterplan: 'Masterplan',
  da: 'DA',
  opw: 'OPW',
  ifc: 'IFC',
}

export default function NoteCanvas({ projectId, subprojectId, subprojectLabel, phase, phaseLabel }) {
  const [canvasId, setCanvasId] = useState(null)
  const [boxes, setBoxes] = useState([])
  const [connections, setConnections] = useState([])
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const saveTimer = useRef(null)
  const initialLoad = useRef(true)

  useEffect(() => {
    if (!projectId) return
    initialLoad.current = true
    setCanvasId(null)
    window.api.canvasLoad({ projectId, subprojectId: subprojectId ?? null, phase: phase ?? null })
      .then(({ id, content }) => {
        setCanvasId(id)
        setBoxes(content.boxes || [])
        setConnections(content.connections || [])
        setPan(content.pan || { x: 0, y: 0 })
        initialLoad.current = false
      })
  }, [projectId, subprojectId, phase])

  useEffect(() => {
    if (initialLoad.current || !canvasId) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api.canvasSave({ id: canvasId, content: { boxes, connections, pan } })
    }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [boxes, connections, pan, canvasId])

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: '#3F3F46' }}>
        <span className="mono text-xs">Select a project to use the canvas</span>
      </div>
    )
  }

  return (
    <div
      className="flex-1 relative overflow-hidden"
      style={{
        backgroundColor: '#050506',
        backgroundImage: 'radial-gradient(#1f1f23 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* Breadcrumb */}
      <div
        className="absolute top-2 left-3 mono text-xs pointer-events-none z-10"
        style={{ color: '#52525B' }}
      >
        {subprojectLabel ? `${subprojectLabel} · ` : ''}{phaseLabel ?? '—'}
      </div>

      {/* Pan layer */}
      <div
        className="absolute inset-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: '0 0' }}
      >
        {boxes.map(box => (
          <CanvasBox key={box.id} box={box} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3.3: Mount NoteCanvas in Dashboard.jsx**

In `src/views/Dashboard.jsx`, add the import near the top alongside the other imports (after the existing component imports):

```javascript
import NoteCanvas from '../components/NoteCanvas.jsx'
```

Replace the entire placeholder block (originally lines 550-572):

```jsx
          {/* Canvas / Notes area */}
          <div
            className="flex-1 relative overflow-hidden flex items-center justify-center"
            style={{
              backgroundColor: '#050506',
              backgroundImage: 'radial-gradient(#1f1f23 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          >
            <div className="text-center" style={{ color: S.dim }}>
              <p className="text-sm mb-2">📓 Phase Notes Journal</p>
              <p className="mono text-xs mb-4">Click a phase in the sidebar to open its journal</p>
              {activeProject && (
                <button
                  onClick={() => {}}
                  className="mono text-xs px-4 py-2 rounded border hover:border-[#7A5CFF] hover:text-white transition"
                  style={{ borderColor: S.border, color: S.zinc }}
                >
                  Open Current {activeSubproject ? 'Subproject' : 'Project'} Notes ({PHASES.find(p => p.key === activePhaseKey)?.label})
                </button>
              )}
            </div>
          </div>
```

With:

```jsx
          {/* Canvas */}
          <NoteCanvas
            projectId={activeProject?.id ?? null}
            subprojectId={activeSubproject?.id ?? null}
            subprojectLabel={activeSubproject?.display_name ?? null}
            phase={activePhaseKey}
            phaseLabel={PHASES.find(p => p.key === activePhaseKey)?.label ?? null}
          />
```

- [ ] **Step 3.4: Manually verify**

Run: `npm run dev`

Expected:
- App opens with a project selected.
- The bottom-center panel is now a dot-grid canvas (still empty — no boxes yet).
- The top-left of the canvas shows the breadcrumb (e.g. `Masterplan` or `Subproject A · DA`).
- Clicking a different phase in the sidebar changes the breadcrumb.
- DevTools console: no errors. SQLite file (in Electron userData dir) has a new row in `canvas_notes` for each scope you visited. To check:
  - Each time you click a different phase, the renderer fires a `canvas:load` IPC. The DB inserts a new row if the scope is unseen.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/NoteCanvas.jsx src/components/canvas/CanvasBox.jsx src/views/Dashboard.jsx
git commit -m "feat(canvas): mount empty NoteCanvas in dashboard with autosave wired"
```

---

## Task 4: Pan with Space+drag and middle-mouse, plus reset-view button

**Files:**
- Create: `src/components/canvas/useCanvasInteractions.js`
- Modify: `src/components/NoteCanvas.jsx`

- [ ] **Step 4.1: Create the interactions hook**

Create `src/components/canvas/useCanvasInteractions.js`:

```javascript
import { useEffect, useRef, useState } from 'react'

export function useCanvasInteractions({ viewportRef, pan, setPan }) {
  const [spaceHeld, setSpaceHeld] = useState(false)
  const dragRef = useRef(null)

  useEffect(() => {
    function onKeyDown(e) {
      if (e.code === 'Space' && !isTypingTarget(e.target) && !spaceHeld) {
        e.preventDefault()
        setSpaceHeld(true)
      }
    }
    function onKeyUp(e) {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [spaceHeld])

  function onPointerDown(e) {
    const isMiddle = e.button === 1
    const isSpaceDrag = e.button === 0 && spaceHeld
    if (!isMiddle && !isSpaceDrag) return

    e.preventDefault()
    viewportRef.current?.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startPan: { ...pan },
    }
  }

  function onPointerMove(e) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    setPan({
      x: d.startPan.x + (e.clientX - d.startX),
      y: d.startPan.y + (e.clientY - d.startY),
    })
  }

  function onPointerUp(e) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    viewportRef.current?.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }

  return {
    spaceHeld,
    panHandlers: { onPointerDown, onPointerMove, onPointerUp },
  }
}

function isTypingTarget(el) {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
```

- [ ] **Step 4.2: Wire the hook into NoteCanvas.jsx**

In `src/components/NoteCanvas.jsx`, add the import:

```javascript
import { useCanvasInteractions } from './canvas/useCanvasInteractions.js'
```

Add a viewport ref and call the hook (inside the component body, after the existing state declarations):

```javascript
  const viewportRef = useRef(null)
  const { spaceHeld, panHandlers } = useCanvasInteractions({ viewportRef, pan, setPan })
```

Replace the viewport `<div>` (the one with `className="flex-1 relative overflow-hidden"`) so it carries the ref, the pan handlers, and a cursor style:

```jsx
    <div
      ref={viewportRef}
      className="flex-1 relative overflow-hidden"
      style={{
        backgroundColor: '#050506',
        backgroundImage: 'radial-gradient(#1f1f23 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        cursor: spaceHeld ? 'grab' : 'default',
      }}
      onPointerDown={panHandlers.onPointerDown}
      onPointerMove={panHandlers.onPointerMove}
      onPointerUp={panHandlers.onPointerUp}
    >
```

- [ ] **Step 4.3: Add a reset-view button**

Inside the viewport `<div>`, after the breadcrumb element, add a reset button:

```jsx
      {/* Reset view */}
      <button
        onClick={() => setPan({ x: 0, y: 0 })}
        className="absolute top-2 right-3 mono text-xs px-2 py-1 rounded border hover:border-[#7A5CFF] hover:text-white transition z-10"
        style={{ borderColor: '#1F1F23', color: '#52525B', backgroundColor: '#0D0D0F' }}
        title="Reset view to origin"
      >
        ⌂ Reset
      </button>
```

- [ ] **Step 4.4: Manually verify**

Run: `npm run dev`

Expected:
- Hold Space and left-drag in the canvas → cursor becomes grab and the dot grid moves.
- Middle-mouse drag in the canvas → same panning effect.
- Click `⌂ Reset` → pan snaps back to origin (dot grid centered).
- After dragging, wait 1 second → autosave fires (check via DB by reopening the same scope and confirming pan persists). Switch phase, switch back, pan position is restored.
- Typing somewhere with focus then pressing Space should NOT activate pan mode.

- [ ] **Step 4.5: Commit**

```bash
git add src/components/canvas/useCanvasInteractions.js src/components/NoteCanvas.jsx
git commit -m "feat(canvas): pan with space+drag or middle-mouse; add reset view button"
```

---

## Task 5: Double-click empty canvas to create a new box

**Files:**
- Modify: `src/components/NoteCanvas.jsx`

- [ ] **Step 5.1: Add box-creation handler**

In `src/components/NoteCanvas.jsx`, add this helper inside the component (after the autosave `useEffect`):

```javascript
  function createBoxAt(clientX, clientY) {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    // Translate screen coords into canvas coords (account for pan)
    const x = clientX - rect.left - pan.x
    const y = clientY - rect.top - pan.y
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const newBox = {
      id,
      x: Math.round(x - 120),  // center the 240-wide box on the cursor
      y: Math.round(y - 60),
      width: 240,
      height: 120,
      html: '',
      updated_at: now,
    }
    setBoxes(prev => [...prev, newBox])
  }
```

- [ ] **Step 5.2: Bind double-click on the viewport**

Add an `onDoubleClick` handler to the viewport `<div>`. Make sure it only fires when the click is on the viewport itself (not a child box):

```jsx
    <div
      ref={viewportRef}
      className="flex-1 relative overflow-hidden"
      style={{...}}
      onPointerDown={panHandlers.onPointerDown}
      onPointerMove={panHandlers.onPointerMove}
      onPointerUp={panHandlers.onPointerUp}
      onDoubleClick={e => {
        if (e.target !== e.currentTarget && !e.target.matches('[data-canvas-bg]')) return
        createBoxAt(e.clientX, e.clientY)
      }}
    >
```

The pan layer (`transform: translate(...)`) needs `data-canvas-bg` so double-click on empty pan space (not on a box) also creates. Update the pan layer div:

```jsx
      <div
        data-canvas-bg
        className="absolute inset-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: '0 0' }}
      >
```

- [ ] **Step 5.3: Manually verify**

Run: `npm run dev`

Expected:
- Double-click on an empty area of the dot grid → a 240×120 box appears centered on the cursor with `(empty)` placeholder text.
- Double-click on a box → no new box created.
- Pan the canvas, then double-click in a new spot → box appears at the cursor location in canvas coordinates (it stays at the right canvas position when you pan further).
- After creating a box, switch phase and back → box persists (autosave + reload).

- [ ] **Step 5.4: Commit**

```bash
git add src/components/NoteCanvas.jsx
git commit -m "feat(canvas): double-click empty canvas to create a text box"
```

---

## Task 6: Single-click box to select; delete button

**Files:**
- Modify: `src/components/NoteCanvas.jsx`
- Modify: `src/components/canvas/CanvasBox.jsx`

- [ ] **Step 6.1: Add selection state in NoteCanvas**

In `src/components/NoteCanvas.jsx`, after the existing useState declarations, add:

```javascript
  // selection is { type: 'box' | 'connection', id: string } | null
  const [selection, setSelection] = useState(null)

  function deleteBox(boxId) {
    setBoxes(prev => prev.filter(b => b.id !== boxId))
    setConnections(prev => prev.filter(c => c.from !== boxId && c.to !== boxId))
    setSelection(null)
  }
```

Pass `selection`, `setSelection`, and `deleteBox` to each `CanvasBox`:

```jsx
        {boxes.map(box => (
          <CanvasBox
            key={box.id}
            box={box}
            selected={selection?.type === 'box' && selection.id === box.id}
            onSelect={() => setSelection({ type: 'box', id: box.id })}
            onDelete={() => deleteBox(box.id)}
          />
        ))}
```

Also clear selection on click of empty canvas. Update the viewport `<div>` to add `onClick`:

```jsx
      onClick={e => {
        if (e.target === e.currentTarget || e.target.matches('[data-canvas-bg]')) {
          setSelection(null)
        }
      }}
```

- [ ] **Step 6.2: Update CanvasBox to support selection and delete**

Replace the entire contents of `src/components/canvas/CanvasBox.jsx`:

```jsx
export default function CanvasBox({ box, selected, onSelect, onDelete }) {
  const borderColor = selected ? '#7A5CFF' : '#1F1F23'

  return (
    <div
      onPointerDown={e => {
        e.stopPropagation()
        onSelect()
      }}
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        backgroundColor: '#121214',
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: selected ? '0 0 0 1px #7A5CFF40' : 'none',
      }}
    >
      <div
        style={{
          height: 24,
          borderBottom: '1px solid #1F1F23',
          backgroundColor: '#0D0D0F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 6px',
        }}
      >
        {selected && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-xs hover:text-white transition"
            style={{ color: '#FF453A', padding: '0 4px' }}
            title="Delete box"
          >
            ✕
          </button>
        )}
      </div>
      <div
        style={{
          flex: 1,
          padding: '8px 12px',
          color: '#D4D4D8',
          fontSize: '13px',
          lineHeight: '1.65',
          overflow: 'auto',
        }}
        dangerouslySetInnerHTML={{ __html: box.html || '<span style="color:#3F3F46">(empty)</span>' }}
      />
    </div>
  )
}
```

- [ ] **Step 6.3: Manually verify**

Run: `npm run dev`

Expected:
- Click a box → accent border + ✕ in the header.
- Click empty canvas → deselected, border returns to dim.
- Click the ✕ → box disappears.
- Create two boxes; click one then the other → selection moves; previous box deselects.

- [ ] **Step 6.4: Commit**

```bash
git add src/components/NoteCanvas.jsx src/components/canvas/CanvasBox.jsx
git commit -m "feat(canvas): select boxes on click; delete with X button"
```

---

## Task 7: Drag the box header to move

**Files:**
- Modify: `src/components/canvas/CanvasBox.jsx`
- Modify: `src/components/NoteCanvas.jsx`

- [ ] **Step 7.1: Pass an update callback from NoteCanvas**

In `src/components/NoteCanvas.jsx`, add a helper:

```javascript
  function updateBox(boxId, patch) {
    setBoxes(prev => prev.map(b => b.id === boxId ? { ...b, ...patch } : b))
  }
```

Pass it into CanvasBox:

```jsx
          <CanvasBox
            key={box.id}
            box={box}
            selected={selection?.type === 'box' && selection.id === box.id}
            onSelect={() => setSelection({ type: 'box', id: box.id })}
            onDelete={() => deleteBox(box.id)}
            onUpdate={patch => updateBox(box.id, patch)}
          />
```

- [ ] **Step 7.2: Add drag-to-move on the header bar**

Replace `src/components/canvas/CanvasBox.jsx` entirely:

```jsx
import { useRef } from 'react'

const CLICK_THRESHOLD_PX = 3

export default function CanvasBox({ box, selected, onSelect, onDelete, onUpdate }) {
  const dragRef = useRef(null)
  const borderColor = selected ? '#7A5CFF' : '#1F1F23'

  function onHeaderPointerDown(e) {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBoxX: box.x,
      startBoxY: box.y,
      moved: false,
    }
  }

  function onHeaderPointerMove(e) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startClientX
    const dy = e.clientY - d.startClientY
    if (!d.moved && Math.hypot(dx, dy) >= CLICK_THRESHOLD_PX) {
      d.moved = true
    }
    if (d.moved) {
      onUpdate({ x: d.startBoxX + dx, y: d.startBoxY + dy })
    }
  }

  function onHeaderPointerUp(e) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d.moved) {
      // Treat as click — select
      onSelect()
    }
    dragRef.current = null
  }

  return (
    <div
      onPointerDown={e => { e.stopPropagation(); onSelect() }}
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        backgroundColor: '#121214',
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: selected ? '0 0 0 1px #7A5CFF40' : 'none',
      }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        style={{
          height: 24,
          borderBottom: '1px solid #1F1F23',
          backgroundColor: '#0D0D0F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 6px',
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        {selected && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            onPointerDown={e => e.stopPropagation()}
            className="text-xs hover:text-white transition"
            style={{ color: '#FF453A', padding: '0 4px' }}
            title="Delete box"
          >
            ✕
          </button>
        )}
      </div>
      <div
        style={{
          flex: 1,
          padding: '8px 12px',
          color: '#D4D4D8',
          fontSize: '13px',
          lineHeight: '1.65',
          overflow: 'auto',
        }}
        dangerouslySetInnerHTML={{ __html: box.html || '<span style="color:#3F3F46">(empty)</span>' }}
      />
    </div>
  )
}
```

- [ ] **Step 7.3: Manually verify**

Run: `npm run dev`

Expected:
- Drag the header bar → box moves with the cursor.
- Quick click on the header (no movement) → selects the box.
- Click ✕ → still deletes.
- Pan the canvas, then drag a box → box moves relative to the canvas, stays in correct position after panning further.
- After dragging, switch phases and back → position persists.

- [ ] **Step 7.4: Commit**

```bash
git add src/components/canvas/CanvasBox.jsx src/components/NoteCanvas.jsx
git commit -m "feat(canvas): drag box header to move; click vs drag threshold"
```

---

## Task 8: Resize box from corner handles

**Files:**
- Modify: `src/components/canvas/CanvasBox.jsx`

- [ ] **Step 8.1: Add resize handles and handler**

In `src/components/canvas/CanvasBox.jsx`, add constants and the resize logic. Update the file:

```jsx
import { useRef } from 'react'

const CLICK_THRESHOLD_PX = 3
const MIN_W = 120
const MIN_H = 60

export default function CanvasBox({ box, selected, onSelect, onDelete, onUpdate }) {
  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const borderColor = selected ? '#7A5CFF' : '#1F1F23'

  function onHeaderPointerDown(e) {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBoxX: box.x,
      startBoxY: box.y,
      moved: false,
    }
  }

  function onHeaderPointerMove(e) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startClientX
    const dy = e.clientY - d.startClientY
    if (!d.moved && Math.hypot(dx, dy) >= CLICK_THRESHOLD_PX) d.moved = true
    if (d.moved) onUpdate({ x: d.startBoxX + dx, y: d.startBoxY + dy })
  }

  function onHeaderPointerUp(e) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d.moved) onSelect()
    dragRef.current = null
  }

  function onResizePointerDown(corner, e) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = {
      pointerId: e.pointerId,
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBox: { x: box.x, y: box.y, width: box.width, height: box.height },
    }
  }

  function onResizePointerMove(e) {
    const r = resizeRef.current
    if (!r || r.pointerId !== e.pointerId) return
    const dx = e.clientX - r.startClientX
    const dy = e.clientY - r.startClientY
    const { x: sx, y: sy, width: sw, height: sh } = r.startBox
    let next = { x: sx, y: sy, width: sw, height: sh }

    if (r.corner === 'se') {
      next.width = Math.max(MIN_W, sw + dx)
      next.height = Math.max(MIN_H, sh + dy)
    } else if (r.corner === 'sw') {
      const w = Math.max(MIN_W, sw - dx)
      next.x = sx + (sw - w)
      next.width = w
      next.height = Math.max(MIN_H, sh + dy)
    } else if (r.corner === 'ne') {
      const h = Math.max(MIN_H, sh - dy)
      next.y = sy + (sh - h)
      next.width = Math.max(MIN_W, sw + dx)
      next.height = h
    } else if (r.corner === 'nw') {
      const w = Math.max(MIN_W, sw - dx)
      const h = Math.max(MIN_H, sh - dy)
      next.x = sx + (sw - w)
      next.y = sy + (sh - h)
      next.width = w
      next.height = h
    }
    onUpdate(next)
  }

  function onResizePointerUp(e) {
    const r = resizeRef.current
    if (!r || r.pointerId !== e.pointerId) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    resizeRef.current = null
  }

  function renderHandle(corner, cursor, posStyle) {
    return (
      <div
        onPointerDown={e => onResizePointerDown(corner, e)}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        style={{
          position: 'absolute',
          width: 12,
          height: 12,
          ...posStyle,
          cursor,
          backgroundColor: '#7A5CFF',
          border: '1px solid #0D0D0F',
          borderRadius: 2,
          zIndex: 2,
        }}
      />
    )
  }

  return (
    <div
      onPointerDown={e => { e.stopPropagation(); onSelect() }}
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        backgroundColor: '#121214',
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: selected ? '0 0 0 1px #7A5CFF40' : 'none',
      }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        style={{
          height: 24,
          borderBottom: '1px solid #1F1F23',
          backgroundColor: '#0D0D0F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 6px',
          cursor: 'move',
          userSelect: 'none',
          borderTopLeftRadius: '6px',
          borderTopRightRadius: '6px',
        }}
      >
        {selected && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            onPointerDown={e => e.stopPropagation()}
            className="text-xs hover:text-white transition"
            style={{ color: '#FF453A', padding: '0 4px' }}
            title="Delete box"
          >
            ✕
          </button>
        )}
      </div>
      <div
        style={{
          flex: 1,
          padding: '8px 12px',
          color: '#D4D4D8',
          fontSize: '13px',
          lineHeight: '1.65',
          overflow: 'auto',
        }}
        dangerouslySetInnerHTML={{ __html: box.html || '<span style="color:#3F3F46">(empty)</span>' }}
      />
      {selected && (
        <>
          {renderHandle('nw', 'nwse-resize', { top: -6, left: -6 })}
          {renderHandle('ne', 'nesw-resize', { top: -6, right: -6 })}
          {renderHandle('sw', 'nesw-resize', { bottom: -6, left: -6 })}
          {renderHandle('se', 'nwse-resize', { bottom: -6, right: -6 })}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 8.2: Manually verify**

Run: `npm run dev`

Expected:
- Click a box → 4 corner squares appear.
- Drag SE corner → grows down-right.
- Drag NW corner → top-left moves inward, box shrinks/grows from that corner.
- Try to shrink below 120×60 → stops at min size.
- After resize, switch and return → size persists.

- [ ] **Step 8.3: Commit**

```bash
git add src/components/canvas/CanvasBox.jsx
git commit -m "feat(canvas): resize boxes from corner handles with min size guard"
```

---

## Task 9: Double-click box to edit; rich-text toolbar; escape to exit; last-edited date

**Files:**
- Modify: `src/components/canvas/CanvasBox.jsx`
- Modify: `src/components/NoteCanvas.jsx`

- [ ] **Step 9.1: Add editing state in NoteCanvas**

In `src/components/NoteCanvas.jsx`:

```javascript
  const [editingId, setEditingId] = useState(null)
```

When selection clears or scope switches, also clear editing:

Update the existing scope-load `useEffect` so it also resets editing:

```javascript
  useEffect(() => {
    if (!projectId) return
    initialLoad.current = true
    setCanvasId(null)
    setSelection(null)
    setEditingId(null)
    window.api.canvasLoad({ projectId, subprojectId: subprojectId ?? null, phase: phase ?? null })
      .then(({ id, content }) => {
        setCanvasId(id)
        setBoxes(content.boxes || [])
        setConnections(content.connections || [])
        setPan(content.pan || { x: 0, y: 0 })
        initialLoad.current = false
      })
  }, [projectId, subprojectId, phase])
```

Update the viewport empty-click handler so it also exits edit mode:

```jsx
      onClick={e => {
        if (e.target === e.currentTarget || e.target.matches('[data-canvas-bg]')) {
          setSelection(null)
          setEditingId(null)
        }
      }}
```

Update `createBoxAt` to enter edit mode on the new box:

```javascript
  function createBoxAt(clientX, clientY) {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = clientX - rect.left - pan.x
    const y = clientY - rect.top - pan.y
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const newBox = {
      id,
      x: Math.round(x - 120),
      y: Math.round(y - 60),
      width: 240,
      height: 120,
      html: '',
      updated_at: now,
    }
    setBoxes(prev => [...prev, newBox])
    setSelection({ type: 'box', id })
    setEditingId(id)
  }
```

Pass edit-mode props to CanvasBox:

```jsx
          <CanvasBox
            key={box.id}
            box={box}
            selected={selection?.type === 'box' && selection.id === box.id}
            editing={editingId === box.id}
            onSelect={() => setSelection({ type: 'box', id: box.id })}
            onStartEdit={() => { setSelection({ type: 'box', id: box.id }); setEditingId(box.id) }}
            onStopEdit={() => setEditingId(null)}
            onDelete={() => deleteBox(box.id)}
            onUpdate={patch => updateBox(box.id, patch)}
          />
```

- [ ] **Step 9.2: Add contentEditable + toolbar to CanvasBox**

Replace `src/components/canvas/CanvasBox.jsx` entirely:

```jsx
import { useRef, useEffect } from 'react'

const CLICK_THRESHOLD_PX = 3
const MIN_W = 120
const MIN_H = 60

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const yr = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${yr}-${mo}-${da} ${hh}:${mm}`
}

function ToolbarBtn({ cmd, arg, title, children, editorRef }) {
  return (
    <button
      title={title}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => {
        e.preventDefault()
        editorRef.current?.focus()
        document.execCommand(cmd, false, arg ?? null)
      }}
      className="px-2 py-0.5 rounded text-xs hover:bg-[#2A2A2E] transition"
      style={{ color: '#A1A1AA' }}
    >
      {children}
    </button>
  )
}

export default function CanvasBox({ box, selected, editing, onSelect, onStartEdit, onStopEdit, onDelete, onUpdate }) {
  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const editorRef = useRef(null)
  const saveTimer = useRef(null)
  const borderColor = editing ? '#7A5CFF' : (selected ? '#7A5CFF' : '#1F1F23')

  useEffect(() => {
    if (editing && editorRef.current) {
      if (editorRef.current.innerHTML !== box.html) {
        editorRef.current.innerHTML = box.html || ''
      }
      editorRef.current.focus()
      // Place caret at end
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(editorRef.current)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }, [editing])

  function onEditorInput() {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const html = editorRef.current?.innerHTML ?? ''
      onUpdate({ html, updated_at: new Date().toISOString() })
    }, 300)
  }

  function onEditorKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      // Flush save immediately
      clearTimeout(saveTimer.current)
      const html = editorRef.current?.innerHTML ?? ''
      onUpdate({ html, updated_at: new Date().toISOString() })
      onStopEdit()
    }
    // Don't let Delete/Backspace bubble to NoteCanvas's keyboard delete handler
    e.stopPropagation()
  }

  function onHeaderPointerDown(e) {
    if (e.button !== 0 || editing) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBoxX: box.x,
      startBoxY: box.y,
      moved: false,
    }
  }

  function onHeaderPointerMove(e) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startClientX
    const dy = e.clientY - d.startClientY
    if (!d.moved && Math.hypot(dx, dy) >= CLICK_THRESHOLD_PX) d.moved = true
    if (d.moved) onUpdate({ x: d.startBoxX + dx, y: d.startBoxY + dy })
  }

  function onHeaderPointerUp(e) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d.moved) onSelect()
    dragRef.current = null
  }

  function onResizePointerDown(corner, e) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = {
      pointerId: e.pointerId,
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBox: { x: box.x, y: box.y, width: box.width, height: box.height },
    }
  }

  function onResizePointerMove(e) {
    const r = resizeRef.current
    if (!r || r.pointerId !== e.pointerId) return
    const dx = e.clientX - r.startClientX
    const dy = e.clientY - r.startClientY
    const { x: sx, y: sy, width: sw, height: sh } = r.startBox
    let next = { x: sx, y: sy, width: sw, height: sh }
    if (r.corner === 'se') {
      next.width = Math.max(MIN_W, sw + dx)
      next.height = Math.max(MIN_H, sh + dy)
    } else if (r.corner === 'sw') {
      const w = Math.max(MIN_W, sw - dx)
      next.x = sx + (sw - w); next.width = w
      next.height = Math.max(MIN_H, sh + dy)
    } else if (r.corner === 'ne') {
      const h = Math.max(MIN_H, sh - dy)
      next.y = sy + (sh - h); next.height = h
      next.width = Math.max(MIN_W, sw + dx)
    } else if (r.corner === 'nw') {
      const w = Math.max(MIN_W, sw - dx)
      const h = Math.max(MIN_H, sh - dy)
      next.x = sx + (sw - w); next.y = sy + (sh - h)
      next.width = w; next.height = h
    }
    onUpdate(next)
  }

  function onResizePointerUp(e) {
    const r = resizeRef.current
    if (!r || r.pointerId !== e.pointerId) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    resizeRef.current = null
  }

  function renderHandle(corner, cursor, posStyle) {
    return (
      <div
        onPointerDown={e => onResizePointerDown(corner, e)}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        style={{
          position: 'absolute', width: 12, height: 12, ...posStyle, cursor,
          backgroundColor: '#7A5CFF', border: '1px solid #0D0D0F',
          borderRadius: 2, zIndex: 2,
        }}
      />
    )
  }

  return (
    <div
      onPointerDown={e => { if (editing) return; e.stopPropagation(); onSelect() }}
      onDoubleClick={e => { e.stopPropagation(); onStartEdit() }}
      style={{
        position: 'absolute',
        left: box.x, top: box.y, width: box.width, height: box.height,
        backgroundColor: '#121214',
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        display: 'flex', flexDirection: 'column',
        boxShadow: (selected || editing) ? '0 0 0 1px #7A5CFF40' : 'none',
      }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        style={{
          minHeight: 24,
          borderBottom: '1px solid #1F1F23',
          backgroundColor: '#0D0D0F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 6px',
          cursor: editing ? 'default' : 'move',
          userSelect: 'none',
          borderTopLeftRadius: '6px',
          borderTopRightRadius: '6px',
          gap: 4,
        }}
      >
        {editing ? (
          <div className="flex items-center gap-0.5 flex-wrap" onPointerDown={e => e.stopPropagation()}>
            <ToolbarBtn cmd="bold" title="Bold" editorRef={editorRef}><b>B</b></ToolbarBtn>
            <ToolbarBtn cmd="italic" title="Italic" editorRef={editorRef}><i>I</i></ToolbarBtn>
            <ToolbarBtn cmd="underline" title="Underline" editorRef={editorRef}><u>U</u></ToolbarBtn>
            <ToolbarBtn cmd="insertUnorderedList" title="Bullet list" editorRef={editorRef}>•</ToolbarBtn>
            <ToolbarBtn cmd="insertOrderedList" title="Numbered list" editorRef={editorRef}>1.</ToolbarBtn>
            <ToolbarBtn cmd="formatBlock" arg="h3" title="Heading" editorRef={editorRef}>H</ToolbarBtn>
            <ToolbarBtn cmd="formatBlock" arg="p" title="Paragraph" editorRef={editorRef}>¶</ToolbarBtn>
          </div>
        ) : (
          <span className="mono text-xs" style={{ color: '#52525B', fontSize: 10 }}>{formatDate(box.updated_at)}</span>
        )}
        {selected && !editing && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            onPointerDown={e => e.stopPropagation()}
            className="text-xs hover:text-white transition"
            style={{ color: '#FF453A', padding: '0 4px' }}
            title="Delete box"
          >
            ✕
          </button>
        )}
      </div>

      {editing ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={onEditorInput}
          onKeyDown={onEditorKeyDown}
          onPointerDown={e => e.stopPropagation()}
          onDoubleClick={e => e.stopPropagation()}
          className="outline-none"
          style={{
            flex: 1,
            padding: '8px 12px',
            color: '#D4D4D8',
            fontSize: '13px',
            lineHeight: '1.65',
            overflow: 'auto',
            caretColor: '#7A5CFF',
          }}
          data-placeholder="Type here..."
        />
      ) : (
        <div
          style={{
            flex: 1,
            padding: '8px 12px',
            color: '#D4D4D8',
            fontSize: '13px',
            lineHeight: '1.65',
            overflow: 'auto',
          }}
          dangerouslySetInnerHTML={{ __html: box.html || '<span style="color:#3F3F46">(empty)</span>' }}
        />
      )}

      <style>{`
        [contenteditable]:empty:before { content: attr(data-placeholder); color: #3F3F46; pointer-events: none; }
        [contenteditable] h3 { font-size: 14px; font-weight: 600; color: #F5F5F7; margin: 8px 0 4px; }
        [contenteditable] ul, [contenteditable] ol { margin-left: 20px; margin-bottom: 6px; }
        [contenteditable] li { margin-bottom: 2px; }
        [contenteditable] b, [contenteditable] strong { color: #F5F5F7; }
      `}</style>

      {selected && !editing && (
        <>
          {renderHandle('nw', 'nwse-resize', { top: -6, left: -6 })}
          {renderHandle('ne', 'nesw-resize', { top: -6, right: -6 })}
          {renderHandle('sw', 'nesw-resize', { bottom: -6, left: -6 })}
          {renderHandle('se', 'nwse-resize', { bottom: -6, right: -6 })}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 9.3: Manually verify**

Run: `npm run dev`

Expected:
- Double-click a box → toolbar appears in header, body becomes editable, cursor focused.
- Type → text appears; after ~300ms, header date (visible when you click out) reflects the update.
- Click Bold → next typed text is bold (uses execCommand).
- Press Escape → exits edit mode, returns to selected (non-editing) view, ✕ button reappears.
- Click outside the box (empty canvas) → also exits edit mode.
- Double-click a new empty area → creates a box AND enters edit mode immediately, ready to type.
- Click another box while one is editing → first exits edit mode (autosaves), second becomes selected (single-click on its body bubbles via the outer `onPointerDown` since editing is false there).

- [ ] **Step 9.4: Commit**

```bash
git add src/components/canvas/CanvasBox.jsx src/components/NoteCanvas.jsx
git commit -m "feat(canvas): double-click to edit; rich text toolbar; escape exits; last-edited date"
```

---

## Task 10: Keyboard delete on selected box

**Files:**
- Modify: `src/components/NoteCanvas.jsx`

- [ ] **Step 10.1: Add global keydown listener for Delete/Backspace**

In `src/components/NoteCanvas.jsx`, add this `useEffect` after the autosave effect:

```javascript
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      // Don't interfere with typing
      const t = document.activeElement
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (!selection) return
      e.preventDefault()
      if (selection.type === 'box') {
        deleteBox(selection.id)
      } else if (selection.type === 'connection') {
        setConnections(prev => prev.filter(c => c.id !== selection.id))
        setSelection(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection])
```

- [ ] **Step 10.2: Manually verify**

Run: `npm run dev`

Expected:
- Click a box (don't double-click) → press Delete → box disappears.
- Press Backspace with selected box → same result.
- Double-click box, type "abc", press Backspace → only deletes character "c"; box stays.
- Press Delete with no selection → nothing happens.

- [ ] **Step 10.3: Commit**

```bash
git add src/components/NoteCanvas.jsx
git commit -m "feat(canvas): Delete/Backspace removes selected box; safe in edit mode"
```

---

## Task 11: Render connection lines (SVG layer)

**Files:**
- Create: `src/components/canvas/CanvasConnections.jsx`
- Modify: `src/components/NoteCanvas.jsx`

- [ ] **Step 11.1: Create CanvasConnections.jsx**

Create `src/components/canvas/CanvasConnections.jsx`:

```jsx
function endpoints(fromBox, toBox) {
  const fx = fromBox.x + fromBox.width
  const fy = fromBox.y + fromBox.height / 2
  const tx = toBox.x
  const ty = toBox.y + toBox.height / 2
  return { fx, fy, tx, ty }
}

function bezierPath(fromBox, toBox) {
  const { fx, fy, tx, ty } = endpoints(fromBox, toBox)
  const cx = (tx - fx) / 2
  return `M ${fx} ${fy} C ${fx + cx} ${fy}, ${tx - cx} ${ty}, ${tx} ${ty}`
}

export default function CanvasConnections({ boxes, connections, selectionId, onSelect, dragConnection }) {
  const boxMap = new Map(boxes.map(b => [b.id, b]))

  return (
    <svg
      style={{
        position: 'absolute',
        left: -50000,
        top: -50000,
        width: 100000,
        height: 100000,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <g transform="translate(50000, 50000)">
        {connections.map(c => {
          const from = boxMap.get(c.from)
          const to = boxMap.get(c.to)
          if (!from || !to) return null
          const d = bezierPath(from, to)
          const isSelected = selectionId === c.id
          return (
            <g key={c.id}>
              {/* Hit area (transparent, fat) */}
              <path
                d={d}
                stroke="transparent"
                strokeWidth={12}
                fill="none"
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onPointerDown={e => { e.stopPropagation(); onSelect(c.id) }}
              />
              {/* Visible line */}
              <path
                d={d}
                stroke={isSelected ? '#7A5CFF' : '#3F3F46'}
                strokeWidth={isSelected ? 2 : 1.5}
                fill="none"
                style={{ pointerEvents: 'none' }}
              />
            </g>
          )
        })}

        {dragConnection && (
          <path
            d={`M ${dragConnection.fromX} ${dragConnection.fromY} L ${dragConnection.toX} ${dragConnection.toY}`}
            stroke="#7A5CFF"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            fill="none"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </g>
    </svg>
  )
}
```

- [ ] **Step 11.2: Mount it in NoteCanvas (inside the pan layer, before boxes)**

In `src/components/NoteCanvas.jsx`, add the import:

```javascript
import CanvasConnections from './canvas/CanvasConnections.jsx'
```

Update the pan layer to include the connections SVG before the boxes:

```jsx
      <div
        data-canvas-bg
        className="absolute inset-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: '0 0' }}
      >
        <CanvasConnections
          boxes={boxes}
          connections={connections}
          selectionId={selection?.type === 'connection' ? selection.id : null}
          onSelect={id => setSelection({ type: 'connection', id })}
          dragConnection={null}
        />
        {boxes.map(box => (
          <CanvasBox
            key={box.id}
            box={box}
            selected={selection?.type === 'box' && selection.id === box.id}
            editing={editingId === box.id}
            onSelect={() => setSelection({ type: 'box', id: box.id })}
            onStartEdit={() => { setSelection({ type: 'box', id: box.id }); setEditingId(box.id) }}
            onStopEdit={() => setEditingId(null)}
            onDelete={() => deleteBox(box.id)}
            onUpdate={patch => updateBox(box.id, patch)}
          />
        ))}
      </div>
```

- [ ] **Step 11.3: Manually verify with seed data**

There is no UI yet to create connections — we add it in Task 12. To verify rendering, temporarily add one fake connection. Open DevTools console with the canvas mounted and run:

```javascript
// In Electron dev tools console (after creating two boxes manually):
// Find any two box ids by inspecting React DevTools or peeking at the SQLite DB.
// Easier: just verify the SVG layer renders nothing (no error) for now.
```

Expected with no connections:
- No errors in console.
- Canvas behaves identically to Task 10.
- React DevTools shows a `<CanvasConnections>` element with an empty `<svg>` mounted inside the pan layer.

- [ ] **Step 11.4: Commit**

```bash
git add src/components/canvas/CanvasConnections.jsx src/components/NoteCanvas.jsx
git commit -m "feat(canvas): render SVG layer for connection lines (no creation yet)"
```

---

## Task 12: Drag-to-connect (connector dot)

**Files:**
- Modify: `src/components/canvas/CanvasBox.jsx`
- Modify: `src/components/NoteCanvas.jsx`

- [ ] **Step 12.1: Manage drag-connection state in NoteCanvas**

In `src/components/NoteCanvas.jsx`, add state:

```javascript
  // { fromBoxId, fromX, fromY, toX, toY } in canvas coords, or null
  const [dragConn, setDragConn] = useState(null)
```

Add handlers (after `updateBox`):

```javascript
  function startConnectionDrag(fromBoxId, clientX, clientY) {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const from = boxes.find(b => b.id === fromBoxId)
    if (!from) return
    const fromX = from.x + from.width
    const fromY = from.y + from.height / 2
    const toX = clientX - rect.left - pan.x
    const toY = clientY - rect.top - pan.y
    setDragConn({ fromBoxId, fromX, fromY, toX, toY })
  }

  function updateConnectionDrag(clientX, clientY) {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect || !dragConn) return
    setDragConn({
      ...dragConn,
      toX: clientX - rect.left - pan.x,
      toY: clientY - rect.top - pan.y,
    })
  }

  function endConnectionDrag(clientX, clientY) {
    if (!dragConn) return
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) { setDragConn(null); return }
    const cx = clientX - rect.left - pan.x
    const cy = clientY - rect.top - pan.y
    // Find which box (if any) the cursor is over
    const target = boxes.find(b =>
      cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height
    )
    if (target && target.id !== dragConn.fromBoxId) {
      const exists = connections.some(c => c.from === dragConn.fromBoxId && c.to === target.id)
      if (!exists) {
        setConnections(prev => [...prev, {
          id: crypto.randomUUID(),
          from: dragConn.fromBoxId,
          to: target.id,
        }])
      }
    }
    setDragConn(null)
  }
```

Attach the move/up handlers to the viewport so a connector drag continues even when the cursor leaves the source box. Update the viewport `<div>`:

```jsx
    <div
      ref={viewportRef}
      className="flex-1 relative overflow-hidden"
      style={{...}}
      onPointerDown={panHandlers.onPointerDown}
      onPointerMove={e => {
        panHandlers.onPointerMove(e)
        if (dragConn) updateConnectionDrag(e.clientX, e.clientY)
      }}
      onPointerUp={e => {
        panHandlers.onPointerUp(e)
        if (dragConn) endConnectionDrag(e.clientX, e.clientY)
      }}
      onClick={e => {
        if (e.target === e.currentTarget || e.target.matches('[data-canvas-bg]')) {
          setSelection(null)
          setEditingId(null)
        }
      }}
      onDoubleClick={e => {
        if (e.target !== e.currentTarget && !e.target.matches('[data-canvas-bg]')) return
        createBoxAt(e.clientX, e.clientY)
      }}
    >
```

Pass `dragConn` to CanvasConnections:

```jsx
        <CanvasConnections
          boxes={boxes}
          connections={connections}
          selectionId={selection?.type === 'connection' ? selection.id : null}
          onSelect={id => setSelection({ type: 'connection', id })}
          dragConnection={dragConn}
        />
```

Pass a connector-start callback to CanvasBox:

```jsx
          <CanvasBox
            key={box.id}
            box={box}
            selected={selection?.type === 'box' && selection.id === box.id}
            editing={editingId === box.id}
            onSelect={() => setSelection({ type: 'box', id: box.id })}
            onStartEdit={() => { setSelection({ type: 'box', id: box.id }); setEditingId(box.id) }}
            onStopEdit={() => setEditingId(null)}
            onDelete={() => deleteBox(box.id)}
            onUpdate={patch => updateBox(box.id, patch)}
            onConnectorDown={clientX => startConnectionDrag(box.id, clientX, 0) || startConnectionDrag(box.id, clientX, 0)}
          />
```

Actually use a cleaner signature — replace the broken double-call:

```jsx
            onConnectorDown={(clientX, clientY) => startConnectionDrag(box.id, clientX, clientY)}
```

- [ ] **Step 12.2: Add connector dot to CanvasBox**

In `src/components/canvas/CanvasBox.jsx`, accept `onConnectorDown` in the props signature:

```jsx
export default function CanvasBox({ box, selected, editing, onSelect, onStartEdit, onStopEdit, onDelete, onUpdate, onConnectorDown }) {
```

Then add a connector dot near the four resize handles, only when selected and not editing:

```jsx
      {selected && !editing && (
        <>
          {renderHandle('nw', 'nwse-resize', { top: -6, left: -6 })}
          {renderHandle('ne', 'nesw-resize', { top: -6, right: -6 })}
          {renderHandle('sw', 'nesw-resize', { bottom: -6, left: -6 })}
          {renderHandle('se', 'nwse-resize', { bottom: -6, right: -6 })}
          <div
            onPointerDown={e => {
              e.stopPropagation()
              onConnectorDown?.(e.clientX, e.clientY)
            }}
            title="Drag to connect to another box"
            style={{
              position: 'absolute',
              right: -7,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 12, height: 12,
              borderRadius: '50%',
              backgroundColor: '#7A5CFF',
              border: '1px solid #0D0D0F',
              cursor: 'crosshair',
              zIndex: 3,
            }}
          />
        </>
      )}
```

- [ ] **Step 12.3: Manually verify**

Run: `npm run dev`

Expected:
- Create two boxes (double-click empty space twice).
- Click box A → connector dot appears on the right edge.
- Drag from dot → a dashed accent line follows the cursor.
- Drop dot on box B → solid bezier line appears between them. Drag line stops.
- Drag from A's dot back to A → no self-loop created.
- Drag from A to B again → no duplicate (still one line).
- Drag a connected box around → the line follows it in real time.
- After connecting, switch phase + back → connections persist.

- [ ] **Step 12.4: Commit**

```bash
git add src/components/NoteCanvas.jsx src/components/canvas/CanvasBox.jsx
git commit -m "feat(canvas): drag connector dot to create connection between boxes"
```

---

## Task 13: Connection selection + mid-line delete

**Files:**
- Modify: `src/components/canvas/CanvasConnections.jsx`
- Modify: `src/components/NoteCanvas.jsx`

- [ ] **Step 13.1: Add midpoint delete ✕ when a connection is selected**

In `src/components/canvas/CanvasConnections.jsx`, replace the file:

```jsx
function endpoints(fromBox, toBox) {
  const fx = fromBox.x + fromBox.width
  const fy = fromBox.y + fromBox.height / 2
  const tx = toBox.x
  const ty = toBox.y + toBox.height / 2
  return { fx, fy, tx, ty }
}

function bezierPath(fromBox, toBox) {
  const { fx, fy, tx, ty } = endpoints(fromBox, toBox)
  const cx = (tx - fx) / 2
  return `M ${fx} ${fy} C ${fx + cx} ${fy}, ${tx - cx} ${ty}, ${tx} ${ty}`
}

function midpoint(fromBox, toBox) {
  const { fx, fy, tx, ty } = endpoints(fromBox, toBox)
  return { mx: (fx + tx) / 2, my: (fy + ty) / 2 }
}

export default function CanvasConnections({ boxes, connections, selectionId, onSelect, onDelete, dragConnection }) {
  const boxMap = new Map(boxes.map(b => [b.id, b]))

  return (
    <svg
      style={{
        position: 'absolute',
        left: -50000,
        top: -50000,
        width: 100000,
        height: 100000,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <g transform="translate(50000, 50000)">
        {connections.map(c => {
          const from = boxMap.get(c.from)
          const to = boxMap.get(c.to)
          if (!from || !to) return null
          const d = bezierPath(from, to)
          const { mx, my } = midpoint(from, to)
          const isSelected = selectionId === c.id
          return (
            <g key={c.id}>
              <path
                d={d}
                stroke="transparent"
                strokeWidth={12}
                fill="none"
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onPointerDown={e => { e.stopPropagation(); onSelect(c.id) }}
              />
              <path
                d={d}
                stroke={isSelected ? '#7A5CFF' : '#3F3F46'}
                strokeWidth={isSelected ? 2 : 1.5}
                fill="none"
                style={{ pointerEvents: 'none' }}
              />
              {isSelected && (
                <g
                  transform={`translate(${mx}, ${my})`}
                  onPointerDown={e => { e.stopPropagation(); onDelete(c.id) }}
                  style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                >
                  <circle r={9} fill="#0D0D0F" stroke="#FF453A" strokeWidth={1} />
                  <text
                    x={0}
                    y={1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={11}
                    fill="#FF453A"
                    style={{ userSelect: 'none' }}
                  >
                    ✕
                  </text>
                </g>
              )}
            </g>
          )
        })}

        {dragConnection && (
          <path
            d={`M ${dragConnection.fromX} ${dragConnection.fromY} L ${dragConnection.toX} ${dragConnection.toY}`}
            stroke="#7A5CFF"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            fill="none"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </g>
    </svg>
  )
}
```

- [ ] **Step 13.2: Wire delete handler in NoteCanvas**

In `src/components/NoteCanvas.jsx`, add a helper:

```javascript
  function deleteConnection(id) {
    setConnections(prev => prev.filter(c => c.id !== id))
    setSelection(null)
  }
```

Update the `<CanvasConnections>` props:

```jsx
        <CanvasConnections
          boxes={boxes}
          connections={connections}
          selectionId={selection?.type === 'connection' ? selection.id : null}
          onSelect={id => setSelection({ type: 'connection', id })}
          onDelete={deleteConnection}
          dragConnection={dragConn}
        />
```

- [ ] **Step 13.3: Manually verify**

Run: `npm run dev`

Expected:
- With two boxes connected, click the line → it turns accent purple, a red ✕ appears at the midpoint.
- Click the ✕ → connection removed.
- Select connection, press Delete → also removed (works via the keyboard handler from Task 10).
- Clicking empty canvas → deselects connection.

- [ ] **Step 13.4: Commit**

```bash
git add src/components/canvas/CanvasConnections.jsx src/components/NoteCanvas.jsx
git commit -m "feat(canvas): select connection lines; mid-line X deletes; keyboard delete works"
```

---

## Task 14: beforeunload save flush

**Files:**
- Modify: `src/components/NoteCanvas.jsx`

- [ ] **Step 14.1: Add synchronous flush on window close**

In `src/components/NoteCanvas.jsx`, add this `useEffect` near the autosave effect:

```javascript
  useEffect(() => {
    function flushSave() {
      if (!canvasId) return
      clearTimeout(saveTimer.current)
      // Fire-and-forget — IPC invoke is async but Electron sends it before unload completes
      window.api.canvasSave({ id: canvasId, content: { boxes, connections, pan } })
    }
    window.addEventListener('beforeunload', flushSave)
    return () => window.removeEventListener('beforeunload', flushSave)
  }, [canvasId, boxes, connections, pan])
```

- [ ] **Step 14.2: Manually verify**

Run: `npm run dev`

Expected:
- Create a box, immediately close the Electron window (within 600ms of the change).
- Re-launch → the box is still there. (Without the flush, the box would be lost because the debounced save didn't fire before close.)

- [ ] **Step 14.3: Commit**

```bash
git add src/components/NoteCanvas.jsx
git commit -m "feat(canvas): flush autosave on window close to prevent lost changes"
```

---

## Task 15: Update report.js to use canvas data

**Files:**
- Modify: `electron/report.js`
- Modify: `electron/db.js` (`listAllCanvases` already added in Task 1.4)

- [ ] **Step 15.1: Replace listAllPhaseNotes import and usage in report.js**

In `electron/report.js`, change line 4:

```javascript
import { listProjects, listAllPhaseNotes, listOutgoingLog, listProjectSubprojects } from './db.js'
```

To:

```javascript
import { listProjects, listAllCanvases, listOutgoingLog, listProjectSubprojects } from './db.js'
```

Replace line 35:

```javascript
  const phaseNotes = listAllPhaseNotes(projectId)
```

With:

```javascript
  const canvases = listAllCanvases(projectId)
```

Replace the grouping block (lines 44-56):

```javascript
  // Group notes by subproject scope, then phase
  const notesByScope = {}
  for (const note of phaseNotes) {
    const scopeKey = note.subproject_id ? `subproject:${note.subproject_id}` : 'project'
    if (!notesByScope[scopeKey]) {
      notesByScope[scopeKey] = {
        label: note.subproject_id ? subprojectNames.get(note.subproject_id) ?? 'Subproject' : 'Project-level',
        phases: {},
      }
    }
    if (!notesByScope[scopeKey].phases[note.phase]) notesByScope[scopeKey].phases[note.phase] = []
    notesByScope[scopeKey].phases[note.phase].push(note)
  }
```

With:

```javascript
  // Group canvas boxes by subproject scope, then phase (boxes sorted by updated_at)
  const notesByScope = {}
  for (const row of canvases) {
    const scopeKey = row.subproject_id ? `subproject:${row.subproject_id}` : 'project'
    if (!notesByScope[scopeKey]) {
      notesByScope[scopeKey] = {
        label: row.subproject_id ? subprojectNames.get(row.subproject_id) ?? 'Subproject' : 'Project-level',
        phases: {},
      }
    }
    let content = { boxes: [], connections: [] }
    try { content = JSON.parse(row.content_json) } catch {}
    const boxes = (content.boxes || []).filter(b => (b.html ?? '').trim() !== '')
    if (boxes.length === 0) continue
    boxes.sort((a, b) => (a.updated_at || '').localeCompare(b.updated_at || ''))
    const phaseKey = row.phase ?? 'general'
    notesByScope[scopeKey].phases[phaseKey] = boxes
  }
```

Replace the notes rendering block (lines 69-79):

```javascript
  const notesHtml = Object.entries(notesByScope).map(([, scope]) => `
    <h3>${esc(scope.label)}</h3>
    ${Object.entries(scope.phases).map(([phase, entries]) => `
      <h4>${esc(PHASE_LABELS[phase] ?? phase)}</h4>
      ${entries.map(e => `
        <div class="note-entry">
          <div class="note-date">${esc(e.entry_date)}</div>
          <div class="note-body">${e.content_html}</div>
        </div>`).join('')}
    `).join('')}
  `).join('') || '<p class="muted">No notes recorded.</p>'
```

With:

```javascript
  const notesHtml = Object.entries(notesByScope).map(([, scope]) => `
    <h3>${esc(scope.label)}</h3>
    ${Object.entries(scope.phases).map(([phase, boxes]) => `
      <h4>${esc(PHASE_LABELS[phase] ?? (phase === 'general' ? 'General' : phase))}</h4>
      ${boxes.map(b => `
        <div class="note-entry">
          <div class="note-date">${esc((b.updated_at || '').slice(0, 16).replace('T', ' '))}</div>
          <div class="note-body">${b.html}</div>
        </div>`).join('')}
    `).join('')}
  `).join('') || '<p class="muted">No notes recorded.</p>'
```

- [ ] **Step 15.2: Manually verify**

Run: `npm run dev`

Expected:
- Click `🖨️ Print Report` in the header.
- The generated HTML report (opens in the default browser) contains a "Notes" section.
- Each canvas with non-empty boxes shows under its scope+phase header.
- Each box's `updated_at` shows as a date, body shows the HTML content.
- No errors in the Electron main process console.

- [ ] **Step 15.3: Commit**

```bash
git add electron/report.js
git commit -m "feat(canvas): printed report renders canvas boxes by scope and phase"
```

---

## Task 16: End-to-end manual QA pass

**Files:** none (verification only)

- [ ] **Step 16.1: Fresh-DB verification**

Stop the dev server. Delete the SQLite file:

```powershell
Remove-Item "$env:APPDATA\docketos\project-hub.db*" -Force -ErrorAction SilentlyContinue
```

(Path may vary — check the `[db] initialised at ...` console log from the previous run to confirm the exact path.)

Run: `npm run dev`

Expected:
- App launches without errors.
- Create a new project (or activate one).
- DB now contains `canvas_notes` table and no `phase_notes` table. (Verify via DB Browser for SQLite or by inspecting the schema.)

- [ ] **Step 16.2: Full gesture walkthrough**

In the running app, in order, verify each:

1. Double-click empty canvas → new box in edit mode. Type "Hello world", press Escape.
2. Double-click another spot → second box. Type "Note 2".
3. Click first box → selected outline. Click connector dot, drag to second box → connection drawn.
4. Drag first box's header → both boxes move with the line following.
5. Click first box, drag a corner → resize works, min size enforced.
6. Click connection line → red ✕ at midpoint. Click ✕ → connection gone.
7. Switch to a different phase via sidebar → canvas clears (different scope). Switch back → boxes + lines restored.
8. Pan with Space+drag → both boxes move with the grid.
9. Click ⌂ Reset → pan back to origin.
10. Press Delete on a selected box → deleted (and any connections to it).
11. Close app immediately after a change → reopen → change persists (beforeunload flush).
12. Click `🖨️ Print Report` → report opens, shows box content under correct phase/scope headings.

- [ ] **Step 16.3: Commit (only if any fixes were made during QA)**

```bash
git status
# If changes exist:
git add -A
git commit -m "fix(canvas): QA fixups"
```

- [ ] **Step 16.4: Done**

The feature is complete. Remove `useState` imports or unused state from Dashboard.jsx if anything was left dangling.

---

## Self-Review Checklist (done before finalising plan)

**Spec coverage:**
- [x] DB schema migration → Task 1
- [x] PhaseNotes deletion → Task 2
- [x] NoteCanvas shell + autosave → Task 3
- [x] Pan (space-drag, middle-mouse) + reset view → Task 4
- [x] Double-click empty → create box → Task 5
- [x] Single-click box → select + delete X → Task 6
- [x] Drag header → move (with click/drag threshold) → Task 7
- [x] Resize from 4 corners with min size → Task 8
- [x] Double-click → edit mode, toolbar, last-edited date, Escape exits → Task 9
- [x] Keyboard Delete on selected (safe in edit mode) → Task 10
- [x] Connection rendering → Task 11
- [x] Drag connector dot to connect (self-loop + duplicate guards) → Task 12
- [x] Connection selection + mid-line ✕ + keyboard delete → Tasks 13 + 10
- [x] beforeunload flush → Task 14
- [x] Report.js update → Task 15
- [x] Final QA → Task 16

**Placeholder scan:** No TBDs, no "TODO later", no "similar to" without code. Every step has either a full code block or an exact command.

**Type consistency:** `box` shape `{id, x, y, width, height, html, updated_at}` consistent across CanvasBox, NoteCanvas, report.js. `connection` shape `{id, from, to}` consistent. IPC names `canvasLoad/canvasSave` consistent across preload, main, NoteCanvas.
