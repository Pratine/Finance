// Shared helpers, SQL fragments and row hydrators used by the IPC domain modules.
// Kept in one place to avoid duplication across modules and to make changes to
// the canonical hydration shape (booleans, nested relations) atomic.
import { db } from '../db'
import type { Frequency } from '../domainTypes'

// ── Date / value helpers ─────────────────────────────────────────────────────
export const nowIso = (): string => new Date().toISOString()

export const toIso = (d: Date | string | null | undefined): string | null => {
  if (d == null) return null
  return (d instanceof Date) ? d.toISOString() : new Date(d).toISOString()
}

export const requireIso = (d: Date | string): string =>
  (d instanceof Date) ? d.toISOString() : new Date(d).toISOString()

// SQLite stores booleans as 0/1; surface them to the renderer as real booleans.
export const boolFromInt = (v: unknown): boolean => v === 1 || v === true
export const intFromBool = (v: boolean | undefined | null): number | undefined =>
  v === undefined || v === null ? undefined : (v ? 1 : 0)

// Advances a date by one period of the given frequency using UTC methods.
export function advanceByFrequency(date: Date, freq: Frequency): Date {
  const d = new Date(date)
  switch (freq) {
    case 'WEEKLY':    d.setUTCDate(d.getUTCDate() + 7); break
    case 'MONTHLY':   d.setUTCMonth(d.getUTCMonth() + 1); break
    case 'QUARTERLY': d.setUTCMonth(d.getUTCMonth() + 3); break
    case 'YEARLY':    d.setUTCFullYear(d.getUTCFullYear() + 1); break
    default: throw new Error(`Unknown frequency: ${freq}`)
  }
  return d
}

// Build `SET col = @col, ...` from a data object, skipping `undefined` values.
export function buildUpdate(
  data: Record<string, unknown>,
  alwaysSet: Record<string, unknown> = {},
): { sql: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {}
  const cols: string[] = []
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    cols.push(`"${k}" = @${k}`)
    params[k] = v
  }
  for (const [k, v] of Object.entries(alwaysSet)) {
    if (!params[k]) cols.push(`"${k}" = @${k}`)
    params[k] = v
  }
  return { sql: cols.join(', '), params }
}

// ── SQL fragments ────────────────────────────────────────────────────────────
export const accountSelect = `
  a.id, a.name, a.bankId, a.accountNumber, a.typeId, a.balance, a.currency, a.createdAt, a.updatedAt,
  b.id AS bank_id, b.name AS bank_name, b.color AS bank_color, b.icon AS bank_icon,
  t.id AS type_id, t.name AS type_name, t.color AS type_color, t.icon AS type_icon
`

export const accountJoins = `
  LEFT JOIN "Bank" b ON b.id = a.bankId
  LEFT JOIN "AccountType" t ON t.id = a.typeId
`

export const categoryJoinSelect = `
  c.id AS cat_id, c.name AS cat_name, c.type AS cat_type, c.color AS cat_color, c.icon AS cat_icon, c.createdAt AS cat_createdAt
`

export const investmentSelect = `
  i.*,
  it.id AS invtype_id, it.name AS invtype_name, it.color AS invtype_color, it.icon AS invtype_icon,
  br.id AS broker_id, br.name AS broker_name, br.color AS broker_color, br.icon AS broker_icon
`

export const investmentJoins = `
  LEFT JOIN "InvestmentType" it ON it.id = i.typeId
  LEFT JOIN "Broker" br ON br.id = i.brokerId
`

// ── Row hydrators ────────────────────────────────────────────────────────────
// Convert raw rows into the same JSON shape Prisma produced so the renderer
// doesn't need to change.

export function hydrateAccount(row: any): any {
  if (!row) return row
  const out: any = {
    id: row.id, name: row.name, bankId: row.bankId, accountNumber: row.accountNumber,
    typeId: row.typeId, balance: row.balance, currency: row.currency,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  }
  if (row.bank_id !== undefined) {
    out.bank = row.bank_id === null ? null : { id: row.bank_id, name: row.bank_name, color: row.bank_color, icon: row.bank_icon }
  }
  if (row.type_id !== undefined) {
    out.type = row.type_id === null ? null : { id: row.type_id, name: row.type_name, color: row.type_color, icon: row.type_icon }
  }
  return out
}

export function hydrateCategory(prefix: string, row: any): any | null {
  if (row[`${prefix}_id`] == null) return null
  return {
    id:    row[`${prefix}_id`],
    name:  row[`${prefix}_name`],
    type:  row[`${prefix}_type`],
    color: row[`${prefix}_color`],
    icon:  row[`${prefix}_icon`],
    createdAt: row[`${prefix}_createdAt`],
  }
}

// Prepared statements used by getters below. Module-level prepare against the
// lazy db proxy is fine: it only resolves on first property access at runtime.
const stmtAccountFull = db.prepare(
  `SELECT ${accountSelect} FROM "Account" a ${accountJoins} WHERE a.id = ?`,
)

export function getAccountFull(id: number): any {
  return hydrateAccount(stmtAccountFull.get(id))
}

const stmtInvestmentFull = db.prepare(
  `SELECT ${investmentSelect} FROM "Investment" i ${investmentJoins} WHERE i.id = ?`,
)
const stmtLotsForInvestment = db.prepare(
  `SELECT * FROM "InvestmentLot" WHERE investmentId = ? ORDER BY date ASC`,
)

export function hydrateInvestment(row: any): any {
  if (!row) return row
  const out: any = {
    id: row.id, name: row.name, typeId: row.typeId, amountIn: row.amountIn,
    currentValue: row.currentValue, currency: row.currency, isin: row.isin,
    ticker: row.ticker, shares: row.shares, lastPriceFetched: row.lastPriceFetched,
    priceUpdatedAt: row.priceUpdatedAt, brokerId: row.brokerId, notes: row.notes,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    type:   row.invtype_id == null ? null : { id: row.invtype_id, name: row.invtype_name, color: row.invtype_color, icon: row.invtype_icon },
    broker: row.broker_id  == null ? null : { id: row.broker_id,  name: row.broker_name,  color: row.broker_color,  icon: row.broker_icon  },
  }
  out.lots = stmtLotsForInvestment.all(row.id)
  return out
}

export function getInvestmentFull(id: number): any | null {
  return hydrateInvestment(stmtInvestmentFull.get(id))
}

const stmtTagsForTx = db.prepare(`
  SELECT tt.transactionId, tt.tagId,
         tg.id AS tag_id, tg.name AS tag_name, tg.color AS tag_color
  FROM "TransactionTag" tt
  JOIN "Tag" tg ON tg.id = tt.tagId
  WHERE tt.transactionId = ?
`)

const stmtSplitsForTx = db.prepare(`
  SELECT s.*, ${categoryJoinSelect}
  FROM "TransactionSplit" s
  LEFT JOIN "Category" c ON c.id = s.categoryId
  WHERE s.transactionId = ?
  ORDER BY s.id ASC
`)

export function hydrateTransaction(row: any, opts: { includeTagsAndSplits?: boolean } = {}): any {
  const out: any = {
    id: row.id, accountId: row.accountId, categoryId: row.categoryId,
    recurringBillId: row.recurringBillId, date: row.date, valueDate: row.valueDate,
    description: row.description, amount: row.amount, type: row.type,
    runningBalance: row.runningBalance, notes: row.notes, importHash: row.importHash,
    createdAt: row.createdAt,
    category: hydrateCategory('cat', row),
  }
  if (opts.includeTagsAndSplits) {
    const tags = stmtTagsForTx.all(row.id) as any[]
    out.tags = tags.map(t => ({
      transactionId: t.transactionId, tagId: t.tagId,
      tag: { id: t.tag_id, name: t.tag_name, color: t.tag_color },
    }))
    const splits = stmtSplitsForTx.all(row.id) as any[]
    out.splits = splits.map(s => ({
      id: s.id, transactionId: s.transactionId, categoryId: s.categoryId,
      amount: s.amount, notes: s.notes, category: hydrateCategory('cat', s),
    }))
  }
  return out
}

const stmtTransactionFull = db.prepare(`
  SELECT t.*, ${categoryJoinSelect}
  FROM "Transaction" t
  LEFT JOIN "Category" c ON c.id = t.categoryId
  WHERE t.id = ?
`)

export function getTransactionFull(id: number): any | null {
  const tx = stmtTransactionFull.get(id) as any
  if (!tx) return null
  return hydrateTransaction(tx, { includeTagsAndSplits: true })
}

// ── Bill/Income hydrators ────────────────────────────────────────────────────
// These accept a row already joined against Account (bill/income select strings
// below) so we don't fire an extra query per row (was N+1).

export const billSelectJoin = `
  SELECT rb.*, ${categoryJoinSelect},
         ${accountSelect}
  FROM "RecurringBill" rb
  LEFT JOIN "Category" c ON c.id = rb.categoryId
  LEFT JOIN "Account" a ON a.id = rb.accountId
  ${accountJoins}
`

export const incomeSelectJoin = `
  SELECT ri.*, ${categoryJoinSelect},
         ${accountSelect}
  FROM "RecurringIncome" ri
  LEFT JOIN "Category" c ON c.id = ri.categoryId
  LEFT JOIN "Account" a ON a.id = ri.accountId
  ${accountJoins}
`

export function hydrateBill(row: any): any {
  if (!row) return row
  return {
    id: row.id, name: row.name, amount: row.amount, frequency: row.frequency,
    nextDueDate: row.nextDueDate, categoryId: row.categoryId, accountId: row.accountId,
    notes: row.notes, isActive: boolFromInt(row.isActive),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    category: hydrateCategory('cat', row),
    account: row.accountId == null ? null : hydrateAccount(row),
  }
}

export function hydrateIncome(row: any): any {
  if (!row) return row
  return {
    id: row.id, name: row.name, amount: row.amount, frequency: row.frequency,
    nextExpectedDate: row.nextExpectedDate, categoryId: row.categoryId,
    accountId: row.accountId, notes: row.notes, isActive: boolFromInt(row.isActive),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    category: hydrateCategory('cat', row),
    account: row.accountId == null ? null : hydrateAccount(row),
  }
}

// ── Savings / Debt hydrators ─────────────────────────────────────────────────
export function hydrateSavingsGoal(row: any): any {
  if (!row) return row
  return {
    id: row.id, accountId: row.accountId, name: row.name,
    targetAmount: row.targetAmount, currentAmount: row.currentAmount,
    deadline: row.deadline, interestType: row.interestType,
    interestValue: row.interestValue, interestFrequencyDays: row.interestFrequencyDays,
    lastInterestApplied: row.lastInterestApplied,
    totalInterestEarned: row.totalInterestEarned,
    contributionAmount: row.contributionAmount,
    contributionFrequencyDays: row.contributionFrequencyDays,
    notes: row.notes, createdAt: row.createdAt, updatedAt: row.updatedAt,
    account: row.accountId == null ? null : getAccountFull(row.accountId),
  }
}

const stmtAccountById = db.prepare(`SELECT * FROM "Account" WHERE id = ?`)
const stmtPaymentsForDebt = db.prepare(
  `SELECT * FROM "DebtPayment" WHERE debtId = ? ORDER BY date DESC`,
)

/**
 * Hydrate a Debt row.
 *
 * `payments` may be passed in by the caller (e.g. the list handler batches the
 * lookup to avoid N+1). When omitted, fall back to a per-row query — handy for
 * single-debt fetches (create/update/recordPayment/deletePayment).
 */
export function hydrateDebt(row: any, payments?: any[]): any {
  if (!row) return row
  const payList = payments ?? (stmtPaymentsForDebt.all(row.id) as any[])
  return {
    id: row.id, name: row.name, type: row.type, counterparty: row.counterparty,
    principal: row.principal, outstanding: row.outstanding, interestRate: row.interestRate,
    frequency: row.frequency, nextPaymentDate: row.nextPaymentDate, startDate: row.startDate,
    endDate: row.endDate, status: row.status, accountId: row.accountId, notes: row.notes,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    account: row.accountId == null ? null : stmtAccountById.get(row.accountId),
    payments: payList,
  }
}
