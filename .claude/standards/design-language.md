# Design Language

This file defines the visual identity of DocketOS. When this file changes, the corresponding values in `tailwind.config.js`, `src/index.css`, and the `S` token object in `src/views/Dashboard.jsx` must be updated to match.

## Name

**Volta Dark System** — dense, precise, engineered. The aesthetic references professional CAD and engineering software: near-black surfaces, high-contrast type, a single electric accent.

## Colour palette

### Tailwind tokens (`tailwind.config.js`)

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#080809` | App background, deepest layer |
| `bg-surface` | `#121214` | Panel backgrounds |
| `bg-elevated` | `#1A1A1E` | Cards, inputs, rows |
| `border-subtle` | `#1F1F23` | All borders |
| `accent` | `#7A5CFF` | Primary actions, focus rings, active states |
| `accent-hover` | `#8F74FF` | Hover state for accent elements |
| `text-primary` | `#F5F5F7` | Body text, headings |
| `text-muted` | `#8E8E93` | Secondary labels, placeholders |
| `status-error` | `#FF453A` | Errors, destructive actions |
| `status-warn` | `#FF9F0A` | Warnings |
| `status-ok` | `#30D158` | Success, confirmed states |

### Inline `S` tokens (`src/views/Dashboard.jsx`)

Used where Tailwind utilities don't map cleanly (inline styles). Must stay in sync with the Tailwind palette above.

```js
const S = {
  panel:     { backgroundColor: '#121214', borderColor: '#1F1F23' },
  elevated:  { backgroundColor: '#1A1A1E', borderColor: '#1F1F23' },
  deeper:    { backgroundColor: '#0D0D0F', borderColor: '#1F1F23' },
  border:    '#1F1F23',
  accent:    '#7A5CFF',
  muted:     '#8E8E93',
  dim:       '#3F3F46',
  zinc:      '#52525B',
  text:      '#F5F5F7',
  labeltext: '#A1A1AA',
}
```

### Scrollbar

```css
scrollbar-color: #2A2A30 #0D0D0F;   /* thumb / track */
scrollbar-thumb-hover: #3A3A42;
```

## Typography

### Body font

```css
font-family: 'Segoe UI', 'Segoe UI Variable', -apple-system, BlinkMacSystemFont, sans-serif;
```

Windows-native sans-serif stack. Clear, system-integrated, no web font load.

### Mono font (`.mono` class)

```css
font-family: 'Cascadia Mono', 'Cascadia Code', Consolas, 'Courier New', monospace;
```

Used for: section labels, status codes, file paths, metadata, keyboard shortcuts. Applied via the `.mono` CSS class — do not inline monospace font styles.

### Type scale

| Role | Classes |
|---|---|
| Section label (caps) | `mono text-xs uppercase tracking-widest` |
| Body / input | `text-sm` |
| Caption / meta | `text-xs` |
| Section heading | `text-xs font-semibold uppercase tracking-wider` |

No `text-base` or larger inside panels — the UI is dense by design.

## Feel and tone

- **Dense** — maximum information per pixel. Generous whitespace is a bug, not a feature.
- **Precise** — 4px border radius throughout (`rounded-app`). Nothing organic or round.
- **Quiet** — one accent colour, used sparingly. Do not introduce secondary accent colours.
- **Engineered** — monospace labels for data, system-font for prose. The UI should feel like a tool, not a consumer app.

## What to change here when updating the design

To change the accent colour: update `accent` and `accent-hover` in `tailwind.config.js` AND `S.accent` in Dashboard.jsx.

To change fonts: update the `font-family` stacks in `src/index.css` (body and `.mono`).

To change background depth: update the `bg-*` tokens in `tailwind.config.js` AND the matching hex values in the `S` object and `index.css` body background.
