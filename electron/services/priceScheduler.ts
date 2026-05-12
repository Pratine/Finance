// Shared price-refresh logic used by both the IPC handler and the background scheduler.
// Extracted so the main process can call it directly without going through IPC.

import { db } from '../db'
import { fetchPrice, fetchExchangeRate } from './priceFetcher'

export interface RefreshResult {
  updated: number
  errors: string[]
  timestamp: Date
}

// Lazy-init so module-load order doesn't matter (db is a Proxy that opens
// the underlying connection on first access). Columns referenced here have
// always existed, so a single prepared statement is safe to reuse.
let _stmtSavePriceSnapshot: import('better-sqlite3').Statement | null = null
let _stmtUpsertRate: import('better-sqlite3').Statement | null = null
let _stmtGetCachedRate: import('better-sqlite3').Statement | null = null
let _stmtUpdateInvestment: import('better-sqlite3').Statement | null = null

function stmtUpsertRate(): import('better-sqlite3').Statement {
  return _stmtUpsertRate ??= db.prepare(`
    INSERT INTO "ExchangeRate" (fromCurrency, rate, updatedAt)
    VALUES (@fromCurrency, @rate, @updatedAt)
    ON CONFLICT(fromCurrency) DO UPDATE SET rate = excluded.rate, updatedAt = excluded.updatedAt
  `)
}
function stmtGetCachedRate(): import('better-sqlite3').Statement {
  return _stmtGetCachedRate ??= db.prepare(`SELECT rate FROM "ExchangeRate" WHERE fromCurrency = ?`)
}
function stmtUpdateInvestment(): import('better-sqlite3').Statement {
  return _stmtUpdateInvestment ??= db.prepare(`
    UPDATE "Investment"
    SET currentValue = @currentValue, lastPriceFetched = @lastPriceFetched, priceUpdatedAt = @priceUpdatedAt, updatedAt = @updatedAt
    WHERE id = @id
  `)
}

export function savePriceSnapshot(investmentId: number, price: number, shares: number) {
  const value = price * shares
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const recordedAt = today.toISOString()
  _stmtSavePriceSnapshot ??= db.prepare(`
    INSERT INTO "PriceHistory" (investmentId, price, value, recordedAt)
    VALUES (@investmentId, @price, @value, @recordedAt)
    ON CONFLICT(investmentId, recordedAt) DO UPDATE SET price = excluded.price, value = excluded.value
  `)
  _stmtSavePriceSnapshot.run({ investmentId, price, value, recordedAt })
}

// Processes tasks in sequential fixed-size batches, with at most `limit` running
// in parallel within each batch. This is NOT a true sliding-window pool — the next
// batch starts only after every item in the current batch completes. For 4-20
// investments this is fast enough; if it becomes a bottleneck, replace with a
// proper worker pool (e.g. p-limit).
async function withConcurrencyLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<unknown>,
): Promise<PromiseSettledResult<unknown>[]> {
  const results: PromiseSettledResult<unknown>[] = []
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    const batchResults = await Promise.allSettled(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

const PRICE_FETCH_CONCURRENCY = 4

interface InvestmentRow {
  id: number
  ticker: string | null
  shares: number | null
}

export async function refreshAllPrices(): Promise<RefreshResult> {
  const investments = db
    .prepare(`SELECT id, ticker, shares FROM "Investment" WHERE ticker IS NOT NULL`)
    .all() as InvestmentRow[]

  const results = await withConcurrencyLimit(investments, PRICE_FETCH_CONCURRENCY, async (inv) => {
    const result = await fetchPrice(inv.ticker!)
    // fetchExchangeRate throws on failure — use a cached rate if we have one,
    // otherwise re-throw so this investment is recorded as a failed update.
    let rate: number
    if (result.currency === 'EUR') {
      rate = 1
    } else {
      try {
        rate = await fetchExchangeRate(result.currency)
        stmtUpsertRate().run({ fromCurrency: result.currency, rate, updatedAt: new Date().toISOString() })
      } catch (rateErr) {
        const cached = stmtGetCachedRate().get(result.currency) as { rate: number } | undefined
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
      throw new Error(`${inv.ticker}: shares not set — add a buy lot to track position size`)
    }
    const shares = Number(inv.shares)
    const now = new Date().toISOString()
    // Atomically write both the Investment row and the daily PriceHistory
    // snapshot — otherwise a crash between the two leaves the snapshot
    // disagreeing with currentValue.
    const persist = db.transaction(() => {
      updateInvestment.run({
        id: inv.id,
        currentValue: priceInEUR * shares,
        lastPriceFetched: priceInEUR,
        priceUpdatedAt: now,
        updatedAt: now,
      })
      savePriceSnapshot(inv.id, priceInEUR, shares)
    })
    persist()
    return { id: inv.id, ticker: inv.ticker, price: priceInEUR }
  })
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
