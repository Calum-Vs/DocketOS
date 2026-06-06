# UI Component Standards

This file is the single source of truth for how interactive elements are built in DocketOS. Do not invent new patterns — match what is here. Add new patterns to this file when they are established.

## Buttons

### Primary (accent fill)
```jsx
<button
  onClick={handler}
  disabled={condition}
  className="bg-accent hover:bg-accent-hover text-white text-xs rounded-app px-3 py-1.5 disabled:opacity-50 transition-colors"
>
  Label
</button>
```

### Secondary (elevated surface)
```jsx
<button
  onClick={handler}
  className="bg-bg-elevated border border-border-subtle text-text-muted text-xs rounded-app px-3 py-1.5 hover:text-text-primary transition-colors"
>
  Label
</button>
```

### Destructive (error tone)
```jsx
<button
  onClick={handler}
  className="bg-status-error/10 border border-status-error/40 text-status-error text-xs rounded-app px-3 py-1.5 transition-colors"
>
  Delete
</button>
```

### Ghost / inline text link
```jsx
<button
  onClick={handler}
  className="text-text-muted hover:text-text-primary text-sm transition-colors"
>
  Cancel
</button>
```

## Inputs

### Standard text input
```jsx
<input
  value={value}
  onChange={e => setValue(e.target.value)}
  placeholder="Placeholder text"
  className="bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
/>
```

### Select / dropdown
```jsx
<select
  value={value}
  onChange={e => setValue(e.target.value)}
  className="w-full rounded border text-sm outline-none"
  style={{ backgroundColor: '#26262C', borderColor: S.border, color: S.text, padding: '7px 10px' }}
>
  <option value="">Select...</option>
</select>
```

### Textarea
```jsx
<textarea
  value={value}
  onChange={e => setValue(e.target.value)}
  className="w-full bg-bg-elevated border border-border-subtle rounded-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent resize-none"
  rows={4}
/>
```

## Section headers

Labels inside panels use the mono uppercase tracking pattern:
```jsx
<p className="mono text-xs uppercase tracking-widest" style={{ color: S.muted }}>
  Section Label
</p>
```

Page/view section headings:
```jsx
<p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
  Section Title
</p>
```

## Feedback / status text

```jsx
{/* Success */}
<p className="text-xs" style={{ color: '#30D158' }}>Saved ✓</p>

{/* Error */}
<p className="text-xs" style={{ color: '#FF453A' }}>Something went wrong</p>

{/* Muted info */}
<p className="mono text-xs" style={{ color: S.dim }}>No items yet</p>
```

## Panels and cards

### Right/left sidebar panel section
```jsx
<div className="p-4 border-b" style={{ borderColor: S.border }}>
  {/* content */}
</div>
```

### Elevated card / row
```jsx
<div
  className="flex items-center gap-2 rounded border px-2 py-1.5"
  style={{ backgroundColor: '#26262C', borderColor: S.border }}
>
  {/* content */}
</div>
```

### Centre grid — linework style

The centre panel grid uses **line work**, not floating boxes. Each panel slot is borderless with a transparent background. The grid as a whole gets one outer `border` frame; slots are divided by 1px right/bottom lines only.

**Grid container:**
```jsx
<div
  ref={centerGridRef}
  className="relative flex-1 min-h-0 overflow-hidden border"
  style={{ borderColor: S.border }}
>
```

**Per-slot box** (absolutely positioned, no own border, no background):
```jsx
<div
  className="min-w-0 min-h-[150px] flex flex-col"
  style={{
    ...boxPositionStyle,   // pure % calc — see getCenterPanelBoxPositionStyle
    borderRight:  isLastColumn ? 'none' : `1px solid ${S.border}`,
    borderBottom: isLastRow    ? 'none' : `1px solid ${S.border}`,
    borderLeft:   'none',
    borderTop:    'none',
  }}
>
```

Box positions use pure percentage ratios — **no pixel insets**:
```js
return {
  position: 'absolute',
  left:   `${columnStart * 100}%`,
  right:  `${(1 - columnEnd) * 100}%`,
  top:    `${rowStart * 100}%`,
  bottom: `${(1 - rowEnd) * 100}%`,
}
```

**Panel header** — quiet, no heavy fill:
```jsx
<div
  className="px-2.5 py-2 border-b flex items-center flex-wrap gap-2"
  style={{ borderColor: '#2A2A30', backgroundColor: '#1C1C20' }}
>
```

Header controls (drag handle, count badge, Pop Out, Remove) use `style={{ color: S.dim }}` with no background or border capsule. Use `flex-wrap` so controls wrap on narrow panels.

### Text wrapping in panels

| Context | Behaviour |
|---|---|
| File/folder entry rows (subproject browser, selected folder, recent files, flagged, timeline) | `truncate` on name (stays fixed); size/date spans use `flexShrink: 2; min-w-0; overflow-hidden; whitespace-nowrap` to clip when narrow |
| Quick links names and paths | `break-all` — full wrap |
| Task items, timeline event text, notes | wrap naturally |
| Panel header controls | `flex-wrap` on the header flex row |

### File/tree filename column resize rail

Use this pattern in file lists, quick links, recent files, and folder trees when filename truncation needs to be adjustable. The rail sits immediately after the filename column, appears on row hover, and uses the app's existing `col-resize` drag state.

**Column width is per-slot.** Each centre-panel slot stores its own width in `fileNameColumnWidthBySlot` keyed by `String(slotIndex)`. The left-panel FolderTree uses the fixed key `'left-panel'`. Never share a single width across slots.

```jsx
function FileNameColumnHandle({ slotKey }) {
  const width = getSlotFileNameWidth(slotKey)
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize filename column"
      onMouseDown={event => beginFileNameColumnResize(event, slotKey)}
      onClick={event => { event.preventDefault(); event.stopPropagation() }}
      className="shrink-0 cursor-col-resize rounded opacity-0 transition-colors group-hover:opacity-100 hover:bg-[#7A5CFF]/60"
      style={{ width: 6, height: 18, backgroundColor: 'rgba(122, 92, 255, 0.16)', transform: `translateX(${Math.max(0, width - DEFAULT_FILE_NAME_COLUMN_WIDTH)}px)`, zIndex: 3 }}
    />
  )
}
```

Filename text should widen visually without pushing metadata. Give it its dragged width, use a negative right margin for the amount wider than the default layout slot, and make the filename background opaque so it masks metadata underneath. Add a flex spacer before right-side metadata so size/date fields stay pinned to the row's right edge:

```jsx
function getFileNameColumnTextStyle(extra = {}, width = DEFAULT_FILE_NAME_COLUMN_WIDTH) {
  const overlap = Math.max(0, width - DEFAULT_FILE_NAME_COLUMN_WIDTH)
  const maskBackground = extra.backgroundColor ?? S.panel.backgroundColor
  return {
    minWidth: 0,
    width: `${width}px`,
    flex: `0 0 ${width}px`,
    maxWidth: `${width}px`,
    marginRight: overlap ? `-${overlap}px` : 0,
    position: 'relative',
    zIndex: 2,
    backgroundColor: maskBackground,
    boxShadow: `8px 0 0 ${maskBackground}`,
    ...extra,
  }
}
```

Move the rail by the same overlap so it remains on the visible filename edge.

**Do NOT add `overflow-hidden` to draggable row containers** — it breaks HTML5 drag-and-drop in Electron. To clip right-side metadata when the panel is narrow, use `flexShrink: 2; min-w-0; overflow-hidden; whitespace-nowrap` on the individual size/date spans so they compress away while the fixed-width filename stays in place.

### Dense dashboard title selectors and context menus

For panel-local collections such as task lists and note sections, use a compact first-row selector instead of a visible tab strip. Creation controls can sit on the same row when space allows.

```jsx
<div className="shrink-0 flex gap-2">
  <select
    value={selectedId}
    onChange={event => selectItem(event.target.value)}
    onContextMenu={event => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu({ x: event.clientX, y: event.clientY, id: selectedId })
    }}
    onDoubleClick={handleRename}
    className="min-w-[120px] max-w-[180px] rounded border text-xs outline-none disabled:opacity-50"
    style={{ backgroundColor: '#26262C', borderColor: S.border, color: S.text, padding: '6px 8px' }}
  >
    {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
  </select>
  <input className="min-w-0 flex-1 rounded border text-xs outline-none disabled:opacity-50" />
</div>
```

Right-click menus should carry secondary title actions such as Export and destructive actions such as Delete. Do not add inline `x` buttons to tabs or title chips when a right-click menu already exists. Put neutral actions before destructive ones.

```jsx
<div className="fixed rounded border shadow-2xl z-[110] overflow-hidden" style={{ backgroundColor: '#1C1C20', borderColor: '#34343A' }}>
  <button className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm transition hover:bg-[#303038]" style={{ color: S.text }}>
    Export .txt
  </button>
  <button className="block w-full whitespace-nowrap text-left px-3 py-2 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#303038]" style={{ color: '#FF453A' }}>
    Delete
  </button>
</div>
```

Rows that represent files or folders should open on double-click. Avoid visible Open buttons in tree/file rows unless there is no row-level interaction available.

### Drag/drop move targets

When supporting file or folder moves, show the drop target in the same panel where the user is working. If the workflow is moving an item out of its current parent, include an explicit parent or `Move Here` row near the current listing instead of relying on a target in a different panel.

### Reorderable card / row drag animation

Use this pattern for draggable task rows, sidebar cards, and other reorderable stacked items. The drag should give three signals:

- the dragged item fades/lifts slightly
- the hovered target opens a small gap so neighbouring items move out of the way
- the moved item gets a short landing pulse after drop

Keep the dragged item key stable while hovering. Reorder the underlying array on `dragover` for live movement, then clear drag state on `drop` / `dragend`.

```jsx
function getReorderItemStyle(baseStyle, isDragging, isDropTarget, isLanded = false) {
  return {
    ...baseStyle,
    position: 'relative',
    marginTop: isDropTarget ? 10 : 0,
    marginBottom: isDropTarget ? 10 : 0,
    transition: 'margin 150ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, box-shadow 180ms ease, filter 180ms ease, border-color 180ms ease',
    transform: isLanded
      ? 'scale(1.018)'
      : isDragging
        ? 'translateY(-2px) scale(1.01)'
        : isDropTarget
          ? 'translateY(2px)'
          : 'scale(1)',
    opacity: isDragging ? 0.72 : 1,
    boxShadow: isDragging
      ? '0 0 0 1px rgba(122,92,255,0.55), 0 16px 34px rgba(0,0,0,0.38)'
      : isLanded
        ? '0 0 0 1px rgba(122,92,255,0.45), 0 8px 24px rgba(122,92,255,0.16)'
        : isDropTarget
          ? '0 0 0 1px rgba(122,92,255,0.35), 0 8px 24px rgba(122,92,255,0.10)'
          : 'none',
    filter: isDropTarget || isLanded ? 'brightness(1.06)' : 'none',
    willChange: 'transform, opacity, margin',
  }
}
```

Landing pulse duration should be short: `420ms` is the current DocketOS pattern.

## Spacing scale

| Use | Class |
|---|---|
| Tight inline gap | `gap-2` |
| Standard gap | `gap-3` |
| Section gap | `gap-4` |
| Panel padding | `p-4` |
| Row padding | `px-2 py-1.5` (compact) / `px-3 py-2` (standard) |

## Border radius

Always `rounded-app` (4px) for interactive controls. `rounded` (default 4px) for containers. Never arbitrary values.

## Disabled state

Always `disabled:opacity-50`. Never hide disabled controls — dim them.

## Transitions

Interactive elements that change colour: `transition-colors`. Never `transition-all` (causes layout jank).

For reorder animations, transition only the properties being animated: `margin`, `transform`, `opacity`, `box-shadow`, `filter`, and `border-color`.
