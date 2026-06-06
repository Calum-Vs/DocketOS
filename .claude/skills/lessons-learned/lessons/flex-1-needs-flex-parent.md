---
name: flex-1-needs-flex-parent
applies-to: src/views/Dashboard.jsx, src/components/NoteCanvas.jsx, any component that mounts NoteCanvas or other flex-1 root components
severity: high
discovered: 2026-06-06
---

## What happened

After tweaking the center panel of `Dashboard.jsx`, the NoteCanvas area rendered as a blank black region with nothing inside. No console errors, no IPC failures — the component mounted but had zero visible height. Wrapping the canvas in `<div className="flex-1 min-h-0">` was not enough.

## Why it happens

`NoteCanvas`'s outermost element uses `className="flex-1 min-h-0 relative overflow-hidden"`. `flex-1` only does anything inside a `display: flex` parent — in a plain block container it has no effect, the child collapses to `height: 0`, and the parent's own `min-h-0` makes that zero perfectly legal.

The same applies to any other internal component whose root relies on `flex-1` to size itself (FolderTree, several panel sections). If the immediate wrapper is a non-flex div, the child silently disappears.

## What to do instead

Always give a flex-1 child a flex column parent:

```jsx
<div className="flex-1 min-h-0 flex flex-col">
  <NoteCanvas ... />
</div>
```

When debugging a "component is mounted but invisible" black region in the dashboard, inspect the wrapper chain first — look for a `flex-1` child whose parent is a plain `<div>`. Add `flex flex-col` to the parent before touching anything else.

## Related

- `src/components/NoteCanvas.jsx` line ~969 (root element with `flex-1`)
- `src/views/Dashboard.jsx` canvas mount block
