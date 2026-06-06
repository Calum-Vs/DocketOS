---
name: sharepoint-filesystem-is-cloud-backed
applies-to: electron/fileWatcher.js, electron/main.js, electron/db.js, src/views/Dashboard.jsx, filesystem IPC, project scanning, performance
severity: high
discovered: 2026-06-04
---

## What happened

DocketOS became progressively laggy while used against project folders stored in SharePoint/OneDrive. The problematic paths were not obvious UI code; they were repeated background filesystem scans, synchronous IPC reads, and full document re-indexing after noisy watcher events.

## Why it happens

SharePoint folders look like normal Windows paths, but reads can block while cloud-only files hydrate, Office temp files appear/disappear rapidly, and `fs.watch({ recursive: true })` can emit bursts. Synchronous `readdirSync`/`statSync` on those paths blocks Electron's main process, and overlapping recursive scans can pile up faster than SharePoint answers.

## What to do instead

- Treat project folders as cloud-backed even when they are local-looking Windows paths.
- Use async `fs.promises` reads with timeout wrappers for browsing, searching, folder listing, and watcher scans.
- Keep watcher scans single-flight: if a scan is running, queue one follow-up scan instead of starting another.
- Avoid full re-index work on every scan. Batch DB writes in a transaction and skip unchanged files using `relativePath + size + mtime`.
- Do not make the renderer rescan SharePoint paths after receiving a watcher payload; derive scoped views from the payload when possible.
- Ignore noisy Office/SharePoint temp entries such as `~$*`, `.tmp`, `.temp`, and download conflict files.
- Leave explicit user-triggered file operations separate from background paths, but be careful before adding new sync traversal there too.

## Related

- `electron/fileWatcher.js`
- `electron/main.js`
- `electron/db.js`
- `src/views/Dashboard.jsx`
- `docs/qa/2026-06-04-dashboard-workflow-updates.md`
- [[dashboard-direct-manipulation-ui]]
