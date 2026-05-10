// Shared price-refresh logic used by both the IPC handler and the background scheduler.
// Extracted so the main process can call it directly without going through IPC.

import { prisma } from '../db'
import { fetchPrice, fetchExchangeRate } from './priceFetcher'

export interface RefreshResult {
  updated: number
  errors: string[]
  timestamp: Date
}

export async function savePriceSnapshot(investmentId: number, price: number, shares: number) {
  const value = price * shares
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  await prisma.priceHistory.upsert({
    where: { investmentId_recordedAt: { investmentId, recordedAt: today } },
    create: { investmentId, price, value, recordedAt: today },
    update: { price, value },
  })
}

export async function refreshAllPrices(): Promise<RefreshResult> {
  const investments = await prisma.investment.findMany({ where: { ticker: { not: null } } })
  const results = await Promise.allSettled(
    investments.map(async (inv) => {
      const result = await fetchPrice(inv.ticker!)
      // fetchExchangeRate throws on failure — use a cached rate if we have one,
      // otherwise re-throw so this investment is recorded as a failed update.
      let rate: number
      if (result.currency === 'EUR') {
        rate = 1
      } else {
        try {
          rate = await fetchExchangeRate(result.currency)
          await prisma.exchangeRate.upsert({
            where: { fromCurrency: result.currency },
            create: { fromCurrency: result.currency, rate },
            update: { rate },
          })
        } catch (rateErr) {
          const cached = await prisma.exchangeRate.findUnique({ where: { fromCurrency: result.currency } })
          if (cached) {
            rate = Number(cached.rate)
            console.warn(`Exchange rate fetch failed for ${result.currency}, using cached rate ${rate}`)
          } else {
            throw new Error(`No exchange rate available for ${result.currency}: ${(rateErr as Error).message}`)
          }
        }
      }
      const priceInEUR = result.price * rate
      if (inv.shares === null) {
        // No share count recorded — skip value update to avoid showing
        // a meaningless per-unit price as the portfolio value.
        throw new Error(`${inv.ticker}: shares not set — add a buy lot to track position size`)
      }
      const shares = Number(inv.shares)
      await prisma.investment.update({
        where: { id: inv.id },
        data: { currentValue: priceInEUR * shares, lastPriceFetched: priceInEUR, priceUpdatedAt: new Date() },
      })
      await savePriceSnapshot(inv.id, priceInEUR, shares)
      return { id: inv.id, ticker: inv.ticker, price: priceInEUR }
    })
  )
  return {
    updated: results.filter(r => r.status === 'fulfilled').length,
    errors: results.filter(r => r.status === 'rejected').map(r => (r as PromiseRejectedResult).reason?.message ?? 'Unknown error'),
    timestamp: new Date(),
  }
}

// ── Scheduler ──────────────────────────────────────────────────────────────────

export type RefreshInterval = 'never' | 'startup' | '1h' | '4h' | '8h' | '24h'

export const INTERVAL_MS: Record<RefreshInterval, number | null> = {
  never:   null,
  startup: null,   // runs once on startup, no timer
  '1h':    60 * 60 * 1000,
  '4h':    4 * 60 * 60 * 1000,
  '8h':    8 * 60 * 60 * 1000,
  '24h':   24 * 60 * 60 * 1000,
}

let _timer: ReturnType<typeof setInterval> | null = null
let _lastRefresh: Date | null = null
let _onComplete: ((result: RefreshResult) => void) | null = null

export function getLastRefresh() { return _lastRefresh }

export function onRefreshComplete(cb: (result: RefreshResult) => void) {
  _onComplete = cb
}

async function runRefresh() {
  try {
    const result = await refreshAllPrices()
    _lastRefresh = result.timestamp
    _onComplete?.(result)
  } catch {
    // Swallow — individual ticker errors are already captured inside refreshAllPrices
  }
}

export function startScheduler(interval: RefreshInterval) {
  // Clear any existing timer
  if (_timer) { clearInterval(_timer); _timer = null }

  // Always attempt a refresh on startup (unless 'never')
  if (interval !== 'never') {
    // Small delay so the DB connection is ready
    setTimeout(runRefresh, 5000)
  }

  // Set up the repeating timer
  const ms = INTERVAL_MS[interval]
  if (ms !== null) {
    _timer = setInterval(runRefresh, ms)
  }
}

export function stopScheduler() {
  if (_timer) { clearInterval(_timer); _timer = null }
}
