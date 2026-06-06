# Design Language

This file defines the visual identity of DocketOS. When this file changes, the corresponding values in `tailwind.config.js`, `src/index.css`, and the `S` token object in `src/views/Dashboard.jsx` must be updated to match.

## Name

**Volta Dark System** — dense, precise, engineered. The aesthetic references professional CAD and engineering software: near-black surfaces, high-contrast type, a single electric accent.

## Colour palette

### Tailwind tokens (`tailwind.config.js`)

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#000000` | App background, deepest layer |
| `bg-surface` | `#1C1C20` | Panel backgrounds |
| `bg-elevated` | `#26262C` | Cards, inputs, rows |
| `bg-hover` | `#303038` | Hovered rows, selected controls, active neutral states |
| `border-subtle` | `#34343A` | All borders |
| `accent` | `#7A5CFF` | Primary actions, focus rings, active states |
| `accent-hover` | `#8F74FF` | Hover state for accent elements |
| `accent-soft` | `#B8AAFF` | Low-emphasis accent text and outlines on dark surfaces |
| `text-primary` | `#F5F5F7` | Body text, headings |
| `text-muted` | `#8E8E93` | Secondary labels, placeholders |
| `status-error` | `#FF453A` | Errors, destructive actions |
| `status-warn` | `#FF9F0A` | Warnings |
| `status-ok` | `#30D158` | Success, confirmed states |

### Inline `S` tokens (`src/views/Dashboard.jsx`)

Used where Tailwind utilities don't map cleanly (inline styles). Must stay in sync with the Tailwind palette above.

```js
const S = {
  panel:     { backgroundColor: '#1C1C20', borderColor: '#34343A' },
  elevated:  { backgroundColor: '#26262C', borderColor: '#34343A' },
  deeper:    { backgroundColor: '#0D0D0F', borderColor: '#34343A' },
  border:    '#34343A',
  hover:     '#303038',
  accent:    '#7A5CFF',
  accentSoft:'#B8AAFF',
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
| App title / active context | `type-app-title` |
| Panel title | `type-panel-title` |
| Section heading | `type-section-heading` |
| Field label | `type-field-label` |
| Body / input / row value | `type-value` or `text-sm` where more readability is needed |
| Caption / path / timestamp / metadata | `type-meta` |
| Small overline label | `type-overline` |
| Tiny badges / dense table labels | `type-tiny-label` |
| Button / command text | `type-command` |

No `text-base` or larger inside panels — the UI is dense by design. Prefer weight, color, and tokenized emphasis over larger type. Use `tracking-wider`/`tracking-widest` sparingly; dense panels should use the compact utility classes instead.

## Layout composition

DocketOS uses a fixed information-workspace region map: header, left work-context panel, center workspace, right action/assistant panel, and bottom canvas. New UI should live inside one of these regions unless the workflow genuinely needs a modal or popout.

Use an 8/4px rhythm adapted for dense desktop work:

| Use | Size |
|---|---|
| Tiny icon/text gap | 4px |
| Dense row vertical padding | 6px |
| Compact row/card gap | 8px |
| Side-panel section padding | 12px |
| Major workspace/modal padding | 16px |

Prefer implicit grouping before extra containers: typography, tight spacing, dividers, then background shifts. Use explicit bordered cards only for repeated rows, modals, and genuinely contained tools. Avoid card-inside-card layouts in side panels.

**Centre grid uses line work, not floating boxes.** The grid has one outer border frame; slots are separated by 1px right/bottom dividers only. Slot backgrounds are transparent. Data items inside slots (task cards, file rows, timeline events) retain their own `background: #26262C; border: 1px solid #34343A; border-radius: 4px` — the contrast between frameless slots and boxed data items is intentional. The `+ Add Box` control lives in the top banner, not above the grid.

Anchor controls consistently as containers scale: selectors and local context on the left, primary actions on the right, metadata pinned right, resize rails on the same edge, and secondary/destructive actions in context menus.

## Feel and tone

- **Dense** — maximum information per pixel. Generous whitespace is a bug, not a feature.
- **Precise** — 4px border radius throughout (`rounded-app`). Nothing organic or round.
- **Quiet** — one accent colour, used sparingly. Do not introduce secondary accent colours.
- **Engineered** — monospace labels for data, system-font for prose. The UI should feel like a tool, not a consumer app.

## What to change here when updating the design

To change the accent colour: update `accent` and `accent-hover` in `tailwind.config.js` AND `S.accent` in Dashboard.jsx.

To change fonts: update the `font-family` stacks in `src/index.css` (body and `.mono`).

To change background depth: update the `bg-*` tokens in `tailwind.config.js` AND the matching hex values in the `S` object and `index.css` body background.
