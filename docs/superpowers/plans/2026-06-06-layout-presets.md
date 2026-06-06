# Layout Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Layouts ▾` button to the top banner that opens a popover for saving and loading named snapshots of the centre-panel kanban grid.

**Architecture:** All changes are in `src/views/Dashboard.jsx`. Presets are stored in `localStorage` under the global key `docketos:layout-presets` (a JSON array). No DB migration, no new files, no new npm deps. The popover follows the existing `folderContextMenu` click-outside pattern.

**Tech Stack:** React 18, inline styles with `S` tokens, localStorage

---

## File Map

| File | Changes |
|---|---|
| `src/views/Dashboard.jsx` | Two new state vars; four helper functions; `Layouts ▾` button + popover JSX in the banner; click-outside `useEffect` |

---

### Task 1: State variables and localStorage helpers

**Files:**
- Modify: `src/views/Dashboard.jsx` — state declarations block (around line 1180) and after `applyLayout` function (around line 1356)

- [ ] **Step 1: Add two state variables**

Find the state declarations block (search for `const [subprojectBrowserSort`). Add immediately after:

```jsx
const [showLayoutsPopover, setShowLayoutsPopover] = useState(false)
const [newPresetName, setNewPresetName] = useState('')
```

- [ ] **Step 2: Add the four helper functions**

Find the `applyLayout` function (search for `function applyLayout`). Add these four functions immediately after `applyLayout`'s closing brace:

```jsx
function loadLayoutPresets() {
  try {
    return JSON.parse(localStorage.getItem('docketos:layout-presets') ?? '[]')
  } catch {
    return []
  }
}

function saveLayoutPreset(name) {
  const presets = loadLayoutPresets()
  const preset = {
    id: String(Date.now()),
    name,
    centerPanelSlots: [...centerPanelSlots],
    centerGridColumnWeights: [...centerGridColumnWeights],
    centerGridRowWeights: [...centerGridRowWeights],
    centerGridColumnRowWeights: { ...centerGridColumnRowWeights },
    centerKanbanHeight,
    fileNameColumnWidthBySlot: { ...fileNameColumnWidthBySlot },
    savedAt: new Date().toISOString(),
  }
  localStorage.setItem('docketos:layout-presets', JSON.stringify([...presets, preset]))
}

function deleteLayoutPreset(id) {
  const presets = loadLayoutPresets().filter(p => p.id !== id)
  localStorage.setItem('docketos:layout-presets', JSON.stringify(presets))
}

function applyLayoutPreset(preset) {
  if (Array.isArray(preset.centerPanelSlots) && preset.centerPanelSlots.length) {
    setCenterPanelSlots([...preset.centerPanelSlots])
  }
  if (Array.isArray(preset.centerGridColumnWeights)) {
    setCenterGridColumnWeights([...preset.centerGridColumnWeights])
  }
  if (Array.isArray(preset.centerGridRowWeights)) {
    setCenterGridRowWeights([...preset.centerGridRowWeights])
  }
  if (preset.centerGridColumnRowWeights && typeof preset.centerGridColumnRowWeights === 'object') {
    setCenterGridColumnRowWeights({ ...preset.centerGridColumnRowWeights })
  }
  if (typeof preset.centerKanbanHeight === 'number') {
    setCenterKanbanHeight(preset.centerKanbanHeight)
  }
  if (preset.fileNameColumnWidthBySlot && typeof preset.fileNameColumnWidthBySlot === 'object') {
    setFileNameColumnWidthBySlot({ ...preset.fileNameColumnWidthBySlot })
  }
}
```

- [ ] **Step 3: Build to confirm no syntax errors**

```powershell
npm run build
```

Expected: build succeeds (zero errors).

- [ ] **Step 4: Commit**

```bash
git add "src/views/Dashboard.jsx"
git commit -m "feat: add layout preset state and localStorage helpers"
```

---

### Task 2: Click-outside effect to close the popover

**Files:**
- Modify: `src/views/Dashboard.jsx` — useEffect block (add near the other click-outside effects, around line 1934)

- [ ] **Step 1: Add the click-outside useEffect**

Find the block `useEffect(() => { if (!folderContextMenu) return` (around line 1934). Add a new `useEffect` immediately before it:

```jsx
useEffect(() => {
  if (!showLayoutsPopover) return
  function handleClose() {
    setShowLayoutsPopover(false)
  }
  window.addEventListener('mousedown', handleClose)
  return () => window.removeEventListener('mousedown', handleClose)
}, [showLayoutsPopover])
```

- [ ] **Step 2: Build**

```powershell
npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add "src/views/Dashboard.jsx"
git commit -m "feat: add click-outside effect for layouts popover"
```

---

### Task 3: Layouts button and popover in the banner

**Files:**
- Modify: `src/views/Dashboard.jsx` — the top banner right-hand control group (around line 4939)

The `Layouts ▾` button and popover go inside the `<div className="flex items-center gap-2">` block that also contains `+ Add Box`. The button needs a `relative` wrapper so the popover can be absolutely positioned below it.

- [ ] **Step 1: Find the insertion point**

Search for `+ Add Box` in the file. The surrounding block looks like:

```jsx
<div className="flex items-center gap-2">
  {!isBoxPopout && shouldLoadCenterBoxes && (
    <button
      onClick={addCenterPanelBox}
      ...
    >
      + Add Box
    </button>
  )}
  <div className="flex items-center gap-2 border rounded px-2.5 py-1" ...>
```

- [ ] **Step 2: Insert the Layouts button + popover before the + Add Box button**

Add the following block as the first child inside `<div className="flex items-center gap-2">` (before the `{!isBoxPopout && shouldLoadCenterBoxes && ...}` block):

```jsx
{!isBoxPopout && shouldLoadCenterBoxes && (
  <div className="relative" onMouseDown={event => event.stopPropagation()}>
    <button
      onClick={() => setShowLayoutsPopover(prev => !prev)}
      className="mono text-[10px] px-2.5 py-1.5 rounded border hover:border-[#3A3A40] hover:text-white transition"
      style={{ ...S.elevated, color: S.zinc }}
      title="Save or load panel layout presets"
    >
      Layouts ▾
    </button>
    {showLayoutsPopover && (() => {
      const presets = loadLayoutPresets()
      return (
        <div
          className="absolute right-0 top-full mt-1 w-64 rounded border shadow-2xl z-50 overflow-hidden"
          style={{ backgroundColor: '#1C1C20', borderColor: S.border }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: S.border }}>
            <span className="mono text-[10px] uppercase tracking-widest" style={{ color: S.muted }}>
              Saved Layouts
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {presets.length === 0 && (
              <p className="mono px-3 py-3 text-[10px]" style={{ color: S.dim }}>
                No saved layouts
              </p>
            )}
            {presets.map(preset => (
              <div
                key={preset.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-[#26262C] transition group"
              >
                <button
                  className="min-w-0 flex-1 text-left text-xs truncate hover:text-white transition"
                  style={{ color: S.text }}
                  title={`Saved ${new Date(preset.savedAt).toLocaleString()}`}
                  onClick={() => {
                    applyLayoutPreset(preset)
                    setShowLayoutsPopover(false)
                  }}
                >
                  {preset.name}
                </button>
                <button
                  className="mono text-[10px] px-1.5 py-0.5 rounded border opacity-0 group-hover:opacity-100 transition hover:text-white"
                  style={{ ...S.elevated, color: S.zinc, borderColor: S.border }}
                  title="Load this layout"
                  onClick={() => {
                    applyLayoutPreset(preset)
                    setShowLayoutsPopover(false)
                  }}
                >
                  Load
                </button>
                <button
                  className="mono text-[10px] opacity-0 group-hover:opacity-100 transition hover:text-white"
                  style={{ color: S.muted }}
                  title="Delete this preset"
                  onClick={() => {
                    deleteLayoutPreset(preset.id)
                    setShowLayoutsPopover(prev => !prev)
                    setShowLayoutsPopover(true)
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="border-t px-3 py-2 flex items-center gap-2" style={{ borderColor: S.border }}>
            <input
              value={newPresetName}
              onChange={event => setNewPresetName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && newPresetName.trim()) {
                  saveLayoutPreset(newPresetName.trim())
                  setNewPresetName('')
                  setShowLayoutsPopover(false)
                  setShowLayoutsPopover(true)
                }
              }}
              placeholder="Preset name…"
              className="flex-1 min-w-0 rounded border text-xs outline-none"
              style={{ backgroundColor: '#26262C', borderColor: S.border, color: S.text, padding: '5px 8px' }}
            />
            <button
              disabled={!newPresetName.trim()}
              onClick={() => {
                if (!newPresetName.trim()) return
                saveLayoutPreset(newPresetName.trim())
                setNewPresetName('')
                setShowLayoutsPopover(false)
                setShowLayoutsPopover(true)
              }}
              className="mono text-[10px] px-2 py-1 rounded border transition disabled:opacity-40 hover:border-[#7A5CFF] hover:text-white"
              style={{ ...S.elevated, color: S.zinc }}
            >
              Save
            </button>
          </div>
        </div>
      )
    })()}
  </div>
)}
```

**Note on re-render trick:** `deleteLayoutPreset` and `saveLayoutPreset` write to localStorage but don't update React state. To force the popover to re-render after a save or delete, the code above calls `setShowLayoutsPopover(false)` then `setShowLayoutsPopover(true)` back-to-back. React batches these into a single re-render that reads fresh localStorage data on the next render. This is intentional — localStorage is the source of truth for presets, not component state.

- [ ] **Step 3: Build**

```powershell
npm run build
```

Expected: success (zero errors).

- [ ] **Step 4: Run dev and verify visually**

```powershell
npm run dev
```

Open the app with a project loaded. Verify:
- `Layouts ▾` button appears in the top banner (left of `+ Add Box`)
- Clicking it opens the popover
- Clicking outside closes it
- Typing a name and pressing Enter saves a preset; the popover refreshes showing the new entry
- Clicking Load applies the panel arrangement
- Clicking ✕ removes the preset
- Empty state "No saved layouts" shows when list is empty

- [ ] **Step 5: Commit**

```bash
git add "src/views/Dashboard.jsx"
git commit -m "feat: add Layouts popover for saving and loading panel presets"
```
