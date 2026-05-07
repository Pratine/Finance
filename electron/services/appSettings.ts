import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { RefreshInterval } from './priceScheduler'

export interface AppSettings {
  priceRefreshInterval: RefreshInterval
}

const DEFAULTS: AppSettings = {
  priceRefreshInterval: '4h',
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'app-settings.json')
}

export function loadAppSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveAppSettings(settings: Partial<AppSettings>): AppSettings {
  const current = loadAppSettings()
  const updated = { ...current, ...settings }
  fs.writeFileSync(settingsPath(), JSON.stringify(updated, null, 2))
  return updated
}
