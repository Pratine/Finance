// Parses Trading 212 CSV exports and creates InvestmentLot rows (NOT bank transactions).
// Sample header:
// Action,Time,ISIN,Ticker,Name,Notes,ID,No. of shares,Price / share,Currency (Price / share),
// Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,
// Currency (Withholding tax),Currency conversion fee,Currency (Currency conversion fee)
//
// Trading 212 reports the "Total" column in the account currency (EUR for EU accounts),
// so we use Total directly as the EUR-normalised cost / proceeds.
//
// Deduplication: each lot stores notes = '[T212]' + ID. Before insert we check for
// an existing lot with the same notes string.

import fs from 'fs'
import type Database from 'better-sqlite3'
import { db } from '../db'
import { calcInvestmentTotals } from './lotCalcs'
import { lookupISIN } from './isinLookup'

// Lazy module-level prepared-statement getters — compiled once on first use.
// Cannot prepare at module load because db is opened after migrations run.
let _findByIsin: Database.Statement | null = null
let _findByTicker: Database.Statement | null = null
let _firstType: Database.Statement | null = null
let _insertInv: Database.Statement | null = null
let _dedupCheck: Database.Statement | null = null
let _lotsRaw: Database.Statement | null = null
let _insertBuy: Database.Statement | null = null
let _insertSell: Database.Statement | null = null
let _updateInvTotals: Database.Statement | null = null

const findByIsin     = () => _findByIsin     ??= db.prepare(`SELECT * FROM "Investment" WHERE isin = ? LIMIT 1`)
const findByTicker   = () => _findByTicker   ??= db.prepare(`SELECT * FROM "Investment" WHERE ticker = ? LIMIT 1`)
const firstType      = () => _firstType      ??= db.prepare(`SELECT id FROM "InvestmentType" ORDER BY id ASC LIMIT 1`)
const insertInv      = () => _insertInv      ??= db.prepare(`
    INSERT INTO "Investment" (name, typeId, brokerId, amountIn, currentValue, currency, isin, ticker, shares, lastPriceFetched, priceUpdatedAt, notes, createdAt, updatedAt)
    VALUES (@name, @typeId, NULL, 0, 0, @currency, @isin, @ticker, NULL, NULL, NULL, NULL, @now, @now)
  `)
const dedupCheck     = () => _dedupCheck     ??= db.prepare(`SELECT id FROM "InvestmentLot" WHERE notes = ? LIMIT 1`)
const lotsRaw        = () => _lotsRaw        ??= db.prepare(`SELECT type, shares, totalCost FROM "InvestmentLot" WHERE investmentId = ?`)
const insertBuy      = () => _insertBuy      ??= db.prepare(`
    INSERT INTO "InvestmentLot" (investmentId, type, date, shares, pricePerShare, totalCost, notes, createdAt)
    VALUES (?, 'BUY', ?, ?, ?, ?, ?, ?)
  `)
const insertSell     = () => _insertSell     ??= db.prepare(`
    INSERT INTO "InvestmentLot" (investmentId, type, date, shares, pricePerShare, totalCost, realizedGain, notes, createdAt)
    VALUES (?, 'SELL', ?, ?, ?, ?, ?, ?, ?)
  `)
const updateInvTotals = () => _updateInvTotals ??= db.prepare(
    `UPDATE "Investment" SET shares = ?, amountIn = ?, currentValue = CASE WHEN currentValue = 0 THEN ? ELSE currentValue END, updatedAt = ? WHERE id = ?`,
  )

export interface Trading212Result {
  imported: number
  skipped: number
  errors: string[]
  newInvestments: string[]
  tickersResolved: string[]   // e.g. ["VFEA → VFEA.DE"]
  tickerErrors: string[]      // investments where ticker resolution failed
}

// EUR-first exchange priority — mirrors priceFetcher.ts
const EUR_EXCHANGE_PRIORITY = ['AMS', 'XETRA', 'EPA', 'MIL', 'BME', 'SIX']

// Resolves the best Yahoo Finance ticker for a newly-created investment using
// OpenFIGI. Only called when the T212 ticker has no exchange suffix (no '.'),
// meaning it cannot be used directly with Yahoo Finance.
async function resolveYahooTicker(isin: string): Promise<string | null> {
  const listings = await lookupISIN(isin)
  const sorted = [...listings].sort((a, b) => {
    const ai = EUR_EXCHANGE_PRIORITY.indexOf(a.exchCode)
    const bi = EUR_EXCHANGE_PRIORITY.indexOf(b.exchCode)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
  return sorted[0]?.yahooTicker ?? null
}

// RFC 4180-compliant CSV line parser — handles quoted fields containing the separator.
function parseCSVLine(line: string, sep: string): string[] {
  const cols: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === sep && !inQuotes) {
      cols.push(current)
      current = ''
    } else {
      current += c
    }
  }
  cols.push(current)
  return cols
}

function parseSeparator(header: string): string {
  return header.includes(';') ? ';' : ','
}

// Trading 212 Time format: "2024-01-15 10:00:00.000" (UTC)
function parseTime(raw: string): string {
  const trimmed = raw.trim().replace(' ', 'T')
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${raw}`)
  return d.toISOString()
}

function classifyAction(action: string): 'BUY' | 'SELL' | null {
  const a = action.trim().toLowerCase()
  if (a === 'market buy' || a === 'limit buy') return 'BUY'
  if (a === 'market sell' || a === 'limit sell') return 'SELL'
  return null
}

interface ParsedRow {
  type: 'BUY' | 'SELL'
  time: string
  isin: string
  ticker: string
  name: string
  id: string
  shares: number
  total: number // in EUR (account currency)
  currency: string
}

export async function importTrading212CSV(filePath: string): Promise<Trading212Result> {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '')
  const lines = content.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) throw new Error('File appears to be empty')

  const sep = parseSeparator(lines[0])
  const headers = parseCSVLine(lines[0], sep).map(h => h.trim())

  const required = ['Action', 'Time', 'ISIN', 'Ticker', 'Name', 'ID', 'No. of shares', 'Total']
  const missing = required.filter(c => !headers.includes(c))
  if (missing.length > 0) {
    throw new Error(`This does not look like a Trading 212 CSV — missing columns: ${missing.join(', ')}`)
  }

  const idx = (name: string) => headers.indexOf(name)
  const iAction = idx('Action')
  const iTime   = idx('Time')
  const iIsin   = idx('ISIN')
  const iTicker = idx('Ticker')
  const iName   = idx('Name')
  const iId     = idx('ID')
  const iShares = idx('No. of shares')
  const iTotal  = idx('Total')
  const iCurTot = idx('Currency (Total)')

  // Parse all rows first
  const parsed: ParsedRow[] = []
  const errors: string[] = []
  let skipped = 0

  for (let ln = 1; ln < lines.length; ln++) {
    const cols = parseCSVLine(lines[ln], sep)
    if (cols.length < headers.length) { skipped++; continue }
    const action = cols[iAction] ?? ''
    const type = classifyAction(action)
    if (!type) { skipped++; continue }

    try {
      const time = parseTime(cols[iTime] ?? '')
      const isin = (cols[iIsin] ?? '').trim().toUpperCase()
      const ticker = (cols[iTicker] ?? '').trim().toUpperCase()
      const name = (cols[iName] ?? '').trim() || ticker || isin || 'Trading 212 position'
      const id = (cols[iId] ?? '').trim()
      const shares = parseFloat(cols[iShares] ?? '')
      const total = Math.abs(parseFloat(cols[iTotal] ?? ''))
      const currency = (iCurTot >= 0 ? (cols[iCurTot] ?? '') : '').trim().toUpperCase() || 'EUR'

      if (!id) { errors.push(`Row ${ln + 1}: missing ID, skipped`); skipped++; continue }
      if (!isin && !ticker) { errors.push(`Row ${ln + 1}: missing ISIN and ticker, skipped`); skipped++; continue }
      if (!isFinite(shares) || shares <= 0) { errors.push(`Row ${ln + 1}: invalid shares`); skipped++; continue }
      if (!isFinite(total) || total <= 0) { errors.push(`Row ${ln + 1}: invalid total`); skipped++; continue }

      parsed.push({ type, time, isin, ticker, name, id, shares, total, currency })
    } catch (e: any) {
      errors.push(`Row ${ln + 1}: ${e.message ?? String(e)}`)
      skipped++
    }
  }

  const newInvestments: string[] = []
  let imported = 0

  const defaultType = firstType().get() as { id: number } | undefined
  const defaultTypeId = defaultType?.id ?? null

  const touchedInvestments = new Set<number>()
  // Cache lots per investment to avoid re-querying after each insert. We refresh
  // the cache entry after every insert so subsequent SELLs in the same batch
  // still see up-to-date balances.
  const lotsCache = new Map<number, Array<{ type: string; shares: unknown; totalCost: unknown }>>()
  const loadLots = (id: number) => {
    let l = lotsCache.get(id)
    if (!l) {
      l = lotsRaw().all(id) as Array<{ type: string; shares: unknown; totalCost: unknown }>
      lotsCache.set(id, l)
    }
    return l
  }

  const run = db.transaction(() => {
    for (const row of parsed) {
      // Resolve investment
      let inv: any = null
      if (row.isin) inv = findByIsin().get(row.isin)
      if (!inv && row.ticker) inv = findByTicker().get(row.ticker)

      if (!inv) {
        if (defaultTypeId === null) {
          errors.push(`${row.name} (${row.id}): cannot auto-create investment — no InvestmentType exists in the database`)
          skipped++
          continue
        }
        const now = new Date().toISOString()
        const info = insertInv().run({
          name: row.name,
          typeId: defaultTypeId,
          currency: 'EUR',
          isin: row.isin || null,
          ticker: row.ticker || null,
          now,
        })
        const newId = Number(info.lastInsertRowid)
        inv = { id: newId, name: row.name }
        newInvestments.push(row.name)
      }

      const noteTag = `[T212]${row.id}`
      const existing = dedupCheck().get(noteTag)
      if (existing) { skipped++; continue }

      const pricePerShare = Math.round((row.total / row.shares) * 10000) / 10000
      const totalCost = Math.round(row.total * 100) / 100
      const isoDate = row.time
      const now = new Date().toISOString()

      if (row.type === 'BUY') {
        insertBuy().run(inv.id, isoDate, row.shares, pricePerShare, totalCost, noteTag, now)
        const lots = loadLots(inv.id)
        lots.push({ type: 'BUY', shares: row.shares, totalCost })
      } else {
        // SELL: validate available shares using current DB state. Reuse the
        // cached lot list for both the validation totals and the avg-cost calc
        // so we only hit SQLite once per investment.
        const lots = loadLots(inv.id)
        const totals = calcInvestmentTotals(lots as any)
        if (row.shares > totals.shares + 1e-9) {
          errors.push(`${row.name} (${row.id}): cannot sell ${row.shares} shares — only ${totals.shares} available`)
          skipped++
          continue
        }
        const buys = lots.filter(l => l.type === 'BUY')
        const totalBuyShares = buys.reduce((s, l) => s + Number(l.shares), 0)
        const totalBuyCost   = buys.reduce((s, l) => s + Number(l.totalCost), 0)
        const avgCost = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0
        const costBasis = Math.round(row.shares * avgCost * 100) / 100
        const realizedGain = Math.round((totalCost - costBasis) * 100) / 100
        insertSell().run(inv.id, isoDate, row.shares, pricePerShare, totalCost, realizedGain, noteTag, now)
        lots.push({ type: 'SELL', shares: row.shares, totalCost })
      }

      touchedInvestments.add(inv.id)
      imported++
    }

    // Sync totals once per touched investment — use the in-memory cache which
    // already reflects every insert we just performed.
    const now = new Date().toISOString()
    for (const id of touchedInvestments) {
      const lots = loadLots(id)
      const { shares, amountIn } = calcInvestmentTotals(lots as any)
      // seed currentValue with amountIn if it's still 0 (no price fetched yet)
      updateInvTotals().run(shares, amountIn, amountIn, now, id)
    }
  })

  run()

  return { imported, skipped, errors, newInvestments }
}
