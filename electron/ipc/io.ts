import type { IpcMain } from 'electron'
import { dialog, app } from 'electron'
import path from 'path'
import { writeFile, readFile } from 'fs/promises'
import { db } from '../db'
import {
  accountSelect, accountJoins, categoryJoinSelect,
  hydrateAccount, hydrateTransaction, nowIso, intFromBool,
} from './shared'
import { importMillenniumCSV } from '../services/csvImporter'
import { importRevolutCSV } from '../services/revolutImporter'

export function registerIoHandlers(ipcMain: IpcMain) {
  const stmtCategoryRules = db.prepare(`SELECT id, pattern, categoryId FROM "CategoryRule"`)
  const stmtImportInsert = db.prepare(`
    INSERT INTO "ImportHistory" (filename, format, accountId, imported, skipped, errors, importedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const stmtImportList = db.prepare(`
    SELECT ih.*, ${accountSelect}
    FROM "ImportHistory" ih
    LEFT JOIN "Account" a ON a.id = ih.accountId
    ${accountJoins}
    ORDER BY ih.importedAt DESC
    LIMIT 50
  `)
  const stmtImportById = db.prepare(`SELECT * FROM "ImportHistory" WHERE id = ?`)
  const stmtImportDelete = db.prepare(`DELETE FROM "ImportHistory" WHERE id = ?`)
  const stmtPing = db.prepare(`SELECT COUNT(*) AS c FROM "Account"`)

  function logImport(
    filePath: string,
    format: string,
    accountId: number,
    result: { imported: number; skipped: number; errors: string[] },
  ) {
    try {
      stmtImportInsert.run(
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

  // ── Export ─────────────────────────────────────────────────────────────────
  ipcMain.handle('export:savePath', async (_e, defaultName: string, filters: Electron.FileFilter[]) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters,
      properties: ['createDirectory'],
    })
    return canceled ? null : filePath
  })

  ipcMain.handle('export:transactions', async (_e, opts: {
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

  ipcMain.handle('export:backup', async (_e, filePath: string) => {
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

  ipcMain.handle('import:backup', async (_e, filePath: string) => {
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
      for (const t of [
        'TransactionTag','TransactionSplit','Tag','ImportHistory','DebtPayment','Debt',
        'SavingsSnapshot','PriceHistory','ExchangeRate','BalanceCorrection','InvestmentLot',
        'Transaction','SavingsGoal','Budget','RecurringBill','RecurringIncome',
        'CategoryRule','Investment','Account','Category','AccountType','Bank','Broker','InvestmentType',
      ]) {
        db.exec(`DELETE FROM "${t}"`)
      }
      db.exec(`DELETE FROM sqlite_sequence`)

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
      insertAll('DebtPayment',     (backup.debtPayments     ?? []).map(r => ({ id: r.id, debtId: r.debtId, date: dIso(r.date) ?? nowIso(), amount: r.amount, principal: r.principal, interest: r.interest, notes: r.notes, linkedTransactionId: r.linkedTransactionId ?? null, createdAt: dIso(r.createdAt) ?? nowIso() })), ['id','debtId','date','amount','principal','interest','notes','linkedTransactionId','createdAt'])
      insertAll('ImportHistory',   (backup.importHistory    ?? []).map(r => ({ id: r.id, filename: r.filename, format: r.format, accountId: r.accountId, imported: r.imported, skipped: r.skipped, errors: r.errors ?? 0, importedAt: dIso(r.importedAt) ?? nowIso() })), ['id','filename','format','accountId','imported','skipped','errors','importedAt'])
    })
    restore()

    return { transactions: backup.transactions?.length ?? 0 }
  })

  // ── DB health check ────────────────────────────────────────────────────────
  ipcMain.handle('db:ping', () => {
    stmtPing.get()
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

  ipcMain.handle('shortcuts:save', async (_e, config: unknown) => {
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
  ipcMain.handle('import:millenniumCSV', async (_e, filePath: string, accountId: number) => {
    const rules = stmtCategoryRules.all() as Array<{ id: number; pattern: string; categoryId: number }>
    const result = await importMillenniumCSV(filePath, accountId, rules)
    logImport(filePath, 'millennium', accountId, result)
    return result
  })

  ipcMain.handle('import:revolut', async (_e, filePath: string, accountId: number) => {
    const rules = stmtCategoryRules.all() as Array<{ id: number; pattern: string; categoryId: number }>
    const result = await importRevolutCSV(filePath, accountId, rules)
    logImport(filePath, 'revolut', accountId, result)
    return result
  })

  ipcMain.handle('import:listHistory', () => {
    const rows = stmtImportList.all() as any[]
    return rows.map(r => ({
      id: r.id, filename: r.filename, format: r.format, accountId: r.accountId,
      imported: r.imported, skipped: r.skipped, errors: r.errors, importedAt: r.importedAt,
      account: r.accountId == null ? null : hydrateAccount(r),
    }))
  })

  ipcMain.handle('import:deleteHistory', (_e, id: number) => {
    const row = stmtImportById.get(id)
    stmtImportDelete.run(id)
    return row
  })

  // ── Cleanup ────────────────────────────────────────────────────────────────
  ipcMain.on('app:quit', () => {
    try { db.close() } catch { /* already closed */ }
  })
}
