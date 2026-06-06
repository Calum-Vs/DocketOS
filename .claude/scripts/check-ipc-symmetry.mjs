#!/usr/bin/env node
// IPC symmetry checker for DocketOS.
//
// Invoked as a PostToolUse hook on Edit|Write. Reads the tool input from stdin,
// bails silently if the edited file isn't one of the three IPC files, otherwise
// scans every top-level electron/*.js for `ipcMain.handle('channel', ...)` calls
// (so handlers registered indirectly via setupLauncherHandlers(ipcMain) and the
// like are seen), reads preload.js for `ipcRenderer.invoke('channel', ...)`
// bindings, and reports any channel that exists on one side but not the other.

import { readFileSync, readdirSync } from 'node:fs'
import { resolve, sep, join } from 'node:path'

const WATCH = ['electron/db.js', 'electron/main.js', 'electron/preload.js']
const ROOT = process.cwd()

const stdin = await readStdin()
let payload
try { payload = JSON.parse(stdin || '{}') } catch { payload = {} }

const editedPath = payload?.tool_input?.file_path ?? ''
const editedRel = relativeToRoot(editedPath)
if (!WATCH.some(w => editedRel.replaceAll('\\', '/').endsWith(w))) {
  process.exit(0)
}

const preloadSrc = safeRead(resolve(ROOT, 'electron/preload.js'))
if (preloadSrc === null) {
  process.exit(0)
}

// Scan every top-level .js in electron/ for ipcMain.handle calls. The preload
// is excluded — it's the renderer-facing surface, not a handler registrar.
const electronDir = resolve(ROOT, 'electron')
const mainChannels = new Set()
let scannedAny = false
try {
  for (const name of readdirSync(electronDir)) {
    if (!name.endsWith('.js') || name === 'preload.js') continue
    const src = safeRead(join(electronDir, name))
    if (src === null) continue
    scannedAny = true
    for (const ch of collect(src, /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g)) {
      mainChannels.add(ch)
    }
  }
} catch {
  // electron/ missing — nothing to check.
  process.exit(0)
}
if (!scannedAny) process.exit(0)

const preloadChannels = collect(preloadSrc, /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g)

const inMainOnly = [...mainChannels].filter(c => !preloadChannels.has(c)).sort()
const inPreloadOnly = [...preloadChannels].filter(c => !mainChannels.has(c)).sort()

if (inMainOnly.length === 0 && inPreloadOnly.length === 0) {
  // Symmetric. Stay silent so the hook doesn't add noise on every edit.
  process.exit(0)
}

const lines = ['[ipc-symmetry] mismatch between electron/* handlers and preload.js bindings:']
if (inMainOnly.length) {
  lines.push('  Handled by some electron/*.js but no renderer binding (renderer cannot reach these):')
  for (const c of inMainOnly) lines.push(`    - ${c}`)
}
if (inPreloadOnly.length) {
  lines.push('  Invoked from preload but no main handler (renderer call will reject):')
  for (const c of inPreloadOnly) lines.push(`    - ${c}`)
}
lines.push('  Add the missing side or remove the orphan. See .claude/skills/add-ipc/SKILL.md.')

// Write to stderr so Claude Code surfaces it as a hook diagnostic.
process.stderr.write(lines.join('\n') + '\n')
process.exit(2) // non-blocking notification (non-zero is shown but not fatal)

function readStdin() {
  return new Promise(res => {
    let buf = ''
    process.stdin.on('data', chunk => { buf += chunk })
    process.stdin.on('end', () => res(buf))
    // Guard against the hook being invoked without piped input.
    setTimeout(() => res(buf), 200)
  })
}

function safeRead(p) {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

function relativeToRoot(absPath) {
  if (!absPath) return ''
  const norm = absPath.replaceAll('/', sep)
  const root = ROOT.replaceAll('/', sep)
  return norm.startsWith(root) ? norm.slice(root.length + 1) : norm
}

function collect(src, re) {
  const out = new Set()
  let m
  while ((m = re.exec(src)) !== null) out.add(m[1])
  return out
}
