// Parses and imports Revolut statement CSV files.
// Revolut exports UTF-8 CSV with headers:
// Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
// Amount is signed: positive = credit, negative = debit.
// Only COMPLETED rows are imported; PENDING and REVERTED are skipped.
import fs from 'fs'
import crypto from 'crypto'
import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

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

  if (!headers.includes('Started Date') || !headers.includes('Amount') || !headers.includes('State')) {
    throw new Error('This does not look like a Revolut statement CSV')
  }

  // ── Parse all rows upfront ───────────────────────────────────────────────────
  type PendingRow = { hash: string; data: Prisma.TransactionCreateManyInput }
  const pending: PendingRow[] = []
  const parseErrors: string[] = []

  for (const line of lines.slice(1)) {
    const cols = parseCSVLine(line, sep)
    if (cols.length < headers.length) continue

    const row = parseRow(cols, headers)
    if (!row) continue // PENDING / REVERTED — intentionally skipped, not an error

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
        date: parseDate(row.completedDate || row.startedDate),
        valueDate: row.startedDate ? parseDate(row.startedDate) : null,
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
    return { imported: 0, skipped: 0, errors: parseErrors }
  }

  // ── Deduplicate against existing imports in one query ────────────────────────
  const existing = new Set(
    (await prisma.transaction.findMany({
      where: { importHash: { in: pending.map(p => p.hash) } },
      select: { importHash: true },
    })).map(t => t.importHash!)
  )

  const newRows = pending.filter(p => !existing.has(p.hash))
  const skipped = pending.length - newRows.length

  if (newRows.length === 0) {
    return { imported: 0, skipped, errors: parseErrors }
  }

  // ── Atomic: insert all new rows + update balance in one transaction ──────────
  await prisma.$transaction(async (tx) => {
    await tx.transaction.createMany({ data: newRows.map(p => p.data) })
    const latest = await tx.transaction.findFirst({
      where: { accountId, runningBalance: { not: null } },
      orderBy: { date: 'desc' },
    })
    if (latest?.runningBalance != null) {
      await tx.account.update({ where: { id: accountId }, data: { balance: latest.runningBalance } })
    }
  })

  return { imported: newRows.length, skipped, errors: parseErrors }
}
