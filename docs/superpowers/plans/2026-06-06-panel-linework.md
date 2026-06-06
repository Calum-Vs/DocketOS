# Panel Line-Work Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-section bordered boxes in the centre grid with a single outer frame + thin internal grid-line dividers, while leaving data-item cards (tasks, files, timeline entries, quick links) unchanged.

**Architecture:** The centre grid renders absolutely-positioned box divs inside a `relative` scroll container. Each box's position is computed via `getCenterPanelBoxPositionStyle` using pixel insets to create gaps. Removing those insets and adding selective per-edge borders converts the floating-card layout into a flush grid with ruled dividers. One outer `border rounded overflow-hidden` wrapper replaces the per-card borders at the perimeter.

**Tech Stack:** React 18, Tailwind CSS, inline `S` style tokens (`src/views/Dashboard.jsx`)

---

## File Map

| File | Changes |
|---|---|
| `src/views/Dashboard.jsx` | 1) `getCenterPanelBoxPositionStyle` — zero out all insets; 2) outer scroll container — add `border rounded overflow-hidden`; 3) per-box div — remove `rounded border`, add selective border-right / border-bottom; 4) header div — remove panel background fill, dim border |

---

### Task 1: Remove inter-box gaps in `getCenterPanelBoxPositionStyle`

**Files:**
- Modify: `src/views/Dashboard.jsx:4266-4269`

Currently each box has 4px insets on interior edges creating gaps between boxes. Zero these out so boxes are flush — the border lines will serve as dividers.

- [ ] **Step 1: Locate the inset lines**

Open `src/views/Dashboard.jsx` and find `getCenterPanelBoxPositionStyle` (around line 4258). The four inset variables are:

```js
const leftInset  = columnIndex === 0 ? 0 : 4
const rightInset = columnIndex === columnWeights.length - 1 ? 0 : 4
const topInset   = rowIndex === 0 ? 0 : 4
const bottomInset = rowIndex + rowSpan >= rowWeights.length ? 0 : 4
```

- [ ] **Step 2: Replace all four inset lines with zeros**

```js
const leftInset   = 0
const rightInset  = 0
const topInset    = 0
const bottomInset = 0
```

The return object below (`position: 'absolute', left: ..., right: ..., top: ..., bottom: ...`) references these variables and requires no other change.

- [ ] **Step 3: Build to confirm no syntax errors**

```powershell
npm run build
```

Expected: build succeeds (zero errors). Boxes will now be flush — borders overlapping, but that's fixed in Task 2.

- [ ] **Step 4: Commit**

```bash
git add "src/views/Dashboard.jsx"
git commit -m "style: zero inter-box insets in center panel position calc"
```

---

### Task 2: Add outer frame to the scroll container

**Files:**
- Modify: `src/views/Dashboard.jsx` — the `centerGridRef` div (around line 5373)

The `relative flex-1 min-h-0 overflow-auto` container becomes the single visual frame for the whole grid.

- [ ] **Step 1: Find the container div**

Around line 5373:

```jsx
<div
  ref={centerGridRef}
  className="relative flex-1 min-h-0 overflow-auto"
  style={{ minHeight: isBoxPopout ? '100%' : ... }}
>
```

- [ ] **Step 2: Add `border rounded overflow-hidden` and border colour**

```jsx
<div
  ref={centerGridRef}
  className="relative flex-1 min-h-0 overflow-hidden rounded border"
  style={{ minHeight: isBoxPopout ? '100%' : shouldLoadCenterBoxes ? getCenterPanelCompactHeight(centerPanelRenderCount) : 220, borderColor: S.border }}
>
```

Two notes:
- Change `overflow-auto` → `overflow-hidden` on this wrapper. Scrolling still works because the absolutely-positioned boxes can overflow individually — or if the content inside a box overflows, the box itself has `overflow-y-auto` on its body div (unchanged).
- The `rounded` clips the corners of the flush boxes so the outer frame looks clean.

- [ ] **Step 3: Build**

```powershell
npm run build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add "src/views/Dashboard.jsx"
git commit -m "style: add single outer border frame to center grid container"
```

---

### Task 3: Convert per-box borders to selective dividers

**Files:**
- Modify: `src/views/Dashboard.jsx:5385-5456` — the `.map(...)` render loop

Each box currently has `rounded border` (all four sides). Replace with border-right (non-last column) and border-bottom (non-last row) only, and remove `rounded`.

- [ ] **Step 1: Compute column/row position inside the map**

Inside the `.map(({ key, slotIndex, renderIndex }) => {` block, after the existing local variables and before the `return (`, add:

```js
const { columnIndex, rowIndex, rowSpan } = getCenterPanelBoxPlacement(renderIndex, centerPanelRenderCount)
const columnCount = getCenterPanelColumnCount(centerPanelRenderCount)
const rowCount    = getCenterPanelRowCount(centerPanelRenderCount)
const isLastColumn = columnIndex === columnCount - 1
const isLastRow    = rowIndex + rowSpan >= rowCount
```

`getCenterPanelBoxPlacement` is already defined in scope (line 4242).

- [ ] **Step 2: Build a border style object for the box**

Add directly below the lines from Step 1:

```js
const boxDividerStyle = isBoxPopout ? {} : {
  borderRight:  isLastColumn ? 'none' : `1px solid ${S.border}`,
  borderBottom: isLastRow    ? 'none' : `1px solid ${S.border}`,
  borderLeft:   'none',
  borderTop:    'none',
}
```

- [ ] **Step 3: Update the box div className and style**

Find the box div (around line 5440):

```jsx
<div
  key={`center-panel-${isBoxPopout ? 'popout' : slotIndex}`}
  className="min-w-0 min-h-[150px] rounded border flex flex-col transition-colors duration-150"
  style={!isBoxPopout && draggingCenterPanelIndex === renderIndex
    ? { ...S.deeper, ...boxPositionStyle, opacity: 0.58, borderColor: S.accent, transform: 'scale(0.985)' }
    : { ...S.deeper, ...boxPositionStyle }
  }
```

Replace with:

```jsx
<div
  key={`center-panel-${isBoxPopout ? 'popout' : slotIndex}`}
  className="min-w-0 min-h-[150px] flex flex-col transition-colors duration-150"
  style={!isBoxPopout && draggingCenterPanelIndex === renderIndex
    ? { backgroundColor: S.deeper.backgroundColor, ...boxPositionStyle, ...boxDividerStyle, opacity: 0.58, outline: `1px solid ${S.accent}`, transform: 'scale(0.985)' }
    : { backgroundColor: S.deeper.backgroundColor, ...boxPositionStyle, ...boxDividerStyle }
  }
```

Changes:
- Removed `rounded border` from className (outer frame handles the perimeter)
- Replaced `...S.deeper` (which sets both backgroundColor and borderColor) with just `backgroundColor: S.deeper.backgroundColor` so the border shorthand doesn't conflict
- Spread `...boxDividerStyle` to apply selective right/bottom borders
- Dragging state: use `outline` instead of `borderColor` so it doesn't fight the divider style

- [ ] **Step 4: Build**

```powershell
npm run build
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add "src/views/Dashboard.jsx"
git commit -m "style: replace per-box borders with selective right/bottom grid dividers"
```

---

### Task 4: Quiet the panel header

**Files:**
- Modify: `src/views/Dashboard.jsx:5458` — the header div inside each box

The header currently has the panel background colour (`S.panel = #1C1C20`) and the standard border colour. Strip the background fill and dim the border.

- [ ] **Step 1: Find the header div**

Around line 5458:

```jsx
{!isBoxPopout && <div className="p-3 border-b flex items-center gap-2" style={{ ...S.panel, borderColor: S.border }}>
```

- [ ] **Step 2: Remove background, reduce padding, dim border**

```jsx
{!isBoxPopout && <div className="px-2.5 py-2 border-b flex items-center gap-2" style={{ borderColor: '#2A2A30' }}>
```

Changes:
- Removed `...S.panel` (no background fill — transparent lets the box background show through)
- Reduced padding: `p-3` → `px-2.5 py-2` (slightly tighter, more recessed)
- Border colour stepped down from `S.border` (`#34343A`) to `#2A2A30` (dimmer, recedes further)

- [ ] **Step 3: Strip capsule styling from drag handle and ctrl buttons**

The drag-handle span (around line 5469) currently has `backgroundColor: '#26262C'` and `borderColor: S.border`. Find these two inline styles and remove the background/border:

**Drag handle — before:**
```jsx
style={{ backgroundColor: '#26262C', borderColor: S.border, color: S.zinc }}
```
**Drag handle — after:**
```jsx
style={{ color: S.dim }}
```

The two `ctrl-btn` buttons (`Pop Out`, `Remove`) — around lines 5492 and 5502 — have:
```jsx
style={{ backgroundColor: '#26262C', borderColor: S.border, color: S.zinc }}
```
Change both to:
```jsx
style={{ color: S.dim }}
```
And remove `border` from their `className` strings (keep `mono text-[10px] px-1.5 py-0.5 rounded hover:text-white transition shrink-0`).

The count badge (around line 5488):
```jsx
style={{ backgroundColor: '#26262C', color: S.labeltext }}
```
Change to:
```jsx
style={{ color: S.dim }}
```
And remove `px-2 py-0.5 rounded` from its className — just `mono text-xs shrink-0`.

- [ ] **Step 4: Build**

```powershell
npm run build
```

Expected: success.

- [ ] **Step 5: Run dev and verify visually**

```powershell
npm run dev
```

Open the app. The centre grid should show:
- One outer rounded border around the whole panel area
- Thin 1px lines between sections (right divider and bottom divider)
- No box-level background or rounded corners per section
- Headers are quieter — no fill, dimmer separator line, plain text controls
- Data items (task cards, file rows, timeline cards, quick links) unchanged — still have `background: #26262C; border: 1px solid #34343A; border-radius: 5px`

- [ ] **Step 6: Commit**

```bash
git add "src/views/Dashboard.jsx"
git commit -m "style: quiet panel headers — remove fill, dim border, strip ctrl button capsules"
```
