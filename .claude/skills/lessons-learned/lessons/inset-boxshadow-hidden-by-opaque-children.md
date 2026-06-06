---
name: inset-boxshadow-hidden-by-opaque-children
applies-to: src/views/Dashboard.jsx, any container whose children have their own opaque backgrounds
severity: medium
discovered: 2026-06-06
---

## What happened

Tried to draw a single continuous frame around the center panel of `Dashboard.jsx` (kanban + canvas) using `boxShadow: 'inset 0 0 0 1px <color>'` on the `<main>` element. The frame appeared above the kanban grid but vanished where the NoteCanvas sat, leaving visible breaks at the canvas edges. Iterating on the colour or adding inner borders only made it worse.

## Why it happens

`box-shadow: inset` paints inside the element's padding box, *behind* its children. Any child with its own opaque `background-color` (NoteCanvas uses `#050506` plus a dotted background-image) paints right on top of the inset shadow along the child's edges. The shadow is still there, the child just hides it.

The center divider had the same symptom in reverse — its black background and explicit `borderTop`/`borderBottom` competed with the parent's inset shadow, producing a double line at one spot and nothing at another.

## What to do instead

For a continuous outline around a container that has opaque-backed children:

- Use a real `border: 1px solid …` on the container (with `overflow-hidden` if children might bleed past the rounded corners), not an inset box-shadow.
- If the design wants the outline on *each* child instead of the whole container, give every child its own border on all four sides — partial per-edge borders (`borderRight`/`borderBottom` only) leave the rightmost/bottommost edges of the grid undrawn.
- Reach for inset box-shadow only when children are guaranteed to be transparent at the edges (rare in this app's dark theme).

## Related

- `src/views/Dashboard.jsx` center `<main>` and kanban box border rules
- `src/components/NoteCanvas.jsx` (opaque dark background-image)
