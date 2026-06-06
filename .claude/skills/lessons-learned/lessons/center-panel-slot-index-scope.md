---
name: center-panel-slot-index-scope
applies-to: src/views/Dashboard.jsx, centre panel rendering, FolderTree, left panel
severity: medium
discovered: 2026-06-06
---

## What happened

When adding per-slot state (e.g. `fileNameColumnWidthBySlot` keyed by `String(slotIndex)`), the `FolderTree` component rendered in the **left panel folder section** also received a `slotIndex` reference — but it is rendered outside the `centerPanelRenderItems.map()` loop, so `slotIndex` is undefined there and React throws a runtime error.

## Why it happens

The `centerPanelRenderItems.map(({ key, slotIndex, renderIndex }) => { ... })` loop is the only place where `slotIndex` exists as a variable. Code that looks like it's inside that loop (because of similar indentation or context) may actually be in a sibling branch of the render tree (e.g. the left panel or a top-level conditional).

## What to do instead

- Any component rendered **inside** the centre panel map → pass `String(slotIndex)` as the slot key.
- Any component rendered **outside** the centre panel map (left panel FolderTree, header, popout window) → use a fixed string key such as `'left-panel'` or `'popout'`.
- Before adding `slotIndex` references to a component prop, check whether that component is always inside the map by tracing the JSX tree upward to its nearest ancestor conditional.

```jsx
// Inside centre panel map — correct
nameColumnWidth={getSlotFileNameWidth(String(slotIndex))}
onBeginNameColumnResize={event => beginFileNameColumnResize(event, String(slotIndex))}

// Left panel FolderTree — correct
nameColumnWidth={getSlotFileNameWidth('left-panel')}
onBeginNameColumnResize={event => beginFileNameColumnResize(event, 'left-panel')}
```

## Related

- `src/views/Dashboard.jsx` — `FileNameColumnHandle`, `getSlotFileNameWidth`, `beginFileNameColumnResize`
- `src/components/FolderTree.jsx`
