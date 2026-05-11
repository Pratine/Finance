// All IPC handlers live here. The renderer calls window.api.* (defined in preload.ts),
// which bridges to these handlers running in the main process where the SQLite
// database and Node.js APIs (fs, dialog) are available. The renderer never touches
// the DB directly.
//
// Backed by better-sqlite3 (synchronous). IPC handlers may return synchronous
// values or Promises — Electron's ipcMain.handle accepts both.
import { IpcMain, dialog, app } from 'electron'
import path from 'path'
import { writeFile, readFile } from 'fs/promises'
import { db } from './db'
import { importMillenniumCSV } from './services/csvImporter'
import { importRevolutCSV } from './services/revolutImporter'
import { fetchPrice, fetchExchangeRate } from './services/priceFetcher'
import { refreshAllPrices, getLastRefresh, startScheduler, type RefreshInterval } from './services/priceScheduler'
import { loadAppSettings, saveAppSettings } from './services/appSettings'
import { lookupISIN } from './services/isinLookup'
import { elapsedPeriods, applyPeriods } from './services/interest'
import { calcInvestmentTotals } from './services/lotCalcs'
import { computeBalanceDelta, toStoredAmount } from './services/transactionCalcs'
import type { Frequency, InterestType, DebtType, DebtStatus } from './domainTypes'

// ── Helpers ──────────────────────────────────────────────────────────────────
const nowIso = () => new Date().toISOString()
const toIso = (d: Date | string | null | undefined): string | null => {
  if (d == null) return null
  return (d instanceof Date) ? d.toISOString() : new Date(d).toISOString()
}
const requireIso = (d: Date | string): string =>
  (d instanceof Date) ? d.toISOString() : new Date(d).toISOString()

// SQLite stores booleans as 0/1; surface them to the renderer as real booleans.
const boolFromInt = (v: unknown): boolean => v === 1 || v === true
const intFromBool = (v: boolean | undefined | null): number | undefined =>
  v === undefined || v === null ? undefined : (v ? 1 : 0)

// Advances a date by one period of the given frequency using UTC methods.
function advanceByFrequency(date: Date, freq: Frequency): Date {
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

// ── Row hydrators ────────────────────────────────────────────────────────────
// These convert raw rows into the same JSON shape Prisma produced (booleans
// instead of 0/1, nested relations under their relation names, etc.) so the
// renderer code doesn't need to change.

function hydrateAccount(row: any): any {
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

const accountSelect = `
  a.id, a.name, a.bankId, a.accountNumber, a.typeId, a.balance, a.currency, a.createdAt, a.updatedAt,
  b.id AS bank_id, b.name AS bank_name, b.color AS bank_color, b.icon AS bank_icon,
  t.id AS type_id, t.name AS type_name, t.color AS type_color, t.icon AS type_icon
`
const accountJoins = `
  LEFT JOIN "Bank" b ON b.id = a.bankId
  LEFT JOIN "AccountType" t ON t.id = a.typeId
`

function getAccountFull(id: number): any {
  const row = db.prepare(`SELECT ${accountSelect} FROM "Account" a ${accountJoins} WHERE a.id = ?`).get(id)
  return hydrateAccount(row)
}

function hydrateCategory(prefix: string, row: any): any | null {
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

function hydrateBill(row: any): any {
  if (!row) return row
  return {
    id: row.id, name: row.name, amount: row.amount, frequency: row.frequency,
    nextDueDate: row.nextDueDate, categoryId: row.categoryId, accountId: row.accountId,
    notes: row.notes, isActive: boolFromInt(row.isActive),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    category: hydrateCategory('cat', row),
    account: row.accountId == null ? null : getAccountFull(row.accountId),
  }
}

function hydrateIncome(row: any): any {
  if (!row) return row
  return {
    id: row.id, name: row.name, amount: row.amount, frequency: row.frequency,
    nextExpectedDate: row.nextExpectedDate, categoryId: row.categoryId,
    accountId: row.accountId, notes: row.notes, isActive: boolFromInt(row.isActive),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    category: hydrateCategory('cat', row),
    account: row.accountId == null ? null : getAccountFull(row.accountId),
  }
}

const categoryJoinSelect = `
  c.id AS cat_id, c.name AS cat_name, c.type AS cat_type, c.color AS cat_color, c.icon AS cat_icon, c.createdAt AS cat_createdAt
`

function getTransactionFull(id: number): any | null {
  const tx = db.prepare(`
    SELECT t.*, ${categoryJoinSelect}
    FROM "Transaction" t
    LEFT JOIN "Category" c ON c.id = t.categoryId
    WHERE t.id = ?
  `).get(id) as any
  if (!tx) return null
  return hydrateTransaction(tx, { includeTagsAndSplits: true })
}

function hydrateTransaction(row: any, opts: { includeTagsAndSplits?: boolean } = {}): any {
  const out: any = {
    id: row.id, accountId: row.accountId, categoryId: row.categoryId,
    recurringBillId: row.recurringBillId, date: row.date, valueDate: row.valueDate,
    description: row.description, amount: row.amount, type: row.type,
    runningBalance: row.runningBalance, notes: row.notes, importHash: row.importHash,
    createdAt: row.createdAt,
    category: hydrateCategory('cat', row),
  }
  if (opts.includeTagsAndSplits) {
    const tags = db.prepare(`
      SELECT tt.transactionId, tt.tagId,
             tg.id AS tag_id, tg.name AS tag_name, tg.color AS tag_color
      FROM "TransactionTag" tt
      JOIN "Tag" tg ON tg.id = tt.tagId
      WHERE tt.transactionId = ?
    `).all(row.id) as any[]
    out.tags = tags.map(t => ({
      transactionId: t.transactionId, tagId: t.tagId,
      tag: { id: t.tag_id, name: t.tag_name, color: t.tag_color },
    }))
    const splits = db.prepare(`
      SELECT s.*, ${categoryJoinSelect}
      FROM "TransactionSplit" s
      LEFT JOIN "Category" c ON c.id = s.categoryId
      WHERE s.transactionId = ?
      ORDER BY s.id ASC
    `).all(row.id) as any[]
    out.splits = splits.map(s => ({
      id: s.id, transactionId: s.transactionId, categoryId: s.categoryId,
      amount: s.amount, notes: s.notes, category: hydrateCategory('cat', s),
    }))
  }
  return out
}

function hydrateInvestment(row: any): any {
  if (!row) return row
  const out: any = {
    id: row.id, name: row.name, typeId: row.typeId, amountIn: row.amountIn,
    currentValue: row.currentValue, currency: row.currency, isin: row.isin,
    ticker: row.ticker, shares: row.shares, lastPriceFetched: row.lastPriceFetched,
    priceUpdatedAt: row.priceUpdatedAt, brokerId: row.brokerId, notes: row.notes,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    type: row.invtype_id == null ? null : { id: row.invtype_id, name: row.invtype_name, color: row.invtype_color, icon: row.invtype_icon },
    broker: row.broker_id == null ? null : { id: row.broker_id, name: row.broker_name, color: row.broker_color, icon: row.broker_icon },
  }
  out.lots = db.prepare(`SELECT * FROM "InvestmentLot" WHERE investmentId = ? ORDER BY date ASC`).all(row.id)
  return out
}

const investmentSelect = `
  i.*,
  it.id AS invtype_id, it.name AS invtype_name, it.color AS invtype_color, it.icon AS invtype_icon,
  br.id AS broker_id, br.name AS broker_name, br.color AS broker_color, br.icon AS broker_icon
`
const investmentJoins = `
  LEFT JOIN "InvestmentType" it ON it.id = i.typeId
  LEFT JOIN "Broker" br ON br.id = i.brokerId
`

function getInvestmentFull(id: number): any | null {
  const row = db.prepare(`SELECT ${investmentSelect} FROM "Investment" i ${investmentJoins} WHERE i.id = ?`).get(id)
  return hydrateInvestment(row)
}

function hydrateSavingsGoal(row: any): any {
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

function hydrateDebt(row: any): any {
  if (!row) return row
  const payments = db.prepare(`SELECT * FROM "DebtPayment" WHERE debtId = ? ORDER BY date DESC`).all(row.id)
  return {
    id: row.id, name: row.name, type: row.type, counterparty: row.counterparty,
    principal: row.principal, outstanding: row.outstanding, interestRate: row.interestRate,
    frequency: row.frequency, nextPaymentDate: row.nextPaymentDate, startDate: row.startDate,
    endDate: row.endDate, status: row.status, accountId: row.accountId, notes: row.notes,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    account: row.accountId == null ? null : db.prepare(`SELECT * FROM "Account" WHERE id = ?`).get(row.accountId),
    payments,
  }
}

// Build `SET col = @col, ...` from a data object, skipping `undefined` values.
function buildUpdate(data: Record<string, unknown>, alwaysSet: Record<string, unknown> = {}): { sql: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = { ...alwaysSet }
  const cols: string[] = []
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    cols.push(`"${k}" = @${k}`)
    params[k] = v
  }
  for (const k of Object.keys(alwaysSet)) cols.push(`"${k}" = @${k}`)
  return { sql: cols.join(', '), params }
}

// ── Setup ────────────────────────────────────────────────────────────────────
export function setupIpcHandlers(ipcMain: IpcMain) {
  // ── Export ─────────────────────────────────────────────────────────────────
  ipcMain.handle('export:savePath', async (_event, defaultName: string, filters: Electron.FileFilter[]) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters,
      properties: ['createDirectory'],
    })
    return canceled ? null : filePath
  })

  ipcMain.handle('export:transactions', async (_event, opts: {
    format: 'csv' | 'json'
    filePath: string
    from?: string
    to?: string
    accountId?: number
  }) => {
    const conds: string[] = []
    const params: any[] = []
    if (opts.from) { conds.push('t.date >= ?'); params.push(new Date(opts.from).toISOString()) }
    if (opts.to)   { conds.push('t.date <= ?'); params.push(new Date(opts.to).toISOString()) }
    if (opts.accountId != null) { conds.push('t.accountId = ?'); params.push(opts.accountId) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const rows = db.prepare(`
      SELECT t.*, ${categoryJoinSelect},
             ${accountSelect}
      FROM "Transaction" t
      LEFT JOIN "Category" c ON c.id = t.categoryId
      LEFT JOIN "Account" a ON a.id = t.accountId
      ${accountJoins}
      ${where}
      ORDER BY t.date DESC
    `).all(...params) as any[]

    const txns = rows.map(r => ({
      ...hydrateTransaction(r),
      account: hydrateAccount(r),
    }))

    if (opts.format === 'json') {
      await writeFile(opts.filePath, JSON.stringify(txns, null, 2), 'utf8')
    } else {
      const q = (s: string) => `"${s.replace(/"/g, '""')}"`
      const header = 'Date,Account,Description,Amount,Type,Category,Balance\n'
      const csv = txns.map(t => [
        new Date(t.date).toISOString().slice(0, 10),
        q(t.account?.name ?? ''),
        q(t.description),
        t.amount,
        t.type,
        q(t.category?.name ?? ''),
        t.runningBalance ?? '',
      ].join(','))
      await writeFile(opts.filePath, header + csv.join('\n'), 'utf8')
    }
    return { exported: txns.length }
  })

  ipcMain.handle('export:backup', async (_event, filePath: string) => {
    const all = (tbl: string) => db.prepare(`SELECT * FROM "${tbl}"`).all()
    const tables = {
      accountTypes:        all('AccountType'),
      banks:               all('Bank'),
      brokers:             all('Broker'),
      investmentTypes:     all('InvestmentType'),
      categories:          all('Category'),
      categoryRules:       all('CategoryRule'),
      accounts:            all('Account'),
      tags:                all('Tag'),
      budgets:             all('Budget'),
      savingsGoals:        all('SavingsGoal'),
      savingsSnapshots:    all('SavingsSnapshot'),
      investments:         all('Investment'),
      investmentLots:      all('InvestmentLot'),
      priceHistory:        all('PriceHistory'),
      exchangeRates:       all('ExchangeRate'),
      recurringBills:      all('RecurringBill'),
      recurringIncome:     all('RecurringIncome'),
      transactions:        all('Transaction'),
      transactionTags:     all('TransactionTag'),
      transactionSplits:   all('TransactionSplit'),
      balanceCorrections:  all('BalanceCorrection'),
      debts:               all('Debt'),
      debtPayments:        all('DebtPayment'),
      importHistory:       all('ImportHistory'),
    }
    const backup = { exportedAt: new Date().toISOString(), version: 2, ...tables }
    await writeFile(filePath, JSON.stringify(backup, null, 2), 'utf8')
    const total = Object.values(tables).reduce((s, t) => s + (t as any[]).length, 0)
    return { exported: total }
  })

  ipcMain.handle('import:backup', async (_event, filePath: string) => {
    type BackupFile = {
      version: number
      exportedAt: string
      accountTypes?: any[]; banks?: any[]; brokers?: any[]; investmentTypes?: any[]
      categories?: any[]; categoryRules?: any[]; accounts?: any[]; tags?: any[]
      budgets?: any[]; exchangeRates?: any[]; savingsGoals?: any[]; savingsSnapshots?: any[]
      investments?: any[]; investmentLots?: any[]; priceHistory?: any[]
      recurringBills?: any[]; recurringIncome?: any[]; transactions?: any[]
      transactionTags?: any[]; transactionSplits?: any[]; balanceCorrections?: any[]
      debts?: any[]; debtPayments?: any[]; importHistory?: any[]
    }

    let backup: BackupFile
    try {
      const raw = await readFile(filePath, 'utf8')
      backup = JSON.parse(raw) as BackupFile
    } catch (e: any) {
      throw new Error(`The selected file is not a valid Finance backup: ${e.message}`)
    }

    if (backup.version !== 2) {
      throw new Error(`Incompatible backup version: expected 2, got ${backup.version ?? 'missing'}. Use the app that created this backup to export it again.`)
    }

    const checkSample = (arr: any[] | undefined, table: string, ...fields: string[]) => {
      if (!arr?.length) return
      const sample = arr.length <= 3 ? arr : [arr[0], arr[Math.floor(arr.length / 2)], arr[arr.length - 1]]
      for (const r of sample) {
        const missing = fields.filter(f => r[f] === undefined)
        if (missing.length) throw new Error(`Backup appears corrupted: ${table} record is missing fields: ${missing.join(', ')}`)
      }
    }
    checkSample(backup.accounts,     'accounts',     'id', 'name', 'bankId', 'typeId', 'balance')
    checkSample(backup.transactions,  'transactions', 'id', 'accountId', 'date', 'amount', 'type')
    checkSample(backup.investments,   'investments',  'id', 'name', 'typeId', 'amountIn', 'currentValue')
    checkSample(backup.debts,         'debts',        'id', 'name', 'type', 'principal', 'outstanding')

    const dIso = (v: string | null | undefined) => v ? new Date(v).toISOString() : null

    // Helper to insert a list of rows using a column list (skipping cols absent from input rows).
    // Returns the number of rows inserted.
    function insertAll(table: string, rows: any[], cols: string[]) {
      if (!rows.length) return
      const placeholders = cols.map(c => `@${c}`).join(', ')
      const colList = cols.map(c => `"${c}"`).join(', ')
      const stmt = db.prepare(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`)
      for (const r of rows) {
        const params: any = {}
        for (const c of cols) params[c] = r[c] ?? null
        stmt.run(params)
      }
    }

    const restore = db.transaction(() => {
      // Delete every table in reverse FK order
      for (const t of [
        'TransactionTag','TransactionSplit','Tag','ImportHistory','DebtPayment','Debt',
        'SavingsSnapshot','PriceHistory','ExchangeRate','BalanceCorrection','InvestmentLot',
        'Transaction','SavingsGoal','Budget','RecurringBill','RecurringIncome',
        'CategoryRule','Investment','Account','Category','AccountType','Bank','Broker','InvestmentType',
      ]) {
        db.exec(`DELETE FROM "${t}"`)
      }
      db.exec(`DELETE FROM sqlite_sequence`)

      // Re-insert in FK dependency order
      insertAll('AccountType',     (backup.accountTypes     ?? []).map(r => ({ id: r.id, name: r.name, color: r.color, icon: r.icon })), ['id','name','color','icon'])
      insertAll('Bank',            (backup.banks            ?? []).map(r => ({ id: r.id, name: r.name, color: r.color, icon: r.icon })), ['id','name','color','icon'])
      insertAll('Broker',          (backup.brokers          ?? []).map(r => ({ id: r.id, name: r.name, color: r.color, icon: r.icon })), ['id','name','color','icon'])
      insertAll('InvestmentType',  (backup.investmentTypes  ?? []).map(r => ({ id: r.id, name: r.name, color: r.color, icon: r.icon })), ['id','name','color','icon'])
      insertAll('Category',        (backup.categories       ?? []).map(r => ({ id: r.id, name: r.name, type: r.type, color: r.color, icon: r.icon, createdAt: dIso(r.createdAt) ?? nowIso() })), ['id','name','type','color','icon','createdAt'])
      insertAll('CategoryRule',    (backup.categoryRules    ?? []).map(r => ({ id: r.id, pattern: r.pattern, categoryId: r.categoryId, createdAt: dIso(r.createdAt) ?? nowIso() })), ['id','pattern','categoryId','createdAt'])
      insertAll('Account',         (backup.accounts         ?? []).map(r => ({ id: r.id, name: r.name, bankId: r.bankId, typeId: r.typeId, accountNumber: r.accountNumber, balance: r.balance, currency: r.currency ?? 'EUR', createdAt: dIso(r.createdAt) ?? nowIso(), updatedAt: dIso(r.updatedAt) ?? nowIso() })), ['id','name','bankId','typeId','accountNumber','balance','currency','createdAt','updatedAt'])
      insertAll('Tag',             (backup.tags             ?? []).map(r => ({ id: r.id, name: r.name, color: r.color })), ['id','name','color'])
      insertAll('Budget',          (backup.budgets          ?? []).map(r => ({ id: r.id, categoryId: r.categoryId, amount: r.amount, createdAt: dIso(r.createdAt) ?? nowIso(), updatedAt: dIso(r.updatedAt) ?? nowIso() })), ['id','categoryId','amount','createdAt','updatedAt'])
      insertAll('ExchangeRate',    (backup.exchangeRates    ?? []).map(r => ({ id: r.id, fromCurrency: r.fromCurrency, rate: r.rate, updatedAt: dIso(r.updatedAt) ?? nowIso() })), ['id','fromCurrency','rate','updatedAt'])
      insertAll('SavingsGoal',     (backup.savingsGoals     ?? []).map(r => ({
        id: r.id, accountId: r.accountId, name: r.name, targetAmount: r.targetAmount, currentAmount: r.currentAmount,
        deadline: dIso(r.deadline), interestType: r.interestType, interestValue: r.interestValue,
        interestFrequencyDays: r.interestFrequencyDays, lastInterestApplied: dIso(r.lastInterestApplied),
        totalInterestEarned: r.totalInterestEarned ?? 0, contributionAmount: r.contributionAmount,
        contributionFrequencyDays: r.contributionFrequencyDays, notes: r.notes,
        createdAt: dIso(r.createdAt) ?? nowIso(), updatedAt: dIso(r.updatedAt) ?? nowIso(),
      })), ['id','accountId','name','targetAmount','currentAmount','deadline','interestType','interestValue','interestFrequencyDays','lastInterestApplied','totalInterestEarned','contributionAmount','contributionFrequencyDays','notes','createdAt','updatedAt'])
      insertAll('SavingsSnapshot', (backup.savingsSnapshots ?? []).map(r => ({ id: r.id, goalId: r.goalId, amount: r.amount, note: r.note, date: dIso(r.date) ?? nowIso() })), ['id','goalId','amount','note','date'])
      insertAll('Investment',      (backup.investments      ?? []).map(r => ({
        id: r.id, name: r.name, typeId: r.typeId, brokerId: r.brokerId, amountIn: r.amountIn,
        currentValue: r.currentValue, currency: r.currency ?? 'EUR', ticker: r.ticker, isin: r.isin,
        shares: r.shares, lastPriceFetched: r.lastPriceFetched, priceUpdatedAt: dIso(r.priceUpdatedAt),
        notes: r.notes, createdAt: dIso(r.createdAt) ?? nowIso(), updatedAt: dIso(r.updatedAt) ?? nowIso(),
      })), ['id','name','typeId','brokerId','amountIn','currentValue','currency','ticker','isin','shares','lastPriceFetched','priceUpdatedAt','notes','createdAt','updatedAt'])
      insertAll('InvestmentLot',   (backup.investmentLots   ?? []).map(r => ({
        id: r.id, investmentId: r.investmentId, type: r.type ?? 'BUY', date: dIso(r.date) ?? nowIso(),
        shares: r.shares, pricePerShare: r.pricePerShare, totalCost: r.totalCost, realizedGain: r.realizedGain,
        notes: r.notes, createdAt: dIso(r.createdAt) ?? nowIso(),
      })), ['id','investmentId','type','date','shares','pricePerShare','totalCost','realizedGain','notes','createdAt'])
      insertAll('PriceHistory',    (backup.priceHistory     ?? []).map(r => ({ id: r.id, investmentId: r.investmentId, price: r.price, value: r.value, recordedAt: dIso(r.recordedAt) ?? nowIso() })), ['id','investmentId','price','value','recordedAt'])
      insertAll('RecurringBill',   (backup.recurringBills   ?? []).map(r => ({
        id: r.id, name: r.name, amount: r.amount, frequency: r.frequency, nextDueDate: dIso(r.nextDueDate) ?? nowIso(),
        categoryId: r.categoryId, accountId: r.accountId, notes: r.notes, isActive: intFromBool(r.isActive ?? true) ?? 1,
        createdAt: dIso(r.createdAt) ?? nowIso(), updatedAt: dIso(r.updatedAt) ?? nowIso(),
      })), ['id','name','amount','frequency','nextDueDate','categoryId','accountId','notes','isActive','createdAt','updatedAt'])
      insertAll('RecurringIncome', (backup.recurringIncome  ?? []).map(r => ({
        id: r.id, name: r.name, amount: r.amount, frequency: r.frequency, nextExpectedDate: dIso(r.nextExpectedDate) ?? nowIso(),
        categoryId: r.categoryId, accountId: r.accountId, notes: r.notes, isActive: intFromBool(r.isActive ?? true) ?? 1,
        createdAt: dIso(r.createdAt) ?? nowIso(), updatedAt: dIso(r.updatedAt) ?? nowIso(),
      })), ['id','name','amount','frequency','nextExpectedDate','categoryId','accountId','notes','isActive','createdAt','updatedAt'])
      insertAll('Transaction',     (backup.transactions     ?? []).map(r => ({
        id: r.id, accountId: r.accountId, categoryId: r.categoryId, recurringBillId: r.recurringBillId,
        date: dIso(r.date) ?? nowIso(), valueDate: dIso(r.valueDate), description: r.description,
        amount: r.amount, type: r.type, runningBalance: r.runningBalance, importHash: r.importHash,
        notes: r.notes, createdAt: dIso(r.createdAt) ?? nowIso(),
      })), ['id','accountId','categoryId','recurringBillId','date','valueDate','description','amount','type','runningBalance','importHash','notes','createdAt'])
      insertAll('TransactionTag',  (backup.transactionTags  ?? []).map(r => ({ transactionId: r.transactionId, tagId: r.tagId })), ['transactionId','tagId'])
      insertAll('TransactionSplit',(backup.transactionSplits?? []).map(r => ({ id: r.id, transactionId: r.transactionId, categoryId: r.categoryId, amount: r.amount, notes: r.notes })), ['id','transactionId','categoryId','amount','notes'])
      insertAll('BalanceCorrection',(backup.balanceCorrections ?? []).map(r => ({ id: r.id, accountId: r.accountId, oldBalance: r.oldBalance, newBalance: r.newBalance, note: r.note, createdAt: dIso(r.createdAt) ?? nowIso() })), ['id','accountId','oldBalance','newBalance','note','createdAt'])
      insertAll('Debt',            (backup.debts            ?? []).map(r => ({
        id: r.id, name: r.name, type: r.type, counterparty: r.counterparty, principal: r.principal,
        outstanding: r.outstanding, interestRate: r.interestRate, frequency: r.frequency,
        nextPaymentDate: dIso(r.nextPaymentDate), startDate: dIso(r.startDate) ?? nowIso(), endDate: dIso(r.endDate),
        status: r.status ?? 'ACTIVE', accountId: r.accountId, notes: r.notes,
        createdAt: dIso(r.createdAt) ?? nowIso(), updatedAt: dIso(r.updatedAt) ?? nowIso(),
      })), ['id','name','type','counterparty','principal','outstanding','interestRate','frequency','nextPaymentDate','startDate','endDate','status','accountId','notes','createdAt','updatedAt'])
      insertAll('DebtPayment',     (backup.debtPayments     ?? []).map(r => ({ id: r.id, debtId: r.debtId, date: dIso(r.date) ?? nowIso(), amount: r.amount, principal: r.principal, interest: r.interest, notes: r.notes, createdAt: dIso(r.createdAt) ?? nowIso() })), ['id','debtId','date','amount','principal','interest','notes','createdAt'])
      insertAll('ImportHistory',   (backup.importHistory    ?? []).map(r => ({ id: r.id, filename: r.filename, format: r.format, accountId: r.accountId, imported: r.imported, skipped: r.skipped, errors: r.errors ?? 0, importedAt: dIso(r.importedAt) ?? nowIso() })), ['id','filename','format','accountId','imported','skipped','errors','importedAt'])
    })
    restore()

    return { transactions: backup.transactions?.length ?? 0 }
  })

  // ── DB health check ────────────────────────────────────────────────────────
  ipcMain.handle('db:ping', () => {
    db.prepare(`SELECT COUNT(*) AS c FROM "Account"`).get()
    return true
  })

  // ── Shortcuts ──────────────────────────────────────────────────────────────
  const shortcutsPath = path.join(app.getPath('userData'), 'shortcuts.json')

  ipcMain.handle('shortcuts:load', async () => {
    try {
      return JSON.parse(await readFile(shortcutsPath, 'utf8'))
    } catch {
      return null
    }
  })

  ipcMain.handle('shortcuts:save', async (_event, config: unknown) => {
    try {
      await writeFile(shortcutsPath, JSON.stringify(config, null, 2), 'utf8')
      return true
    } catch (e: any) {
      throw new Error(`Failed to save shortcuts: ${e.message}`)
    }
  })

  // ── File dialog ────────────────────────────────────────────────────────────
  ipcMain.handle('dialog:openCSV', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select bank statement',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile'],
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('dialog:openJSON', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select backup file',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    return canceled ? null : filePaths[0]
  })

  // ── CSV import ─────────────────────────────────────────────────────────────
  function logImport(
    filePath: string,
    format: string,
    accountId: number,
    result: { imported: number; skipped: number; errors: string[] },
  ) {
    try {
      db.prepare(`
        INSERT INTO "ImportHistory" (filename, format, accountId, imported, skipped, errors, importedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        filePath.split(/[/\\]/).pop() ?? filePath,
        format,
        accountId,
        result.imported,
        result.skipped,
        result.errors.length,
        nowIso(),
      )
    } catch (e) {
      console.error('Failed to log import history:', e)
    }
  }

  ipcMain.handle('import:millenniumCSV', async (_event, filePath: string, accountId: number) => {
    const rules = db.prepare(`SELECT id, pattern, categoryId FROM "CategoryRule"`).all() as Array<{ id: number; pattern: string; categoryId: number }>
    const result = await importMillenniumCSV(filePath, accountId, rules)
    logImport(filePath, 'millennium', accountId, result)
    return result
  })

  ipcMain.handle('import:revolut', async (_event, filePath: string, accountId: number) => {
    const rules = db.prepare(`SELECT id, pattern, categoryId FROM "CategoryRule"`).all() as Array<{ id: number; pattern: string; categoryId: number }>
    const result = await importRevolutCSV(filePath, accountId, rules)
    logImport(filePath, 'revolut', accountId, result)
    return result
  })

  ipcMain.handle('import:listHistory', () => {
    const rows = db.prepare(`
      SELECT ih.*, ${accountSelect}
      FROM "ImportHistory" ih
      LEFT JOIN "Account" a ON a.id = ih.accountId
      ${accountJoins}
      ORDER BY ih.importedAt DESC
      LIMIT 50
    `).all() as any[]
    return rows.map(r => ({
      id: r.id, filename: r.filename, format: r.format, accountId: r.accountId,
      imported: r.imported, skipped: r.skipped, errors: r.errors, importedAt: r.importedAt,
      account: r.accountId == null ? null : hydrateAccount(r),
    }))
  })

  ipcMain.handle('import:deleteHistory', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "ImportHistory" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "ImportHistory" WHERE id = ?`).run(id)
    return row
  })

  // ── Brokers ────────────────────────────────────────────────────────────────
  ipcMain.handle('brokers:list', () => {
    return db.prepare(`SELECT * FROM "Broker" ORDER BY name ASC`).all()
  })

  ipcMain.handle('brokers:create', (_event, data: { name: string; color?: string | null; icon?: string | null }) => {
    const info = db.prepare(`INSERT INTO "Broker" (name, color, icon) VALUES (?, ?, ?)`).run(data.name, data.color ?? null, data.icon ?? null)
    return db.prepare(`SELECT * FROM "Broker" WHERE id = ?`).get(info.lastInsertRowid)
  })

  ipcMain.handle('brokers:update', (_event, id: number, data: { name?: string; color?: string | null; icon?: string | null }) => {
    const { sql, params } = buildUpdate(data)
    if (sql) db.prepare(`UPDATE "Broker" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return db.prepare(`SELECT * FROM "Broker" WHERE id = ?`).get(id)
  })

  ipcMain.handle('brokers:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "Broker" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "Broker" WHERE id = ?`).run(id)
    return row
  })

  // ── Investment lots ────────────────────────────────────────────────────────
  function syncInvestmentTotals(investmentId: number) {
    const lots = db.prepare(`SELECT * FROM "InvestmentLot" WHERE investmentId = ?`).all(investmentId)
    const { shares, amountIn } = calcInvestmentTotals(lots as any)
    db.prepare(`UPDATE "Investment" SET shares = ?, amountIn = ?, updatedAt = ? WHERE id = ?`).run(shares, amountIn, nowIso(), investmentId)
  }

  ipcMain.handle('lots:list', (_event, investmentId: number) => {
    return db.prepare(`SELECT * FROM "InvestmentLot" WHERE investmentId = ? ORDER BY date ASC`).all(investmentId)
  })

  ipcMain.handle('lots:create', (_event, data: {
    investmentId: number
    date: string
    shares: number
    pricePerShare: number
    notes?: string | null
  }) => {
    const totalCost = Math.round(data.shares * data.pricePerShare * 100) / 100
    const result = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO "InvestmentLot" (investmentId, type, date, shares, pricePerShare, totalCost, notes)
        VALUES (?, 'BUY', ?, ?, ?, ?, ?)
      `).run(data.investmentId, requireIso(data.date), data.shares, data.pricePerShare, totalCost, data.notes ?? null)
      syncInvestmentTotals(data.investmentId)
      return db.prepare(`SELECT * FROM "InvestmentLot" WHERE id = ?`).get(info.lastInsertRowid)
    })()
    return result
  })

  ipcMain.handle('lots:createSell', (_event, data: {
    investmentId: number
    date: string
    shares: number
    pricePerShare: number
    notes?: string | null
  }) => {
    const result = db.transaction(() => {
      const existing = db.prepare(`SELECT * FROM "InvestmentLot" WHERE investmentId = ?`).all(data.investmentId) as any[]
      const buys  = existing.filter(l => l.type === 'BUY')
      const sells = existing.filter(l => l.type === 'SELL')
      const totalBuyShares  = buys.reduce((s, l) => s + Number(l.shares), 0)
      const totalSellShares = sells.reduce((s, l) => s + Number(l.shares), 0)
      const remainingShares = totalBuyShares - totalSellShares

      if (data.shares > remainingShares) {
        throw new Error(
          `Cannot sell ${data.shares} shares — only ${parseFloat(remainingShares.toFixed(6))} remaining`,
        )
      }

      const totalBuyCost    = buys.reduce((s, l) => s + Number(l.totalCost), 0)
      const avgCostPerShare = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0
      const proceeds        = Math.round(data.shares * data.pricePerShare * 100) / 100
      const costBasis       = Math.round(data.shares * avgCostPerShare * 100) / 100
      const realizedGain    = Math.round((proceeds - costBasis) * 100) / 100

      const info = db.prepare(`
        INSERT INTO "InvestmentLot" (investmentId, type, date, shares, pricePerShare, totalCost, realizedGain, notes)
        VALUES (?, 'SELL', ?, ?, ?, ?, ?, ?)
      `).run(data.investmentId, requireIso(data.date), data.shares, data.pricePerShare, proceeds, realizedGain, data.notes ?? null)
      syncInvestmentTotals(data.investmentId)
      return db.prepare(`SELECT * FROM "InvestmentLot" WHERE id = ?`).get(info.lastInsertRowid)
    })()
    return result
  })

  ipcMain.handle('lots:delete', (_event, id: number) => {
    const result = db.transaction(() => {
      const lot = db.prepare(`SELECT * FROM "InvestmentLot" WHERE id = ?`).get(id) as any
      if (!lot) throw new Error(`Lot ${id} not found`)
      db.prepare(`DELETE FROM "InvestmentLot" WHERE id = ?`).run(id)
      syncInvestmentTotals(lot.investmentId)
      return lot
    })()
    return result
  })

  // ── Investment types ───────────────────────────────────────────────────────
  ipcMain.handle('investmentTypes:list', () => {
    return db.prepare(`SELECT * FROM "InvestmentType" ORDER BY name ASC`).all()
  })

  ipcMain.handle('investmentTypes:create', (_event, data: { name: string; color?: string | null; icon?: string | null }) => {
    const info = db.prepare(`INSERT INTO "InvestmentType" (name, color, icon) VALUES (?, ?, ?)`).run(data.name, data.color ?? null, data.icon ?? null)
    return db.prepare(`SELECT * FROM "InvestmentType" WHERE id = ?`).get(info.lastInsertRowid)
  })

  ipcMain.handle('investmentTypes:update', (_event, id: number, data: { name?: string; color?: string | null; icon?: string | null }) => {
    const { sql, params } = buildUpdate(data)
    if (sql) db.prepare(`UPDATE "InvestmentType" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return db.prepare(`SELECT * FROM "InvestmentType" WHERE id = ?`).get(id)
  })

  ipcMain.handle('investmentTypes:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "InvestmentType" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "InvestmentType" WHERE id = ?`).run(id)
    return row
  })

  // ── Investments ────────────────────────────────────────────────────────────
  ipcMain.handle('investments:list', () => {
    const rows = db.prepare(`SELECT ${investmentSelect} FROM "Investment" i ${investmentJoins} ORDER BY i.createdAt ASC`).all() as any[]
    return rows.map(hydrateInvestment)
  })

  ipcMain.handle('investments:create', (_event, data: any) => {
    const now = nowIso()
    const info = db.prepare(`
      INSERT INTO "Investment" (name, typeId, brokerId, amountIn, currentValue, currency, isin, ticker, shares, lastPriceFetched, priceUpdatedAt, notes, createdAt, updatedAt)
      VALUES (@name, @typeId, @brokerId, @amountIn, @currentValue, @currency, @isin, @ticker, @shares, @lastPriceFetched, @priceUpdatedAt, @notes, @createdAt, @updatedAt)
    `).run({
      name: data.name,
      typeId: data.typeId,
      brokerId: data.brokerId ?? null,
      amountIn: data.amountIn,
      currentValue: data.currentValue,
      currency: data.currency ?? 'EUR',
      isin: data.isin ?? null,
      ticker: data.ticker ?? null,
      shares: data.shares ?? null,
      lastPriceFetched: data.lastPriceFetched ?? null,
      priceUpdatedAt: toIso(data.priceUpdatedAt),
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    return getInvestmentFull(Number(info.lastInsertRowid))
  })

  ipcMain.handle('investments:update', (_event, id: number, data: any) => {
    const allowed = ['name','typeId','brokerId','amountIn','currentValue','currency','isin','ticker','shares','lastPriceFetched','priceUpdatedAt','notes']
    const fields: Record<string, unknown> = {}
    for (const k of allowed) {
      if (data[k] !== undefined) {
        fields[k] = (k === 'priceUpdatedAt') ? toIso(data[k]) : data[k]
      }
    }
    const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
    db.prepare(`UPDATE "Investment" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return getInvestmentFull(id)
  })

  ipcMain.handle('investments:priceHistory', () => {
    const since = new Date(); since.setUTCFullYear(since.getUTCFullYear() - 2)
    const rows = db.prepare(`
      SELECT recordedAt, value FROM "PriceHistory"
      WHERE recordedAt >= ?
      ORDER BY recordedAt ASC
    `).all(since.toISOString()) as Array<{ recordedAt: string; value: number }>
    const byDate = new Map<string, number>()
    for (const h of rows) {
      const date = new Date(h.recordedAt).toISOString().slice(0, 10)
      byDate.set(date, (byDate.get(date) ?? 0) + Number(h.value))
    }
    return [...byDate.entries()].map(([date, value]) => ({ date, value }))
  })

  ipcMain.handle('investments:priceHistoryById', (_event, id: number) => {
    const since = new Date(); since.setUTCFullYear(since.getUTCFullYear() - 2)
    const rows = db.prepare(`
      SELECT recordedAt, price, value FROM "PriceHistory"
      WHERE investmentId = ? AND recordedAt >= ?
      ORDER BY recordedAt ASC
    `).all(id, since.toISOString()) as Array<{ recordedAt: string; price: number; value: number }>
    return rows.map(h => ({
      date: new Date(h.recordedAt).toISOString().slice(0, 10),
      price: Number(h.price),
      value: Number(h.value),
    }))
  })

  ipcMain.handle('investments:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "Investment" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "Investment" WHERE id = ?`).run(id)
    return row
  })

  ipcMain.handle('investments:lookupISIN', async (_event, isin: string) => {
    return lookupISIN(isin)
  })

  ipcMain.handle('investments:refreshPrice', async (_event, id: number) => {
    const inv = db.prepare(`SELECT * FROM "Investment" WHERE id = ?`).get(id) as any
    if (!inv) throw new Error(`Investment ${id} not found`)
    if (!inv.ticker) throw new Error('No ticker symbol set for this investment')
    if (inv.shares === null) {
      throw new Error(`${inv.ticker}: shares not set — add a buy lot before refreshing the price`)
    }
    const result = await fetchPrice(inv.ticker)

    let rate: number
    if (result.currency === 'EUR') {
      rate = 1
    } else {
      try {
        rate = await fetchExchangeRate(result.currency)
      } catch (rateErr) {
        const cached = db.prepare(`SELECT rate FROM "ExchangeRate" WHERE fromCurrency = ?`).get(result.currency) as { rate: number } | undefined
        if (cached) {
          rate = Number(cached.rate)
        } else {
          throw new Error(`Cannot convert ${result.currency} to EUR: ${(rateErr as Error).message}`)
        }
      }
    }

    const priceInEUR = result.price * rate
    const shares = Number(inv.shares)
    const newValue = priceInEUR * shares
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    const todayIso = today.toISOString()
    const now = nowIso()

    db.transaction(() => {
      if (result.currency !== 'EUR') {
        db.prepare(`
          INSERT INTO "ExchangeRate" (fromCurrency, rate, updatedAt) VALUES (?, ?, ?)
          ON CONFLICT(fromCurrency) DO UPDATE SET rate = excluded.rate, updatedAt = excluded.updatedAt
        `).run(result.currency, rate, now)
      }
      db.prepare(`
        INSERT INTO "PriceHistory" (investmentId, price, value, recordedAt)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(investmentId, recordedAt) DO UPDATE SET price = excluded.price, value = excluded.value
      `).run(id, priceInEUR, newValue, todayIso)
      db.prepare(`
        UPDATE "Investment"
        SET currentValue = ?, lastPriceFetched = ?, priceUpdatedAt = ?, updatedAt = ?
        WHERE id = ?
      `).run(newValue, priceInEUR, now, now, id)
    })()

    return getInvestmentFull(id)
  })

  ipcMain.handle('exchangeRates:list', () => {
    return db.prepare(`SELECT * FROM "ExchangeRate" ORDER BY fromCurrency ASC`).all()
  })

  ipcMain.handle('investments:refreshAll', async () => {
    const result = await refreshAllPrices()
    return { updated: result.updated, errors: result.errors }
  })

  ipcMain.handle('investments:lastRefresh', () => {
    const ts = getLastRefresh()
    return ts ? ts.toISOString() : null
  })

  // ── App settings ───────────────────────────────────────────────────────────
  ipcMain.handle('appSettings:load', () => loadAppSettings())

  ipcMain.handle('appSettings:save', async (_event, patch: Partial<{ priceRefreshInterval: RefreshInterval }>) => {
    const updated = await saveAppSettings(patch)
    if (patch.priceRefreshInterval !== undefined) {
      startScheduler(patch.priceRefreshInterval)
    }
    return updated
  })

  // ── Banks ──────────────────────────────────────────────────────────────────
  ipcMain.handle('banks:list', () => db.prepare(`SELECT * FROM "Bank" ORDER BY name ASC`).all())

  ipcMain.handle('banks:create', (_event, data: { name: string; color?: string | null; icon?: string | null }) => {
    const info = db.prepare(`INSERT INTO "Bank" (name, color, icon) VALUES (?, ?, ?)`).run(data.name, data.color ?? null, data.icon ?? null)
    return db.prepare(`SELECT * FROM "Bank" WHERE id = ?`).get(info.lastInsertRowid)
  })

  ipcMain.handle('banks:update', (_event, id: number, data: { name?: string; color?: string | null; icon?: string | null }) => {
    const { sql, params } = buildUpdate(data)
    if (sql) db.prepare(`UPDATE "Bank" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return db.prepare(`SELECT * FROM "Bank" WHERE id = ?`).get(id)
  })

  ipcMain.handle('banks:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "Bank" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "Bank" WHERE id = ?`).run(id)
    return row
  })

  // ── Account types ──────────────────────────────────────────────────────────
  ipcMain.handle('accountTypes:list', () => db.prepare(`SELECT * FROM "AccountType" ORDER BY name ASC`).all())

  ipcMain.handle('accountTypes:create', (_event, data: { name: string; color?: string | null; icon?: string | null }) => {
    const info = db.prepare(`INSERT INTO "AccountType" (name, color, icon) VALUES (?, ?, ?)`).run(data.name, data.color ?? null, data.icon ?? null)
    return db.prepare(`SELECT * FROM "AccountType" WHERE id = ?`).get(info.lastInsertRowid)
  })

  ipcMain.handle('accountTypes:update', (_event, id: number, data: { name?: string; color?: string | null; icon?: string | null }) => {
    const { sql, params } = buildUpdate(data)
    if (sql) db.prepare(`UPDATE "AccountType" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return db.prepare(`SELECT * FROM "AccountType" WHERE id = ?`).get(id)
  })

  ipcMain.handle('accountTypes:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "AccountType" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "AccountType" WHERE id = ?`).run(id)
    return row
  })

  // ── Accounts ───────────────────────────────────────────────────────────────
  ipcMain.handle('accounts:list', () => {
    const rows = db.prepare(`SELECT ${accountSelect} FROM "Account" a ${accountJoins} ORDER BY a.name ASC`).all() as any[]
    return rows.map(hydrateAccount)
  })

  ipcMain.handle('accounts:create', (_event, data: any) => {
    const now = nowIso()
    const info = db.prepare(`
      INSERT INTO "Account" (name, bankId, accountNumber, typeId, balance, currency, createdAt, updatedAt)
      VALUES (@name, @bankId, @accountNumber, @typeId, @balance, @currency, @createdAt, @updatedAt)
    `).run({
      name: data.name,
      bankId: data.bankId,
      accountNumber: data.accountNumber ?? null,
      typeId: data.typeId,
      balance: data.balance ?? 0,
      currency: data.currency ?? 'EUR',
      createdAt: now,
      updatedAt: now,
    })
    return getAccountFull(Number(info.lastInsertRowid))
  })

  ipcMain.handle('accounts:update', (_event, id: number, data: any) => {
    const { _note, ...rest } = data
    return db.transaction(() => {
      if (rest.balance !== undefined) {
        const current = db.prepare(`SELECT balance FROM "Account" WHERE id = ?`).get(id) as { balance: number } | undefined
        if (!current) throw new Error(`Account ${id} not found`)
        if (Number(current.balance) !== Number(rest.balance)) {
          db.prepare(`
            INSERT INTO "BalanceCorrection" (accountId, oldBalance, newBalance, note, createdAt)
            VALUES (?, ?, ?, ?, ?)
          `).run(id, Number(current.balance), Number(rest.balance), _note ?? null, nowIso())
        }
      }
      const allowed = ['name','bankId','accountNumber','typeId','balance','currency']
      const fields: Record<string, unknown> = {}
      for (const k of allowed) if (rest[k] !== undefined) fields[k] = rest[k]
      const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
      db.prepare(`UPDATE "Account" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })

      if (rest.name) {
        db.prepare(`UPDATE "SavingsGoal" SET name = ?, updatedAt = ? WHERE accountId = ?`).run(rest.name, nowIso(), id)
      }
      return getAccountFull(id)
    })()
  })

  ipcMain.handle('accounts:corrections', (_event, accountId: number) => {
    return db.prepare(`
      SELECT * FROM "BalanceCorrection"
      WHERE accountId = ?
      ORDER BY createdAt DESC
      LIMIT 20
    `).all(accountId)
  })

  ipcMain.handle('accounts:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "Account" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "Account" WHERE id = ?`).run(id)
    return row
  })

  // ── Transactions ───────────────────────────────────────────────────────────
  ipcMain.handle('transactions:list', (_event, accountId?: number) => {
    const where = accountId != null ? `WHERE t.accountId = ?` : ''
    const params = accountId != null ? [accountId] : []
    const rows = db.prepare(`
      SELECT t.*, ${categoryJoinSelect}
      FROM "Transaction" t
      LEFT JOIN "Category" c ON c.id = t.categoryId
      ${where}
      ORDER BY t.date DESC
    `).all(...params) as any[]
    return rows.map(r => hydrateTransaction(r))
  })

  ipcMain.handle('transactions:listPaged', (_event, opts: {
    accountId?: number; take: number; skip: number
  }) => {
    const where = opts.accountId != null ? `WHERE t.accountId = ?` : ''
    const baseParams = opts.accountId != null ? [opts.accountId] : []
    const rows = db.prepare(`
      SELECT t.*, ${categoryJoinSelect}
      FROM "Transaction" t
      LEFT JOIN "Category" c ON c.id = t.categoryId
      ${where}
      ORDER BY t.date DESC
      LIMIT ? OFFSET ?
    `).all(...baseParams, opts.take, opts.skip) as any[]
    const total = (db.prepare(`
      SELECT COUNT(*) AS c FROM "Transaction" t ${where}
    `).get(...baseParams) as { c: number }).c
    const transactions = rows.map(r => hydrateTransaction(r, { includeTagsAndSplits: true }))
    return { transactions, total }
  })

  ipcMain.handle('transactions:bulkCategorise', (_event, ids: number[], categoryId: number | null) => {
    if (ids.length === 0) return { updated: 0 }
    const placeholders = ids.map(() => '?').join(',')
    const info = db.prepare(`UPDATE "Transaction" SET categoryId = ? WHERE id IN (${placeholders})`).run(categoryId, ...ids)
    return { updated: info.changes }
  })

  ipcMain.handle('transactions:getSplits', (_event, transactionId: number) => {
    const rows = db.prepare(`
      SELECT s.*, ${categoryJoinSelect}
      FROM "TransactionSplit" s
      LEFT JOIN "Category" c ON c.id = s.categoryId
      WHERE s.transactionId = ?
      ORDER BY s.id ASC
    `).all(transactionId) as any[]
    return rows.map(s => ({
      id: s.id, transactionId: s.transactionId, categoryId: s.categoryId,
      amount: s.amount, notes: s.notes, category: hydrateCategory('cat', s),
    }))
  })

  ipcMain.handle('transactions:setSplits', (_event, transactionId: number, splits: Array<{ categoryId: number | null; amount: number; notes?: string | null }>) => {
    return db.transaction(() => {
      db.prepare(`DELETE FROM "TransactionSplit" WHERE transactionId = ?`).run(transactionId)
      const stmt = db.prepare(`INSERT INTO "TransactionSplit" (transactionId, categoryId, amount, notes) VALUES (?, ?, ?, ?)`)
      for (const s of splits) {
        stmt.run(transactionId, s.categoryId ?? null, s.amount, s.notes ?? null)
      }
      return getTransactionFull(transactionId)
    })()
  })

  ipcMain.handle('transactions:update', (_event, id: number, data: {
    date?: string
    description?: string
    amount?: number
    type?: 'CREDIT' | 'DEBIT'
    notes?: string
  }) => {
    const current = db.prepare(`SELECT * FROM "Transaction" WHERE id = ?`).get(id) as any
    if (!current) throw new Error(`Transaction ${id} not found`)
    const updateData: Record<string, unknown> = {}
    if (data.date !== undefined) updateData.date = requireIso(data.date)
    if (data.description !== undefined) updateData.description = data.description.trim()
    if (data.notes !== undefined) updateData.notes = data.notes || null

    if (data.amount !== undefined || data.type !== undefined) {
      const newType = (data.type ?? current.type) as 'CREDIT' | 'DEBIT'
      const newAbs  = Math.abs(data.amount ?? Math.abs(Number(current.amount)))
      const balanceDelta = computeBalanceDelta(Number(current.amount), newType, newAbs)
      updateData.amount = toStoredAmount(newAbs, newType)
      updateData.type   = newType

      db.transaction(() => {
        const { sql, params } = buildUpdate(updateData)
        if (sql) db.prepare(`UPDATE "Transaction" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
        db.prepare(`UPDATE "Account" SET balance = balance + ?, updatedAt = ? WHERE id = ?`).run(balanceDelta, nowIso(), current.accountId)
      })()
      return getTransactionFull(id)
    }

    const { sql, params } = buildUpdate(updateData)
    if (sql) db.prepare(`UPDATE "Transaction" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return getTransactionFull(id)
  })

  ipcMain.handle('transactions:categorise', (_event, id: number, categoryId: number | null) => {
    db.prepare(`UPDATE "Transaction" SET categoryId = ? WHERE id = ?`).run(categoryId, id)
    return getTransactionFull(id)
  })

  // ── Tags ───────────────────────────────────────────────────────────────────
  ipcMain.handle('tags:list', () => db.prepare(`SELECT * FROM "Tag" ORDER BY name ASC`).all())

  ipcMain.handle('tags:create', (_event, data: { name: string; color?: string | null }) => {
    const name = data.name.trim().toLowerCase()
    const existing = db.prepare(`SELECT * FROM "Tag" WHERE name = ?`).get(name)
    if (existing) return existing
    const info = db.prepare(`INSERT INTO "Tag" (name, color) VALUES (?, ?)`).run(name, data.color ?? null)
    return db.prepare(`SELECT * FROM "Tag" WHERE id = ?`).get(info.lastInsertRowid)
  })

  ipcMain.handle('tags:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "Tag" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "Tag" WHERE id = ?`).run(id)
    return row
  })

  ipcMain.handle('tags:addToTransaction', (_event, transactionId: number, tagId: number) => {
    db.prepare(`INSERT OR IGNORE INTO "TransactionTag" (transactionId, tagId) VALUES (?, ?)`).run(transactionId, tagId)
    return getTransactionFull(transactionId)
  })

  ipcMain.handle('tags:removeFromTransaction', (_event, transactionId: number, tagId: number) => {
    db.prepare(`DELETE FROM "TransactionTag" WHERE transactionId = ? AND tagId = ?`).run(transactionId, tagId)
    return getTransactionFull(transactionId)
  })

  ipcMain.handle('transactions:create', (_event, data: {
    accountId: number
    date: string
    description: string
    amount: number
    type: 'CREDIT' | 'DEBIT'
    categoryId?: number | null
    notes?: string
  }) => {
    const absAmount = Math.abs(data.amount)
    const storedAmount = data.type === 'DEBIT' ? -absAmount : absAmount
    const result = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO "Transaction" (accountId, categoryId, date, description, amount, type, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(data.accountId, data.categoryId ?? null, requireIso(data.date), data.description.trim(), storedAmount, data.type, data.notes ?? null)
      db.prepare(`UPDATE "Account" SET balance = balance + ?, updatedAt = ? WHERE id = ?`).run(storedAmount, nowIso(), data.accountId)
      return getTransactionFull(Number(info.lastInsertRowid))
    })()
    return result
  })

  ipcMain.handle('transactions:delete', (_event, id: number) => {
    const result = db.transaction(() => {
      const tx = db.prepare(`SELECT * FROM "Transaction" WHERE id = ?`).get(id) as any
      if (!tx) throw new Error(`Transaction ${id} not found`)
      db.prepare(`DELETE FROM "Transaction" WHERE id = ?`).run(id)
      db.prepare(`UPDATE "Account" SET balance = balance - ?, updatedAt = ? WHERE id = ?`).run(Number(tx.amount), nowIso(), tx.accountId)
      return tx
    })()
    return result
  })

  ipcMain.handle('transactions:transfer', (_event, data: {
    fromAccountId: number
    toAccountId: number
    amount: number
    date: string
    description: string
    categoryId?: number | null
  }) => {
    const abs = Math.abs(data.amount)
    const desc = data.description.trim() || 'Transfer'
    const result = db.transaction(() => {
      const dateIso = requireIso(data.date)
      const debitInfo = db.prepare(`
        INSERT INTO "Transaction" (accountId, categoryId, date, description, amount, type)
        VALUES (?, ?, ?, ?, ?, 'DEBIT')
      `).run(data.fromAccountId, data.categoryId ?? null, dateIso, desc, -abs)
      const creditInfo = db.prepare(`
        INSERT INTO "Transaction" (accountId, categoryId, date, description, amount, type)
        VALUES (?, ?, ?, ?, ?, 'CREDIT')
      `).run(data.toAccountId, data.categoryId ?? null, dateIso, desc, abs)
      db.prepare(`UPDATE "Account" SET balance = balance - ?, updatedAt = ? WHERE id = ?`).run(abs, nowIso(), data.fromAccountId)
      db.prepare(`UPDATE "Account" SET balance = balance + ?, updatedAt = ? WHERE id = ?`).run(abs, nowIso(), data.toAccountId)
      return {
        debit:  getTransactionFull(Number(debitInfo.lastInsertRowid)),
        credit: getTransactionFull(Number(creditInfo.lastInsertRowid)),
      }
    })()
    return result
  })

  // ── Savings goals ──────────────────────────────────────────────────────────
  ipcMain.handle('savings:list', () => {
    const rows = db.prepare(`SELECT * FROM "SavingsGoal" ORDER BY createdAt ASC`).all() as any[]
    return rows.map(hydrateSavingsGoal)
  })

  ipcMain.handle('savings:sync', () => {
    // Auto-create a savings goal for every savings-type account that doesn't have one yet.
    const savingsAccounts = db.prepare(`
      SELECT a.* FROM "Account" a
      JOIN "AccountType" t ON t.id = a.typeId
      WHERE t.name = 'Savings'
    `).all() as any[]

    for (const acc of savingsAccounts) {
      db.transaction(() => {
        const existing = db.prepare(`SELECT id FROM "SavingsGoal" WHERE accountId = ?`).get(acc.id)
        if (existing) return
        const currentAmount = Number(acc.balance)
        const now = nowIso()
        const info = db.prepare(`
          INSERT INTO "SavingsGoal" (name, accountId, targetAmount, currentAmount, createdAt, updatedAt)
          VALUES (?, ?, 0, ?, ?, ?)
        `).run(acc.name, acc.id, currentAmount, now, now)
        if (currentAmount > 0) {
          db.prepare(`INSERT INTO "SavingsSnapshot" (goalId, amount, note, date) VALUES (?, ?, 'initial', ?)`).run(info.lastInsertRowid, currentAmount, now)
        }
      })()
    }

    // Apply elapsed interest periods for goals that have interest configured.
    const interestGoals = db.prepare(`
      SELECT * FROM "SavingsGoal"
      WHERE interestType IS NOT NULL AND interestFrequencyDays IS NOT NULL
    `).all() as any[]

    for (const goal of interestGoals) {
      if (!goal.interestFrequencyDays || !goal.interestValue || !goal.interestType) continue
      const periods = elapsedPeriods({
        lastInterestApplied: goal.lastInterestApplied ? new Date(goal.lastInterestApplied) : null,
        interestFrequencyDays: goal.interestFrequencyDays,
        createdAt: new Date(goal.createdAt),
      })
      if (periods <= 0) continue
      const base = goal.lastInterestApplied ? new Date(goal.lastInterestApplied) : new Date(goal.createdAt)
      const newAmount = applyPeriods(
        Number(goal.currentAmount),
        goal.interestType as InterestType,
        Number(goal.interestValue),
        periods,
      )
      const newLastApplied = new Date(base.getTime() + periods * goal.interestFrequencyDays * 86_400_000)
      const earned = newAmount - Number(goal.currentAmount)
      db.transaction(() => {
        const now = nowIso()
        db.prepare(`
          UPDATE "SavingsGoal"
          SET currentAmount = ?, lastInterestApplied = ?, totalInterestEarned = ?, updatedAt = ?
          WHERE id = ?
        `).run(newAmount, newLastApplied.toISOString(), Number(goal.totalInterestEarned) + earned, now, goal.id)
        if (goal.accountId) {
          db.prepare(`UPDATE "Account" SET balance = ?, updatedAt = ? WHERE id = ?`).run(newAmount, now, goal.accountId)
        }
        db.prepare(`INSERT INTO "SavingsSnapshot" (goalId, amount, note, date) VALUES (?, ?, 'interest', ?)`).run(goal.id, newAmount, now)
      })()
    }
  })

  ipcMain.handle('savings:create', (_event, data: any) => {
    return db.transaction(() => {
      const now = nowIso()
      const info = db.prepare(`
        INSERT INTO "SavingsGoal" (accountId, name, targetAmount, currentAmount, deadline, interestType, interestValue, interestFrequencyDays, lastInterestApplied, totalInterestEarned, contributionAmount, contributionFrequencyDays, notes, createdAt, updatedAt)
        VALUES (@accountId, @name, @targetAmount, @currentAmount, @deadline, @interestType, @interestValue, @interestFrequencyDays, @lastInterestApplied, @totalInterestEarned, @contributionAmount, @contributionFrequencyDays, @notes, @createdAt, @updatedAt)
      `).run({
        accountId: data.accountId ?? null,
        name: data.name,
        targetAmount: data.targetAmount ?? 0,
        currentAmount: data.currentAmount ?? 0,
        deadline: toIso(data.deadline),
        interestType: data.interestType ?? null,
        interestValue: data.interestValue ?? null,
        interestFrequencyDays: data.interestFrequencyDays ?? null,
        lastInterestApplied: toIso(data.lastInterestApplied),
        totalInterestEarned: data.totalInterestEarned ?? 0,
        contributionAmount: data.contributionAmount ?? null,
        contributionFrequencyDays: data.contributionFrequencyDays ?? null,
        notes: data.notes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      const id = Number(info.lastInsertRowid)
      if (Number(data.currentAmount ?? 0) > 0) {
        db.prepare(`INSERT INTO "SavingsSnapshot" (goalId, amount, note, date) VALUES (?, ?, 'initial', ?)`).run(id, Number(data.currentAmount), now)
      }
      const row = db.prepare(`SELECT * FROM "SavingsGoal" WHERE id = ?`).get(id)
      return hydrateSavingsGoal(row)
    })()
  })

  ipcMain.handle('savings:update', (_event, id: number, data: any) => {
    return db.transaction(() => {
      const current = db.prepare(`SELECT * FROM "SavingsGoal" WHERE id = ?`).get(id) as any
      if (!current) throw new Error(`SavingsGoal ${id} not found`)
      const allowed = ['accountId','name','targetAmount','currentAmount','deadline','interestType','interestValue','interestFrequencyDays','lastInterestApplied','totalInterestEarned','contributionAmount','contributionFrequencyDays','notes']
      const fields: Record<string, unknown> = {}
      for (const k of allowed) {
        if (data[k] !== undefined) {
          fields[k] = (k === 'deadline' || k === 'lastInterestApplied') ? toIso(data[k]) : data[k]
        }
      }
      const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
      db.prepare(`UPDATE "SavingsGoal" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })

      if (data.currentAmount !== undefined && Number(data.currentAmount) !== Number(current.currentAmount)) {
        db.prepare(`INSERT INTO "SavingsSnapshot" (goalId, amount, note, date) VALUES (?, ?, 'update', ?)`).run(id, Number(data.currentAmount), nowIso())
      }
      const updated = db.prepare(`SELECT * FROM "SavingsGoal" WHERE id = ?`).get(id)
      return hydrateSavingsGoal(updated)
    })()
  })

  ipcMain.handle('savings:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "SavingsGoal" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "SavingsGoal" WHERE id = ?`).run(id)
    return row
  })

  ipcMain.handle('savings:history', (_event, goalId: number) => {
    const goal = db.prepare(`SELECT * FROM "SavingsGoal" WHERE id = ?`).get(goalId) as any
    if (!goal) throw new Error(`SavingsGoal ${goalId} not found`)
    const snapshots = db.prepare(`SELECT * FROM "SavingsSnapshot" WHERE goalId = ? ORDER BY date ASC`).all(goalId) as any[]

    const points = new Map<string, number>()
    for (const s of snapshots) {
      const date = new Date(s.date).toISOString().slice(0, 10)
      points.set(date, Number(s.amount))
    }

    if (goal.accountId) {
      const txns = db.prepare(`
        SELECT date, runningBalance FROM "Transaction"
        WHERE accountId = ? AND runningBalance IS NOT NULL
        ORDER BY date ASC
      `).all(goal.accountId) as Array<{ date: string; runningBalance: number }>
      for (const t of txns) {
        const date = new Date(t.date).toISOString().slice(0, 10)
        if (!points.has(date)) points.set(date, Number(t.runningBalance))
      }
    }

    return [...points.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount }))
  })

  ipcMain.handle('savings:applyInterest', (_event, id: number) => {
    const goal = db.prepare(`SELECT * FROM "SavingsGoal" WHERE id = ?`).get(id) as any
    if (!goal) throw new Error(`SavingsGoal ${id} not found`)
    if (!goal.interestType || goal.interestValue === null || !goal.interestFrequencyDays) {
      throw new Error('No interest configuration set for this goal')
    }
    const periods = elapsedPeriods({
      lastInterestApplied: goal.lastInterestApplied ? new Date(goal.lastInterestApplied) : null,
      interestFrequencyDays: goal.interestFrequencyDays,
      createdAt: new Date(goal.createdAt),
    })
    const effectivePeriods = Math.max(1, periods)
    const newAmount = applyPeriods(
      Number(goal.currentAmount),
      goal.interestType as InterestType,
      Number(goal.interestValue),
      effectivePeriods,
    )
    const base = goal.lastInterestApplied ? new Date(goal.lastInterestApplied) : new Date(goal.createdAt)
    const newLastApplied = new Date(base.getTime() + effectivePeriods * goal.interestFrequencyDays * 86_400_000)
    const earned = newAmount - Number(goal.currentAmount)

    db.transaction(() => {
      const now = nowIso()
      db.prepare(`
        UPDATE "SavingsGoal"
        SET currentAmount = ?, lastInterestApplied = ?, totalInterestEarned = ?, updatedAt = ?
        WHERE id = ?
      `).run(newAmount, newLastApplied.toISOString(), Number(goal.totalInterestEarned) + earned, now, id)
      if (goal.accountId) {
        db.prepare(`UPDATE "Account" SET balance = ?, updatedAt = ? WHERE id = ?`).run(newAmount, now, goal.accountId)
      }
      db.prepare(`INSERT INTO "SavingsSnapshot" (goalId, amount, note, date) VALUES (?, ?, 'interest', ?)`).run(id, newAmount, now)
    })()

    const updated = db.prepare(`SELECT * FROM "SavingsGoal" WHERE id = ?`).get(id)
    return hydrateSavingsGoal(updated)
  })

  // ── Recurring income ───────────────────────────────────────────────────────
  const incomeSelectJoin = `
    SELECT ri.*, ${categoryJoinSelect}
    FROM "RecurringIncome" ri
    LEFT JOIN "Category" c ON c.id = ri.categoryId
  `

  ipcMain.handle('income:list', () => {
    const rows = db.prepare(`${incomeSelectJoin} ORDER BY ri.nextExpectedDate ASC`).all() as any[]
    return rows.map(hydrateIncome)
  })

  ipcMain.handle('income:create', (_event, data: any) => {
    const now = nowIso()
    const info = db.prepare(`
      INSERT INTO "RecurringIncome" (name, amount, frequency, nextExpectedDate, categoryId, accountId, notes, isActive, createdAt, updatedAt)
      VALUES (@name, @amount, @frequency, @nextExpectedDate, @categoryId, @accountId, @notes, @isActive, @createdAt, @updatedAt)
    `).run({
      name: data.name,
      amount: data.amount,
      frequency: data.frequency,
      nextExpectedDate: requireIso(data.nextExpectedDate),
      categoryId: data.categoryId ?? null,
      accountId: data.accountId ?? null,
      notes: data.notes ?? null,
      isActive: intFromBool(data.isActive ?? true) ?? 1,
      createdAt: now,
      updatedAt: now,
    })
    const row = db.prepare(`${incomeSelectJoin} WHERE ri.id = ?`).get(info.lastInsertRowid) as any
    return hydrateIncome(row)
  })

  ipcMain.handle('income:update', (_event, id: number, data: any) => {
    const allowed = ['name','amount','frequency','nextExpectedDate','categoryId','accountId','notes','isActive']
    const fields: Record<string, unknown> = {}
    for (const k of allowed) {
      if (data[k] !== undefined) {
        if (k === 'nextExpectedDate') fields[k] = requireIso(data[k])
        else if (k === 'isActive') fields[k] = intFromBool(data[k])
        else fields[k] = data[k]
      }
    }
    const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
    db.prepare(`UPDATE "RecurringIncome" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    const row = db.prepare(`${incomeSelectJoin} WHERE ri.id = ?`).get(id) as any
    return hydrateIncome(row)
  })

  ipcMain.handle('income:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "RecurringIncome" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "RecurringIncome" WHERE id = ?`).run(id)
    return row
  })

  ipcMain.handle('income:markReceived', (_event, id: number, actualAmount?: number) => {
    const income = db.prepare(`SELECT * FROM "RecurringIncome" WHERE id = ?`).get(id) as any
    if (!income) throw new Error(`RecurringIncome ${id} not found`)
    const next = advanceByFrequency(new Date(income.nextExpectedDate), income.frequency as Frequency)
    const creditAmount = Math.abs(actualAmount ?? Number(income.amount))

    db.transaction(() => {
      if (income.accountId) {
        db.prepare(`
          INSERT INTO "Transaction" (accountId, categoryId, date, description, amount, type)
          VALUES (?, ?, ?, ?, ?, 'CREDIT')
        `).run(income.accountId, income.categoryId, nowIso(), income.name, creditAmount)
        db.prepare(`UPDATE "Account" SET balance = balance + ?, updatedAt = ? WHERE id = ?`).run(creditAmount, nowIso(), income.accountId)
      }
      db.prepare(`UPDATE "RecurringIncome" SET nextExpectedDate = ?, updatedAt = ? WHERE id = ?`).run(next.toISOString(), nowIso(), id)
    })()

    const row = db.prepare(`${incomeSelectJoin} WHERE ri.id = ?`).get(id) as any
    return hydrateIncome(row)
  })

  // ── Recurring bills ────────────────────────────────────────────────────────
  const billSelectJoin = `
    SELECT rb.*, ${categoryJoinSelect}
    FROM "RecurringBill" rb
    LEFT JOIN "Category" c ON c.id = rb.categoryId
  `

  ipcMain.handle('bills:list', () => {
    const rows = db.prepare(`${billSelectJoin} ORDER BY rb.nextDueDate ASC`).all() as any[]
    return rows.map(hydrateBill)
  })

  ipcMain.handle('bills:create', (_event, data: any) => {
    const now = nowIso()
    const info = db.prepare(`
      INSERT INTO "RecurringBill" (name, amount, frequency, nextDueDate, categoryId, accountId, notes, isActive, createdAt, updatedAt)
      VALUES (@name, @amount, @frequency, @nextDueDate, @categoryId, @accountId, @notes, @isActive, @createdAt, @updatedAt)
    `).run({
      name: data.name,
      amount: data.amount,
      frequency: data.frequency,
      nextDueDate: requireIso(data.nextDueDate),
      categoryId: data.categoryId ?? null,
      accountId: data.accountId ?? null,
      notes: data.notes ?? null,
      isActive: intFromBool(data.isActive ?? true) ?? 1,
      createdAt: now,
      updatedAt: now,
    })
    const row = db.prepare(`${billSelectJoin} WHERE rb.id = ?`).get(info.lastInsertRowid) as any
    return hydrateBill(row)
  })

  ipcMain.handle('bills:update', (_event, id: number, data: any) => {
    const allowed = ['name','amount','frequency','nextDueDate','categoryId','accountId','notes','isActive']
    const fields: Record<string, unknown> = {}
    for (const k of allowed) {
      if (data[k] !== undefined) {
        if (k === 'nextDueDate') fields[k] = requireIso(data[k])
        else if (k === 'isActive') fields[k] = intFromBool(data[k])
        else fields[k] = data[k]
      }
    }
    const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
    db.prepare(`UPDATE "RecurringBill" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    const row = db.prepare(`${billSelectJoin} WHERE rb.id = ?`).get(id) as any
    return hydrateBill(row)
  })

  ipcMain.handle('bills:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "RecurringBill" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "RecurringBill" WHERE id = ?`).run(id)
    return row
  })

  ipcMain.handle('bills:markPaid', (_event, id: number) => {
    const bill = db.prepare(`SELECT * FROM "RecurringBill" WHERE id = ?`).get(id) as any
    if (!bill) throw new Error(`RecurringBill ${id} not found`)
    const next = advanceByFrequency(new Date(bill.nextDueDate), bill.frequency as Frequency)
    const billAmount = Math.abs(Number(bill.amount))

    db.transaction(() => {
      if (bill.accountId) {
        db.prepare(`
          INSERT INTO "Transaction" (accountId, categoryId, recurringBillId, date, description, amount, type)
          VALUES (?, ?, ?, ?, ?, ?, 'DEBIT')
        `).run(bill.accountId, bill.categoryId ?? null, bill.id, nowIso(), bill.name, -billAmount)
        db.prepare(`UPDATE "Account" SET balance = balance - ?, updatedAt = ? WHERE id = ?`).run(billAmount, nowIso(), bill.accountId)
      }
      db.prepare(`UPDATE "RecurringBill" SET nextDueDate = ?, updatedAt = ? WHERE id = ?`).run(next.toISOString(), nowIso(), id)
    })()

    const row = db.prepare(`${billSelectJoin} WHERE rb.id = ?`).get(id) as any
    return hydrateBill(row)
  })

  // ── Budgets ────────────────────────────────────────────────────────────────
  ipcMain.handle('budgets:list', () => {
    const rows = db.prepare(`
      SELECT b.*, ${categoryJoinSelect}
      FROM "Budget" b
      JOIN "Category" c ON c.id = b.categoryId
      ORDER BY c.name ASC
    `).all() as any[]
    return rows.map(r => ({
      id: r.id, categoryId: r.categoryId, amount: r.amount,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
      category: hydrateCategory('cat', r),
    }))
  })

  ipcMain.handle('budgets:upsert', (_event, categoryId: number, amount: number) => {
    const now = nowIso()
    db.prepare(`
      INSERT INTO "Budget" (categoryId, amount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(categoryId) DO UPDATE SET amount = excluded.amount, updatedAt = excluded.updatedAt
    `).run(categoryId, amount, now, now)
    const row = db.prepare(`
      SELECT b.*, ${categoryJoinSelect}
      FROM "Budget" b
      JOIN "Category" c ON c.id = b.categoryId
      WHERE b.categoryId = ?
    `).get(categoryId) as any
    return {
      id: row.id, categoryId: row.categoryId, amount: row.amount,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
      category: hydrateCategory('cat', row),
    }
  })

  ipcMain.handle('budgets:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "Budget" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "Budget" WHERE id = ?`).run(id)
    return row
  })

  // ── Categories ─────────────────────────────────────────────────────────────
  ipcMain.handle('categories:list', () => db.prepare(`SELECT * FROM "Category" ORDER BY name ASC`).all())

  ipcMain.handle('categories:create', (_event, data: { name: string; type: string; color?: string | null; icon?: string | null }) => {
    const info = db.prepare(`
      INSERT INTO "Category" (name, type, color, icon, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.name, data.type, data.color ?? null, data.icon ?? null, nowIso())
    return db.prepare(`SELECT * FROM "Category" WHERE id = ?`).get(info.lastInsertRowid)
  })

  // ── Category rules ─────────────────────────────────────────────────────────
  ipcMain.handle('rules:list', () => {
    const rows = db.prepare(`
      SELECT cr.*, ${categoryJoinSelect}
      FROM "CategoryRule" cr
      JOIN "Category" c ON c.id = cr.categoryId
      ORDER BY cr.createdAt ASC
    `).all() as any[]
    return rows.map(r => ({
      id: r.id, pattern: r.pattern, categoryId: r.categoryId, createdAt: r.createdAt,
      category: hydrateCategory('cat', r),
    }))
  })

  ipcMain.handle('rules:create', (_event, pattern: string, categoryId: number) => {
    const info = db.prepare(`
      INSERT INTO "CategoryRule" (pattern, categoryId, createdAt) VALUES (?, ?, ?)
    `).run(pattern.trim(), categoryId, nowIso())
    const row = db.prepare(`
      SELECT cr.*, ${categoryJoinSelect}
      FROM "CategoryRule" cr
      JOIN "Category" c ON c.id = cr.categoryId
      WHERE cr.id = ?
    `).get(info.lastInsertRowid) as any
    return {
      id: row.id, pattern: row.pattern, categoryId: row.categoryId, createdAt: row.createdAt,
      category: hydrateCategory('cat', row),
    }
  })

  ipcMain.handle('rules:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "CategoryRule" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "CategoryRule" WHERE id = ?`).run(id)
    return row
  })

  ipcMain.handle('rules:applyToAll', () => {
    const rules = db.prepare(`SELECT id, pattern, categoryId FROM "CategoryRule"`).all() as Array<{ id: number; pattern: string; categoryId: number }>
    if (rules.length === 0) return { updated: 0 }
    const uncategorised = db.prepare(`SELECT id, description FROM "Transaction" WHERE categoryId IS NULL`).all() as Array<{ id: number; description: string }>
    const groups = new Map<number, number[]>()
    for (const tx of uncategorised) {
      const lower = tx.description.toLowerCase()
      const match = rules.find(r => lower.includes(r.pattern.toLowerCase()))
      if (match) {
        const ids = groups.get(match.categoryId) ?? []
        ids.push(tx.id)
        groups.set(match.categoryId, ids)
      }
    }
    if (groups.size === 0) return { updated: 0 }
    let total = 0
    db.transaction(() => {
      for (const [categoryId, ids] of groups) {
        const placeholders = ids.map(() => '?').join(',')
        const info = db.prepare(`UPDATE "Transaction" SET categoryId = ? WHERE id IN (${placeholders})`).run(categoryId, ...ids)
        total += info.changes
      }
    })()
    return { updated: total }
  })

  ipcMain.handle('categories:update', (_event, id: number, data: { name?: string; type?: string; color?: string | null; icon?: string | null }) => {
    const { sql, params } = buildUpdate(data)
    if (sql) db.prepare(`UPDATE "Category" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return db.prepare(`SELECT * FROM "Category" WHERE id = ?`).get(id)
  })

  ipcMain.handle('categories:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "Category" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "Category" WHERE id = ?`).run(id)
    return row
  })

  // ── Debts ──────────────────────────────────────────────────────────────────
  ipcMain.handle('debts:list', () => {
    const rows = db.prepare(`SELECT * FROM "Debt" ORDER BY createdAt ASC`).all() as any[]
    return rows.map(hydrateDebt)
  })

  ipcMain.handle('debts:create', (_event, data: {
    name: string
    type: DebtType
    counterparty: string
    principal: number
    interestRate?: number | null
    frequency?: Frequency | null
    nextPaymentDate?: string | null
    startDate: string
    endDate?: string | null
    accountId?: number | null
    notes?: string | null
  }) => {
    const now = nowIso()
    const info = db.prepare(`
      INSERT INTO "Debt" (name, type, counterparty, principal, outstanding, interestRate, frequency, nextPaymentDate, startDate, endDate, status, accountId, notes, createdAt, updatedAt)
      VALUES (@name, @type, @counterparty, @principal, @outstanding, @interestRate, @frequency, @nextPaymentDate, @startDate, @endDate, 'ACTIVE', @accountId, @notes, @createdAt, @updatedAt)
    `).run({
      name: data.name,
      type: data.type,
      counterparty: data.counterparty,
      principal: data.principal,
      outstanding: data.principal,
      interestRate: data.interestRate ?? null,
      frequency: data.frequency ?? null,
      nextPaymentDate: toIso(data.nextPaymentDate),
      startDate: requireIso(data.startDate),
      endDate: toIso(data.endDate),
      accountId: data.accountId ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    const row = db.prepare(`SELECT * FROM "Debt" WHERE id = ?`).get(info.lastInsertRowid)
    return hydrateDebt(row)
  })

  ipcMain.handle('debts:update', (_event, id: number, data: {
    name?: string
    counterparty?: string
    interestRate?: number | null
    frequency?: Frequency | null
    nextPaymentDate?: string | null
    endDate?: string | null
    status?: DebtStatus
    accountId?: number | null
    notes?: string | null
  }) => {
    const allowed: Array<keyof typeof data> = ['name','counterparty','interestRate','frequency','nextPaymentDate','endDate','status','accountId','notes']
    const fields: Record<string, unknown> = {}
    for (const k of allowed) {
      if (data[k] !== undefined) {
        if (k === 'nextPaymentDate' || k === 'endDate') fields[k] = toIso(data[k] as any)
        else fields[k] = data[k]
      }
    }
    const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
    db.prepare(`UPDATE "Debt" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    const row = db.prepare(`SELECT * FROM "Debt" WHERE id = ?`).get(id)
    return hydrateDebt(row)
  })

  ipcMain.handle('debts:delete', (_event, id: number) => {
    const row = db.prepare(`SELECT * FROM "Debt" WHERE id = ?`).get(id)
    db.prepare(`DELETE FROM "Debt" WHERE id = ?`).run(id)
    return row
  })

  ipcMain.handle('debts:recordPayment', (_event, data: {
    debtId: number
    date: string
    amount: number
    principal: number
    interest: number
    notes?: string | null
  }) => {
    const debt = db.prepare(`SELECT * FROM "Debt" WHERE id = ?`).get(data.debtId) as any
    if (!debt) throw new Error(`Debt ${data.debtId} not found`)
    const newOutstanding = Math.max(0, Number(debt.outstanding) - data.principal)
    const newStatus: DebtStatus = newOutstanding <= 0 ? 'PAID' : 'ACTIVE'

    const nextDate: string | null = (newStatus === 'ACTIVE' && debt.frequency && debt.nextPaymentDate)
      ? advanceByFrequency(new Date(debt.nextPaymentDate), debt.frequency as Frequency).toISOString()
      : null

    db.transaction(() => {
      db.prepare(`
        INSERT INTO "DebtPayment" (debtId, date, amount, principal, interest, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(data.debtId, requireIso(data.date), data.amount, data.principal, data.interest, data.notes ?? null)
      db.prepare(`
        UPDATE "Debt" SET outstanding = ?, status = ?, nextPaymentDate = ?, updatedAt = ? WHERE id = ?
      `).run(newOutstanding, newStatus, nextDate, nowIso(), data.debtId)
      // LOAN (I owe) → paying out is a DEBIT; RECEIVABLE (owed to me) → receiving is a CREDIT
      if (debt.accountId && data.amount > 0) {
        const txType = (debt.type as DebtType) === 'LOAN' ? 'DEBIT' : 'CREDIT'
        const txAmount = txType === 'DEBIT' ? -data.amount : data.amount
        db.prepare(`
          INSERT INTO "Transaction" (accountId, date, description, amount, type)
          VALUES (?, ?, ?, ?, ?)
        `).run(debt.accountId, requireIso(data.date), `Payment: ${debt.name}`, txAmount, txType)
        db.prepare(`UPDATE "Account" SET balance = balance + ?, updatedAt = ? WHERE id = ?`).run(txAmount, nowIso(), debt.accountId)
      }
    })()

    const row = db.prepare(`SELECT * FROM "Debt" WHERE id = ?`).get(data.debtId)
    return hydrateDebt(row)
  })

  ipcMain.handle('debts:deletePayment', (_event, paymentId: number) => {
    const payment = db.prepare(`SELECT * FROM "DebtPayment" WHERE id = ?`).get(paymentId) as any
    if (!payment) throw new Error(`DebtPayment ${paymentId} not found`)
    const debt = db.prepare(`SELECT * FROM "Debt" WHERE id = ?`).get(payment.debtId) as any
    if (!debt) throw new Error(`Debt ${payment.debtId} not found`)
    const restored = Math.min(Number(debt.principal), Number(debt.outstanding) + Number(payment.principal))

    const linkedTx = debt.accountId
      ? db.prepare(`
          SELECT * FROM "Transaction"
          WHERE accountId = ? AND description = ? AND date = ?
          LIMIT 1
        `).get(debt.accountId, `Payment: ${debt.name}`, payment.date) as any
      : null

    if (!linkedTx && debt.accountId) {
      console.warn(`debts:deletePayment: could not find linked account transaction for payment ${paymentId} — account balance not restored`)
    }

    db.transaction(() => {
      db.prepare(`DELETE FROM "DebtPayment" WHERE id = ?`).run(paymentId)
      db.prepare(`UPDATE "Debt" SET outstanding = ?, status = ?, updatedAt = ? WHERE id = ?`).run(restored, restored > 0 ? 'ACTIVE' : 'PAID', nowIso(), debt.id)
      if (linkedTx) {
        db.prepare(`DELETE FROM "Transaction" WHERE id = ?`).run(linkedTx.id)
        db.prepare(`UPDATE "Account" SET balance = balance - ?, updatedAt = ? WHERE id = ?`).run(Number(linkedTx.amount), nowIso(), debt.accountId)
      }
    })()

    const row = db.prepare(`SELECT * FROM "Debt" WHERE id = ?`).get(debt.id)
    return hydrateDebt(row)
  })

  // ── Cleanup ────────────────────────────────────────────────────────────────
  ipcMain.on('app:quit', () => {
    try { db.close() } catch { /* already closed */ }
  })
}
