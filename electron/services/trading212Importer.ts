// Parses and imports Trading 212 statement CSV files.
// Each Market buy/sell row becomes an InvestmentLot.
// Deposits, withdrawals and dividends are skipped (bank statement importers
// handle cash movements; dividend support can be added later).
// Deduplication uses the Trading 212 trade ID stored in the lot notes field.
import fs from 'fs'
import { db } from '../db'
import { calcInvestmentTotals } from './lotCalcs'

export interface Trading212Result {
  imported: number
  skipped: number
  errors: string[]
  newInvestments: string[]  // names of investments auto-created during import
}

interface T212Row {
  action: string
  time: string
  isin: string
  ticker: string
  name: string
  id: string
  shares: number
  pricePerShare: number
  currency: string
  exchangeRate: number
  total: number   // always in account currency (EUR)
}

// RFC 4180-compliant CSV line parser
function parseCSVLine(line: string): string[] {
  const cols: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (c === ',' && !inQuotes) {
      cols.push(current); current = ''
    } else {
      current += c
    }
  }
  cols.push(current)
  return cols
}

function colIndex(headers: string[], name: string): number {
  return headers.indexOf(name)
}

function parseRow(cols: string[], headers: string[]): T212Row | null {
  const get = (name: string) => (cols[colIndex(headers, name)] ?? '').trim()
  const action = get('Action')
  if (!['Market buy', 'Market sell', 'Limit buy', 'Limit sell'].includes(action)) return null

  const shares    = parseFloat(get('No. of shares'))
  const price     = parseFloat(get('Price / share'))
  const total     = parseFloat(get('Total'))
  const exchRate  = parseFloat(get('Exchange rate')) || 1

  if (isNaN(shares) || isNaN(price) || isNaN(total)) return null

  return {
    action,
    time: get('Time'),
    isin: get('ISIN'),
    ticker: get('Ticker'),
    name: get('Name'),
    id: get('ID'),
    shares,
    pricePerShare: total / shares,   // normalised to EUR
    currency: get('Currency (Price / share)'),
    exchangeRate: exchRate,
    total,
  }
}

// Find or create an investment for the given ISIN/ticker/name.
// Tries ISIN first (most reliable), then ticker, then creates a new one.
function resolveInvestment(row: T212Row, now: string): { id: number; created: boolean } {
  // 1. Match by ISIN
  if (row.isin) {
    const byIsin = db.prepare(`SELECT id FROM "Investment" WHERE isin = ?`).get(row.isin) as { id: number } | undefined
    if (byIsin) return { id: byIsin.id, created: false }
  }

  // 2. Match by ticker
  if (row.ticker) {
    const byTicker = db.prepare(`SELECT id FROM "Investment" WHERE ticker = ?`).get(row.ticker) as { id: number } | undefined
    if (byTicker) return { id: byTicker.id, created: false }
  }

  // 3. Create — find a usable investment type (first in list, or null)
  const invType = db.prepare(`SELECT id FROM "InvestmentType" ORDER BY id ASC LIMIT 1`).get() as { id: number } | undefined

  const info = db.prepare(`
    INSERT INTO "Investment" (name, isin, ticker, currency, typeId, brokerId, amountIn, currentValue, shares, createdAt, updatedAt)
    VALUES (@name, @isin, @ticker, @currency, @typeId, @brokerId, 0, 0, 0, @now, @now)
  `).run({
    name: row.name || row.ticker,
    isin: row.isin || null,
    ticker: row.ticker || null,
    currency: row.currency === 'EUR' ? 'EUR' : row.currency,
    typeId: invType?.id ?? null,
    brokerId: null,
    now,
  })

  return { id: Number(info.lastInsertRowid), created: true }
}

function syncTotals(investmentId: number, now: string) {
  const lots = db.prepare(`SELECT * FROM "InvestmentLot" WHERE investmentId = ?`).all(investmentId)
  const { shares, amountIn } = calcInvestmentTotals(lots as any)
  db.prepare(`UPDATE "Investment" SET shares = ?, amountIn = ?, updatedAt = ? WHERE id = ?`).run(shares, amountIn, now, investmentId)
}

const T212_PREFIX = '[T212]'

export async function importTrading212CSV(filePath: string): Promise<Trading212Result> {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) throw new Error('File appears to be empty')

  const headers = parseCSVLine(lines[0]).map(h => h.trim())
  const required = ['Action', 'Time', 'ISIN', 'Ticker', 'No. of shares', 'Price / share', 'Total', 'ID']
  const missing = required.filter(h => !headers.includes(h))
  if (missing.length > 0) {
    throw new Error(`This does not look like a Trading 212 statement — missing columns: ${missing.join(', ')}`)
  }

  const pending: T212Row[] = []
  const errors: string[] = []

  for (const line of lines.slice(1)) {
    const cols = parseCSVLine(line)
    if (cols.length < 5) continue
    const row = parseRow(cols, headers)
    if (!row) continue  // skipped action type
    pending.push(row)
  }

  if (pending.length === 0) return { imported: 0, skipped: 0, errors, newInvestments: [] }

  // Dedup: check which trade IDs are already present in lot notes
  const existingIds = new Set<string>(
    (db.prepare(`SELECT notes FROM "InvestmentLot" WHERE notes LIKE '${T212_PREFIX}%'`).all() as Array<{ notes: string }>)
      .map(r => r.notes),
  )

  const newRows = pending.filter(r => !existingIds.has(`${T212_PREFIX}${r.id}`))
  const skipped = pending.length - newRows.length

  if (newRows.length === 0) return { imported: 0, skipped, errors, newInvestments: [] }

  const newInvestmentNames: string[] = []
  const now = new Date().toISOString()
  let imported = 0

  db.transaction(() => {
    // Group by investment to avoid repeated syncTotals calls
    const dirtyInvestments = new Set<number>()

    for (const row of newRows) {
      try {
        const { id: investmentId, created } = resolveInvestment(row, now)
        if (created) newInvestmentNames.push(row.name || row.ticker)

        const isBuy = row.action.toLowerCase().includes('buy')
        const type = isBuy ? 'BUY' : 'SELL'

        if (!isBuy) {
          // Validate there are enough shares to sell
          const lots = db.prepare(`SELECT * FROM "InvestmentLot" WHERE investmentId = ?`).all(investmentId)
          const { shares: held } = calcInvestmentTotals(lots as any)
          if (row.shares > held + 0.000001) {
            errors.push(`${row.ticker}: cannot sell ${row.shares} shares — only ${held.toFixed(6)} held at ${row.time}`)
            continue
          }
        }

        db.prepare(`
          INSERT INTO "InvestmentLot" (investmentId, type, date, shares, pricePerShare, totalCost, notes, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          investmentId,
          type,
          new Date(row.time).toISOString(),
          row.shares,
          row.pricePerShare,
          row.total,
          `${T212_PREFIX}${row.id}`,
          now,
        )

        dirtyInvestments.add(investmentId)
        imported++
      } catch (e: any) {
        errors.push(`Row ${row.id || row.time}: ${e?.message ?? e}`)
      }
    }

    for (const id of dirtyInvestments) syncTotals(id, now)
  })()

  return { imported, skipped, errors, newInvestments: [...new Set(newInvestmentNames)] }
}
