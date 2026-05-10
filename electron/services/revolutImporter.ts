// Parses and imports Revolut statement CSV files.
// Revolut exports UTF-8 CSV with headers:
// Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
// Amount is signed: positive = credit, negative = debit.
// Only COMPLETED rows are imported; PENDING and REVERTED are skipped.
import fs from 'fs'
import crypto from 'crypto'
import { prisma } from '../db'

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
  // Detect comma or semicolon separator from the header line
  return header.includes(';') ? ';' : ','
}

function parseRow(cols: string[], headers: string[], sep: string): RawRow | null {
  const get = (name: string) => (cols[headers.indexOf(name)] ?? '').trim().replace(/^"|"$/g, '')
  const state = get('State').toUpperCase()
  if (state !== 'COMPLETED') return null
  return {
    type: get('Type'),
    startedDate: get('Started Date'),
    completedDate: get('Completed Date'),
    description: get('Description'),
    amount: get('Amount'),
    fee: get('Fee'),
    currency: get('Currency'),
    state,
    balance: get('Balance'),
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
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''))

  // Validate it looks like a Revolut file
  if (!headers.includes('Started Date') || !headers.includes('Amount') || !headers.includes('State')) {
    throw new Error('This does not look like a Revolut statement CSV')
  }

  const result: ImportResult = { imported: 0, skipped: 0, errors: [] }

  for (const line of lines.slice(1)) {
    const cols = line.split(sep)
    if (cols.length < headers.length) continue

    const row = parseRow(cols, headers, sep)
    if (!row) { result.skipped++; continue }

    const amount = parseFloat(row.amount)
    if (isNaN(amount)) continue

    const type = amount >= 0 ? 'CREDIT' : 'DEBIT'
    const hash = rowHash(row)
    const description = row.description || row.type

    const lower = description.toLowerCase()
    const matchedRule = rules.find(r => lower.includes(r.pattern.toLowerCase()))

    try {
      await prisma.transaction.create({
        data: {
          accountId,
          date: parseDate(row.completedDate || row.startedDate),
          valueDate: row.startedDate ? parseDate(row.startedDate) : null,
          description,
          amount,
          type,
          runningBalance: row.balance ? parseFloat(row.balance) : null,
          importHash: hash,
          categoryId: matchedRule?.categoryId ?? null,
        },
      })
      result.imported++
    } catch (e: any) {
      if (e?.code === 'P2002') {
        result.skipped++
      } else {
        result.errors.push(`Row "${description}": ${e?.message ?? e}`)
      }
    }
  }

  // Update account balance from last completed row's balance
  if (result.imported > 0) {
    const latest = await prisma.transaction.findFirst({
      where: { accountId, runningBalance: { not: null } },
      orderBy: { date: 'desc' },
    })
    if (latest?.runningBalance != null) {
      await prisma.account.update({
        where: { id: accountId },
        data: { balance: latest.runningBalance },
      })
    }
  }

  return result
}
