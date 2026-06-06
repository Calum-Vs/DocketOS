---
name: ui-components
description: Use before building any new UI element — buttons, inputs, panels, modals, feedback text. Ensures new UI matches established patterns rather than inventing new ones.
---

# UI Components

Read `.claude/standards/ui-components.md` before writing any JSX.

## When this skill applies

- Adding a new button, input, select, or textarea
- Building a new panel, card, modal, or section
- Showing feedback text (success, error, info)
- Any time you would write a Tailwind className string for an interactive element

## Steps

1. **Look up the pattern first** — find the matching element type in `ui-components.md` and copy the className string exactly. Do not adapt, extend, or simplify.

2. **Do not invent new patterns** — if the element you need is not in the doc, use the closest existing pattern and add the new pattern to `ui-components.md` after confirming it with the user.

3. **Buttons**
   - Primary action → accent fill
   - Secondary / cancel → elevated surface
   - Destructive → error tone
   - Always `disabled:opacity-50`, never hidden

4. **Inputs** — always `bg-bg-elevated border border-border-subtle rounded-app ... focus:border-accent`. Never custom border colours on focus.

5. **Spacing** — use the spacing scale from the doc. Do not use arbitrary Tailwind values (`px-[13px]` etc.).

6. **Border radius** — `rounded-app` for controls, `rounded` for containers. Never `rounded-lg` or `rounded-xl`.

7. **Colour** — use Tailwind tokens or `S.*` values. Do not hardcode hex values outside the `S` object in Dashboard.jsx.
