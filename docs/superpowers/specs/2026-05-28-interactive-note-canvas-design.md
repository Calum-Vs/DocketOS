# Interactive Note Canvas — Design Spec

**Date:** 2026-05-28
**Status:** Approved for implementation planning
**Replaces:** `PhaseNotes` date-journal modal

## Goal

Turn the placeholder dot-grid panel in `Dashboard.jsx` into an interactive, pannable canvas where users can double-click to create text boxes, single-click to select, double-click to edit, drag to move/resize, and connect boxes with arrows. Replace the existing `PhaseNotes` date-journal modal entirely.

## Architecture

Three-layer rendering, all inside one `overflow:hidden` viewport `<div>`:

1. **Pan layer** — a single child `<div>` with `transform: translate(panX, panY)`. Everything inside moves with the pan.
2. **Connections layer** — an `<svg>` inside the pan layer, drawn under the boxes. One `<path>` per connection.
3. **Boxes layer** — absolutely-positioned `<div>` per note. Reuses the rich-text toolbar pattern from `PhaseNotes`.

Tech: plain DOM + CSS transforms + SVG overlay. No new dependencies.

Scope axes: `(project_id, subproject_id_or_null, phase_or_null)`. Each unique combo = one stored canvas record. Switching scope swaps which canvas is rendered.

Persistence: each canvas is a single row in `canvas_notes` storing a JSON blob (`{boxes, connections, pan}`). Autosave debounced 600ms after any change. Final flush on `beforeunload`.

## File Structure

### New files

| File | Responsibility |
|---|---|
| `src/components/NoteCanvas.jsx` | Top-level canvas component. Owns viewport, pan state, selection state, loads/saves canvas data via IPC. Renders the three layers. Receives `{projectId, subprojectId, phase}` props. |
| `src/components/canvas/CanvasBox.jsx` | One text-box node. Handles its own drag, resize, single-click-to-select, double-click-to-edit. Renders the rich-text toolbar. Shows last-edited date in its header. |
| `src/components/canvas/CanvasConnections.jsx` | SVG overlay. Receives `boxes` + `connections` arrays, draws bezier paths between box edges. Handles in-progress drag-to-connect line and connection selection. |
| `src/components/canvas/useCanvasInteractions.js` | Custom hook holding pan / drag / resize / connect-drag pointer handlers and keyboard handlers. Keeps `NoteCanvas.jsx` lean. |

### Modified files

| File | Change |
|---|---|
| `src/views/Dashboard.jsx` | Remove `showNotes`, `notesPhase` state and the `PhaseNotes` modal block. Replace the placeholder panel at lines 550–572 with `<NoteCanvas projectId={...} subprojectId={...} phase={...} />`. Sidebar phase buttons call `setProjectPhaseKey`/`setSubprojectPhaseKey` directly (canvas re-scopes). |
| `electron/db.js` | Drop `phase_notes` table create + all `phaseNote*` functions. Drop and re-create `canvas_notes` with new shape (subproject_id nullable, phase nullable, updated default JSON). Add `loadCanvas / saveCanvas` functions. |
| `electron/main.js` | Remove `notes:list/upsert/delete` IPC handlers. Add `canvas:load` and `canvas:save` handlers. |
| `electron/preload.js` | Remove `notesList/notesUpsert/notesDelete`. Add `canvasLoad / canvasSave`. |
| `electron/report.js` | Replace `listAllPhaseNotes` with `listAllCanvases`. Render canvas box contents per scope+phase instead of journal entries. |

### Deleted files

- `src/components/PhaseNotes.jsx` — entire file removed.

## Data Model

### Schema change in `electron/db.js`

```sql
-- Cleanup at startup
DROP TABLE IF EXISTS phase_notes;
DROP TABLE IF EXISTS canvas_notes;

-- New canvas table
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
```

The existing `ALTER TABLE phase_notes ADD COLUMN subproject_id` block (db.js:100-103) is removed — the table no longer exists.

Drop-and-recreate is safe because both tables either contain no data (`canvas_notes` was an unused stub) or are being intentionally discarded (`phase_notes` — user-approved).

### `content_json` shape

```json
{
  "boxes": [
    {
      "id": "uuid",
      "x": 120, "y": 80,
      "width": 240, "height": 120,
      "html": "<p>note text</p>",
      "updated_at": "2026-05-28T10:15:30.123Z"
    }
  ],
  "connections": [
    { "id": "uuid", "from": "boxId1", "to": "boxId2" }
  ],
  "pan": { "x": 0, "y": 0 }
}
```

### IPC contract

```js
// Load — creates the row on first access for a given scope, returns existing otherwise.
window.api.canvasLoad({ projectId, subprojectId, phase })
  → { id, content: { boxes, connections, pan } }

// Save — full blob, debounced from renderer.
window.api.canvasSave({ id, content })
  → { ok: true, updated_at }
```

### Why a single JSON blob per canvas (not normalized tables)

- Typical canvas has tens of boxes, not thousands.
- Drag/resize fires many state updates per second; debounced save = one tiny row write.
- Matches the original `content_json` shape already in the unused stub.

### Why `subproject_id` and `phase` are both nullable

User scope is "Project + Subproject + (optional) Phase". Valid combos:

- `(project, null, null)` — project-level general
- `(project, null, phase)` — project-level per phase
- `(project, subproject, null)` — subproject general
- `(project, subproject, phase)` — subproject per phase

The unique index uses `IFNULL` so NULL participates in uniqueness — each scope gets exactly one row.

## Interaction Model

### On empty canvas

| Gesture | Result |
|---|---|
| Single-click empty area | Clear selection. No box created. |
| **Double-click empty area** | Create a new box at the cursor (translated through current pan), default 240×120, immediately enter edit mode with focus in the editor. |
| Hold Space + drag | Pan the canvas. Cursor changes to grab/grabbing. |
| Middle-mouse drag | Pan the canvas (alternative to space-drag). |

### On a box

| Gesture | Result |
|---|---|
| **Single-click box** | Select the box. Shows 1px accent outline, 4 corner resize handles, drag-handle header bar (with last-edited date), delete `✕` button, and a connector dot on the right edge. |
| **Double-click box** | Enter edit mode. Toolbar (Bold/Italic/Underline/Lists/Headings) appears in the header. Cursor goes into the text. |
| Drag the header bar | Move the box. Updates `x,y`. |
| Drag a corner handle | Resize the box. Updates `width,height`. Min 120×60. |
| Drag the connector dot to another box | Creates a connection. Dashed in-progress line follows the cursor until release. Dropping on another box commits; dropping on empty space cancels. Self-loops disallowed. Duplicate connections (same `from` + `to`) are a no-op. |
| Click `✕` | Delete the box and any connections touching it. |
| Click outside the box (while editing) | Exit edit mode. Bump `updated_at` to now. |
| **Escape** (while editing) | Exit edit mode, keep selection. |
| **Delete / Backspace** (while selected, not editing) | Delete the box and its connections. |

### On a connection line

| Gesture | Result |
|---|---|
| Single-click the line | Select the connection. Line highlights in accent colour. Small `✕` appears at its midpoint. |
| Click `✕` on selected line | Delete the connection. |
| Delete key (while connection selected) | Delete it. |

### Selection rules

- One thing selected at a time (box OR connection).
- Clicking empty canvas always deselects.
- Switching scope (different phase / subproject) clears selection.

### Edge cases

- **Drag boundary:** Infinite pan; boxes can have negative coordinates.
- **Editing + dragging:** Can't drag a box while it's in edit mode (header drag disabled until exit). Prevents text-selection conflicts.
- **Click vs drag on the header:** Pointer-down on the header starts a drag-intent. If pointer moves less than 3px before pointer-up, it's treated as a click (selects the box). Otherwise it's a drag.
- **Clicking another box while editing:** Exits edit mode on the currently-editing box (saves), then selects the newly-clicked box. Does not enter edit mode on the new one (requires a second click — i.e. a double-click).
- **Connector self-loops:** Disallowed. Dropping the connector dot back on the source box cancels.
- **Duplicate connections:** A connection is identified by the ordered pair `(from, to)`. Creating an A→B connection when one already exists is a no-op. B→A is allowed independently (renders as a separate parallel line).
- **Keyboard delete during editing:** Must not delete the box when typing in contentEditable. Handler checks `document.activeElement` is not a contentEditable before deleting.

## Visual / Rendering Details

### Viewport

- Dot-grid background: `radial-gradient(#1f1f23 1px, transparent 1px)`, `28px` step (reused from current placeholder).
- Dot grid moves with pan: `backgroundPosition: ${panX}px ${panY}px`. Cheaper than redrawing SVG.
- Top-left of viewport: breadcrumb `Project · Subproject · Phase` in mono / dim.
- Top-right of viewport: `⌂` reset-view button (resets pan to `0,0`).

### Box (`CanvasBox.jsx`)

- Default size: **240 × 120**. Min: 120 × 60.
- Background: `#121214` (matches `S.panel`).
- Border: 1px `#1F1F23` default, `#7A5CFF` (accent) when selected.
- Header bar (24px tall, drag handle):
  - Left: last-edited date in mono `text-xs` dim (`YYYY-MM-DD HH:mm`).
  - Right (only when selected): `✕` delete button.
  - When editing: date hidden, rich-text toolbar shown (Bold / Italic / Underline / Lists / Headings). Same `ToolbarBtn` pattern as the deleted `PhaseNotes`.
- Body: contentEditable div. `#D4D4D8` text, `13px / 1.65`, accent caret. Empty-state via `data-placeholder` + `:empty:before` CSS.
- Resize handles: 4 corners, 8×8 hit area, visible only when selected (small accent square in each corner).
- Connector dot: 8×8 accent circle on the right-center edge, visible only when selected.

### Connection lines (`CanvasConnections.jsx`)

- SVG layer: `position:absolute; inset:-50000px; width:100000px; height:100000px; pointer-events:none;`. Lives inside the pan layer.
- Each connection = bezier `<path>`:
  - Endpoints: midpoints of the right edge of `from` and the left edge of `to`.
  - Control points: horizontal offset of `(toX - fromX) / 2` for a clean S-curve.
  - Stroke: `#3F3F46`, 1.5px default. Selected: `#7A5CFF`, 2px.
  - Hit area: a transparent fatter `<path>` (12px stroke) drawn underneath each visible path so lines are easier to click. `pointer-events: auto` on these paths only.
- In-progress drag line: dashed accent line from source dot to current cursor.
- Mid-line `✕` (when selected): rendered as SVG `<circle>` + `<text>` so it sits inside the pan transform with the line.

### Layout integration

The bottom-center panel of Dashboard (currently lines 550–572 placeholder) becomes:

```
┌── breadcrumb (Project · Sub · Phase) ──┬── ⌂ Reset view ──┐
│                                                            │
│              [interactive canvas viewport]                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

Sidebar phase buttons keep their position. Clicking one sets the active phase state — the canvas re-loads for the new scope. The breadcrumb shows `—` when phase is null (general canvas).

### Performance

- All boxes re-render on state change — fine up to a few hundred. Virtualization deferred (YAGNI).
- Drag/resize/pan use local component state during the gesture; commit to the parent `boxes` array on `pointerup`. Continuous re-renders during drag stay scoped to the one box being moved.

## Migration & Cleanup at App Startup

In `initDb()`:

1. `DROP TABLE IF EXISTS phase_notes;` — user-approved discard.
2. `DROP TABLE IF EXISTS canvas_notes;` — wipe stale schema (table currently empty/unused).
3. Recreate `canvas_notes` with new shape.
4. Remove the existing `ALTER TABLE phase_notes ADD COLUMN subproject_id` block (db.js:100-103).

### Code to delete

- `src/components/PhaseNotes.jsx` — entire file.
- In `src/views/Dashboard.jsx`: `showNotes`, `notesPhase` state; the `PhaseNotes` import; the modal render block; the `handlePhaseClick` body becomes `setProjectPhaseKey(phaseKey)` (or subproject equivalent based on active scope).
- In `electron/main.js`: `notes:list`, `notes:upsert`, `notes:delete` IPC handlers + the `listPhaseNotes`/`upsertPhaseNote`/`deletePhaseNote` imports.
- In `electron/preload.js`: `notesList`, `notesUpsert`, `notesDelete` bindings.
- In `electron/db.js`: `listPhaseNotes`, `listAllPhaseNotes`, `upsertPhaseNote`, `deletePhaseNote` functions.

### Code to update

- `electron/report.js`: replace `listAllPhaseNotes(projectId)` call (line 35) with a new `listAllCanvases(projectId)` that returns all canvas rows for the project. The renderer block at lines 69–79 changes to iterate canvases → group by subproject/phase scope → render each box's HTML content as a section, with the box's `updated_at` as the per-section date. (Boxes are spatially ordered on the canvas, but for the printed report they're flattened — sort by `updated_at` ascending within each scope.)

## Out of Scope (v1)

Explicitly deferred to v2 if needed:

- Zoom (pan only in v1).
- Multi-select boxes / box grouping.
- Box colours / accent stripes.
- Minimap.
- Reset-to-fit-content button (only reset-to-origin in v1).
- Connection labels / arrow direction indicators.
- Undo / redo across the canvas.
- Image / file attachments inside boxes.
- Export canvas to image or PDF.
- Multi-user / collaborative editing.

## Risk Callouts

- **Pointer-event ordering** when dragging across a contentEditable body: `pointerdown` on the header bar must call `setPointerCapture` so a quick drag doesn't accidentally select text inside the body.
- **Backspace in edit mode** must not trigger the "delete selected box" shortcut. Keyboard handler checks `document.activeElement` is not contentEditable before deleting.
- **Save flush on close:** debounced save can be in-flight when the window closes. Add a `beforeunload` listener in `NoteCanvas.jsx` that flushes any pending save synchronously via IPC.
- **Report regeneration:** because `report.js` already reads phase_notes, the report code must change in lockstep with the DB drop. If report code lags the DB migration, report generation will throw.
