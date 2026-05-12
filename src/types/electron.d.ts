export {}

declare const __APP_VERSION__: string

declare global {
  interface Window {
    api: {
      // Export
      exportSavePath: (defaultName: string, filters: Array<{ name: string; extensions: string[] }>) => Promise<string | null>
      exportTransactions: (opts: { format: 'csv' | 'json'; filePath: string; from?: string; to?: string; accountId?: number }) => Promise<{ exported: number }>
      exportBackup: (filePath: string) => Promise<{ exported: number }>
      importBackup: (filePath: string) => Promise<{ transactions: number }>

      // DB health
      pingDB: () => Promise<boolean>

      // Shortcuts
      loadShortcuts: () => Promise<Record<string, string> | null>
      saveShortcuts: (config: Record<string, string>) => Promise<boolean>

      // File
      openCSVDialog: () => Promise<string | null>
      openJSONDialog: () => Promise<string | null>

      // Import
      importCSV: (filePath: string, accountId: number) => Promise<{ imported: number; skipped: number; errors: string[] }>
      importRevolut: (filePath: string, accountId: number) => Promise<{ imported: number; skipped: number; errors: string[] }>
      importTrading212: (filePath: string) => Promise<{ imported: number; skipped: number; errors: string[]; newInvestments: string[] }>
      listImportHistory: () => Promise<ImportHistory[]>
      deleteImportHistory: (id: number) => Promise<ImportHistory>

      // Investment lots
      listLots: (investmentId: number) => Promise<InvestmentLot[]>
      createLot: (data: { investmentId: number; date: string; shares: number; pricePerShare: number; notes?: string | null }) => Promise<InvestmentLot>
      createSellLot: (data: { investmentId: number; date: string; shares: number; pricePerShare: number; notes?: string | null }) => Promise<InvestmentLot>
      deleteLot: (id: number) => Promise<InvestmentLot>

      // Brokers
      listBrokers: () => Promise<Broker[]>
      createBroker: (data: Omit<Broker, 'id'>) => Promise<Broker>
      updateBroker: (id: number, data: Partial<Omit<Broker, 'id'>>) => Promise<Broker>
      deleteBroker: (id: number) => Promise<Broker>

      // Investment types
      listInvestmentTypes: () => Promise<InvestmentType[]>
      createInvestmentType: (data: Omit<InvestmentType, 'id'>) => Promise<InvestmentType>
      updateInvestmentType: (id: number, data: Partial<Omit<InvestmentType, 'id'>>) => Promise<InvestmentType>
      deleteInvestmentType: (id: number) => Promise<InvestmentType>

      // Investments
      listInvestments: () => Promise<Investment[]>
      createInvestment: (data: Omit<Investment, 'id' | 'type' | 'createdAt' | 'updatedAt'>) => Promise<Investment>
      updateInvestment: (id: number, data: Partial<Omit<Investment, 'id' | 'type'>>) => Promise<Investment>
      deleteInvestment: (id: number) => Promise<Investment>
      lookupISIN: (isin: string) => Promise<Array<{ ticker: string; yahooTicker: string; exchange: string; exchCode: string; name: string; currency: string }>>
      getInvestmentPriceHistory: () => Promise<Array<{ date: string; value: number }>>
      getInvestmentPriceHistoryById: (id: number) => Promise<Array<{ date: string; price: number; value: number }>>
      listExchangeRates: () => Promise<Array<{ id: number; fromCurrency: string; rate: string; updatedAt: string }>>
      refreshInvestmentPrice: (id: number) => Promise<Investment>
      refreshAllPrices: () => Promise<{ updated: number; errors: string[] }>
      getLastPriceRefresh: () => Promise<string | null>
      loadAppSettings: () => Promise<AppSettings>
      saveAppSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>

      // Banks
      listBanks: () => Promise<Bank[]>
      createBank: (data: Omit<Bank, 'id'>) => Promise<Bank>
      updateBank: (id: number, data: Partial<Omit<Bank, 'id'>>) => Promise<Bank>
      deleteBank: (id: number) => Promise<Bank>

      // Account types
      listAccountTypes: () => Promise<AccountType[]>
      createAccountType: (data: Omit<AccountType, 'id'>) => Promise<AccountType>
      updateAccountType: (id: number, data: Partial<Omit<AccountType, 'id'>>) => Promise<AccountType>
      deleteAccountType: (id: number) => Promise<AccountType>

      // Accounts
      listAccounts: () => Promise<Account[]>
      createAccount: (data: Omit<Account, 'id' | 'type'> & { typeId: number }) => Promise<Account>
      updateAccount: (id: number, data: Partial<Omit<Account, 'id' | 'type'> & { typeId: number; _note?: string }>) => Promise<Account>
      listCorrections: (accountId: number) => Promise<BalanceCorrection[]>
      deleteAccount: (id: number) => Promise<Account>

      // Transactions
      listTransactions: (accountId?: number) => Promise<Transaction[]>
      listTransactionsPaged: (opts: { accountId?: number; take: number; skip: number }) => Promise<{ transactions: Transaction[]; total: number }>
      categoriseTransaction: (id: number, categoryId: number) => Promise<Transaction>
      bulkCategoriseTransactions: (ids: number[], categoryId: number | null) => Promise<{ updated: number }>
      getTransactionSplits: (transactionId: number) => Promise<TransactionSplit[]>
      setTransactionSplits: (transactionId: number, splits: Array<{ categoryId: number | null; amount: number; notes?: string | null }>) => Promise<Transaction>
      updateTransaction: (id: number, data: {
        date?: string; description?: string; amount?: number
        type?: 'CREDIT' | 'DEBIT'; notes?: string
      }) => Promise<Transaction>
      createTransaction: (data: {
        accountId: number
        date: string
        description: string
        amount: number
        type: 'CREDIT' | 'DEBIT'
        categoryId?: number | null
        notes?: string
      }) => Promise<Transaction>
      deleteTransaction: (id: number) => Promise<Transaction>
      transferBetweenAccounts: (data: {
        fromAccountId: number
        toAccountId: number
        amount: number
        date: string
        description: string
        categoryId?: number | null
      }) => Promise<{ debit: Transaction; credit: Transaction }>

      // Recurring income
      listIncome: () => Promise<RecurringIncome[]>
      createIncome: (data: Omit<RecurringIncome, 'id' | 'category' | 'account' | 'createdAt' | 'updatedAt'>) => Promise<RecurringIncome>
      updateIncome: (id: number, data: Partial<Omit<RecurringIncome, 'id' | 'category' | 'account'>>) => Promise<RecurringIncome>
      deleteIncome: (id: number) => Promise<RecurringIncome>
      markIncomeReceived: (id: number, actualAmount?: number) => Promise<RecurringIncome>

      // Recurring bills
      listBills: () => Promise<RecurringBill[]>
      createBill: (data: Omit<RecurringBill, 'id' | 'category' | 'createdAt' | 'updatedAt'>) => Promise<RecurringBill>
      updateBill: (id: number, data: Partial<Omit<RecurringBill, 'id' | 'category'>>) => Promise<RecurringBill>
      deleteBill: (id: number) => Promise<RecurringBill>
      markBillPaid: (id: number) => Promise<RecurringBill>

      // Budgets
      listBudgets: () => Promise<Budget[]>
      upsertBudget: (categoryId: number, amount: number) => Promise<Budget>
      deleteBudget: (id: number) => Promise<Budget>

      // Savings goals
      listSavings: () => Promise<SavingsGoal[]>
      syncSavings: () => Promise<void>
      createSavings: (data: Omit<SavingsGoal, 'id' | 'account' | 'createdAt' | 'updatedAt'>) => Promise<SavingsGoal>
      updateSavings: (id: number, data: Partial<Omit<SavingsGoal, 'id' | 'account'>>) => Promise<SavingsGoal>
      deleteSavings: (id: number) => Promise<SavingsGoal>
      applyInterest: (id: number) => Promise<SavingsGoal>
      getSavingsHistory: (goalId: number) => Promise<Array<{ date: string; amount: number }>>

      // Category rules
      listRules: () => Promise<CategoryRule[]>
      createRule: (pattern: string, categoryId: number) => Promise<CategoryRule>
      deleteRule: (id: number) => Promise<CategoryRule>
      applyRulesToAll: () => Promise<{ updated: number }>

      // Auto-updater
      checkForUpdates: () => Promise<UpdaterStatus>
      getUpdateStatus: () => Promise<UpdaterStatus>
      installUpdate: () => Promise<void>
      onUpdateStatus: (cb: (payload: UpdaterStatus) => void) => () => void

      // Categories
      listCategories: () => Promise<Category[]>
      createCategory: (data: Omit<Category, 'id'>) => Promise<Category>
      updateCategory: (id: number, data: Partial<Omit<Category, 'id'>>) => Promise<Category>
      deleteCategory: (id: number) => Promise<Category>

      // Tags
      listTags: () => Promise<Tag[]>
      createTag: (data: { name: string; color?: string | null }) => Promise<Tag>
      deleteTag: (id: number) => Promise<Tag>
      addTagToTransaction: (transactionId: number, tagId: number) => Promise<Transaction>
      removeTagFromTransaction: (transactionId: number, tagId: number) => Promise<Transaction>

      // Debts
      listDebts: () => Promise<Debt[]>
      createDebt: (data: {
        name: string; type: 'LOAN' | 'RECEIVABLE'; counterparty: string
        principal: number; interestRate?: number | null; frequency?: string | null
        nextPaymentDate?: string | null; startDate: string; endDate?: string | null
        accountId?: number | null; notes?: string | null
      }) => Promise<Debt>
      updateDebt: (id: number, data: {
        name?: string; counterparty?: string; interestRate?: number | null
        frequency?: string | null; nextPaymentDate?: string | null; endDate?: string | null
        status?: 'ACTIVE' | 'PAID' | 'WRITTEN_OFF'; accountId?: number | null; notes?: string | null
      }) => Promise<Debt>
      deleteDebt: (id: number) => Promise<Debt>
      recordDebtPayment: (data: { debtId: number; date: string; amount: number; principal: number; interest: number; notes?: string | null }) => Promise<Debt>
      deleteDebtPayment: (paymentId: number) => Promise<Debt>
    }
  }

  interface Broker {
    id: number
    name: string
    color: string | null
    icon: string | null
  }

  interface InvestmentType {
    id: number
    name: string
    color: string | null
    icon: string | null
  }

  interface InvestmentLot {
    id: number
    investmentId: number
    type: 'BUY' | 'SELL'
    date: string
    shares: string
    pricePerShare: string
    totalCost: string       // BUY: cost paid; SELL: proceeds received
    realizedGain: string | null  // SELL only
    notes: string | null
    createdAt: string
  }

  interface Investment {
    id: number
    name: string
    typeId: number
    type: InvestmentType
    amountIn: string
    currentValue: string
    currency: string
    isin: string | null
    ticker: string | null
    shares: string | null
    lastPriceFetched: string | null
    priceUpdatedAt: string | null
    brokerId: number | null
    broker: Broker | null
    notes: string | null
    createdAt: string
    updatedAt: string
    lots: InvestmentLot[]
  }

  interface BalanceCorrection {
    id: number
    accountId: number
    oldBalance: string
    newBalance: string
    note: string | null
    createdAt: string
  }

  interface Bank {
    id: number
    name: string
    color: string | null
    icon: string | null
  }

  interface AccountType {
    id: number
    name: string
    color: string | null
    icon: string | null
  }

  interface Account {
    id: number
    name: string
    bankId: number
    bank: Bank
    accountNumber: string | null
    typeId: number
    type: AccountType
    balance: string
    currency: string
  }

  interface Tag {
    id: number
    name: string
    color: string | null
  }

  interface TransactionSplit {
    id: number
    transactionId: number
    categoryId: number | null
    category: Category | null
    amount: string
    notes: string | null
  }

  interface Transaction {
    id: number
    accountId: number
    categoryId: number | null
    date: string
    valueDate: string | null
    description: string
    amount: string
    type: 'CREDIT' | 'DEBIT'
    runningBalance: string | null
    notes: string | null
    category: Category | null
    tags?: Array<{ tag: Tag }>
    splits?: TransactionSplit[]
  }

  type Frequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

  interface RecurringIncome {
    id: number
    name: string
    amount: string
    frequency: Frequency
    nextExpectedDate: string
    categoryId: number | null
    category: Category | null
    accountId: number | null
    account: Account | null
    notes: string | null
    isActive: boolean
    createdAt: string
    updatedAt: string
  }

  interface RecurringBill {
    id: number
    name: string
    amount: string
    frequency: Frequency
    nextDueDate: string
    categoryId: number | null
    category: Category | null
    accountId: number | null
    account: Account | null
    notes: string | null
    isActive: boolean
    createdAt: string
    updatedAt: string
  }

  interface Budget {
    id: number
    categoryId: number
    category: Category
    amount: string
    createdAt: string
    updatedAt: string
  }

  interface SavingsGoal {
    id: number
    accountId: number | null
    account: Account | null
    name: string
    targetAmount: string
    currentAmount: string
    deadline: string | null
    interestType: 'PERCENTAGE' | 'FIXED' | null
    interestValue: string | null
    interestFrequencyDays: number | null
    lastInterestApplied: string | null
    totalInterestEarned: string
    contributionAmount: string | null
    contributionFrequencyDays: number | null
    notes: string | null
    createdAt: string
    updatedAt: string
  }

  interface CategoryRule {
    id: number
    pattern: string
    categoryId: number
    category: Category
    createdAt: string
  }

  interface Category {
    id: number
    name: string
    type: 'INCOME' | 'EXPENSE'
    color: string | null
    icon: string | null
  }

  interface UpdaterStatus {
    status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error'
    version?: string
    percent?: number
    error?: string
  }

  type RefreshInterval = 'never' | 'startup' | '1h' | '4h' | '8h' | '24h'

  interface AppSettings {
    priceRefreshInterval: RefreshInterval
  }

  interface ImportHistory {
    id: number
    filename: string
    format: string
    accountId: number | null
    account: Account | null
    imported: number
    skipped: number
    errors: number
    importedAt: string
  }

  interface DebtPayment {
    id: number
    debtId: number
    date: string
    amount: string
    principal: string
    interest: string
    notes: string | null
    createdAt: string
  }

  interface Debt {
    id: number
    name: string
    type: 'LOAN' | 'RECEIVABLE'
    counterparty: string
    principal: string
    outstanding: string
    interestRate: string | null
    frequency: Frequency | null
    nextPaymentDate: string | null
    startDate: string
    endDate: string | null
    status: 'ACTIVE' | 'PAID' | 'WRITTEN_OFF'
    accountId: number | null
    account: Account | null
    notes: string | null
    createdAt: string
    updatedAt: string
    payments: DebtPayment[]
  }
}
