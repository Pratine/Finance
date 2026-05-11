import type { IpcMain } from 'electron'
import { loadAppSettings, saveAppSettings } from '../services/appSettings'
import { startScheduler, type RefreshInterval, refreshAllPrices, getLastRefresh } from '../services/priceScheduler'

export function registerSettingsHandlers(ipcMain: IpcMain) {
  // ── App settings ───────────────────────────────────────────────────────────
  ipcMain.handle('appSettings:load', () => loadAppSettings())

  ipcMain.handle('appSettings:save', async (_e, patch: Partial<{ priceRefreshInterval: RefreshInterval }>) => {
    const updated = await saveAppSettings(patch)
    if (patch.priceRefreshInterval !== undefined) {
      startScheduler(patch.priceRefreshInterval)
    }
    return updated
  })

  // ── Price refresh (whole-portfolio) ────────────────────────────────────────
  // Per-investment refresh (investments:refreshPrice) lives in investments.ts
  // because it touches investment hydration.
  ipcMain.handle('investments:refreshAll', async () => {
    const result = await refreshAllPrices()
    return { updated: result.updated, errors: result.errors }
  })

  ipcMain.handle('investments:lastRefresh', () => {
    const ts = getLastRefresh()
    return ts ? ts.toISOString() : null
  })
}
