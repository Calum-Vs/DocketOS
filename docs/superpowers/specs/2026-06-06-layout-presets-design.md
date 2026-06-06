# Layout Presets Design

**Date:** 2026-06-06

## Goal

Let the user save and recall named snapshots of the centre-panel kanban grid — which panel type is in each slot, the column/row weights, the kanban height, and the per-slot filename column widths. Presets are global (not per-project).

## Scope

Centre panel only. A preset does **not** capture or restore:
- Left/right panel widths or collapsed state
- Left/right section heights or section order
- Canvas visibility or height
- Any per-slot internal selections (active task list, note file, subproject, etc.)

## Data Model

Presets are stored in `localStorage` under the global key `docketos:layout-presets` as a JSON array. No DB migration required.

### Preset object schema

```js
{
  id: string,                        // String(Date.now()) — unique within a session
  name: string,                      // User-typed label
  centerPanelSlots: string[],        // e.g. ['todo', 'inProgress', 'timeline']
  centerGridColumnWeights: number[], // flex weights for columns
  centerGridRowWeights: number[],    // flex weights for rows
  centerGridColumnRowWeights: object,// per-column row weight overrides
  centerKanbanHeight: number,        // px height of the kanban section
  fileNameColumnWidthBySlot: object, // { [slotKey]: number }
  savedAt: string,                   // ISO 8601, shown as title tooltip on the name
}
```

### Helper functions (all in `src/views/Dashboard.jsx`)

| Function | Behaviour |
|---|---|
| `loadLayoutPresets()` | Reads and parses `docketos:layout-presets` from localStorage; returns `[]` on parse error |
| `saveLayoutPreset(name)` | Snapshots current state, appends a new preset object, writes back to localStorage |
| `deleteLayoutPreset(id)` | Filters the preset with the matching id out of the array, writes back |
| `applyLayoutPreset(preset)` | Calls the six centre-panel setters (slots, column weights, row weights, column-row weights, kanban height, filename column widths); does not touch any other layout state |

## UI

### Banner button

A `Layouts ▾` button is added to the top banner's right-hand control group, immediately before `+ Add Box`. It uses the same secondary button style as `Ctrl+K`:

```jsx
<button
  onClick={() => setShowLayoutsPopover(prev => !prev)}
  className="mono text-[10px] px-2.5 py-1.5 rounded border hover:border-[#3A3A40] hover:text-white transition"
  style={{ ...S.elevated, color: S.zinc }}
>
  Layouts ▾
</button>
```

### Popover

Anchored below the button via `position: absolute` on a wrapping `relative` div. Closes on click-outside via a `useEffect` that attaches a `mousedown` listener to `document` while open.

```
┌─────────────────────────────────┐
│  SAVED LAYOUTS                  │  ← mono muted label
├─────────────────────────────────┤
│  3-panel review    [Load]  [✕]  │
│  Focus mode        [Load]  [✕]  │
│  No saved layouts               │  ← empty state (dim)
├─────────────────────────────────┤
│  [________________]  [Save]     │  ← name input + save
└─────────────────────────────────┘
```

**Preset list rows:** name truncated with `truncate`, `title={savedAt ISO string}`. Clicking the name or Load button calls `applyLayoutPreset` and closes the popover. ✕ calls `deleteLayoutPreset` — no confirmation.

**Save row:** controlled `input` bound to `newPresetName` state. Clicking Save or pressing Enter calls `saveLayoutPreset(newPresetName.trim())` if the name is non-empty, then clears the input. Duplicate names are allowed (the id differentiates them).

**Empty state:** shown when the preset array is empty: `"No saved layouts"` in `S.dim` text.

### State additions

```js
const [showLayoutsPopover, setShowLayoutsPopover] = useState(false)
const [newPresetName, setNewPresetName] = useState('')
```

Preset data is not React state — it is read from and written to localStorage directly on each action. No need to mirror it in component state; the popover re-reads on each open.

## Affected Files

| File | Changes |
|---|---|
| `src/views/Dashboard.jsx` | New state vars, four helper functions, `Layouts ▾` button in banner, popover JSX |

No other files change. No DB migration. No new npm dependencies.
