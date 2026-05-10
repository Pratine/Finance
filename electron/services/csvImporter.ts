// Parses and imports Millennium BCP bank statement CSV files into the database.
// Handles both UTF-8 and UTF-16 LE encodings and prevents duplicate imports
// by hashing each row and storing the hash in the `importHash` column.
import fs from 'fs'
import crypto from 'crypto'
import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

interface Rule { id: number; pattern: string; categoryId: number }

export interface RawRow {
  dataLancamento: string
  dataValor: string
  descricao: string
  montante: string
  tipo: string
  saldo: string
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

// Reads the file and auto-detects encoding.
// Millennium BCP exports UTF-16 LE, sometimes with a BOM (FF FE) and sometimes without.
// Without a BOM, every other byte is 0x00 for ASCII-dominant content — we detect that too.
function readFile(filePath: string): string {
  const buf = fs.readFileSync(filePath)
  // UTF-16 LE with BOM
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le')
  }
  // UTF-16 LE without BOM: odd-indexed bytes are 0x00 for ASCII characters
  if (buf.length > 8 && buf[1] === 0x00 && buf[3] === 0x00 && buf[5] === 0x00) {
    return buf.toString('utf16le')
  }
  return buf.toString('utf8')
}

// Strips encoding artefacts from mis-decoded UTF-16 content.
// Null bytes (\x00) appear when UTF-16 LE is read as UTF-8 without BOM detection.
// Space-per-character patterns cover display/export edge cases.
export function normalise(s: string): string {
  if (s.includes('\x00')) return s.replace(/\x00/g, '').trim()
  const everyOtherIsSpace = s.length > 4 && [...s].every((c, i) => i % 2 === 0 || c === ' ')
  if (everyOtherIsSpace) return s.replace(/ /g, '').trim()
  return s.trim()
}

export function parseDate(raw: string): Date {
  const clean = normalise(raw)
  const [day, month, year] = clean.split('-')
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}

export function parseDecimal(raw: string): number {
  return parseFloat(normalise(raw).replace(',', '.'))
}

// Produces a stable SHA-256 fingerprint for a row so re-imports are idempotent.
export function rowHash(row: RawRow): string {
  const key = [row.dataLancamento, row.dataValor, row.descricao, row.montante, row.tipo]
    .map(normalise)
    .join('|')
  return crypto.createHash('sha256').update(key).digest('hex')
}

export function isDataRow(cols: string[]): boolean {
  if (cols.length < 6) return false
  const date = normalise(cols[0])
  return /^\d{2}-\d{2}-\d{4}$/.test(date)
}

export async function importMillenniumCSV(
  filePath: string,
  accountId: number,
  rules: Rule[] = [],
): Promise<ImportResult> {
  const content = readFile(filePath)
  const lines = content.split(/\r?\n/)

  // Find the header row ("Data lançamento;Data valor;...")
  const headerIdx = lines.findIndex((l) => {
    const n = normalise(l)
    return n.startsWith('Data') && n.includes('Descri')
  })

  if (headerIdx === -1) {
    throw new Error('Could not find data header row — is this a Millennium BCP statement?')
  }

  // ── Parse all valid rows upfront ────────────────────────────────────────────
  type PendingRow = { hash: string; data: Prisma.TransactionCreateManyInput }
  const pending: PendingRow[] = []
  const errors: string[] = []

  for (const line of lines.slice(headerIdx + 1)) {
    const cols = line.split(';')
    if (!isDataRow(cols)) continue

    const row: RawRow = {
      dataLancamento: cols[0],
      dataValor:      cols[1],
      descricao:      cols[2],
      montante:       cols[3],
      tipo:           cols[4],
      saldo:          cols[5],
    }

    // Millennium BCP exports amounts already signed: credits are positive, debits
    // are negative. We store the value as-is — do NOT take Math.abs() here.
    const amount = parseDecimal(row.montante)
    const type   = normalise(row.tipo).toLowerCase().includes('cr') ? 'CREDIT' : 'DEBIT'
    const description = normalise(row.descricao)

    if (isNaN(amount)) {
      errors.push(`Row "${description}": could not parse amount "${normalise(row.montante)}"`)
      continue
    }

    const lower = description.toLowerCase()
    const matchedRule = rules.find(r => lower.includes(r.pattern.toLowerCase()))

    pending.push({
      hash: rowHash(row),
      data: {
        accountId,
        date:           parseDate(row.dataLancamento),
        valueDate:      row.dataValor ? parseDate(row.dataValor) : null,
        description,
        amount,
        type,
        runningBalance: parseDecimal(row.saldo),
        importHash:     rowHash(row),
        categoryId:     matchedRule?.categoryId ?? null,
      },
    })
  }

  if (pending.length === 0) return { imported: 0, skipped: 0, errors }

  // ── Deduplicate against existing imports in one query ────────────────────────
  const existing = new Set(
    (await prisma.transaction.findMany({
      where: { importHash: { in: pending.map(p => p.hash) } },
      select: { importHash: true },
    })).map(t => t.importHash!)
  )

  const newRows = pending.filter(p => !existing.has(p.hash))
  const skipped = pending.length - newRows.length

  if (newRows.length === 0) return { imported: 0, skipped, errors }

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

  return { imported: newRows.length, skipped, errors }
}
