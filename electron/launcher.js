import { spawn } from 'child_process'
import fs from 'fs'
import { getSetting } from './db.js'

const DEFAULT_LAUNCHER_REGISTRY = [
  { id: 'autocad', label: 'AutoCAD', pathKey: 'launcher_autocad' },
  { id: '12d', label: '12D Model', pathKey: 'launcher_12d' },
  { id: 'excel', label: 'Excel', pathKey: 'launcher_excel' },
  { id: 'word', label: 'Word', pathKey: 'launcher_word' },
]

function getLauncherRegistry() {
  try {
    const parsed = JSON.parse(getSetting('launcher_registry') ?? 'null')
    if (!Array.isArray(parsed)) return DEFAULT_LAUNCHER_REGISTRY
    const normalized = parsed
      .map(app => ({
        id: String(app?.id ?? '').trim(),
        label: String(app?.label ?? '').trim(),
        pathKey: String(app?.pathKey ?? '').trim(),
      }))
      .filter(app => app.id && app.label && /^launcher_[a-z0-9_-]+$/.test(app.pathKey))
    return normalized.length ? normalized : DEFAULT_LAUNCHER_REGISTRY
  } catch {
    return DEFAULT_LAUNCHER_REGISTRY
  }
}

export function setupLauncherHandlers(ipcMain) {
  ipcMain.handle('launcher:open', (_e, { appKey }) => {
    const app = getLauncherRegistry().find(item => item.id === appKey)
    if (!app) {
      return { success: false, error: `Unknown app key: ${appKey}` }
    }

    const exePath = getSetting(app.pathKey)

    if (!exePath) {
      return { success: false, error: `No path configured for ${app.label}. Update it in Backend Settings.` }
    }

    if (!fs.existsSync(exePath)) {
      return { success: false, error: `Path not found: ${exePath}. Update it in Backend Settings.` }
    }

    const child = spawn(exePath, [], { detached: true, stdio: 'ignore' })
    child.unref()

    return { success: true }
  })
}
