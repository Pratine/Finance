// All IPC handlers live here. The renderer calls window.api.* (defined in preload.ts),
// which bridges to these handlers running in the main process where Prisma and Node.js
// APIs (fs, dialog) are available. The renderer never touches the DB directly.
import { IpcMain, dialog, app } from 'electron'
import path from 'path'
import { writeFile, readFile } from 'fs/promises'
import { prisma } from './db'
import { importMillenniumCSV } from './services/csvImporter'
import { importRevolutCSV } from './services/revolutImporter'
import { fetchPrice, fetchExchangeRate } from './services/priceFetcher'
import { refreshAllPrices, getLastRefresh, startScheduler, type RefreshInterval } from './services/priceScheduler'
import { loadAppSettings, saveAppSettings } from './services/appSettings'
import { lookupISIN } from './services/isinLookup'
import { elapsedPeriods, applyPeriods } from './services/interest'
import type { Frequency, InterestType, DebtType, DebtStatus } from './domainTypes'
import type { Prisma } from '@prisma/client'

// Converts Prisma responses to plain JSON before sending over IPC.
// Electron's structured-clone algorithm cannot handle Prisma's Decimal objects,
// so we round-trip through JSON to coerce them to strings/numbers.
function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

// Advances a date by one period of the given frequency using UTC methods.
// Shared by income, bills, and debt handlers so the same logic isn't
// duplicated and mis-fixed in three places.
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

export function setupIpcHandlers(ipcMain: IpcMain) {
  // â”€â”€ Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  ipcMain.handle('export:savePath', async (_event, defaultName: string, filters: Electron.FileFilter[]) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters,
      properties: ['createDirectory'],
    })
    return canceled ? null : filePath
  })

  // Export transactions (optionally filtered by date range) to CSV or JSON.
  ipcMain.handle('export:transactions', async (_event, opts: {
    format: 'csv' | 'json'
    filePath: string
    from?: string
    to?: string
    accountId?: number
  }) => {
    const where: Record<string, unknown> = {}
    if (opts.from || opts.to) {
      where.date = {}
      if (opts.from) (where.date as Record<string, unknown>).gte = new Date(opts.from)
      if (opts.to)   (where.date as Record<string, unknown>).lte = new Date(opts.to)
    }
    if (opts.accountId != null) where.accountId = opts.accountId

    const txns = await prisma.transaction.findMany({
      where,
      include: { category: true, account: { include: { bank: true } } },
      orderBy: { date: 'desc' },
    })

    if (opts.format === 'json') {
      await writeFile(opts.filePath, JSON.stringify(serialize(txns), null, 2), 'utf8')
    } else {
      const q = (s: string) => `"${s.replace(/"/g, '""')}"`
      const header = 'Date,Account,Description,Amount,Type,Category,Balance\n'
      const rows = txns.map(t => [
        new Date(t.date).toISOString().slice(0, 10),
        q(t.account?.name ?? ''),
        q(t.description),
        t.amount,
        t.type,
        q(t.category?.name ?? ''),
        t.runningBalance ?? '',
      ].join(','))
      await writeFile(opts.filePath, header + rows.join('\n'), 'utf8')
    }
    return { exported: txns.length }
  })

  // Full database backup — every table serialised to a single JSON file.
  // All tables are read into memory at once. For a personal finance app the
  // dataset is small enough that this is never a practical problem, but if the
  // transactions or priceHistory tables ever grow very large (100 k+ rows) this
  // handler should be converted to a streaming/chunked approach.
  ipcMain.handle('export:backup', async (_event, filePath: string) => {
    const [
      accountTypes, banks, brokers, investmentTypes, categories, categoryRules,
      accounts, tags, budgets, savingsGoals, savingsSnapshots,
      investments, investmentLots, priceHistory, exchangeRates,
      recurringBills, recurringIncome, transactions, transactionTags,
      transactionSplits, balanceCorrections, debts, debtPayments, importHistory,
    ] = await Promise.all([
      prisma.accountType.findMany(),
      prisma.bank.findMany(),
      prisma.broker.findMany(),
      prisma.investmentType.findMany(),
      prisma.category.findMany(),
      prisma.categoryRule.findMany(),
      prisma.account.findMany(),
      prisma.tag.findMany(),
      prisma.budget.findMany(),
      prisma.savingsGoal.findMany(),
      prisma.savingsSnapshot.findMany(),
      prisma.investment.findMany(),
      prisma.investmentLot.findMany(),
      prisma.priceHistory.findMany(),
      prisma.exchangeRate.findMany(),
      prisma.recurringBill.findMany(),
      prisma.recurringIncome.findMany(),
      prisma.transaction.findMany(),
      prisma.transactionTag.findMany(),
      prisma.transactionSplit.findMany(),
      prisma.balanceCorrection.findMany(),
      prisma.debt.findMany(),
      prisma.debtPayment.findMany(),
      prisma.importHistory.findMany(),
    ])
    const backup = serialize({
      exportedAt: new Date().toISOString(),
      version: 2,
      accountTypes, banks, brokers, investmentTypes, categories, categoryRules,
      accounts, tags, budgets, savingsGoals, savingsSnapshots,
      investments, investmentLots, priceHistory, exchangeRates,
      recurringBills, recurringIncome, transactions, transactionTags,
      transactionSplits, balanceCorrections, debts, debtPayments, importHistory,
    })
    await writeFile(filePath, JSON.stringify(backup, null, 2), 'utf8')
    return { exported: transactions.length }
  })

  // Restores all data from a full backup JSON file.
  // The entire operation runs inside a single SQLite transaction — if any step
  // fails the database is rolled back to its state before the restore started.
  ipcMain.handle('import:backup', async (_event, filePath: string) => {
    // Typed shape for the v2 backup format.
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

    // Validate required fields exist on a sample of records from critical tables.
    // Checks multiple records, not just the first, to catch partially-corrupted arrays.
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

    // Mapper helpers — one per model, named so the createMany calls below stay readable.
    const d = (v: string | null | undefined) => v ? new Date(v) : null
    const icon  = (r: any) => ({ id: r.id, name: r.name, color: r.color, icon: r.icon })
    const mapCategory    = (r: any) => ({ id: r.id, name: r.name, type: r.type, color: r.color, icon: r.icon })
    const mapCategoryRule = (r: any) => ({ id: r.id, pattern: r.pattern, categoryId: r.categoryId })
    const mapAccount     = (r: any) => ({ id: r.id, name: r.name, bankId: r.bankId, typeId: r.typeId, accountNumber: r.accountNumber, balance: r.balance, currency: r.currency })
    const mapTag         = (r: any) => ({ id: r.id, name: r.name, color: r.color })
    const mapBudget      = (r: any) => ({ id: r.id, categoryId: r.categoryId, amount: r.amount })
    const mapExRate      = (r: any) => ({ id: r.id, fromCurrency: r.fromCurrency, rate: r.rate })
    const mapGoal        = (r: any) => ({
      id: r.id, accountId: r.accountId, name: r.name,
      targetAmount: r.targetAmount, currentAmount: r.currentAmount,
      deadline: d(r.deadline), interestType: r.interestType,
      interestValue: r.interestValue, interestFrequencyDays: r.interestFrequencyDays,
      lastInterestApplied: d(r.lastInterestApplied),
      totalInterestEarned: r.totalInterestEarned ?? 0,
      contributionAmount: r.contributionAmount,
      contributionFrequencyDays: r.contributionFrequencyDays, notes: r.notes,
    })
    const mapSnapshot    = (r: any) => ({ id: r.id, goalId: r.goalId, amount: r.amount, note: r.note, date: new Date(r.date) })
    const mapInvestment  = (r: any) => ({
      id: r.id, name: r.name, typeId: r.typeId, brokerId: r.brokerId,
      amountIn: r.amountIn, currentValue: r.currentValue, currency: r.currency,
      ticker: r.ticker, isin: r.isin, shares: r.shares,
      lastPriceFetched: r.lastPriceFetched, priceUpdatedAt: d(r.priceUpdatedAt), notes: r.notes,
    })
    const mapLot         = (r: any) => ({ id: r.id, investmentId: r.investmentId, type: r.type, date: new Date(r.date), shares: r.shares, pricePerShare: r.pricePerShare, totalCost: r.totalCost, realizedGain: r.realizedGain, notes: r.notes })
    const mapPrice       = (r: any) => ({ id: r.id, investmentId: r.investmentId, price: r.price, value: r.value, recordedAt: new Date(r.recordedAt) })
    const mapBill        = (r: any) => ({ id: r.id, name: r.name, amount: r.amount, frequency: r.frequency, nextDueDate: new Date(r.nextDueDate), categoryId: r.categoryId, accountId: r.accountId, notes: r.notes, isActive: r.isActive })
    const mapIncome      = (r: any) => ({ id: r.id, name: r.name, amount: r.amount, frequency: r.frequency, nextExpectedDate: new Date(r.nextExpectedDate), categoryId: r.categoryId, accountId: r.accountId, notes: r.notes, isActive: r.isActive })
    const mapTx          = (r: any) => ({ id: r.id, accountId: r.accountId, categoryId: r.categoryId, recurringBillId: r.recurringBillId, date: new Date(r.date), valueDate: d(r.valueDate), description: r.description, amount: r.amount, type: r.type, runningBalance: r.runningBalance, importHash: r.importHash, notes: r.notes })
    const mapTxTag       = (r: any) => ({ transactionId: r.transactionId, tagId: r.tagId })
    const mapSplit       = (r: any) => ({ id: r.id, transactionId: r.transactionId, categoryId: r.categoryId, amount: r.amount, notes: r.notes })
    const mapCorrection  = (r: any) => ({ id: r.id, accountId: r.accountId, oldBalance: r.oldBalance, newBalance: r.newBalance, note: r.note, createdAt: new Date(r.createdAt) })
    const mapDebt        = (r: any) => ({
      id: r.id, name: r.name, type: r.type, counterparty: r.counterparty,
      principal: r.principal, outstanding: r.outstanding, interestRate: r.interestRate,
      frequency: r.frequency, nextPaymentDate: d(r.nextPaymentDate),
      startDate: new Date(r.startDate), endDate: d(r.endDate),
      status: r.status, accountId: r.accountId, notes: r.notes,
    })
    const mapPayment     = (r: any) => ({ id: r.id, debtId: r.debtId, date: new Date(r.date), amount: r.amount, principal: r.principal, interest: r.interest, notes: r.notes })
    const mapImport      = (r: any) => ({ id: r.id, filename: r.filename, format: r.format, accountId: r.accountId, imported: r.imported, skipped: r.skipped, errors: r.errors })

    await prisma.$transaction(async (tx) => {
      // Delete every table in reverse FK order
      for (const t of [
        'TransactionTag','TransactionSplit','Tag','ImportHistory','DebtPayment','Debt',
        'SavingsSnapshot','PriceHistory','ExchangeRate','BalanceCorrection','InvestmentLot',
        'Transaction','SavingsGoal','Budget','RecurringBill','RecurringIncome',
        'CategoryRule','Investment','Account','Category','AccountType','Bank','Broker','InvestmentType',
      ]) { await tx.$executeRawUnsafe(`DELETE FROM “${t}”`) }
      await tx.$executeRaw`DELETE FROM sqlite_sequence`

      // Re-insert in FK dependency order
      if (backup.accountTypes?.length)     await tx.accountType.createMany({ data: backup.accountTypes.map(icon) })
      if (backup.banks?.length)            await tx.bank.createMany({ data: backup.banks.map(icon) })
      if (backup.brokers?.length)          await tx.broker.createMany({ data: backup.brokers.map(icon) })
      if (backup.investmentTypes?.length)  await tx.investmentType.createMany({ data: backup.investmentTypes.map(icon) })
      if (backup.categories?.length)       await tx.category.createMany({ data: backup.categories.map(mapCategory) })
      if (backup.categoryRules?.length)    await tx.categoryRule.createMany({ data: backup.categoryRules.map(mapCategoryRule) })
      if (backup.accounts?.length)         await tx.account.createMany({ data: backup.accounts.map(mapAccount) })
      if (backup.tags?.length)             await tx.tag.createMany({ data: backup.tags.map(mapTag) })
      if (backup.budgets?.length)          await tx.budget.createMany({ data: backup.budgets.map(mapBudget) })
      if (backup.exchangeRates?.length)    await tx.exchangeRate.createMany({ data: backup.exchangeRates.map(mapExRate) })
      if (backup.savingsGoals?.length)     await tx.savingsGoal.createMany({ data: backup.savingsGoals.map(mapGoal) })
      if (backup.savingsSnapshots?.length) await tx.savingsSnapshot.createMany({ data: backup.savingsSnapshots.map(mapSnapshot) })
      if (backup.investments?.length)      await tx.investment.createMany({ data: backup.investments.map(mapInvestment) })
      if (backup.investmentLots?.length)   await tx.investmentLot.createMany({ data: backup.investmentLots.map(mapLot) })
      if (backup.priceHistory?.length)     await tx.priceHistory.createMany({ data: backup.priceHistory.map(mapPrice) })
      if (backup.recurringBills?.length)   await tx.recurringBill.createMany({ data: backup.recurringBills.map(mapBill) })
      if (backup.recurringIncome?.length)  await tx.recurringIncome.createMany({ data: backup.recurringIncome.map(mapIncome) })
      if (backup.transactions?.length)     await tx.transaction.createMany({ data: backup.transactions.map(mapTx) })
      if (backup.transactionTags?.length)  await tx.transactionTag.createMany({ data: backup.transactionTags.map(mapTxTag) })
      if (backup.transactionSplits?.length) await tx.transactionSplit.createMany({ data: backup.transactionSplits.map(mapSplit) })
      if (backup.balanceCorrections?.length) await tx.balanceCorrection.createMany({ data: backup.balanceCorrections.map(mapCorrection) })
      if (backup.debts?.length)            await tx.debt.createMany({ data: backup.debts.map(mapDebt) })
      if (backup.debtPayments?.length)     await tx.debtPayment.createMany({ data: backup.debtPayments.map(mapPayment) })
      if (backup.importHistory?.length)    await tx.importHistory.createMany({ data: backup.importHistory.map(mapImport) })
    }, { timeout: 60_000 })

    return { transactions: backup.transactions?.length ?? 0 }
  })

  // â”€â”€ DB health check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('db:ping', async () => {
    // Query a real table to verify the schema is applied, not just the connection.
    await prisma.account.count()
    return true
  })

  // â”€â”€ Shortcuts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const shortcutsPath = path.join(app.getPath('userData'), 'shortcuts.json')

  ipcMain.handle('shortcuts:load', async () => {
    try {
      return JSON.parse(await readFile(shortcutsPath, 'utf8'))
    } catch {
      return null // null means renderer uses defaults
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

  // â”€â”€ File dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ CSV import â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function logImport(
    filePath: string,
    format: string,
    accountId: number,
    result: { imported: number; skipped: number; errors: string[] },
  ) {
    await prisma.importHistory.create({
      data: {
        filename: filePath.split(/[/\\]/).pop() ?? filePath,
        format,
        accountId,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors.length,
      },
    })
  }

  ipcMain.handle('import:millenniumCSV', async (_event, filePath: string, accountId: number) => {
    const rules = await prisma.categoryRule.findMany()
    const result = await importMillenniumCSV(filePath, accountId, rules)
    // Log after the import — a logging failure must not mark a successful import as failed.
    logImport(filePath, 'millennium', accountId, result).catch(e =>
      console.error('Failed to log import history:', e)
    )
    return result
  })

  ipcMain.handle('import:revolut', async (_event, filePath: string, accountId: number) => {
    const rules = await prisma.categoryRule.findMany()
    const result = await importRevolutCSV(filePath, accountId, rules)
    logImport(filePath, 'revolut', accountId, result).catch(e =>
      console.error('Failed to log import history:', e)
    )
    return result
  })

  ipcMain.handle('import:listHistory', async () => {
    return serialize(await prisma.importHistory.findMany({
      include: { account: { include: { bank: true } } },
      orderBy: { importedAt: 'desc' },
      take: 50,
    }))
  })

  ipcMain.handle('import:deleteHistory', async (_event, id: number) => {
    return serialize(await prisma.importHistory.delete({ where: { id } }))
  })

  // â”€â”€ Brokers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('brokers:list', async () => {
    return serialize(await prisma.broker.findMany({ orderBy: { name: 'asc' } }))
  })

  ipcMain.handle('brokers:create', async (_event, data) => {
    return serialize(await prisma.broker.create({ data }))
  })

  ipcMain.handle('brokers:update', async (_event, id: number, data) => {
    return serialize(await prisma.broker.update({ where: { id }, data }))
  })

  ipcMain.handle('brokers:delete', async (_event, id: number) => {
    return serialize(await prisma.broker.delete({ where: { id } }))
  })

  // â”€â”€ Investment lots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Recalculates amountIn and shares on the parent Investment using the average cost method.
  // Must be called inside a $transaction so it sees the committed lot state.
  async function syncInvestmentTotals(investmentId: number, tx: Prisma.TransactionClient) {
    const lots = await tx.investmentLot.findMany({ where: { investmentId } })
    // When all lots are gone reset to zero — no early return, or deleting the last
    // lot leaves the investment with stale shares/amountIn.
    if (lots.length === 0) {
      await tx.investment.update({ where: { id: investmentId }, data: { shares: 0, amountIn: 0 } })
      return
    }
    const buys  = lots.filter(l => l.type === 'BUY')
    const sells = lots.filter(l => l.type === 'SELL')
    const totalBuyShares  = buys.reduce((s, l) => s + Number(l.shares), 0)
    const totalSellShares = sells.reduce((s, l) => s + Number(l.shares), 0)
    const totalShares = Math.max(0, totalBuyShares - totalSellShares)
    const totalBuyCost = buys.reduce((s, l) => s + Number(l.totalCost), 0)
    const avgBuyPrice = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0
    const remainingCost = Math.round(totalShares * avgBuyPrice * 100) / 100
    await tx.investment.update({
      where: { id: investmentId },
      data: { shares: totalShares, amountIn: remainingCost },
    })
  }

  ipcMain.handle('lots:list', async (_event, investmentId: number) => {
    return serialize(await prisma.investmentLot.findMany({
      where: { investmentId },
      orderBy: { date: 'asc' },
    }))
  })

  ipcMain.handle('lots:create', async (_event, data: {
    investmentId: number
    date: string
    shares: number
    pricePerShare: number
    notes?: string | null
  }) => {
    const totalCost = Math.round(data.shares * data.pricePerShare * 100) / 100
    return serialize(await prisma.$transaction(async (tx) => {
      const lot = await tx.investmentLot.create({
        data: {
          investmentId: data.investmentId,
          type: 'BUY',
          date: new Date(data.date),
          shares: data.shares,
          pricePerShare: data.pricePerShare,
          totalCost,
          notes: data.notes ?? null,
        },
      })
      await syncInvestmentTotals(data.investmentId, tx)
      return lot
    }))
  })

  ipcMain.handle('lots:createSell', async (_event, data: {
    investmentId: number
    date: string
    shares: number
    pricePerShare: number
    notes?: string | null
  }) => {
    return serialize(await prisma.$transaction(async (tx) => {
      // Read existing lots inside the transaction for consistency
      const existing = await tx.investmentLot.findMany({ where: { investmentId: data.investmentId } })
      const buys  = existing.filter(l => l.type === 'BUY')
      const sells = existing.filter(l => l.type === 'SELL')
      const totalBuyShares  = buys.reduce((s, l) => s + Number(l.shares), 0)
      const totalSellShares = sells.reduce((s, l) => s + Number(l.shares), 0)
      const remainingShares = totalBuyShares - totalSellShares

      if (data.shares > remainingShares) {
        throw new Error(
          `Cannot sell ${data.shares} shares — only ${parseFloat(remainingShares.toFixed(6))} remaining`
        )
      }

      const totalBuyCost    = buys.reduce((s, l) => s + Number(l.totalCost), 0)
      const avgCostPerShare = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0
      const proceeds        = Math.round(data.shares * data.pricePerShare * 100) / 100
      const costBasis       = Math.round(data.shares * avgCostPerShare * 100) / 100
      const realizedGain    = Math.round((proceeds - costBasis) * 100) / 100

      const lot = await tx.investmentLot.create({
        data: {
          investmentId: data.investmentId,
          type: 'SELL',
          date: new Date(data.date),
          shares: data.shares,
          pricePerShare: data.pricePerShare,
          totalCost: proceeds,
          realizedGain,
          notes: data.notes ?? null,
        },
      })
      await syncInvestmentTotals(data.investmentId, tx)
      return lot
    }))
  })

  ipcMain.handle('lots:delete', async (_event, id: number) => {
    return serialize(await prisma.$transaction(async (tx) => {
      const lot = await tx.investmentLot.findUniqueOrThrow({ where: { id } })
      await tx.investmentLot.delete({ where: { id } })
      await syncInvestmentTotals(lot.investmentId, tx)
      return lot
    }))
  })

  // â”€â”€ Investment types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('investmentTypes:list', async () => {
    return serialize(await prisma.investmentType.findMany({ orderBy: { name: 'asc' } }))
  })

  ipcMain.handle('investmentTypes:create', async (_event, data) => {
    return serialize(await prisma.investmentType.create({ data }))
  })

  ipcMain.handle('investmentTypes:update', async (_event, id: number, data) => {
    return serialize(await prisma.investmentType.update({ where: { id }, data }))
  })

  ipcMain.handle('investmentTypes:delete', async (_event, id: number) => {
    return serialize(await prisma.investmentType.delete({ where: { id } }))
  })

  // â”€â”€ Investments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const investmentInclude = { type: true, broker: true, lots: { orderBy: { date: 'asc' as const } } }

  ipcMain.handle('investments:list', async () => {
    return serialize(await prisma.investment.findMany({
      include: investmentInclude,
      orderBy: { createdAt: 'asc' },
    }))
  })

  ipcMain.handle('investments:create', async (_event, data) => {
    return serialize(await prisma.investment.create({ data, include: investmentInclude }))
  })

  ipcMain.handle('investments:update', async (_event, id: number, data) => {
    return serialize(await prisma.investment.update({ where: { id }, data, include: investmentInclude }))
  })

  // Returns daily portfolio value snapshots grouped by date, limited to the last 2 years.
  ipcMain.handle('investments:priceHistory', async () => {
    const since = new Date(); since.setUTCFullYear(since.getUTCFullYear() - 2)
    const history = await prisma.priceHistory.findMany({
      where: { recordedAt: { gte: since } },
      include: { investment: { select: { name: true, typeId: true } } },
      orderBy: { recordedAt: 'asc' },
    })
    // Group by date â†' sum all investment values = total portfolio value
    const byDate = new Map<string, number>()
    for (const h of history) {
      const date = h.recordedAt.toISOString().slice(0, 10)
      byDate.set(date, (byDate.get(date) ?? 0) + Number(h.value))
    }
    return serialize([...byDate.entries()].map(([date, value]) => ({ date, value })))
  })

  ipcMain.handle('investments:priceHistoryById', async (_event, id: number) => {
    const since = new Date(); since.setUTCFullYear(since.getUTCFullYear() - 2)
    const history = await prisma.priceHistory.findMany({
      where: { investmentId: id, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    })
    return serialize(history.map(h => ({
      date: h.recordedAt.toISOString().slice(0, 10),
      price: Number(h.price),
      value: Number(h.value),
    })))
  })

  ipcMain.handle('investments:delete', async (_event, id: number) => {
    return serialize(await prisma.investment.delete({ where: { id } }))
  })

  // Converts an ISIN to a list of ticker symbols (one per exchange).
  ipcMain.handle('investments:lookupISIN', async (_event, isin: string) => {
    return lookupISIN(isin)
  })

  // Fetches the latest price for one investment and atomically updates price
  // history, exchange rate cache, and investment currentValue in one transaction.
  ipcMain.handle('investments:refreshPrice', async (_event, id: number) => {
    const inv = await prisma.investment.findUniqueOrThrow({ where: { id } })
    if (!inv.ticker) throw new Error('No ticker symbol set for this investment')
    if (inv.shares === null) {
      throw new Error(`${inv.ticker}: shares not set — add a buy lot before refreshing the price`)
    }
    const result = await fetchPrice(inv.ticker)

    // Resolve exchange rate before opening the transaction (network call).
    let rate: number
    if (result.currency === 'EUR') {
      rate = 1
    } else {
      try {
        rate = await fetchExchangeRate(result.currency)
      } catch (rateErr) {
        const cached = await prisma.exchangeRate.findUnique({ where: { fromCurrency: result.currency } })
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

    return serialize(await prisma.$transaction(async (tx) => {
      // Cache the exchange rate inside the transaction so it's consistent with
      // the price snapshot and investment update written below.
      if (result.currency !== 'EUR') {
        await tx.exchangeRate.upsert({
          where: { fromCurrency: result.currency },
          create: { fromCurrency: result.currency, rate },
          update: { rate },
        })
      }
      await tx.priceHistory.upsert({
        where: { investmentId_recordedAt: { investmentId: id, recordedAt: today } },
        create: { investmentId: id, price: priceInEUR, value: newValue, recordedAt: today },
        update: { price: priceInEUR, value: newValue },
      })
      return tx.investment.update({
        where: { id },
        data: { currentValue: newValue, lastPriceFetched: priceInEUR, priceUpdatedAt: new Date() },
        include: investmentInclude,
      })
    }))
  })

  ipcMain.handle('exchangeRates:list', async () => {
    return serialize(await prisma.exchangeRate.findMany({ orderBy: { fromCurrency: 'asc' } }))
  })

  // Refreshes prices for all investments that have a ticker symbol.
  ipcMain.handle('investments:refreshAll', async () => {
    const result = await refreshAllPrices()
    return serialize({ updated: result.updated, errors: result.errors })
  })

  ipcMain.handle('investments:lastRefresh', () => {
    const ts = getLastRefresh()
    return ts ? ts.toISOString() : null
  })

  // â”€â”€ App settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('appSettings:load', () => {
    return loadAppSettings()
  })

  ipcMain.handle('appSettings:save', (_event, patch: Partial<{ priceRefreshInterval: RefreshInterval }>) => {
    const updated = saveAppSettings(patch)
    // Re-apply scheduler immediately when interval changes
    if (patch.priceRefreshInterval !== undefined) {
      startScheduler(patch.priceRefreshInterval)
    }
    return updated
  })

  // â”€â”€ Banks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('banks:list', async () => {
    return serialize(await prisma.bank.findMany({ orderBy: { name: 'asc' } }))
  })

  ipcMain.handle('banks:create', async (_event, data) => {
    return serialize(await prisma.bank.create({ data }))
  })

  ipcMain.handle('banks:update', async (_event, id: number, data) => {
    return serialize(await prisma.bank.update({ where: { id }, data }))
  })

  ipcMain.handle('banks:delete', async (_event, id: number) => {
    return serialize(await prisma.bank.delete({ where: { id } }))
  })

  // â”€â”€ Account types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('accountTypes:list', async () => {
    return serialize(await prisma.accountType.findMany({ orderBy: { name: 'asc' } }))
  })

  ipcMain.handle('accountTypes:create', async (_event, data) => {
    return serialize(await prisma.accountType.create({ data }))
  })

  ipcMain.handle('accountTypes:update', async (_event, id: number, data) => {
    return serialize(await prisma.accountType.update({ where: { id }, data }))
  })

  ipcMain.handle('accountTypes:delete', async (_event, id: number) => {
    return serialize(await prisma.accountType.delete({ where: { id } }))
  })

  // â”€â”€ Accounts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('accounts:list', async () => {
    return serialize(await prisma.account.findMany({ include: { type: true, bank: true }, orderBy: { name: 'asc' } }))
  })

  ipcMain.handle('accounts:create', async (_event, data) => {
    return serialize(await prisma.account.create({ data, include: { type: true, bank: true } }))
  })

  ipcMain.handle('accounts:update', async (_event, id: number, data) => {
    // Destructure the internal-only _note field so it is never passed to Prisma.
    const { _note, ...prismaData } = data

    return await prisma.$transaction(async (tx) => {
      if (prismaData.balance !== undefined) {
        const current = await tx.account.findUniqueOrThrow({ where: { id } })
        if (Number(current.balance) !== Number(prismaData.balance)) {
          await tx.balanceCorrection.create({
            data: {
              accountId: id,
              oldBalance: Number(current.balance),
              newBalance: Number(prismaData.balance),
              note: _note ?? null,
            },
          })
        }
      }
      const updated = await tx.account.update({ where: { id }, data: prismaData, include: { type: true, bank: true } })
      if (prismaData.name) {
        await tx.savingsGoal.updateMany({ where: { accountId: id }, data: { name: prismaData.name } })
      }
      return serialize(updated)
    })
  })

  ipcMain.handle('accounts:corrections', async (_event, accountId: number) => {
    return serialize(await prisma.balanceCorrection.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }))
  })

  ipcMain.handle('accounts:delete', async (_event, id: number) => {
    return serialize(await prisma.account.delete({ where: { id } }))
  })

  // â”€â”€ Transactions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const txInclude = { category: true, tags: { include: { tag: true } }, splits: { include: { category: true }, orderBy: { id: 'asc' as const } } }

  // Unpaginated list used by analytics/reporting pages — omits tags and splits
  // (not needed for aggregations) to avoid loading large nested objects into memory.
  ipcMain.handle('transactions:list', async (_event, accountId?: number) => {
    return serialize(await prisma.transaction.findMany({
      where: accountId != null ? { accountId } : undefined,
      include: { category: true },
      orderBy: { date: 'desc' },
    }))
  })

  // Paginated version used by TransactionsPage â€” returns the page + total count.
  ipcMain.handle('transactions:listPaged', async (_event, opts: {
    accountId?: number; take: number; skip: number
  }) => {
    const where = opts.accountId != null ? { accountId: opts.accountId } : undefined
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({ where, include: txInclude, orderBy: { date: 'desc' }, take: opts.take, skip: opts.skip }),
      prisma.transaction.count({ where }),
    ])
    return serialize({ transactions, total })
  })

  ipcMain.handle('transactions:bulkCategorise', async (_event, ids: number[], categoryId: number | null) => {
    const { count } = await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { categoryId } })
    return { updated: count }
  })

  ipcMain.handle('transactions:getSplits', async (_event, transactionId: number) => {
    return serialize(await prisma.transactionSplit.findMany({
      where: { transactionId },
      include: { category: true },
      orderBy: { id: 'asc' },
    }))
  })

  ipcMain.handle('transactions:setSplits', async (_event, transactionId: number, splits: Array<{ categoryId: number | null; amount: number; notes?: string | null }>) => {
    return serialize(await prisma.$transaction(async (tx) => {
      await tx.transactionSplit.deleteMany({ where: { transactionId } })
      for (const s of splits) {
        await tx.transactionSplit.create({
          data: { transactionId, categoryId: s.categoryId ?? null, amount: s.amount, notes: s.notes ?? null },
        })
      }
      return tx.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: txInclude })
    }))
  })

  ipcMain.handle('transactions:update', async (_event, id: number, data: {
    date?: string
    description?: string
    amount?: number
    type?: 'CREDIT' | 'DEBIT'
    notes?: string
  }) => {
    const current = await prisma.transaction.findUniqueOrThrow({ where: { id } })
    const updateData: Record<string, unknown> = {}

    if (data.date !== undefined) updateData.date = new Date(data.date)
    if (data.description !== undefined) updateData.description = data.description.trim()
    if (data.notes !== undefined) updateData.notes = data.notes || null

    // Recompute amount + atomically adjust account balance when either field changes
    if (data.amount !== undefined || data.type !== undefined) {
      const newType = data.type ?? current.type
      const newAbs  = Math.abs(data.amount ?? Math.abs(Number(current.amount)))
      const newStoredAmount = newType === 'DEBIT' ? -newAbs : newAbs
      const balanceDelta = newStoredAmount - Number(current.amount)
      updateData.amount = newStoredAmount
      updateData.type   = newType
      const [updated] = await prisma.$transaction([
        prisma.transaction.update({ where: { id }, data: updateData, include: txInclude }),
        prisma.account.update({ where: { id: current.accountId }, data: { balance: { increment: balanceDelta } } }),
      ])
      return serialize(updated)
    }

    return serialize(await prisma.transaction.update({ where: { id }, data: updateData, include: txInclude }))
  })

  ipcMain.handle('transactions:categorise', async (_event, id: number, categoryId: number | null) => {
    return serialize(await prisma.transaction.update({ where: { id }, data: { categoryId }, include: txInclude }))
  })

  // â”€â”€ Tags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('tags:list', async () => {
    return serialize(await prisma.tag.findMany({ orderBy: { name: 'asc' } }))
  })

  ipcMain.handle('tags:create', async (_event, data: { name: string; color?: string | null }) => {
    return serialize(await prisma.tag.upsert({
      where: { name: data.name.trim().toLowerCase() },
      create: { name: data.name.trim().toLowerCase(), color: data.color ?? null },
      update: {},
    }))
  })

  ipcMain.handle('tags:delete', async (_event, id: number) => {
    return serialize(await prisma.tag.delete({ where: { id } }))
  })

  ipcMain.handle('tags:addToTransaction', async (_event, transactionId: number, tagId: number) => {
    await prisma.transactionTag.upsert({
      where: { transactionId_tagId: { transactionId, tagId } },
      create: { transactionId, tagId },
      update: {},
    })
    return serialize(await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: txInclude }))
  })

  ipcMain.handle('tags:removeFromTransaction', async (_event, transactionId: number, tagId: number) => {
    await prisma.transactionTag.deleteMany({ where: { transactionId, tagId } })
    return serialize(await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: txInclude }))
  })

  ipcMain.handle('transactions:create', async (_event, data: {
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
    const [tx] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          accountId: data.accountId,
          categoryId: data.categoryId ?? null,
          date: new Date(data.date),
          description: data.description.trim(),
          amount: storedAmount,
          type: data.type,
          notes: data.notes ?? null,
        },
        include: txInclude,
      }),
      prisma.account.update({
        where: { id: data.accountId },
        data: { balance: { increment: storedAmount } },
      }),
    ])
    return serialize(tx)
  })

  ipcMain.handle('transactions:delete', async (_event, id: number) => {
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id } })
    // amount is signed (+credit, -debit) so decrementing by it exactly reverses the balance effect
    const [deleted] = await prisma.$transaction([
      prisma.transaction.delete({ where: { id } }),
      prisma.account.update({
        where: { id: tx.accountId },
        data: { balance: { decrement: Number(tx.amount) } },
      }),
    ])
    return serialize(deleted)
  })

  ipcMain.handle('transactions:transfer', async (_event, data: {
    fromAccountId: number
    toAccountId: number
    amount: number
    date: string
    description: string
    categoryId?: number | null
  }) => {
    const abs = Math.abs(data.amount)
    const desc = data.description.trim() || 'Transfer'
    const [debit, credit] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          accountId: data.fromAccountId,
          categoryId: data.categoryId ?? null,
          date: new Date(data.date),
          description: desc,
          amount: -abs,
          type: 'DEBIT',
        },
        include: { category: true },
      }),
      prisma.transaction.create({
        data: {
          accountId: data.toAccountId,
          categoryId: data.categoryId ?? null,
          date: new Date(data.date),
          description: desc,
          amount: abs,
          type: 'CREDIT',
        },
        include: { category: true },
      }),
      prisma.account.update({ where: { id: data.fromAccountId }, data: { balance: { decrement: abs } } }),
      prisma.account.update({ where: { id: data.toAccountId },   data: { balance: { increment: abs } } }),
    ])
    return serialize({ debit, credit })
  })

  // â”€â”€ Savings goals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const savingsInclude = { account: { include: { type: true, bank: true } } }

  // Pure read — just returns the current state of savings goals.
  ipcMain.handle('savings:list', async () => {
    return serialize(await prisma.savingsGoal.findMany({
      include: savingsInclude,
      orderBy: { createdAt: 'asc' },
    }))
  })

  // Separate from list: auto-creates goals for savings accounts and applies
  // elapsed interest. Called once on page mount, not on every list refresh.
  ipcMain.handle('savings:sync', async () => {
    // Auto-create a savings goal for every savings-type account that doesn't have one yet.
    const savingsAccounts = await prisma.account.findMany({
      where: { type: { name: { equals: 'Savings' } } },
    })
    // Sequential — SQLite allows only one concurrent writer. Parallel $transaction
    // calls would queue under WAL but can throw SQLITE_BUSY under contention.
    for (const acc of savingsAccounts) {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.savingsGoal.findUnique({ where: { accountId: acc.id } })
        if (existing) return
        const currentAmount = Number(acc.balance)
        const goal = await tx.savingsGoal.create({
          data: { name: acc.name, accountId: acc.id, targetAmount: 0, currentAmount },
        })
        if (currentAmount > 0) {
          await tx.savingsSnapshot.create({
            data: { goalId: goal.id, amount: currentAmount, note: 'initial' },
          })
        }
      })
    }

    // Apply elapsed interest periods for goals that have interest configured.
    const interestGoals = await prisma.savingsGoal.findMany({
      where: { interestType: { not: null }, interestFrequencyDays: { not: null } },
    })
    for (const goal of interestGoals) {
      if (!goal.interestFrequencyDays || !goal.interestValue || !goal.interestType) continue
      const periods = elapsedPeriods({
        lastInterestApplied: goal.lastInterestApplied,
        interestFrequencyDays: goal.interestFrequencyDays,
        createdAt: goal.createdAt,
      })
      if (periods <= 0) continue
      const base = goal.lastInterestApplied ?? goal.createdAt
      const newAmount = applyPeriods(
        Number(goal.currentAmount),
        goal.interestType as InterestType,
        Number(goal.interestValue),
        periods,
      )
      const newLastApplied = new Date(base.getTime() + periods * goal.interestFrequencyDays * 86_400_000)
      const earned = newAmount - Number(goal.currentAmount)
      await prisma.$transaction(async (tx) => {
        await tx.savingsGoal.update({
          where: { id: goal.id },
          data: {
            currentAmount: newAmount,
            lastInterestApplied: newLastApplied,
            totalInterestEarned: Number(goal.totalInterestEarned) + earned,
          },
        })
        if (goal.accountId) {
          await tx.account.update({ where: { id: goal.accountId }, data: { balance: newAmount } })
        }
        await tx.savingsSnapshot.create({ data: { goalId: goal.id, amount: newAmount, note: 'interest' } })
      })
    }
  })

  ipcMain.handle('savings:create', async (_event, data) => {
    return serialize(await prisma.$transaction(async (tx) => {
      const goal = await tx.savingsGoal.create({ data, include: savingsInclude })
      if (Number(goal.currentAmount) > 0) {
        await tx.savingsSnapshot.create({ data: { goalId: goal.id, amount: Number(goal.currentAmount), note: 'initial' } })
      }
      return goal
    }))
  })

  ipcMain.handle('savings:update', async (_event, id: number, data) => {
    return serialize(await prisma.$transaction(async (tx) => {
      const current = await tx.savingsGoal.findUniqueOrThrow({ where: { id } })
      const updated = await tx.savingsGoal.update({ where: { id }, data, include: savingsInclude })
      if (data.currentAmount !== undefined && Number(data.currentAmount) !== Number(current.currentAmount)) {
        await tx.savingsSnapshot.create({ data: { goalId: id, amount: Number(updated.currentAmount), note: 'update' } })
      }
      return updated
    }))
  })

  ipcMain.handle('savings:delete', async (_event, id: number) => {
    return serialize(await prisma.savingsGoal.delete({ where: { id } }))
  })

  // Returns a merged chronological array of { date, amount } for a goal's balance history.
  // Combines saved snapshots with account transaction runningBalance data (for linked accounts).
  // Three separate reads — not wrapped in a transaction. For a single-user desktop app phantom
  // reads are not a practical concern, but data added between reads may appear in results.
  ipcMain.handle('savings:history', async (_event, goalId: number) => {
    const goal = await prisma.savingsGoal.findUniqueOrThrow({ where: { id: goalId } })
    const snapshots = await prisma.savingsSnapshot.findMany({
      where: { goalId },
      orderBy: { date: 'asc' },
    })

    const points = new Map<string, number>()

    // From snapshots
    for (const s of snapshots) {
      const date = s.date.toISOString().slice(0, 10)
      points.set(date, Number(s.amount))
    }

    // From linked account transaction runningBalance (fills in pre-snapshot history)
    if (goal.accountId) {
      const txns = await prisma.transaction.findMany({
        where: { accountId: goal.accountId, runningBalance: { not: null } },
        orderBy: { date: 'asc' },
      })
      for (const t of txns) {
        const date = t.date.toISOString().slice(0, 10)
        if (!points.has(date)) {
          points.set(date, Number(t.runningBalance))
        }
      }
    }

    const sorted = [...points.entries()].sort(([a], [b]) => a.localeCompare(b))
    return serialize(sorted.map(([date, amount]) => ({ date, amount })))
  })

  // Manually applies all elapsed interest periods to a goal and records the date.
  ipcMain.handle('savings:applyInterest', async (_event, id: number) => {
    const goal = await prisma.savingsGoal.findUniqueOrThrow({ where: { id } })
    if (!goal.interestType || goal.interestValue === null || !goal.interestFrequencyDays) {
      throw new Error('No interest configuration set for this goal')
    }
    const periods = elapsedPeriods({
      lastInterestApplied: goal.lastInterestApplied,
      interestFrequencyDays: goal.interestFrequencyDays,
      createdAt: goal.createdAt,
    })
    const effectivePeriods = Math.max(1, periods) // apply at least one period on manual trigger
    const newAmount = applyPeriods(
      Number(goal.currentAmount),
      goal.interestType as InterestType,
      Number(goal.interestValue),
      effectivePeriods,
    )
    const base = goal.lastInterestApplied ?? goal.createdAt
    const newLastApplied = new Date(base.getTime() + effectivePeriods * goal.interestFrequencyDays * 86_400_000)
    const earned = newAmount - Number(goal.currentAmount)
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.savingsGoal.update({
        where: { id },
        data: {
          currentAmount: newAmount,
          lastInterestApplied: newLastApplied,
          totalInterestEarned: Number(goal.totalInterestEarned) + earned,
        },
        include: savingsInclude,
      })
      if (goal.accountId) {
        await tx.account.update({ where: { id: goal.accountId }, data: { balance: newAmount } })
      }
      await tx.savingsSnapshot.create({ data: { goalId: id, amount: newAmount, note: 'interest' } })
      return result
    })
    return serialize(updated)
  })

  // â”€â”€ Recurring income â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const incomeInclude = { category: true, account: { include: { type: true, bank: true } } }

  ipcMain.handle('income:list', async () => {
    return serialize(await prisma.recurringIncome.findMany({
      include: incomeInclude,
      orderBy: { nextExpectedDate: 'asc' },
    }))
  })

  ipcMain.handle('income:create', async (_event, data) => {
    return serialize(await prisma.recurringIncome.create({ data, include: incomeInclude }))
  })

  ipcMain.handle('income:update', async (_event, id: number, data) => {
    return serialize(await prisma.recurringIncome.update({ where: { id }, data, include: incomeInclude }))
  })

  ipcMain.handle('income:delete', async (_event, id: number) => {
    return serialize(await prisma.recurringIncome.delete({ where: { id } }))
  })

  ipcMain.handle('income:markReceived', async (_event, id: number, actualAmount?: number) => {
    const income = await prisma.recurringIncome.findUniqueOrThrow({ where: { id } })
    const next = advanceByFrequency(new Date(income.nextExpectedDate), income.frequency as Frequency)
    const creditAmount = Math.abs(actualAmount ?? Number(income.amount))

    return serialize(await prisma.$transaction(async (tx) => {
      if (income.accountId) {
        await tx.transaction.create({
          data: {
            accountId: income.accountId,
            categoryId: income.categoryId,
            date: new Date(),
            description: income.name,
            amount: creditAmount,
            type: 'CREDIT',
          },
        })
        await tx.account.update({
          where: { id: income.accountId },
          data: { balance: { increment: creditAmount } },
        })
      }
      return tx.recurringIncome.update({
        where: { id },
        data: { nextExpectedDate: next },
        include: incomeInclude,
      })
    }))
  })

  // â”€â”€ Recurring bills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const billInclude = { category: true, account: { include: { type: true, bank: true } } }

  ipcMain.handle('bills:list', async () => {
    return serialize(await prisma.recurringBill.findMany({
      include: billInclude,
      orderBy: { nextDueDate: 'asc' },
    }))
  })

  ipcMain.handle('bills:create', async (_event, data) => {
    return serialize(await prisma.recurringBill.create({ data, include: billInclude }))
  })

  ipcMain.handle('bills:update', async (_event, id: number, data) => {
    return serialize(await prisma.recurringBill.update({ where: { id }, data, include: billInclude }))
  })

  ipcMain.handle('bills:delete', async (_event, id: number) => {
    return serialize(await prisma.recurringBill.delete({ where: { id } }))
  })

  ipcMain.handle('bills:markPaid', async (_event, id: number) => {
    const bill = await prisma.recurringBill.findUniqueOrThrow({ where: { id } })
    const next = advanceByFrequency(new Date(bill.nextDueDate), bill.frequency as Frequency)
    const billAmount = Math.abs(Number(bill.amount))

    return serialize(await prisma.$transaction(async (tx) => {
      if (bill.accountId) {
        await tx.transaction.create({
          data: {
            accountId: bill.accountId,
            categoryId: bill.categoryId ?? null,
            recurringBillId: bill.id,
            date: new Date(),
            description: bill.name,
            amount: -billAmount,
            type: 'DEBIT',
          },
        })
        await tx.account.update({
          where: { id: bill.accountId },
          data: { balance: { decrement: billAmount } },
        })
      }
      return tx.recurringBill.update({
        where: { id },
        data: { nextDueDate: next },
        include: billInclude,
      })
    }))
  })

  // â”€â”€ Budgets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('budgets:list', async () => {
    return serialize(await prisma.budget.findMany({
      include: { category: true },
      orderBy: { category: { name: 'asc' } },
    }))
  })

  ipcMain.handle('budgets:upsert', async (_event, categoryId: number, amount: number) => {
    return serialize(await prisma.budget.upsert({
      where: { categoryId },
      create: { categoryId, amount },
      update: { amount },
      include: { category: true },
    }))
  })

  ipcMain.handle('budgets:delete', async (_event, id: number) => {
    return serialize(await prisma.budget.delete({ where: { id } }))
  })

  // â”€â”€ Categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('categories:list', async () => {
    return serialize(await prisma.category.findMany({ orderBy: { name: 'asc' } }))
  })

  ipcMain.handle('categories:create', async (_event, data) => {
    return serialize(await prisma.category.create({ data }))
  })

  // â”€â”€ Category rules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('rules:list', async () => {
    return serialize(await prisma.categoryRule.findMany({
      include: { category: true },
      orderBy: { createdAt: 'asc' },
    }))
  })

  ipcMain.handle('rules:create', async (_event, pattern: string, categoryId: number) => {
    return serialize(await prisma.categoryRule.create({
      data: { pattern: pattern.trim(), categoryId },
      include: { category: true },
    }))
  })

  ipcMain.handle('rules:delete', async (_event, id: number) => {
    return serialize(await prisma.categoryRule.delete({ where: { id } }))
  })

  // Applies all rules to every uncategorised transaction.
  // Groups matches by categoryId and uses updateMany — O(unique categories) queries
  // instead of O(transactions).
  ipcMain.handle('rules:applyToAll', async () => {
    const rules = await prisma.categoryRule.findMany()
    if (rules.length === 0) return { updated: 0 }
    const uncategorised = await prisma.transaction.findMany({
      where: { categoryId: null },
      select: { id: true, description: true },
    })
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
    const updates = [...groups.entries()]
    await prisma.$transaction(
      updates.map(([categoryId, ids]) =>
        prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { categoryId } })
      )
    )
    return { updated: updates.reduce((s, [, ids]) => s + ids.length, 0) }
  })

  ipcMain.handle('categories:update', async (_event, id: number, data) => {
    return serialize(await prisma.category.update({ where: { id }, data }))
  })

  ipcMain.handle('categories:delete', async (_event, id: number) => {
    return serialize(await prisma.category.delete({ where: { id } }))
  })

  // â”€â”€ Debts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const debtInclude = { account: true, payments: { orderBy: { date: 'desc' as const } } }

  ipcMain.handle('debts:list', async () => {
    return serialize(await prisma.debt.findMany({ include: debtInclude, orderBy: { createdAt: 'asc' } }))
  })

  ipcMain.handle('debts:create', async (_event, data: {
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
    return serialize(await prisma.debt.create({
      data: {
        name: data.name,
        type: data.type,
        counterparty: data.counterparty,
        principal: data.principal,
        outstanding: data.principal,
        interestRate: data.interestRate ?? null,
        frequency: data.frequency ?? null,
        nextPaymentDate: data.nextPaymentDate ? new Date(data.nextPaymentDate) : null,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        accountId: data.accountId ?? null,
        notes: data.notes ?? null,
      },
      include: debtInclude,
    }))
  })

  ipcMain.handle('debts:update', async (_event, id: number, data: {
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
    const { nextPaymentDate, endDate, ...rest } = data
    return serialize(await prisma.debt.update({
      where: { id },
      data: {
        ...rest,
        nextPaymentDate: nextPaymentDate !== undefined
          ? (nextPaymentDate ? new Date(nextPaymentDate) : null)
          : undefined,
        endDate: endDate !== undefined
          ? (endDate ? new Date(endDate) : null)
          : undefined,
      },
      include: debtInclude,
    }))
  })

  ipcMain.handle('debts:delete', async (_event, id: number) => {
    return serialize(await prisma.debt.delete({ where: { id } }))
  })

  ipcMain.handle('debts:recordPayment', async (_event, data: {
    debtId: number
    date: string
    amount: number
    principal: number
    interest: number
    notes?: string | null
  }) => {
    const debt = await prisma.debt.findUniqueOrThrow({ where: { id: data.debtId } })
    const newOutstanding = Math.max(0, Number(debt.outstanding) - data.principal)
    const newStatus: DebtStatus = newOutstanding <= 0 ? 'PAID' : 'ACTIVE'

    const nextDate: Date | null = (newStatus === 'ACTIVE' && debt.frequency && debt.nextPaymentDate)
      ? advanceByFrequency(new Date(debt.nextPaymentDate), debt.frequency as Frequency)
      : null

    await prisma.$transaction(async (tx) => {
      await tx.debtPayment.create({
        data: {
          debtId: data.debtId,
          date: new Date(data.date),
          amount: data.amount,
          principal: data.principal,
          interest: data.interest,
          notes: data.notes ?? null,
        },
      })
      await tx.debt.update({
        where: { id: data.debtId },
        data: { outstanding: newOutstanding, status: newStatus, nextPaymentDate: nextDate },
      })
      // LOAN (I owe) → paying out is a DEBIT; RECEIVABLE (owed to me) → receiving is a CREDIT
      if (debt.accountId && data.amount > 0) {
        const txType = (debt.type as DebtType) === 'LOAN' ? 'DEBIT' : 'CREDIT'
        const txAmount = txType === 'DEBIT' ? -data.amount : data.amount
        await tx.transaction.create({
          data: {
            accountId: debt.accountId,
            date: new Date(data.date),
            description: `Payment: ${debt.name}`,
            amount: txAmount,
            type: txType,
          },
        })
        await tx.account.update({ where: { id: debt.accountId }, data: { balance: { increment: txAmount } } })
      }
    })

    return serialize(await prisma.debt.findUniqueOrThrow({ where: { id: data.debtId }, include: debtInclude }))
  })

  ipcMain.handle('debts:deletePayment', async (_event, paymentId: number) => {
    const payment = await prisma.debtPayment.findUniqueOrThrow({ where: { id: paymentId } })
    const debt = await prisma.debt.findUniqueOrThrow({ where: { id: payment.debtId } })
    const restored = Math.min(Number(debt.principal), Number(debt.outstanding) + Number(payment.principal))

    // Find the account transaction created by recordPayment.
    // Matched heuristically by description + date since there is no FK linking them.
    // Limitation: if two payments share the same date and debt name, findFirst returns
    // one arbitrarily. If the debt name was edited after the payment, no match is found
    // and the account balance is not restored (logged as a console warning).
    // The proper fix is a schema change adding debtPaymentId to Transaction.
    const linkedTx = debt.accountId
      ? await prisma.transaction.findFirst({
          where: {
            accountId: debt.accountId,
            description: `Payment: ${debt.name}`,
            date: payment.date,
          },
        })
      : null

    await prisma.$transaction([
      prisma.debtPayment.delete({ where: { id: paymentId } }),
      prisma.debt.update({
        where: { id: debt.id },
        data: { outstanding: restored, status: restored > 0 ? 'ACTIVE' : 'PAID' },
      }),
      ...(linkedTx ? [
        prisma.transaction.delete({ where: { id: linkedTx.id } }),
        prisma.account.update({
          where: { id: debt.accountId! },
          data: { balance: { decrement: Number(linkedTx.amount) } },
        }),
      ] : (() => {
        if (debt.accountId) console.warn(`debts:deletePayment: could not find linked account transaction for payment ${paymentId} — account balance not restored`)
        return []
      })()),
    ])

    return serialize(await prisma.debt.findUniqueOrThrow({ where: { id: debt.id }, include: debtInclude }))
  })

  // â”€â”€ Cleanup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.on('app:quit', async () => {
    await prisma.$disconnect()
  })
}
