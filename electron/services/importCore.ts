// Shared CSV-import primitives used by every bank-specific importer.
// Each importer parses its source format into a `PendingRow[]` and hands the
// array to `applyPendingRows`, which dedups against the existing importHash
// set and atomically inserts new rows + refreshes the account balance.
import { db } from '../db'

export interface TxInsert {
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

export type PendingRow = { hash: string; data: TxInsert }

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

// Batch the IN-clause to stay under SQLite's SQLITE_LIMIT_VARIABLE_NUMBER (999).
const BATCH = 500

/** Returns the set of importHashes already present in the Transaction table. */
function findExistingHashes(hashes: string[]): Set<string> {
  const existing = new Set<string>()
  for (let i = 0; i < hashes.length; i += BATCH) {
    const slice = hashes.slice(i, i + BATCH)
    const placeholders = slice.map(() => '?').join(',')
    const rows = db
      .prepare(`SELECT importHash FROM "Transaction" WHERE importHash IN (${placeholders})`)
      .all(...slice) as Array<{ importHash: string | null }>
    rows.forEach(r => { if (r.importHash) existing.add(r.importHash) })
  }
  return existing
}

/**
 * Dedup `pending` against existing importHashes, insert the new rows and
 * refresh the account balance from the latest runningBalance — all atomically.
 *
 * Returns the canonical ImportResult; the caller can add extra `skipped`
 * (e.g. intentionally-skipped PENDING rows) before returning to the user.
 */
export function applyPendingRows(
  pending: PendingRow[],
  accountId: number,
  errors: string[] = [],
  extraSkipped = 0,
): ImportResult {
  if (pending.length === 0) {
    return { imported: 0, skipped: extraSkipped, errors }
  }

  const existing = findExistingHashes(pending.map(p => p.hash))
  const newRows = pending.filter(p => !existing.has(p.hash))
  const skipped = extraSkipped + (pending.length - newRows.length)

  if (newRows.length === 0) {
    return { imported: 0, skipped, errors }
  }

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

  return { imported: newRows.length, skipped, errors }
}
