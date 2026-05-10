// All IPC handlers live here. The renderer calls window.api.* (defined in preload.ts),
// which bridges to these handlers running in the main process where Prisma and Node.js
// APIs (fs, dialog) are available. The renderer never touches the DB directly.
//
// serialize() converts Prisma responses to plain JSON before sending over IPC.
// Electron's structured-clone algorithm cannot handle Prisma's Decimal objects,
// so we round-trip through JSON to get plain strings/numbers.
function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

import { IpcMain, dialog, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { prisma } from './db'
import { importMillenniumCSV } from './services/csvImporter'
import { importRevolutCSV } from './services/revolutImporter'
import { fetchPrice, fetchExchangeRate } from './services/priceFetcher'
import { refreshAllPrices, savePriceSnapshot, getLastRefresh, startScheduler, type RefreshInterval } from './services/priceScheduler'
import { loadAppSettings, saveAppSettings } from './services/appSettings'
import { lookupISIN } from './services/isinLookup'
import { elapsedPeriods, applyPeriods } from './services/interest'

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
    if (opts.accountId) where.accountId = opts.accountId

    const txns = await prisma.transaction.findMany({
      where,
      include: { category: true, account: { include: { bank: true } } },
      orderBy: { date: 'desc' },
    })

    if (opts.format === 'json') {
      fs.writeFileSync(opts.filePath, JSON.stringify(serialize(txns), null, 2), 'utf8')
    } else {
      const header = 'Date,Account,Description,Amount,Type,Category,Balance\n'
      const rows = txns.map(t => [
        new Date(t.date).toISOString().slice(0, 10),
        t.account?.name ?? '',
        `"${t.description.replace(/"/g, '""')}"`,
        t.amount,
        t.type,
        t.category?.name ?? '',
        t.runningBalance ?? '',
      ].join(','))
      fs.writeFileSync(opts.filePath, header + rows.join('\n'), 'utf8')
    }
    return { exported: txns.length }
  })

  // Full database backup â€” all tables serialised to a single JSON file.
  ipcMain.handle('export:backup', async (_event, filePath: string) => {
    const [accounts, transactions, categories, budgets, savingsGoals,
           investments, recurringBills, accountTypes, banks, investmentTypes,
           brokers, categoryRules] = await Promise.all([
      prisma.account.findMany({ include: { type: true, bank: true } }),
      prisma.transaction.findMany({ include: { category: true } }),
      prisma.category.findMany(),
      prisma.budget.findMany({ include: { category: true } }),
      prisma.savingsGoal.findMany(),
      prisma.investment.findMany({ include: { type: true, broker: true } }),
      prisma.recurringBill.findMany({ include: { category: true } }),
      prisma.accountType.findMany(),
      prisma.bank.findMany(),
      prisma.investmentType.findMany(),
      prisma.broker.findMany(),
      prisma.categoryRule.findMany({ include: { category: true } }),
    ])
    const backup = serialize({
      exportedAt: new Date().toISOString(),
      version: 1,
      accounts, transactions, categories, budgets, savingsGoals,
      investments, recurringBills, accountTypes, banks, investmentTypes,
      brokers, categoryRules,
    })
    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf8')
    return { exported: transactions.length }
  })

  // Restores all data from a full backup JSON file.
  // Truncates every table first â€” this is a destructive full restore.
  ipcMain.handle('import:backup', async (_event, filePath: string) => {
    const raw = fs.readFileSync(filePath, 'utf8')
    const backup = JSON.parse(raw)

    // Delete in reverse FK order (SQLite uses DELETE FROM, no TRUNCATE)
    for (const t of [
      'TransactionTag','TransactionSplit','Tag','ImportHistory','DebtPayment','Debt',
      'SavingsSnapshot','PriceHistory','ExchangeRate','BalanceCorrection','InvestmentLot',
      'Transaction','SavingsGoal','Budget','RecurringBill','RecurringIncome',
      'CategoryRule','Investment','Account','Category','AccountType','Bank','Broker','InvestmentType',
    ]) { await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`) }
    await prisma.$executeRaw`DELETE FROM sqlite_sequence`

    // Re-insert in FK dependency order
    if (backup.accountTypes?.length)   await prisma.accountType.createMany({ data: backup.accountTypes.map((r: any) => ({ id: r.id, name: r.name, color: r.color, icon: r.icon })) })
    if (backup.banks?.length)          await prisma.bank.createMany({ data: backup.banks.map((r: any) => ({ id: r.id, name: r.name, color: r.color, icon: r.icon })) })
    if (backup.brokers?.length)        await prisma.broker.createMany({ data: backup.brokers.map((r: any) => ({ id: r.id, name: r.name, color: r.color, icon: r.icon })) })
    if (backup.investmentTypes?.length) await prisma.investmentType.createMany({ data: backup.investmentTypes.map((r: any) => ({ id: r.id, name: r.name, color: r.color, icon: r.icon })) })
    if (backup.categories?.length)     await prisma.category.createMany({ data: backup.categories.map((r: any) => ({ id: r.id, name: r.name, type: r.type, color: r.color, icon: r.icon })) })
    if (backup.categoryRules?.length)  await prisma.categoryRule.createMany({ data: backup.categoryRules.map((r: any) => ({ id: r.id, pattern: r.pattern, categoryId: r.categoryId })) })
    if (backup.accounts?.length)       await prisma.account.createMany({ data: backup.accounts.map((r: any) => ({ id: r.id, name: r.name, bankId: r.bankId, typeId: r.typeId, accountNumber: r.accountNumber, balance: r.balance, currency: r.currency })) })
    if (backup.budgets?.length)        await prisma.budget.createMany({ data: backup.budgets.map((r: any) => ({ id: r.id, categoryId: r.categoryId, amount: r.amount })) })
    if (backup.savingsGoals?.length)   await prisma.savingsGoal.createMany({ data: backup.savingsGoals.map((r: any) => ({ id: r.id, accountId: r.accountId, name: r.name, targetAmount: r.targetAmount, currentAmount: r.currentAmount, deadline: r.deadline ? new Date(r.deadline) : null, interestType: r.interestType, interestValue: r.interestValue, interestFrequencyDays: r.interestFrequencyDays, lastInterestApplied: r.lastInterestApplied ? new Date(r.lastInterestApplied) : null, contributionAmount: r.contributionAmount, contributionFrequencyDays: r.contributionFrequencyDays, totalInterestEarned: r.totalInterestEarned ?? 0, notes: r.notes })) })
    if (backup.investments?.length)    await prisma.investment.createMany({ data: backup.investments.map((r: any) => ({ id: r.id, name: r.name, typeId: r.typeId, brokerId: r.brokerId, amountIn: r.amountIn, currentValue: r.currentValue, currency: r.currency, ticker: r.ticker, isin: r.isin, shares: r.shares, lastPriceFetched: r.lastPriceFetched, priceUpdatedAt: r.priceUpdatedAt ? new Date(r.priceUpdatedAt) : null, notes: r.notes })) })
    if (backup.recurringBills?.length) await prisma.recurringBill.createMany({ data: backup.recurringBills.map((r: any) => ({ id: r.id, name: r.name, amount: r.amount, frequency: r.frequency, nextDueDate: new Date(r.nextDueDate), categoryId: r.categoryId, accountId: r.accountId, notes: r.notes, isActive: r.isActive })) })
    if (backup.transactions?.length)   await prisma.transaction.createMany({ data: backup.transactions.map((r: any) => ({ id: r.id, accountId: r.accountId, categoryId: r.categoryId, recurringBillId: r.recurringBillId, date: new Date(r.date), valueDate: r.valueDate ? new Date(r.valueDate) : null, description: r.description, amount: r.amount, type: r.type, runningBalance: r.runningBalance, importHash: r.importHash, notes: r.notes })) })

    // SQLite manages autoincrement via sqlite_sequence — no manual sequence reset needed.

    return { transactions: backup.transactions?.length ?? 0 }
  })

  // â”€â”€ DB health check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.handle('db:ping', async () => {
    await prisma.$queryRaw`SELECT 1`
    return true
  })

  // â”€â”€ Shortcuts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const shortcutsPath = path.join(app.getPath('userData'), 'shortcuts.json')

  ipcMain.handle('shortcuts:load', () => {
    try {
      return JSON.parse(fs.readFileSync(shortcutsPath, 'utf8'))
    } catch {
      return null // returns null â†’ renderer uses defaults
    }
  })

  ipcMain.handle('shortcuts:save', (_event, config: unknown) => {
    fs.writeFileSync(shortcutsPath, JSON.stringify(config, null, 2), 'utf8')
    return true
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
    await logImport(filePath, 'millennium', accountId, result)
    return result
  })

  ipcMain.handle('import:revolut', async (_event, filePath: string, accountId: number) => {
    const rules = await prisma.categoryRule.findMany()
    const result = await importRevolutCSV(filePath, accountId, rules)
    await logImport(filePath, 'revolut', accountId, result)
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

  // Recalculates amountIn and shares on the parent Investment from its lots.
  // Uses average cost method: remaining cost = remaining shares Ã— avg buy price.
  async function syncInvestmentTotals(investmentId: number) {
    const lots = await prisma.investmentLot.findMany({ where: { investmentId } })
    if (lots.length === 0) return  // no lots â€” keep manual values
    const buys  = lots.filter(l => l.type === 'BUY')
    const sells = lots.filter(l => l.type === 'SELL')
    const totalBuyShares  = buys.reduce((s, l) => s + Number(l.shares), 0)
    const totalSellShares = sells.reduce((s, l) => s + Number(l.shares), 0)
    const totalShares = Math.max(0, totalBuyShares - totalSellShares)
    const totalBuyCost = buys.reduce((s, l) => s + Number(l.totalCost), 0)
    // Average cost method: amountIn = remaining shares Ã— avg buy price
    const avgBuyPrice = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0
    const remainingCost = Math.round(totalShares * avgBuyPrice * 100) / 100
    await prisma.investment.update({
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
    const lot = await prisma.investmentLot.create({
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
    await syncInvestmentTotals(data.investmentId)
    return serialize(lot)
  })

  ipcMain.handle('lots:createSell', async (_event, data: {
    investmentId: number
    date: string
    shares: number
    pricePerShare: number
    notes?: string | null
  }) => {
    // Compute avg cost basis at time of sale to record realized gain
    const existing = await prisma.investmentLot.findMany({ where: { investmentId: data.investmentId } })
    const buys = existing.filter(l => l.type === 'BUY')
    const totalBuyShares = buys.reduce((s, l) => s + Number(l.shares), 0)
    const totalBuyCost   = buys.reduce((s, l) => s + Number(l.totalCost), 0)
    const avgCostPerShare = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0

    const proceeds     = Math.round(data.shares * data.pricePerShare * 100) / 100
    const costBasis    = Math.round(data.shares * avgCostPerShare * 100) / 100
    const realizedGain = Math.round((proceeds - costBasis) * 100) / 100

    const lot = await prisma.investmentLot.create({
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
    await syncInvestmentTotals(data.investmentId)
    return serialize(lot)
  })

  ipcMain.handle('lots:delete', async (_event, id: number) => {
    const lot = await prisma.investmentLot.findUniqueOrThrow({ where: { id } })
    await prisma.investmentLot.delete({ where: { id } })
    await syncInvestmentTotals(lot.investmentId)
    return serialize(lot)
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

  // Returns daily portfolio value snapshots grouped by date.
  ipcMain.handle('investments:priceHistory', async () => {
    const history = await prisma.priceHistory.findMany({
      include: { investment: { select: { name: true, typeId: true } } },
      orderBy: { recordedAt: 'asc' },
    })
    // Group by date â†’ sum all investment values = total portfolio value
    const byDate = new Map<string, number>()
    for (const h of history) {
      const date = h.recordedAt.toISOString().slice(0, 10)
      byDate.set(date, (byDate.get(date) ?? 0) + Number(h.value))
    }
    return serialize([...byDate.entries()].map(([date, value]) => ({ date, value })))
  })

  ipcMain.handle('investments:priceHistoryById', async (_event, id: number) => {
    const history = await prisma.priceHistory.findMany({
      where: { investmentId: id },
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

  // savePriceSnapshot is imported from priceScheduler service

  // Fetches the latest price for one investment and updates currentValue = price Ã— shares.
  ipcMain.handle('investments:refreshPrice', async (_event, id: number) => {
    const inv = await prisma.investment.findUniqueOrThrow({ where: { id } })
    if (!inv.ticker) throw new Error('No ticker symbol set for this investment')
    const result = await fetchPrice(inv.ticker)
    const rate = await fetchExchangeRate(result.currency)
    // Cache rate
    if (result.currency !== 'EUR') {
      await prisma.exchangeRate.upsert({
        where: { fromCurrency: result.currency },
        create: { fromCurrency: result.currency, rate },
        update: { rate },
      })
    }
    const priceInEUR = result.price * rate
    const shares = Number(inv.shares ?? 1)
    const newValue = priceInEUR * shares
    await savePriceSnapshot(id, priceInEUR, shares)
    return serialize(await prisma.investment.update({
      where: { id },
      data: { currentValue: newValue, lastPriceFetched: priceInEUR, priceUpdatedAt: new Date() },
      include: investmentInclude,
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
    // If balance is being corrected, log it before applying the change.
    if (data.balance !== undefined) {
      const current = await prisma.account.findUniqueOrThrow({ where: { id } })
      if (Number(current.balance) !== Number(data.balance)) {
        await prisma.balanceCorrection.create({
          data: {
            accountId: id,
            oldBalance: Number(current.balance),
            newBalance: Number(data.balance),
            note: data._note ?? null,
          },
        })
      }
      // Remove internal-only field before passing to Prisma
      delete data._note
    }
    const updated = await prisma.account.update({ where: { id }, data, include: { type: true, bank: true } })
    if (data.name) {
      await prisma.savingsGoal.updateMany({ where: { accountId: id }, data: { name: data.name } })
    }
    return serialize(updated)
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

  ipcMain.handle('transactions:list', async (_event, accountId?: number) => {
    return serialize(await prisma.transaction.findMany({
      where: accountId ? { accountId } : undefined,
      include: txInclude,
      orderBy: { date: 'desc' },
    }))
  })

  // Paginated version used by TransactionsPage â€” returns the page + total count.
  ipcMain.handle('transactions:listPaged', async (_event, opts: {
    accountId?: number; take: number; skip: number
  }) => {
    const where = opts.accountId ? { accountId: opts.accountId } : undefined
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({ where, include: txInclude, orderBy: { date: 'desc' }, take: opts.take, skip: opts.skip }),
      prisma.transaction.count({ where }),
    ])
    return serialize({ transactions, total })
  })

  ipcMain.handle('transactions:bulkCategorise', async (_event, ids: number[], categoryId: number | null) => {
    await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { categoryId } })
    return { updated: ids.length }
  })

  ipcMain.handle('transactions:getSplits', async (_event, transactionId: number) => {
    return serialize(await prisma.transactionSplit.findMany({
      where: { transactionId },
      include: { category: true },
      orderBy: { id: 'asc' },
    }))
  })

  ipcMain.handle('transactions:setSplits', async (_event, transactionId: number, splits: Array<{ categoryId: number | null; amount: number; notes?: string | null }>) => {
    await prisma.$transaction([
      prisma.transactionSplit.deleteMany({ where: { transactionId } }),
      ...splits.map(s => prisma.transactionSplit.create({
        data: { transactionId, categoryId: s.categoryId ?? null, amount: s.amount, notes: s.notes ?? null },
      })),
    ])
    return serialize(await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: txInclude }))
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

    // Recompute amount + adjust account balance when either field changes
    if (data.amount !== undefined || data.type !== undefined) {
      const newType = data.type ?? current.type
      const newAbs  = Math.abs(data.amount ?? Math.abs(Number(current.amount)))
      const newStoredAmount = newType === 'DEBIT' ? -newAbs : newAbs
      const balanceDelta = newStoredAmount - Number(current.amount)
      updateData.amount = newStoredAmount
      updateData.type   = newType
      const account = await prisma.account.findUniqueOrThrow({ where: { id: current.accountId } })
      await prisma.account.update({
        where: { id: current.accountId },
        data: { balance: Number(account.balance) + balanceDelta },
      })
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
    const tx = await prisma.transaction.create({
      data: {
        accountId: data.accountId,
        categoryId: data.categoryId ?? null,
        date: new Date(data.date),
        description: data.description.trim(),
        amount: data.type === 'DEBIT' ? -absAmount : absAmount,
        type: data.type,
        notes: data.notes ?? null,
      },
      include: txInclude,
    })
    const account = await prisma.account.findUniqueOrThrow({ where: { id: data.accountId } })
    const delta = data.type === 'CREDIT' ? absAmount : -absAmount
    await prisma.account.update({
      where: { id: data.accountId },
      data: { balance: Number(account.balance) + delta },
    })
    return serialize(tx)
  })

  ipcMain.handle('transactions:delete', async (_event, id: number) => {
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id } })
    const account = await prisma.account.findUniqueOrThrow({ where: { id: tx.accountId } })
    // Reverse the effect on the balance
    await prisma.account.update({
      where: { id: tx.accountId },
      data: { balance: Number(account.balance) - Number(tx.amount) },
    })
    return serialize(await prisma.transaction.delete({ where: { id } }))
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
    ])
    const [from, to] = await Promise.all([
      prisma.account.findUniqueOrThrow({ where: { id: data.fromAccountId } }),
      prisma.account.findUniqueOrThrow({ where: { id: data.toAccountId } }),
    ])
    await Promise.all([
      prisma.account.update({ where: { id: data.fromAccountId }, data: { balance: Number(from.balance) - abs } }),
      prisma.account.update({ where: { id: data.toAccountId }, data: { balance: Number(to.balance) + abs } }),
    ])
    return serialize({ debit, credit })
  })

  // â”€â”€ Savings goals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const savingsInclude = { account: { include: { type: true, bank: true } } }

  ipcMain.handle('savings:list', async () => {
    // Auto-create a savings goal for every savings-type account that doesn't have one yet.
    // upsert on accountId ensures this is idempotent even if called concurrently.
    const savingsAccounts = await prisma.account.findMany({
      where: { type: { name: { equals: 'Savings' } } },
    })
    for (const acc of savingsAccounts) {
      await prisma.savingsGoal.upsert({
        where: { accountId: acc.id },
        create: { name: acc.name, accountId: acc.id, targetAmount: 0, currentAmount: Number(acc.balance) },
        update: {},
      })
    }

    // Auto-apply elapsed interest periods for ALL goals with interest configured.
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
        goal.interestType as 'PERCENTAGE' | 'FIXED',
        Number(goal.interestValue),
        periods,
      )
      const newLastApplied = new Date(base.getTime() + periods * goal.interestFrequencyDays * 86_400_000)
      const earned = newAmount - Number(goal.currentAmount)
      await prisma.savingsGoal.update({
        where: { id: goal.id },
        data: {
          currentAmount: newAmount,
          lastInterestApplied: newLastApplied,
          totalInterestEarned: Number(goal.totalInterestEarned) + earned,
        },
      })
      if (goal.accountId) {
        await prisma.account.update({
          where: { id: goal.accountId },
          data: { balance: newAmount },
        })
      }
      await recordSavingsSnapshot(goal.id, newAmount, 'interest')
    }

    return serialize(await prisma.savingsGoal.findMany({
      include: savingsInclude,
      orderBy: { createdAt: 'asc' },
    }))
  })

  async function recordSavingsSnapshot(goalId: number, amount: number, note: string) {
    await prisma.savingsSnapshot.create({ data: { goalId, amount, note } })
  }

  ipcMain.handle('savings:create', async (_event, data) => {
    const goal = await prisma.savingsGoal.create({ data, include: savingsInclude })
    if (Number(goal.currentAmount) > 0) {
      await recordSavingsSnapshot(goal.id, Number(goal.currentAmount), 'initial')
    }
    return serialize(goal)
  })

  ipcMain.handle('savings:update', async (_event, id: number, data) => {
    const current = await prisma.savingsGoal.findUniqueOrThrow({ where: { id } })
    const updated = await prisma.savingsGoal.update({ where: { id }, data, include: savingsInclude })
    // Snapshot if the amount changed
    if (data.currentAmount !== undefined && Number(data.currentAmount) !== Number(current.currentAmount)) {
      await recordSavingsSnapshot(id, Number(updated.currentAmount), 'update')
    }
    return serialize(updated)
  })

  ipcMain.handle('savings:delete', async (_event, id: number) => {
    return serialize(await prisma.savingsGoal.delete({ where: { id } }))
  })

  // Returns a merged chronological array of { date, amount } for a goal's balance history.
  // Combines saved snapshots with account transaction runningBalance data (for linked accounts).
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
          points.set(date, Math.abs(Number(t.runningBalance)))
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
      goal.interestType as 'PERCENTAGE' | 'FIXED',
      Number(goal.interestValue),
      effectivePeriods,
    )
    const base = goal.lastInterestApplied ?? goal.createdAt
    const newLastApplied = new Date(base.getTime() + effectivePeriods * goal.interestFrequencyDays * 86_400_000)
    const earned = newAmount - Number(goal.currentAmount)
    const updated = await prisma.savingsGoal.update({
      where: { id },
      data: {
        currentAmount: newAmount,
        lastInterestApplied: newLastApplied,
        totalInterestEarned: Number(goal.totalInterestEarned) + earned,
      },
      include: savingsInclude,
    })
    // Keep linked account balance in sync.
    if (goal.accountId) {
      await prisma.account.update({
        where: { id: goal.accountId },
        data: { balance: newAmount },
      })
    }
    await recordSavingsSnapshot(id, newAmount, 'interest')
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
    const next = new Date(income.nextExpectedDate)
    switch (income.frequency) {
      case 'WEEKLY':    next.setDate(next.getDate() + 7); break
      case 'MONTHLY':   next.setMonth(next.getMonth() + 1); break
      case 'QUARTERLY': next.setMonth(next.getMonth() + 3); break
      case 'YEARLY':    next.setFullYear(next.getFullYear() + 1); break
    }
    // Use the actual amount received; fall back to the configured amount
    const creditAmount = Math.abs(actualAmount ?? Number(income.amount))
    if (income.accountId) {
      await prisma.transaction.create({
        data: {
          accountId: income.accountId,
          categoryId: income.categoryId,
          date: new Date(),
          description: income.name,
          amount: creditAmount,
          type: 'CREDIT',
        },
      })
      const account = await prisma.account.findUniqueOrThrow({ where: { id: income.accountId } })
      await prisma.account.update({
        where: { id: income.accountId },
        data: { balance: Number(account.balance) + creditAmount },
      })
    }
    return serialize(await prisma.recurringIncome.update({
      where: { id },
      data: { nextExpectedDate: next },
      include: incomeInclude,
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
    const next = new Date(bill.nextDueDate)
    switch (bill.frequency) {
      case 'WEEKLY':    next.setDate(next.getDate() + 7); break
      case 'MONTHLY':   next.setMonth(next.getMonth() + 1); break
      case 'QUARTERLY': next.setMonth(next.getMonth() + 3); break
      case 'YEARLY':    next.setFullYear(next.getFullYear() + 1); break
    }
    // Auto-create a debit transaction if the bill has a linked account
    if (bill.accountId) {
      // Verify the category still exists before referencing it
      const categoryExists = bill.categoryId
        ? await prisma.category.findUnique({ where: { id: bill.categoryId } })
        : null
      await prisma.transaction.create({
        data: {
          accountId: bill.accountId,
          categoryId: categoryExists ? bill.categoryId : null,
          recurringBillId: bill.id,
          date: new Date(),
          description: bill.name,
          amount: -Math.abs(Number(bill.amount)),
          type: 'DEBIT',
        },
      })
      // Update account balance
      const account = await prisma.account.findUniqueOrThrow({ where: { id: bill.accountId } })
      await prisma.account.update({
        where: { id: bill.accountId },
        data: { balance: Number(account.balance) - Math.abs(Number(bill.amount)) },
      })
    }
    return serialize(await prisma.recurringBill.update({
      where: { id },
      data: { nextDueDate: next },
      include: billInclude,
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

  // Applies all rules to every uncategorised transaction and returns count updated.
  ipcMain.handle('rules:applyToAll', async () => {
    const rules = await prisma.categoryRule.findMany()
    if (rules.length === 0) return { updated: 0 }
    const uncategorised = await prisma.transaction.findMany({ where: { categoryId: null } })
    let updated = 0
    for (const tx of uncategorised) {
      const lower = tx.description.toLowerCase()
      const match = rules.find(r => lower.includes(r.pattern.toLowerCase()))
      if (match) {
        await prisma.transaction.update({ where: { id: tx.id }, data: { categoryId: match.categoryId } })
        updated++
      }
    }
    return { updated }
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
    type: 'LOAN' | 'RECEIVABLE'
    counterparty: string
    principal: number
    interestRate?: number | null
    frequency?: string | null
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
        frequency: (data.frequency as any) ?? null,
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
    frequency?: string | null
    nextPaymentDate?: string | null
    endDate?: string | null
    status?: 'ACTIVE' | 'PAID' | 'WRITTEN_OFF'
    accountId?: number | null
    notes?: string | null
  }) => {
    const mapped: Record<string, unknown> = { ...data }
    if (data.nextPaymentDate !== undefined) mapped.nextPaymentDate = data.nextPaymentDate ? new Date(data.nextPaymentDate) : null
    if (data.endDate !== undefined) mapped.endDate = data.endDate ? new Date(data.endDate) : null
    return serialize(await prisma.debt.update({ where: { id }, data: mapped as any, include: debtInclude }))
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
    const newStatus = newOutstanding <= 0 ? 'PAID' : 'ACTIVE'

    // Calculate next payment date
    let nextDate: Date | null = null
    if (newStatus === 'ACTIVE' && debt.frequency && debt.nextPaymentDate) {
      nextDate = new Date(debt.nextPaymentDate)
      switch (debt.frequency) {
        case 'WEEKLY':    nextDate.setDate(nextDate.getDate() + 7); break
        case 'MONTHLY':   nextDate.setMonth(nextDate.getMonth() + 1); break
        case 'QUARTERLY': nextDate.setMonth(nextDate.getMonth() + 3); break
        case 'YEARLY':    nextDate.setFullYear(nextDate.getFullYear() + 1); break
      }
    }

    const [payment] = await prisma.$transaction([
      prisma.debtPayment.create({
        data: {
          debtId: data.debtId,
          date: new Date(data.date),
          amount: data.amount,
          principal: data.principal,
          interest: data.interest,
          notes: data.notes ?? null,
        },
      }),
      prisma.debt.update({
        where: { id: data.debtId },
        data: {
          outstanding: newOutstanding,
          status: newStatus as any,
          nextPaymentDate: nextDate,
        },
      }),
    ])

    // Create a transaction on the linked account if set
    if (debt.accountId && data.amount > 0) {
      const account = await prisma.account.findUniqueOrThrow({ where: { id: debt.accountId } })
      // For a LOAN (I owe), paying reduces my account balance (DEBIT)
      // For a RECEIVABLE (someone owes me), receiving increases my balance (CREDIT)
      const txType = debt.type === 'LOAN' ? 'DEBIT' : 'CREDIT'
      const txAmount = txType === 'DEBIT' ? -data.amount : data.amount
      await prisma.transaction.create({
        data: {
          accountId: debt.accountId,
          date: new Date(data.date),
          description: `Payment: ${debt.name}`,
          amount: txAmount,
          type: txType,
        },
      })
      await prisma.account.update({
        where: { id: debt.accountId },
        data: { balance: Number(account.balance) + txAmount },
      })
    }

    return serialize(await prisma.debt.findUniqueOrThrow({ where: { id: data.debtId }, include: debtInclude }))
  })

  ipcMain.handle('debts:deletePayment', async (_event, paymentId: number) => {
    const payment = await prisma.debtPayment.findUniqueOrThrow({ where: { id: paymentId } })
    const debt = await prisma.debt.findUniqueOrThrow({ where: { id: payment.debtId } })
    // Restore outstanding
    const restored = Math.min(Number(debt.principal), Number(debt.outstanding) + Number(payment.principal))
    await prisma.debt.update({
      where: { id: debt.id },
      data: { outstanding: restored, status: restored > 0 ? 'ACTIVE' : 'PAID' },
    })
    await prisma.debtPayment.delete({ where: { id: paymentId } })
    return serialize(await prisma.debt.findUniqueOrThrow({ where: { id: debt.id }, include: debtInclude }))
  })

  // â”€â”€ Cleanup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ipcMain.on('app:quit', async () => {
    await prisma.$disconnect()
  })
}
