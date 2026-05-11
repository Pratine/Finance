import type { IpcMain } from 'electron'
import { db } from '../db'
import {
  investmentSelect, investmentJoins, buildUpdate, hydrateInvestment,
  getInvestmentFull, nowIso, toIso, requireIso,
} from './shared'
import { calcInvestmentTotals } from '../services/lotCalcs'
// refreshPrice/lookupISIN handlers live in settings.ts (per refactor spec).

// ── Brokers ──────────────────────────────────────────────────────────────────
const stmtBrokersList  = db.prepare(`SELECT * FROM "Broker" ORDER BY name ASC`)
const stmtBrokerInsert = db.prepare(`INSERT INTO "Broker" (name, color, icon) VALUES (?, ?, ?)`)
const stmtBrokerById   = db.prepare(`SELECT * FROM "Broker" WHERE id = ?`)
const stmtBrokerDelete = db.prepare(`DELETE FROM "Broker" WHERE id = ?`)

// ── Investment types ─────────────────────────────────────────────────────────
const stmtInvTypesList  = db.prepare(`SELECT * FROM "InvestmentType" ORDER BY name ASC`)
const stmtInvTypeInsert = db.prepare(`INSERT INTO "InvestmentType" (name, color, icon) VALUES (?, ?, ?)`)
const stmtInvTypeById   = db.prepare(`SELECT * FROM "InvestmentType" WHERE id = ?`)
const stmtInvTypeDelete = db.prepare(`DELETE FROM "InvestmentType" WHERE id = ?`)

// ── Investment lots ──────────────────────────────────────────────────────────
const stmtLotsForInv = db.prepare(`SELECT * FROM "InvestmentLot" WHERE investmentId = ? ORDER BY date ASC`)
const stmtLotsRawForInv = db.prepare(`SELECT * FROM "InvestmentLot" WHERE investmentId = ?`)
const stmtInvSyncTotals = db.prepare(`UPDATE "Investment" SET shares = ?, amountIn = ?, updatedAt = ? WHERE id = ?`)
const stmtLotInsertBuy = db.prepare(`
  INSERT INTO "InvestmentLot" (investmentId, type, date, shares, pricePerShare, totalCost, notes)
  VALUES (?, 'BUY', ?, ?, ?, ?, ?)
`)
const stmtLotInsertSell = db.prepare(`
  INSERT INTO "InvestmentLot" (investmentId, type, date, shares, pricePerShare, totalCost, realizedGain, notes)
  VALUES (?, 'SELL', ?, ?, ?, ?, ?, ?)
`)
const stmtLotById     = db.prepare(`SELECT * FROM "InvestmentLot" WHERE id = ?`)
const stmtLotDelete   = db.prepare(`DELETE FROM "InvestmentLot" WHERE id = ?`)

function syncInvestmentTotals(investmentId: number) {
  const lots = stmtLotsRawForInv.all(investmentId)
  const { shares, amountIn } = calcInvestmentTotals(lots as any)
  stmtInvSyncTotals.run(shares, amountIn, nowIso(), investmentId)
}

// ── Investments ──────────────────────────────────────────────────────────────
const stmtInvList = db.prepare(
  `SELECT ${investmentSelect} FROM "Investment" i ${investmentJoins} ORDER BY i.createdAt ASC`,
)
const stmtInvInsert = db.prepare(`
  INSERT INTO "Investment" (name, typeId, brokerId, amountIn, currentValue, currency, isin, ticker, shares, lastPriceFetched, priceUpdatedAt, notes, createdAt, updatedAt)
  VALUES (@name, @typeId, @brokerId, @amountIn, @currentValue, @currency, @isin, @ticker, @shares, @lastPriceFetched, @priceUpdatedAt, @notes, @createdAt, @updatedAt)
`)
const stmtInvRaw      = db.prepare(`SELECT * FROM "Investment" WHERE id = ?`)
const stmtInvDelete   = db.prepare(`DELETE FROM "Investment" WHERE id = ?`)
const stmtPriceHistAll = db.prepare(`
  SELECT recordedAt, value FROM "PriceHistory"
  WHERE recordedAt >= ?
  ORDER BY recordedAt ASC
`)
const stmtPriceHistById = db.prepare(`
  SELECT recordedAt, price, value FROM "PriceHistory"
  WHERE investmentId = ? AND recordedAt >= ?
  ORDER BY recordedAt ASC
`)
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
const stmtRatesList = db.prepare(`SELECT * FROM "ExchangeRate" ORDER BY fromCurrency ASC`)

export function registerInvestmentsHandlers(ipcMain: IpcMain) {
  // Brokers
  ipcMain.handle('brokers:list', () => stmtBrokersList.all())
  ipcMain.handle('brokers:create', (_e, data: { name: string; color?: string | null; icon?: string | null }) => {
    const info = stmtBrokerInsert.run(data.name, data.color ?? null, data.icon ?? null)
    return stmtBrokerById.get(info.lastInsertRowid)
  })
  ipcMain.handle('brokers:update', (_e, id: number, data: { name?: string; color?: string | null; icon?: string | null }) => {
    const { sql, params } = buildUpdate(data)
    if (sql) db.prepare(`UPDATE "Broker" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return stmtBrokerById.get(id)
  })
  ipcMain.handle('brokers:delete', (_e, id: number) => {
    const row = stmtBrokerById.get(id)
    stmtBrokerDelete.run(id)
    return row
  })

  // Investment types
  ipcMain.handle('investmentTypes:list', () => stmtInvTypesList.all())
  ipcMain.handle('investmentTypes:create', (_e, data: { name: string; color?: string | null; icon?: string | null }) => {
    const info = stmtInvTypeInsert.run(data.name, data.color ?? null, data.icon ?? null)
    return stmtInvTypeById.get(info.lastInsertRowid)
  })
  ipcMain.handle('investmentTypes:update', (_e, id: number, data: { name?: string; color?: string | null; icon?: string | null }) => {
    const { sql, params } = buildUpdate(data)
    if (sql) db.prepare(`UPDATE "InvestmentType" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return stmtInvTypeById.get(id)
  })
  ipcMain.handle('investmentTypes:delete', (_e, id: number) => {
    const row = stmtInvTypeById.get(id)
    stmtInvTypeDelete.run(id)
    return row
  })

  // Lots
  ipcMain.handle('lots:list', (_e, investmentId: number) => stmtLotsForInv.all(investmentId))

  ipcMain.handle('lots:create', (_e, data: {
    investmentId: number; date: string; shares: number; pricePerShare: number; notes?: string | null
  }) => {
    const totalCost = Math.round(data.shares * data.pricePerShare * 100) / 100
    return db.transaction(() => {
      const info = stmtLotInsertBuy.run(
        data.investmentId, requireIso(data.date), data.shares, data.pricePerShare, totalCost, data.notes ?? null,
      )
      syncInvestmentTotals(data.investmentId)
      return stmtLotById.get(info.lastInsertRowid)
    })()
  })

  ipcMain.handle('lots:createSell', (_e, data: {
    investmentId: number; date: string; shares: number; pricePerShare: number; notes?: string | null
  }) => {
    return db.transaction(() => {
      const existing = stmtLotsRawForInv.all(data.investmentId) as any[]
      const buys  = existing.filter(l => l.type === 'BUY')
      const sells = existing.filter(l => l.type === 'SELL')
      const totalBuyShares  = buys.reduce((s, l) => s + Number(l.shares), 0)
      const totalSellShares = sells.reduce((s, l) => s + Number(l.shares), 0)
      const remainingShares = totalBuyShares - totalSellShares

      if (data.shares > remainingShares) {
        throw new Error(
          `Cannot sell ${data.shares} shares — only ${parseFloat(remainingShares.toFixed(6))} remaining`,
        )
      }

      const totalBuyCost    = buys.reduce((s, l) => s + Number(l.totalCost), 0)
      const avgCostPerShare = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0
      const proceeds        = Math.round(data.shares * data.pricePerShare * 100) / 100
      const costBasis       = Math.round(data.shares * avgCostPerShare * 100) / 100
      const realizedGain    = Math.round((proceeds - costBasis) * 100) / 100

      const info = stmtLotInsertSell.run(
        data.investmentId, requireIso(data.date), data.shares, data.pricePerShare,
        proceeds, realizedGain, data.notes ?? null,
      )
      syncInvestmentTotals(data.investmentId)
      return stmtLotById.get(info.lastInsertRowid)
    })()
  })

  ipcMain.handle('lots:delete', (_e, id: number) => {
    return db.transaction(() => {
      const lot = stmtLotById.get(id) as any
      if (!lot) throw new Error(`Lot ${id} not found`)
      stmtLotDelete.run(id)
      syncInvestmentTotals(lot.investmentId)
      return lot
    })()
  })

  // Investments
  ipcMain.handle('investments:list', () => {
    const rows = stmtInvList.all() as any[]
    return rows.map(hydrateInvestment)
  })

  ipcMain.handle('investments:create', (_e, data: any) => {
    const now = nowIso()
    const info = stmtInvInsert.run({
      name: data.name,
      typeId: data.typeId,
      brokerId: data.brokerId ?? null,
      amountIn: data.amountIn,
      currentValue: data.currentValue,
      currency: data.currency ?? 'EUR',
      isin: data.isin ?? null,
      ticker: data.ticker ?? null,
      shares: data.shares ?? null,
      lastPriceFetched: data.lastPriceFetched ?? null,
      priceUpdatedAt: toIso(data.priceUpdatedAt),
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    return getInvestmentFull(Number(info.lastInsertRowid))
  })

  ipcMain.handle('investments:update', (_e, id: number, data: any) => {
    const allowed = ['name','typeId','brokerId','amountIn','currentValue','currency','isin','ticker','shares','lastPriceFetched','priceUpdatedAt','notes']
    const fields: Record<string, unknown> = {}
    for (const k of allowed) {
      if (data[k] !== undefined) {
        fields[k] = (k === 'priceUpdatedAt') ? toIso(data[k]) : data[k]
      }
    }
    const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
    db.prepare(`UPDATE "Investment" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return getInvestmentFull(id)
  })

  ipcMain.handle('investments:priceHistory', () => {
    const since = new Date(); since.setUTCFullYear(since.getUTCFullYear() - 2)
    const rows = stmtPriceHistAll.all(since.toISOString()) as Array<{ recordedAt: string; value: number }>
    const byDate = new Map<string, number>()
    for (const h of rows) {
      const date = new Date(h.recordedAt).toISOString().slice(0, 10)
      byDate.set(date, (byDate.get(date) ?? 0) + Number(h.value))
    }
    return [...byDate.entries()].map(([date, value]) => ({ date, value }))
  })

  ipcMain.handle('investments:priceHistoryById', (_e, id: number) => {
    const since = new Date(); since.setUTCFullYear(since.getUTCFullYear() - 2)
    const rows = stmtPriceHistById.all(id, since.toISOString()) as Array<{ recordedAt: string; price: number; value: number }>
    return rows.map(h => ({
      date: new Date(h.recordedAt).toISOString().slice(0, 10),
      price: Number(h.price),
      value: Number(h.value),
    }))
  })

  ipcMain.handle('investments:delete', (_e, id: number) => {
    const row = stmtInvRaw.get(id)
    stmtInvDelete.run(id)
    return row
  })

  ipcMain.handle('exchangeRates:list', () => stmtRatesList.all())
}
