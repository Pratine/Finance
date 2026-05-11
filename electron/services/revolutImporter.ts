// Parses and imports Revolut statement CSV files.
// Revolut exports UTF-8 CSV with headers:
// Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
// Amount is signed: positive = credit, negative = debit.
// Only COMPLETED rows are imported; PENDING and REVERTED are skipped.
import fs from 'fs'
import crypto from 'crypto'
import { db } from '../db'

interface TxInsert {
  accountId: number
  date: string
  valueDate: string | null
  description: string
  amount: number
  type: string
  runningBalance: number | null
  importHash: string
  categoryId: number | null
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

interface RawRow {
  type: string
  startedDate: string
  completedDate: string
  description: string
  amount: string
  fee: string
  currency: string
  state: string
  balance: string
}

function parseDate(raw: string): Date {
  // Format: "2024-01-15 10:00:00" or "2024-01-15T10:00:00"
  return new Date(raw.trim().replace(' ', 'T'))
}

function rowHash(row: RawRow): string {
  const key = [row.completedDate, row.description, row.amount, row.currency, row.type].join('|')
  return crypto.createHash('sha256').update(key).digest('hex')
}

function parseSeparator(header: string): string {
  return header.includes(';') ? ';' : ','
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
        i++ // skip escaped quote
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

function parseRow(cols: string[], headers: string[]): RawRow | null {
  const get = (name: string) => (cols[headers.indexOf(name)] ?? '').trim()
  const state = get('State').toUpperCase()
  if (state !== 'COMPLETED') return null
  return {
    type:          get('Type'),
    startedDate:   get('Started Date'),
    completedDate: get('Completed Date'),
    description:   get('Description'),
    amount:        get('Amount'),
    fee:           get('Fee'),
    currency:      get('Currency'),
    state,
    balance:       get('Balance'),
  }
}

export async function importRevolutCSV(
  filePath: string,
  accountId: number,
  rules: Array<{ pattern: string; categoryId: number }> = [],
): Promise<ImportResult> {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) throw new Error('File appears to be empty')

  const sep = parseSeparator(lines[0])
  const headers = parseCSVLine(lines[0], sep).map(h => h.trim())

  const required = ['Type', 'Started Date', 'Completed Date', 'Description', 'Amount', 'Currency', 'State', 'Balance']
  const missing = required.filter(col => !headers.includes(col))
  if (missing.length > 0) {
    throw new Error(`This does not look like a Revolut statement CSV — missing columns: ${missing.join(', ')}`)
  }

  // ── Parse all rows upfront ───────────────────────────────────────────────────
  type PendingRow = { hash: string; data: TxInsert }
  const pending: PendingRow[] = []
  const parseErrors: string[] = []
  let intentionallySkipped = 0

  for (const line of lines.slice(1)) {
    const cols = parseCSVLine(line, sep)
    if (cols.length < headers.length) continue

    const row = parseRow(cols, headers)
    if (!row) { intentionallySkipped++; continue } // PENDING / REVERTED

    const amount = parseFloat(row.amount)
    if (isNaN(amount)) continue

    const type = amount >= 0 ? 'CREDIT' : 'DEBIT'
    const hash = rowHash(row)
    const description = row.description || row.type
    const lower = description.toLowerCase()
    const matchedRule = rules.find(r => lower.includes(r.pattern.toLowerCase()))

    // If the transaction is not in EUR, append the original currency to the
    // description so the user can see it. Revolut multi-currency conversions
    // are not auto-converted here — the stored amount is the EUR equivalent
    // as shown in the Revolut statement's Amount column.
    const notesPrefix = row.currency && row.currency.toUpperCase() !== 'EUR'
      ? `[${row.currency}] `
      : ''

    pending.push({
      hash,
      data: {
        accountId,
        date: parseDate(row.completedDate || row.startedDate).toISOString(),
        valueDate: row.startedDate ? parseDate(row.startedDate).toISOString() : null,
        description: `${notesPrefix}${description}`,
        amount,
        type,
        runningBalance: row.balance ? parseFloat(row.balance) : null,
        importHash: hash,
        categoryId: matchedRule?.categoryId ?? null,
      },
    })
  }

  if (pending.length === 0) {
    return { imported: 0, skipped: intentionallySkipped, errors: parseErrors }
  }

  // ── Deduplicate against existing imports ────────────────────────────────────
  // Batch the IN-clause to stay under SQLite's SQLITE_LIMIT_VARIABLE_NUMBER (999).
  const BATCH = 500
  const existing = new Set<string>()
  const hashes = pending.map(p => p.hash)
  for (let i = 0; i < hashes.length; i += BATCH) {
    const slice = hashes.slice(i, i + BATCH)
    const placeholders = slice.map(() => '?').join(',')
    const rows = db
      .prepare(`SELECT importHash FROM "Transaction" WHERE importHash IN (${placeholders})`)
      .all(...slice) as Array<{ importHash: string | null }>
    rows.forEach(r => { if (r.importHash) existing.add(r.importHash) })
  }

  const newRows = pending.filter(p => !existing.has(p.hash))
  const skipped = intentionallySkipped + (pending.length - newRows.length)

  if (newRows.length === 0) {
    return { imported: 0, skipped, errors: parseErrors }
  }

  // ── Atomic: insert all new rows + update balance in one transaction ──────────
  const insertTx = db.prepare(`
    INSERT INTO "Transaction" (accountId, categoryId, date, valueDate, description, amount, type, runningBalance, importHash)
    VALUES (@accountId, @categoryId, @date, @valueDate, @description, @amount, @type, @runningBalance, @importHash)
  `)
  const findLatest = db.prepare(`
    SELECT runningBalance FROM "Transaction"
    WHERE accountId = ? AND runningBalance IS NOT NULL
    ORDER BY date DESC LIMIT 1
  `)
  const updateBalance = db.prepare(`UPDATE "Account" SET balance = ?, updatedAt = ? WHERE id = ?`)

  const apply = db.transaction((rows: PendingRow[]) => {
    for (const p of rows) insertTx.run(p.data)
    const latest = findLatest.get(accountId) as { runningBalance: number | null } | undefined
    if (latest?.runningBalance != null) {
      updateBalance.run(latest.runningBalance, new Date().toISOString(), accountId)
    }
  })
  apply(newRows)

  return { imported: newRows.length, skipped, errors: parseErrors }
}
