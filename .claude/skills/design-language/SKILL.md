---
name: design-language
description: Use before changing any visual styling — colours, fonts, spacing feel, or the overall look of the app. Also use when the user asks to update the design system or theme.
---

# Design Language

Read `.claude/standards/design-language.md` before proceeding.

## When this skill applies

- Changing any colour token or adding a new colour
- Changing a font family or type scale
- The user says "I want to change the accent colour", "update the theme", "make it feel more X"
- Adding a new design token to `tailwind.config.js` or the `S` object

## Steps

1. **Update `design-language.md` first** — the doc is the source of truth. Change the value there, then propagate to code.

2. **Three places must stay in sync:**
   - `tailwind.config.js` — Tailwind tokens
   - `src/index.css` — body font, scrollbar colours, `.mono` class
   - `S` object in `src/views/Dashboard.jsx` — inline style tokens

3. **Changing accent colour** — update `accent` + `accent-hover` in `tailwind.config.js` AND `S.accent` in Dashboard.jsx.

4. **Changing fonts** — update `font-family` in `src/index.css` for body font and `.mono` class. Do not inline font families elsewhere.

5. **Do not add new colours outside the palette** — if a new semantic colour is needed (e.g. a new status colour), add it to `tailwind.config.js` and document it in `design-language.md` before using it anywhere.

6. **Run a build after changes** — Tailwind purges unused classes; a build confirms the tokens are referenced correctly.
