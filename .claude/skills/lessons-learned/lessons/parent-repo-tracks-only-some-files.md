---
name: parent-repo-tracks-only-some-files
applies-to: git workflow, anything in DocketOS/
severity: low
discovered: 2026-05-28
---

## What happened

`git status` from inside `c:\Project\DocketOS` showed almost every source file as untracked (`??`) at session start. After committing, `git show --stat` reported huge whole-file insertions like `DocketOS/src/views/Dashboard.jsx | 842 insertions(+)` even though the file already existed on disk and had been edited only slightly.

## Why it happens

The git repository root is `c:/Project`, one level above `DocketOS`. The `DocketOS/` subdirectory was added to the parent repo only partially — a handful of files were tracked (db.js, main.js, preload.js, report.js, Dashboard.jsx), the rest were untracked. The first time a `git add` touched an untracked file, git recorded the entire current state as a brand-new file in the parent repo, producing a deceptively large diff for a small edit.

This is not broken — it's just an unusual layout. But it surprises naive expectations: `git status` reports relative to the cwd but operates against the parent repo, commit diffs come prefixed with `DocketOS/`, and small edits to previously-untracked files show as huge additions.

## What to do instead

- Don't panic when `git status` shows most of the tree as untracked. Run `git rev-parse --show-toplevel` to confirm where the repo root actually lives.
- When staging from inside `c:\Project\DocketOS`, use cwd-relative paths (`git add electron/db.js`) — git resolves them correctly even though the underlying record is `DocketOS/electron/db.js`.
- When a small edit produces a deceptively large `git show --stat`, check `git log -- <file>` — if there's only one prior commit and it was the implicit add, the "big diff" is the first-time tracking, not an actual change.
- Don't bulk-add the entire `DocketOS/` directory unprompted — the user has a reason for the partial tracking (likely to avoid checking in dist/ or node_modules/). Always ask before staging untracked source files in bulk.

If long-term clarity matters more than the current layout, the right fix is making `DocketOS/` its own git repo, but that's a conversation to have explicitly with the user — never act on it unilaterally.

## Related

- Session-start git status confirmed the unusual layout
- The two parent-repo Roamlee Vault entries (`../Roamlee Vault/...`) are unrelated to DocketOS and should not be staged in DocketOS commits
