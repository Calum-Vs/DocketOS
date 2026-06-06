---
name: bulk-index-and-identity-sync-block-on-sharepoint
applies-to: electron/db.js, electron/fileWatcher.js, electron/main.js, src/views/Dashboard.jsx, project open, document indexing, quick links, performance
severity: high
discovered: 2026-06-06
---

## What happened

Opening a project stored on SharePoint froze the whole app ~3-4 s after selecting it. The delay was the cloud-backed scan finishing; the freeze itself was the work that ran *immediately after* the scan returned. Two separate culprits, both downstream of an otherwise-correct async scan:

1. **First-time bulk index blocked the main process.** `syncProjectDocumentsFromFiles` indexed every changed file in one synchronous `better-sqlite3` transaction. On a first open every file is "new", and `upsertDocumentFromFile` ran ~15-20 statements per file (document upsert, revision insert/update, FTS delete+insert, plus a nested transaction that eagerly created a default checklist per file). Tens of thousands of synchronous statements with zero yields = hard UI freeze.
2. **Quick-link identity sync spawned a rescan storm.** `syncQuickLinksWithFilesystem` (renderer) called `fs:findEntryByIdentity` *once per quick link*, concurrently, scheduled after every `kanban:update`. Each call does a full recursive walk of the SharePoint root statting every file to find one entry by `dev`/`ino`. SharePoint sync churn keeps the watcher firing, so N full-tree cloud walks repeated indefinitely.

## Why it happens

`better-sqlite3` is fully synchronous, so any unbounded per-file loop inside a transaction blocks Electron's main process — the async scan in front of it gives a false sense of safety. And SharePoint roots are cloud-backed: a single recursive walk is already expensive, so fanning out one walk per item (and re-triggering on watcher noise) multiplies a slow operation into an unresponsive one. Eager per-file work that *looks* cheap in isolation (one nested checklist transaction) becomes the dominant cost at thousands of files.

## What to do instead

- **Never index an unbounded file set in one synchronous transaction.** Batch the writes (e.g. 200 at a time) and `await new Promise(r => setImmediate(r))` between batches so the event loop breathes. Make the sync function `async` and `await` it at every caller.
- **Don't do eager per-file setup in the bulk index path.** Default checklists are created lazily by `getChecklistForDocument` when a document is actually opened — creating them up front for every file roughly doubled the SQL volume for no benefit.
- **Resolve many filesystem identities in ONE tree walk, not one walk per item.** Added `fs:findEntriesByIdentity` (batched, early-exits when all matched) to replace per-item `fs:findEntryByIdentity` calls.
- **Guard renderer-driven SharePoint scans with single-flight.** Watcher churn must not stack overlapping full-tree walks; bail if a sync is already running.
- **Drop dead IPC sends.** `watcher:update` had no renderer listener (only `kanban:update` is consumed) — it was serializing the full file list across the bridge on every scan for nothing.

## Related

- `electron/db.js` (`syncProjectDocumentsFromFiles`, `upsertDocumentFromFile`)
- `electron/fileWatcher.js` (`scanAndEmit`, `indexDocuments`)
- `electron/main.js` (`fs:findEntriesByIdentity`)
- `src/views/Dashboard.jsx` (`syncQuickLinksWithFilesystem`)
- [[sharepoint-filesystem-is-cloud-backed]]
