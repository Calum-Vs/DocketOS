# Panel Line-Work Redesign

**Date:** 2026-06-06

## Goal

Replace the heavy per-section box borders in the centre grid with a lightweight line-work system. The visual noise of six individual bordered boxes obscures the content; a shared frame + internal grid lines gives the same structural clarity at a fraction of the visual weight.

## What Changes

### Section containers (centre grid panels)

**Before:** Each panel is an independent `rounded border` box with its own background (`#0D0D0F`), border (`#34343A`), and header background (`#1C1C20`).

**After:** All panels share one outer `rounded border` frame. Internal panel edges are replaced by 1px dividers — `border-right` on non-last columns, `border-bottom` on non-last rows. The grid becomes a single visual unit with ruled sections rather than a stack of floating cards.

Header rows lose their panel background fill (transparent) and inner `border-b` colour is stepped down to `#2A2A30` (one stop dimmer than `#34343A`) so they recede further. Drag handles and control buttons (`Pop Out`, `Remove`) lose their `background: #26262C; border` treatment — just muted text, no capsule.

### Data items (tasks, files, timeline events, quick links, timesheet rows)

**No change.** These retain `background: #26262C; border: 1px solid #34343A; border-radius: 5px`. The contrast between frameless section areas and boxed data items is intentional — the items are what the user cares about; the section chrome should disappear.

## Affected Files

| File | What changes |
|---|---|
| `src/views/Dashboard.jsx` | Centre-panel grid wrapper class + per-slot box class + header div class |

The left and right side panels use a different layout structure and are **not** in scope for this change.

## Specific Class / Style Edits

### Grid wrapper
The wrapping `div` around all centre-panel slots currently adds gap between boxes. In the new approach it becomes a single bordered container with no gap:

```
// before: gap-2 (or similar), each child has its own border
// after:  outer border + border-radius, overflow-hidden, no gap
className="... border rounded overflow-hidden"
style={{ borderColor: S.border }}
```

### Per-slot box
```
// before: "min-w-0 min-h-[150px] rounded border flex flex-col ..."
//         style={S.deeper}  (has backgroundColor + borderColor)
// after:  "min-w-0 min-h-[150px] flex flex-col ..."
//         style={{ backgroundColor: S.deeper.backgroundColor }}
//         border-right and border-bottom applied via positional logic
```

Border logic: add `border-r` for columns 0 and 1 (not last), `border-b` for rows 0 (not last row). With a 3-column layout this means slots 0,1 get `border-r`; slots 0,1,2 get `border-b`. Both use `borderColor: S.border`.

### Per-slot header
```
// before: "p-3 border-b flex items-center gap-2"
//         style={{ ...S.panel, borderColor: S.border }}
// after:  "px-2.5 py-2 border-b flex items-center gap-2"
//         style={{ borderColor: '#2A2A30' }}
```

The drag-handle span and ctrl-btn elements drop their `backgroundColor: '#26262C'` and `border` inline styles; they become plain-text affordances styled with `color: S.dim` and a hover-only underline or colour shift.
