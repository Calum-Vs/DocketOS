# File Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a file-name search bar to the Project Folders section that lets the user find files and reveal them in the folder tree.

**Architecture:** Three-layer change — IPC handler in the main process does the recursive FS walk, preload exposes it as `window.api.fsSearchFiles`, Dashboard renders the search input and results list, and FolderTree gains a `revealPath` prop so clicking a result auto-expands ancestor folders.

**Tech Stack:** Electron IPC, React (useState/useEffect/useRef), Node.js fs module

---

### Task 1: IPC handler + preload

**Files:**
- Modify: `electron/main.js` (add `fs:searchFiles` handler near other `fs:*` handlers around line 705)
- Modify: `electron/preload.js` (add `fsSearchFiles` entry near other `fs*` entries around line 32)

- [ ] **Step 1: Add the recursive walk helper and IPC handler to `electron/main.js`**

Add this block immediately after the `fs:listFolders` handler (around line 716):

```javascript
function walkFilesForSearch(dir, rootPath, query, results) {
  if (results.length >= 50) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (results.length >= 50) break
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFilesForSearch(fullPath, rootPath, query, results)
    } else if (entry.name.toLowerCase().includes(query.toLowerCase())) {
      results.push({
        name: entry.name,
        relativePath: path.relative(rootPath, fullPath),
        fullPath,
      })
    }
  }
}

ipcMain.handle('fs:searchFiles', (_e, { rootPath, query }) => {
  if (!rootPath || !query || !query.trim()) return []
  if (!isPathInsideActiveProject(rootPath) && rootPath !== activeProjectRoot) return []
  const results = []
  walkFilesForSearch(rootPath, rootPath, query.trim(), results)
  return results
})
```

- [ ] **Step 2: Expose it in `electron/preload.js`**

Add this line in the `api` object after `fsMoveFile`:

```javascript
fsSearchFiles:      (data) => ipcRenderer.invoke('fs:searchFiles', data),
```

- [ ] **Step 3: Build to verify no syntax errors**

```
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```
git add electron/main.js electron/preload.js
git commit -m "feat(search): add fs:searchFiles IPC handler"
```

---

### Task 2: FolderTree `revealPath` prop

**Files:**
- Modify: `src/components/FolderTree.jsx`

The `revealPath` prop tells FolderTree (and each FolderNode) to auto-expand any ancestor directory of the given path. When `revealPath` changes to a non-null value, any FolderNode whose `fullPath` is a strict ancestor of `revealPath` will open itself.

- [ ] **Step 1: Add `revealPath` to `FolderNode`'s props and auto-expand logic**

`FolderNode` starts at line 135. Change its signature and add a `useEffect` for reveal:

```javascript
function FolderNode({ node, depth, onRefresh, selectedPath, onSelectFolder, onAddQuickLink, onQuickFile, autoExpand = false, allowChildren = true, revealPath = null }) {
```

Add this `useEffect` after the existing `useEffect` blocks (after line ~162):

```javascript
  useEffect(() => {
    if (!revealPath || !allowChildren) return
    const isAncestor = revealPath.toLowerCase().startsWith(node.fullPath.toLowerCase() + '\\') ||
                       revealPath.toLowerCase().startsWith(node.fullPath.toLowerCase() + '/')
    if (isAncestor && !open) {
      if (children === null) loadChildren()
      setOpen(true)
    }
  }, [revealPath])
```

- [ ] **Step 2: Pass `revealPath` down when rendering child FolderNodes**

Find where FolderNode renders its children (the recursive `children.map(...)` call, around line 340–365). Add `revealPath={revealPath}` to each child:

```javascript
children.map(child => (
  <FolderNode
    key={child.fullPath}
    node={child}
    depth={depth + 1}
    onRefresh={onRefresh}
    selectedPath={selectedPath}
    onSelectFolder={onSelectFolder}
    onAddQuickLink={onAddQuickLink}
    onQuickFile={onQuickFile}
    autoExpand={isTechnicalFolderName(child.name)}
    allowChildren={true}
    revealPath={revealPath}
  />
))
```

- [ ] **Step 3: Accept and forward `revealPath` in the top-level `FolderTree` component**

`FolderTree` is at line 371. Change its signature to accept `revealPath` and pass it to each root `FolderNode`:

```javascript
export default function FolderTree({ rootPath, selectedPath, onSelectFolder, onAddQuickLink, onQuickFile, revealPath = null }) {
```

In the `rootFolders.map(...)` call, add `revealPath={revealPath}`:

```javascript
<FolderNode
  key={folder.fullPath}
  node={folder}
  depth={0}
  onRefresh={refresh}
  selectedPath={selectedPath}
  onSelectFolder={onSelectFolder}
  onAddQuickLink={onAddQuickLink}
  onQuickFile={onQuickFile}
  autoExpand={isTechnicalFolderName(folder.name)}
  allowChildren={true}
  revealPath={revealPath}
/>
```

- [ ] **Step 4: Build to verify no errors**

```
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```
git add src/components/FolderTree.jsx
git commit -m "feat(search): add revealPath prop to FolderTree"
```

---

### Task 3: Search UI in Dashboard

**Files:**
- Modify: `src/views/Dashboard.jsx`

This task adds three things: state, a debounced search effect, and the UI (search input + results list replacing the FolderTree when active).

- [ ] **Step 1: Add state near the other folder-related state (around line 877)**

```javascript
const [fileSearchQuery, setFileSearchQuery] = useState('')
const [fileSearchResults, setFileSearchResults] = useState([])
const [fileSearchLoading, setFileSearchLoading] = useState(false)
const [fileRevealPath, setFileRevealPath] = useState(null)
```

- [ ] **Step 2: Add the debounced search effect**

Add this `useEffect` near the other project-related effects (after the `hiddenExtensions` effect, around line 898):

```javascript
useEffect(() => {
  if (!fileSearchQuery.trim() || !activeProject?.root_path) {
    setFileSearchResults([])
    setFileSearchLoading(false)
    return
  }
  setFileSearchLoading(true)
  const timer = setTimeout(async () => {
    const results = await window.api.fsSearchFiles({
      rootPath: activeProject.root_path,
      query: fileSearchQuery.trim(),
    })
    setFileSearchResults(results)
    setFileSearchLoading(false)
  }, 300)
  return () => clearTimeout(timer)
}, [fileSearchQuery, activeProject?.root_path])
```

- [ ] **Step 3: Clear search state when active project changes**

Find the existing `useEffect` that resets folder state when `activeProject` changes (the one that calls `setSelectedTreeFolderPath(null)`). Add these lines inside it:

```javascript
setFileSearchQuery('')
setFileSearchResults([])
setFileRevealPath(null)
```

- [ ] **Step 4: Add the search input to the PROJECT FOLDERS section header**

The PROJECT FOLDERS section header `div` is around line 4193 in Dashboard.jsx. It currently contains the section title and drag handle. Add the search input inside this header div, after the title row:

```javascript
<div className="shrink-0 mt-2">
  <input
    type="text"
    value={fileSearchQuery}
    onChange={e => setFileSearchQuery(e.target.value)}
    placeholder="Search files…"
    disabled={!activeProject?.root_path}
    className="w-full rounded border text-xs outline-none disabled:opacity-40"
    style={{ backgroundColor: '#1A1A1E', borderColor: fileSearchQuery ? '#7A5CFF' : S.border, color: S.text, padding: '5px 8px' }}
  />
</div>
```

- [ ] **Step 5: Replace the FolderTree with the results list when a query is active**

Find the `<div className="flex-1 min-h-0 overflow-y-auto pb-2">` that wraps `<FolderTree .../>` (around line 4210). Replace its contents with a conditional:

```javascript
<div className="flex-1 min-h-0 overflow-y-auto pb-2">
  {fileSearchQuery.trim() ? (
    <div className="space-y-0.5 pr-1">
      {fileSearchLoading && (
        <p className="mono px-1 py-2 text-[10px]" style={{ color: S.dim }}>Searching…</p>
      )}
      {!fileSearchLoading && fileSearchResults.length === 0 && (
        <p className="mono px-1 py-2 text-[10px]" style={{ color: S.dim }}>No files found.</p>
      )}
      {fileSearchResults.map(result => (
        <button
          key={result.fullPath}
          onClick={() => {
            const parentPath = result.fullPath.substring(0, result.fullPath.lastIndexOf('\\')) ||
                               result.fullPath.substring(0, result.fullPath.lastIndexOf('/'))
            const parentName = parentPath.split('\\').pop() || parentPath.split('/').pop() || ''
            handleFolderSelect({ fullPath: parentPath, name: parentName })
            setFileRevealPath(result.fullPath)
            setFileSearchQuery('')
          }}
          className="w-full rounded border border-transparent px-2 py-1.5 text-left transition hover:border-[#7A5CFF] hover:bg-[#18181B]"
        >
          <p className="truncate text-xs font-medium" style={{ color: S.text }}>{result.name}</p>
          <p className="mono mt-0.5 truncate text-[10px]" style={{ color: S.zinc }}>{result.relativePath}</p>
        </button>
      ))}
    </div>
  ) : (
    <FolderTree
      rootPath={activeProject?.root_path ?? null}
      onSelectFolder={handleFolderSelect}
      selectedPath={selectedTreeFolderPath}
      onAddQuickLink={handleAddQuickLink}
      onQuickFile={handleSendEntryToQuickFiling}
      revealPath={fileRevealPath}
    />
  )}
</div>
```

- [ ] **Step 6: Build to verify no errors**

```
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 7: Smoke test**

Start `npm run dev`. With a project active:
1. Type a filename fragment in the search box — results appear within 300ms.
2. Click a result — folder tree replaces the results list, the file's parent folder is selected and highlighted, ancestor folders are expanded.
3. Clear the search input manually — folder tree returns normally.
4. With no project active — search input is greyed/disabled.

- [ ] **Step 8: Commit**

```
git add src/views/Dashboard.jsx
git commit -m "feat(search): add file search UI to Project Folders panel"
```
