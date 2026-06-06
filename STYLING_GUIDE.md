# DocketOS Styling Guide

This guide defines the visual and UI implementation standards for DocketOS.

## Design Direction

- Theme: Volta Dark System (high contrast, low glare, engineering dashboard feel).
- Visual style: dense, information-first, subtle elevation, minimal gradients.
- Interaction priority: clarity over ornament.

## Core Color Tokens

Use the existing style token object in `Dashboard.jsx` (`S`) and matching Tailwind theme tokens.

- `S.panel` / `bg-surface`: primary panel surfaces.
- `S.elevated` / `bg-elevated`: interactive cards and controls.
- `S.deeper`: deepest containers and nested surfaces.
- `S.border`: standard border and divider color.
- `S.hover` / `bg-hover`: hovered rows, selected neutral controls, active neutral states.
- `S.text`: primary text.
- `S.muted`, `S.zinc`, `S.dim`: secondary/de-emphasized text levels.
- `S.accent`: primary action/accent color.
- `S.accentSoft` / `accent-soft`: low-emphasis accent text and outlines.

### Status Colors

- Success: `#30D158`
- Warning: `#FF9F0A`
- Error: `#FF453A`

Do not introduce new one-off colors unless there is a strong UX reason.

## Typography

- Body text: compact and readable.
- Labels/metadata: mono, uppercase where appropriate.
- UI hierarchy:
  - App title / active context: `type-app-title`.
  - Panel titles: `type-panel-title`.
  - Section headings: `type-section-heading`.
  - Field labels: `type-field-label`.
  - Primary values/content: `type-value` or `text-sm` for denser readable content.
  - Paths/meta/timestamps: `type-meta`.
  - Small overlines: `type-overline`.
  - Tiny badges and dense table labels: `type-tiny-label`.
  - Buttons/commands: `type-command`.
- Prefer font weight and color emphasis over larger text. Avoid `text-base` inside dashboard panels.
- Avoid wide tracking in dense surfaces; use the type utilities instead of repeated `tracking-widest` labels.

## Spacing and Sizing

- Dense side-panel padding: `p-3`.
- Standard tool/body panel padding: `p-4` only when text/prose needs more breathing room.
- Tight internal grouping: `gap-1.5`, `gap-2`.
- Standard section spacing: `mb-2`, `mb-3`.
- Avoid `gap-4`, `p-5`, and `p-6` inside dashboard panels unless the surface is a modal or long-form prose.
- Corner radius: use existing Tailwind rounded scale (commonly `rounded`).
- Divider bars:
  - Section splitters: 8px height.
  - Side collapse separators: 20px width for usable hit area.

### Compact spacing rhythm

- 4px: icon/text gaps and tiny internal offsets.
- 6px: dense row vertical padding.
- 8px: row/card gaps and compact gutters.
- 12px: side-panel section padding.
- 16px: major workspace or modal padding.

## Layout Rules

- Use the fixed DocketOS region map: header, left work-context panel, center workspace, right action/assistant panel, and bottom canvas.
- Prefer flex and grid with `min-h-0` on scrollable children.
- Any resizable region should use explicit height/width state values.
- Avoid percentage height for split layouts unless parent has explicit computed height.
- Collapsible panels should preserve last known size and persist by project.
- Anchor panel selectors/actions in predictable positions: selectors left, primary actions right, metadata pinned right, secondary/destructive actions in context menus.
- Keep center boxes aligned to stable gutters and min heights; hover/selection must not change outer layout size.
- Constrain long prose/AI output to readable line lengths where practical instead of stretching full-width text across large panels.

## Component Styling Patterns

### Buttons

- Primary action:
  - Accent fill (`S.accent`), white text, clear disabled state.
- Secondary action:
  - Elevated/deeper surface + subtle border (`S.border`).
- Destructive action:
  - Error color and explicit confirmation path.

### Inputs and Selects

- Background: `#26262C` or token-equivalent elevated surface.
- Border: `S.border` for visible separation on grey surfaces.
- Text: `S.text`.
- Placeholder/help text: muted tokens.

### Panels and Cards

- Use panel/elevated/deeper token stack consistently.
- Keep visual depth changes subtle and intentional.
- Maintain consistent border tone across all cards.
- Prefer implicit grouping first: typography, tight spacing, then dividers. Use bordered cards for repeated rows, modals, and genuinely contained tools.
- Avoid unnecessary nested bordered containers inside already-bordered panels.

## Motion and Interaction

- Use short, subtle transitions (`transition`, `transition-colors`).
- Hover states should improve affordance, not shift layout.
- Resize handles and collapse controls must have clear cursor states and large enough hit areas.

## Accessibility and Usability

- Ensure text contrast remains strong against dark surfaces.
- Keep controls keyboard-usable where practical.
- Maintain visible focus behavior for interactive controls.
- Avoid tiny click targets for critical controls.

## Implementation Notes

- Reuse existing tokens first; add tokens before adding hardcoded values.
- Keep styles local to component intent; avoid broad ad hoc overrides.
- Preserve current visual language when adding features.

## Quick Do/Don't

Do:
- Reuse `S` tokens and Tailwind theme tokens.
- Keep panel structures and spacing consistent.
- Use mono metadata style for technical context (paths, timestamps, IDs).

Don't:
- Introduce bright, unrelated colors without design intent.
- Mix many different border or background tones in one view.
- Create tiny icon-only controls without sufficient hit area.

## PR Styling Checklist

Use this checklist before merging UI changes.

- Tokens: uses `S`/theme tokens first, with no unnecessary new hardcoded colors.
- Contrast: text and controls remain readable on dark surfaces.
- Spacing: follows existing spacing rhythm (`p-4`, `gap-2`, `mb-2/mb-3`) unless intentionally different.
- Components: button/input/panel styles match existing patterns.
- Interaction: hover/focus/disabled states are present and consistent.
- Resizing/collapse: handles are clear, hit areas are usable, and cursor states are correct.
- Layout safety: scrollable areas use `min-h-0`; no accidental clipping or overflow regressions.
- Consistency: no one-off border radius, border color, or typography drift.
