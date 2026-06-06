---
name: diverged-tree-commit-first-then-build-on-top
applies-to: long multi-task plans, working in a shared tree
severity: medium
discovered: 2026-05-28
---

## What happened

Mid-way through executing a 16-task implementation plan, the working tree appeared with thousands of lines of uncommitted changes that no subagent had produced — added by the user (or an external tool) between tasks. The affected files (`NoteCanvas.jsx`, `CanvasBox.jsx`, several `electron/*.js`) were exactly the ones the next plan task was about to rewrite. Stashing risked losing the work; treating it as the plan's output would have falsely claimed it; blindly editing on top would have buried it inside an unrelated commit.

## Why it happens

Long plans take time. The user is not paused while subagents run — they're also editing, running other tools, or another assistant is touching the same tree. The default assumption that "the tree is what I left it as" breaks the moment elapsed time exceeds the gap between user actions.

## What to do instead

When the tree diverges from the last commit you made and the diff isn't from any subagent you dispatched:

1. **Don't auto-commit the divergence as part of your work.** That misattributes authorship and makes future bisection lie.
2. **Surface it to the user immediately.** Show the file list, the magnitude (line counts), a sample of what changed, and ask how to handle it. Don't try to be clever about who wrote it.
3. **Default offer: commit theirs first, then build on top.** A separate `wip(...)` commit isolates their work from yours, lets the plan continue on a clean base, and survives any later need to revert one or the other.
4. **Re-read the affected files in full before continuing.** Your plan was written against the *old* shape of those files; the new shape may need surgical adaptation rather than the plan's drop-in rewrite.

After committing the divergence, the next task may need scoped edits instead of full replacements — apply the plan's intent, not its literal code.

## Related

- Surfaced when committing `216e055` (folder-tree mode + sanitizer + documents/intake IPC surface) mid-plan
- The next task (Task 9, edit mode) was adapted inline to the new file shape rather than dispatched fresh
