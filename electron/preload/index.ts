// Runs in an isolated context between the main process and the renderer.
// contextBridge.exposeInMainWorld makes window.api available in React while
// keeping Node.js and Electron internals fully sandboxed from the renderer.
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Export
  exportSavePath: (defaultName: string, filters: Array<{ name: string; extensions: string[] }>) =>
    ipcRenderer.invoke('export:savePath', defaultName, filters),
  exportTransactions: (opts: unknown) => ipcRenderer.invoke('export:transactions', opts),
  exportBackup: (filePath: string) => ipcRenderer.invoke('export:backup', filePath),
  importBackup: (filePath: string) => ipcRenderer.invoke('import:backup', filePath),

  // DB health
  pingDB: () => ipcRenderer.invoke('db:ping'),

  // Shortcuts
  loadShortcuts: () => ipcRenderer.invoke('shortcuts:load'),
  saveShortcuts: (config: unknown) => ipcRenderer.invoke('shortcuts:save', config),

  // File
  openCSVDialog: () => ipcRenderer.invoke('dialog:openCSV'),
  openJSONDialog: () => ipcRenderer.invoke('dialog:openJSON'),

  // Import
  importCSV: (filePath: string, accountId: number) =>
    ipcRenderer.invoke('import:millenniumCSV', filePath, accountId),
  importRevolut: (filePath: string, accountId: number) =>
    ipcRenderer.invoke('import:revolut', filePath, accountId),
  listImportHistory: () => ipcRenderer.invoke('import:listHistory'),
  deleteImportHistory: (id: number) => ipcRenderer.invoke('import:deleteHistory', id),

  // Investment lots
  listLots: (investmentId: number) => ipcRenderer.invoke('lots:list', investmentId),
  createLot: (data: unknown) => ipcRenderer.invoke('lots:create', data),
  createSellLot: (data: unknown) => ipcRenderer.invoke('lots:createSell', data),
  deleteLot: (id: number) => ipcRenderer.invoke('lots:delete', id),

  // Brokers
  listBrokers: () => ipcRenderer.invoke('brokers:list'),
  createBroker: (data: unknown) => ipcRenderer.invoke('brokers:create', data),
  updateBroker: (id: number, data: unknown) => ipcRenderer.invoke('brokers:update', id, data),
  deleteBroker: (id: number) => ipcRenderer.invoke('brokers:delete', id),

  // Investment types
  listInvestmentTypes: () => ipcRenderer.invoke('investmentTypes:list'),
  createInvestmentType: (data: unknown) => ipcRenderer.invoke('investmentTypes:create', data),
  updateInvestmentType: (id: number, data: unknown) => ipcRenderer.invoke('investmentTypes:update', id, data),
  deleteInvestmentType: (id: number) => ipcRenderer.invoke('investmentTypes:delete', id),

  // Investments
  listInvestments: () => ipcRenderer.invoke('investments:list'),
  createInvestment: (data: unknown) => ipcRenderer.invoke('investments:create', data),
  updateInvestment: (id: number, data: unknown) => ipcRenderer.invoke('investments:update', id, data),
  deleteInvestment: (id: number) => ipcRenderer.invoke('investments:delete', id),
  lookupISIN: (isin: string) => ipcRenderer.invoke('investments:lookupISIN', isin),
  getInvestmentPriceHistory: () => ipcRenderer.invoke('investments:priceHistory'),
  getInvestmentPriceHistoryById: (id: number) => ipcRenderer.invoke('investments:priceHistoryById', id),
  listExchangeRates: () => ipcRenderer.invoke('exchangeRates:list'),
  refreshInvestmentPrice: (id: number) => ipcRenderer.invoke('investments:refreshPrice', id),
  refreshAllPrices: () => ipcRenderer.invoke('investments:refreshAll'),
  getLastPriceRefresh: () => ipcRenderer.invoke('investments:lastRefresh'),
  loadAppSettings: () => ipcRenderer.invoke('appSettings:load'),
  saveAppSettings: (patch: unknown) => ipcRenderer.invoke('appSettings:save', patch),

  // Banks
  listBanks: () => ipcRenderer.invoke('banks:list'),
  createBank: (data: unknown) => ipcRenderer.invoke('banks:create', data),
  updateBank: (id: number, data: unknown) => ipcRenderer.invoke('banks:update', id, data),
  deleteBank: (id: number) => ipcRenderer.invoke('banks:delete', id),

  // Account types
  listAccountTypes: () => ipcRenderer.invoke('accountTypes:list'),
  createAccountType: (data: unknown) => ipcRenderer.invoke('accountTypes:create', data),
  updateAccountType: (id: number, data: unknown) => ipcRenderer.invoke('accountTypes:update', id, data),
  deleteAccountType: (id: number) => ipcRenderer.invoke('accountTypes:delete', id),

  // Accounts
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  createAccount: (data: unknown) => ipcRenderer.invoke('accounts:create', data),
  updateAccount: (id: number, data: unknown) => ipcRenderer.invoke('accounts:update', id, data),
  listCorrections: (accountId: number) => ipcRenderer.invoke('accounts:corrections', accountId),
  deleteAccount: (id: number) => ipcRenderer.invoke('accounts:delete', id),

  // Transactions
  listTransactions: (accountId?: number) => ipcRenderer.invoke('transactions:list', accountId),
  listTransactionsPaged: (opts: { accountId?: number; take: number; skip: number }) =>
    ipcRenderer.invoke('transactions:listPaged', opts),
  categoriseTransaction: (id: number, categoryId: number) =>
    ipcRenderer.invoke('transactions:categorise', id, categoryId),
  createTransaction: (data: unknown) => ipcRenderer.invoke('transactions:create', data),
  bulkCategoriseTransactions: (ids: number[], categoryId: number | null) => ipcRenderer.invoke('transactions:bulkCategorise', ids, categoryId),
  getTransactionSplits: (transactionId: number) => ipcRenderer.invoke('transactions:getSplits', transactionId),
  setTransactionSplits: (transactionId: number, splits: Array<{ categoryId: number | null; amount: number; notes?: string | null }>) => ipcRenderer.invoke('transactions:setSplits', transactionId, splits),
  updateTransaction: (id: number, data: unknown) => ipcRenderer.invoke('transactions:update', id, data),
  deleteTransaction: (id: number) => ipcRenderer.invoke('transactions:delete', id),
  transferBetweenAccounts: (data: unknown) => ipcRenderer.invoke('transactions:transfer', data),

  // Savings goals
  listSavings: () => ipcRenderer.invoke('savings:list'),
  syncSavings: () => ipcRenderer.invoke('savings:sync'),
  createSavings: (data: unknown) => ipcRenderer.invoke('savings:create', data),
  updateSavings: (id: number, data: unknown) => ipcRenderer.invoke('savings:update', id, data),
  deleteSavings: (id: number) => ipcRenderer.invoke('savings:delete', id),
  applyInterest: (id: number) => ipcRenderer.invoke('savings:applyInterest', id),
  getSavingsHistory: (goalId: number) => ipcRenderer.invoke('savings:history', goalId),

  // Recurring income
  listIncome: () => ipcRenderer.invoke('income:list'),
  createIncome: (data: unknown) => ipcRenderer.invoke('income:create', data),
  updateIncome: (id: number, data: unknown) => ipcRenderer.invoke('income:update', id, data),
  deleteIncome: (id: number) => ipcRenderer.invoke('income:delete', id),
  markIncomeReceived: (id: number, actualAmount?: number) => ipcRenderer.invoke('income:markReceived', id, actualAmount),

  // Recurring bills
  listBills: () => ipcRenderer.invoke('bills:list'),
  createBill: (data: unknown) => ipcRenderer.invoke('bills:create', data),
  updateBill: (id: number, data: unknown) => ipcRenderer.invoke('bills:update', id, data),
  deleteBill: (id: number) => ipcRenderer.invoke('bills:delete', id),
  markBillPaid: (id: number) => ipcRenderer.invoke('bills:markPaid', id),

  // Budgets
  listBudgets: () => ipcRenderer.invoke('budgets:list'),
  upsertBudget: (categoryId: number, amount: number) => ipcRenderer.invoke('budgets:upsert', categoryId, amount),
  deleteBudget: (id: number) => ipcRenderer.invoke('budgets:delete', id),

  // Category rules
  listRules: () => ipcRenderer.invoke('rules:list'),
  createRule: (pattern: string, categoryId: number) => ipcRenderer.invoke('rules:create', pattern, categoryId),
  deleteRule: (id: number) => ipcRenderer.invoke('rules:delete', id),
  applyRulesToAll: () => ipcRenderer.invoke('rules:applyToAll'),

  // Tags
  listTags: () => ipcRenderer.invoke('tags:list'),
  createTag: (data: { name: string; color?: string | null }) => ipcRenderer.invoke('tags:create', data),
  deleteTag: (id: number) => ipcRenderer.invoke('tags:delete', id),
  addTagToTransaction: (transactionId: number, tagId: number) => ipcRenderer.invoke('tags:addToTransaction', transactionId, tagId),
  removeTagFromTransaction: (transactionId: number, tagId: number) => ipcRenderer.invoke('tags:removeFromTransaction', transactionId, tagId),

  // Debts
  listDebts: () => ipcRenderer.invoke('debts:list'),
  createDebt: (data: unknown) => ipcRenderer.invoke('debts:create', data),
  updateDebt: (id: number, data: unknown) => ipcRenderer.invoke('debts:update', id, data),
  deleteDebt: (id: number) => ipcRenderer.invoke('debts:delete', id),
  recordDebtPayment: (data: unknown) => ipcRenderer.invoke('debts:recordPayment', data),
  deleteDebtPayment: (paymentId: number) => ipcRenderer.invoke('debts:deletePayment', paymentId),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  getUpdateStatus: () => ipcRenderer.invoke('updater:getStatus'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateStatus: (cb: (payload: { status: string; version?: string; percent?: number; error?: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: typeof cb extends (p: infer P) => void ? P : never) => cb(payload)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  },

  // Categories
  listCategories: () => ipcRenderer.invoke('categories:list'),
  createCategory: (data: unknown) => ipcRenderer.invoke('categories:create', data),
  updateCategory: (id: number, data: unknown) => ipcRenderer.invoke('categories:update', id, data),
  deleteCategory: (id: number) => ipcRenderer.invoke('categories:delete', id),
})
