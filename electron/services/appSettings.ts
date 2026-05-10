import fs from 'fs'
import { writeFile } from 'fs/promises'
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

// In-memory cache — avoids repeated disk reads for a file that rarely changes.
let cache: AppSettings | null = null

export function loadAppSettings(): AppSettings {
  if (cache) return cache
  let settings: AppSettings
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    settings = { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    settings = { ...DEFAULTS }
  }
  cache = settings
  return settings
}

export function saveAppSettings(settings: Partial<AppSettings>): AppSettings {
  const updated = { ...loadAppSettings(), ...settings }
  fs.writeFileSync(settingsPath(), JSON.stringify(updated, null, 2))
  cache = updated
  return updated
}
