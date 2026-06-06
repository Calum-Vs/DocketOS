---
name: lessons-learned
description: Captures and surfaces project-specific lessons learned in DocketOS so past mistakes don't repeat across sessions. Use this skill (a) BEFORE starting any non-trivial change — read relevant lessons under .claude/skills/lessons-learned/lessons/ first; (b) WHEN the user says "we learned", "lesson:", "remember this:", "don't do X again", "/lesson", "/lessons", "save this insight", "note for next time"; (c) AFTER discovering a non-obvious gotcha through trial and error so the next session benefits. Strongly preferred over inline memory because lessons survive across conversations and live with the code.
---

# Project Lessons Learned

Lessons live under `.claude/skills/lessons-learned/lessons/` as one markdown file per lesson. Each captures a non-obvious gotcha specific to this codebase — the kind of thing you only learn by hitting it once.

This skill teaches two flows: **reading** existing lessons before acting (the more important direction), and **recording** new ones when the user surfaces something worth keeping.

## When to read lessons

Before any of these, read every file in `lessons/`:

- Modifying `electron/db.js` schema → consult any lessons about migrations, schema patterns, data loss.
- Building on top of someone else's uncommitted changes → consult lessons about working with a diverged tree.
- Adding IPC, touching the main/preload/renderer boundary → consult lessons about the trio pattern.
- Anything that touches `dangerouslySetInnerHTML`, contentEditable, or auto-fixed security warnings → consult lessons about the documented XSS surface.
- Long multi-task implementation plans → consult lessons about pacing, dispatching subagents, working on `main`.

Reading is cheap. Each lesson is short. The cost of *not* reading is repeating a mistake that already cost time once.

How to consume: read the frontmatter (`name`, `applies-to`, `severity`) to filter for relevance, then the body for the explanation and the action. If a lesson contradicts what you were about to do, pause and reconsider before proceeding.

## When to record a new lesson

Record when you (or the user) discover something that:

- Wasn't obvious from reading the code.
- Would have prevented a real problem in this session if known in advance.
- Generalises to future sessions (not just "this one file has X" — that's a code comment).
- Isn't already documented in `CLAUDE.md`, the existing skills, or a clearly-named source file.

User triggers: "remember this", "save this", "lesson:", "we just learned", "don't do X again", "make a note for next time". When the user says any of these, treat it as a request to write a new lesson file.

You can also proactively suggest recording a lesson when you notice you just wasted a turn on something that's likely to bite the next session. Phrase it as: "Worth recording as a lesson?"

## How to record

One file per lesson. Pick a kebab-case filename that names the gotcha — e.g., `unguarded-drop-table-wipes-data.md`, `vite-rollup-needs-real-exports.md`. Use this frontmatter:

```markdown
---
name: short-kebab-case-slug
applies-to: <comma-separated tags — file paths, subsystems, or workflow phases>
severity: low | medium | high
discovered: YYYY-MM-DD
---

## What happened

One short paragraph: the symptom, what was being attempted.

## Why it happens

The underlying mechanism — the part you didn't know.

## What to do instead

Concrete recipe. Show the corrected pattern as code if applicable. Link related skills with `[[skill-name]]`.

## Related

- Optional pointers to other lessons, skills, files, or commits.
```

Keep each lesson under ~50 lines. If it's longer, it's probably documentation, not a lesson — put it in a regular doc.

## Curation

Lessons rot. Once a quarter, or whenever you read a lesson and realise it no longer applies (the underlying code changed, the tool was replaced, the convention was abandoned), update or delete the file. A wrong lesson is worse than no lesson because it gets blindly followed.

If you find two lessons that say overlapping things, merge them. Cross-link with `[[other-lesson-slug]]` where they relate.

## Anti-patterns

- Don't record one-off project facts ("this project uses React 18"). That's `CLAUDE.md` territory.
- Don't record code patterns that are obvious from reading the code itself.
- Don't record a lesson after every minor mistake — only when the mistake would plausibly repeat without the lesson.
- Don't write lessons in second person dressed up as commandments ("YOU MUST ALWAYS"). Explain the mechanism and let the reader infer the action.

## Quick recipe

When the user says "save this as a lesson" or you decide to proactively record one:

1. Pick a slug.
2. Write `lessons/<slug>.md` with the frontmatter and the four sections above.
3. Tell the user the filename and quote the one-sentence summary back so they can confirm it captured the right thing.
4. Don't commit it automatically unless they asked — but tell them the file is staged in their working tree.
