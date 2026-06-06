---
name: overflow-hidden-breaks-drag-use-flex-shrink
applies-to: src/views/Dashboard.jsx, renderFolderEntries, any draggable row with metadata
severity: high
discovered: 2026-06-06
---

## What happened

Adding `overflow-hidden` to draggable row containers (the divs with `draggable` and `onDragStart`) silently broke HTML5 drag-and-drop in Electron/Chromium. The drag no longer initiated from those rows.

## Why it happens

`overflow: hidden` on a draggable container changes how Chromium computes the drag hit region and interacts with the stacking context created by positioned children (the filename span has `position: relative; zIndex: 2`). The result is that drag events stop firing reliably.

## What to do instead

To clip metadata (date, file size) when a panel is too narrow, apply `flexShrink` and `overflow: hidden` to the **individual metadata spans**, not the row container:

```jsx
<span
  className="mono text-[10px] min-w-0 overflow-hidden whitespace-nowrap"
  style={{ color: S.zinc, flexShrink: 2 }}
>
  {formatLastEditedDate(entry.mtime)}
</span>
```

With `flexShrink: 2` and `min-w-0`, the span compresses to nothing when the panel is narrow, while the fixed-width filename column stays put. The row container needs no `overflow-hidden`.

## Related

- `renderFolderEntries` in `src/views/Dashboard.jsx`
- `.claude/standards/ui-components.md` — File/tree filename column resize rail section
