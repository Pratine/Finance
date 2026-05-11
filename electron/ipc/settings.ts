import type { IpcMain } from 'electron'
import { db } from '../db'
import { getInvestmentFull, nowIso } from './shared'
import { loadAppSettings, saveAppSettings } from '../services/appSettings'
import {
  startScheduler, refreshAllPrices, getLastRefresh,
  type RefreshInterval,
} from '../services/priceScheduler'
import { fetchPrice, fetchExchangeRate } from '../services/priceFetcher'
import { lookupISIN } from '../services/isinLookup'

const stmtInvRaw = db.prepare(`SELECT * FROM "Investment" WHERE id = ?`)
const stmtRateGet = db.prepare(`SELECT rate FROM "ExchangeRate" WHERE fromCurrency = ?`)
const stmtRateUpsert = db.prepare(`
  INSERT INTO "ExchangeRate" (fromCurrency, rate, updatedAt) VALUES (?, ?, ?)
  ON CONFLICT(fromCurrency) DO UPDATE SET rate = excluded.rate, updatedAt = excluded.updatedAt
`)
const stmtPriceHistUpsert = db.prepare(`
  INSERT INTO "PriceHistory" (investmentId, price, value, recordedAt)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(investmentId, recordedAt) DO UPDATE SET price = excluded.price, value = excluded.value
`)
const stmtInvSyncPrice = db.prepare(`
  UPDATE "Investment"
  SET currentValue = ?, lastPriceFetched = ?, priceUpdatedAt = ?, updatedAt = ?
  WHERE id = ?
`)

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

  // ── Price refresh ──────────────────────────────────────────────────────────
  ipcMain.handle('investments:refreshAll', async () => {
    const result = await refreshAllPrices()
    return { updated: result.updated, errors: result.errors }
  })

  ipcMain.handle('investments:lastRefresh', () => {
    const ts = getLastRefresh()
    return ts ? ts.toISOString() : null
  })

  ipcMain.handle('investments:lookupISIN', async (_e, isin: string) => lookupISIN(isin))

  ipcMain.handle('investments:refreshPrice', async (_e, id: number) => {
    const inv = stmtInvRaw.get(id) as any
    if (!inv) throw new Error(`Investment ${id} not found`)
    if (!inv.ticker) throw new Error('No ticker symbol set for this investment')
    if (inv.shares === null) {
      throw new Error(`${inv.ticker}: shares not set — add a buy lot before refreshing the price`)
    }
    const result = await fetchPrice(inv.ticker)

    let rate: number
    if (result.currency === 'EUR') {
      rate = 1
    } else {
      try {
        rate = await fetchExchangeRate(result.currency)
      } catch (rateErr) {
        const cached = stmtRateGet.get(result.currency) as { rate: number } | undefined
        if (cached) rate = Number(cached.rate)
        else throw new Error(`Cannot convert ${result.currency} to EUR: ${(rateErr as Error).message}`)
      }
    }

    const priceInEUR = result.price * rate
    const shares = Number(inv.shares)
    const newValue = priceInEUR * shares
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    const todayIso = today.toISOString()
    const now = nowIso()

    db.transaction(() => {
      if (result.currency !== 'EUR') {
        stmtRateUpsert.run(result.currency, rate, now)
      }
      stmtPriceHistUpsert.run(id, priceInEUR, newValue, todayIso)
      stmtInvSyncPrice.run(newValue, priceInEUR, now, now, id)
    })()

    return getInvestmentFull(id)
  })
}
