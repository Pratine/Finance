// @ts-check
'use strict'

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const dbPath = path.join(__dirname, 'prisma', 'dev.db')

// Apply migrations first so schema is up to date
const migrationsDir = path.join(__dirname, 'migrations')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Apply all migrations
db.prepare(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)`).run()
const applied = new Set(db.prepare(`SELECT name FROM _migrations`).all().map(r => r.name))
const dirs = fs.readdirSync(migrationsDir).sort()

// If tables already exist but _migrations is empty, mark all as applied (Prisma→better-sqlite3 migration)
const hasExistingTables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Account'`).get()
if (hasExistingTables && applied.size === 0) {
  const ins = db.prepare(`INSERT OR IGNORE INTO _migrations (name) VALUES (?)`)
  const markAll = db.transaction(() => { for (const dir of dirs) ins.run(dir) })
  markAll()
} else {
  for (const dir of dirs) {
    if (applied.has(dir)) continue
    const sql = fs.readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      db.prepare(`INSERT INTO _migrations (name) VALUES (?)`).run(dir)
    })()
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rnd(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100
}

function date(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 10, 0, 0)).toISOString()
}

function monthsAgo(n, day = 15) {
  const d = new Date()
  d.setUTCDate(day)
  d.setUTCHours(10, 0, 0, 0)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString()
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

const now = new Date().toISOString()

// ─── Seed ─────────────────────────────────────────────────────────────────────

console.log('Seeding database...')

db.transaction(() => {
  // ── Clear existing data ──────────────────────────────────────────────────────
  for (const t of [
    'TransactionTag','TransactionSplit','Tag','ImportHistory','DebtPayment','Debt',
    'SavingsSnapshot','PriceHistory','ExchangeRate','BalanceCorrection','InvestmentLot',
    'Transaction','SavingsGoal','Budget','RecurringBill','RecurringIncome',
    'CategoryRule','Investment','Account','Category','AccountType','Bank','Broker','InvestmentType',
  ]) { db.prepare(`DELETE FROM "${t}"`).run() }
  db.prepare(`DELETE FROM sqlite_sequence`).run()

  // ── Banks ────────────────────────────────────────────────────────────────────
  const insBank = db.prepare(`INSERT INTO "Bank" (name, color, icon) VALUES (@name, @color, @icon)`)
  const bcpId    = insBank.run({ name: 'Millennium BCP', color: '#c41e3a', icon: 'building-2' }).lastInsertRowid
  const revId    = insBank.run({ name: 'Revolut',        color: '#0075eb', icon: 'credit-card' }).lastInsertRowid
  insBank.run({ name: 'Caixa Geral', color: '#005a2b', icon: 'landmark' })

  // ── Account types ────────────────────────────────────────────────────────────
  const insType = db.prepare(`INSERT INTO "AccountType" (name, color, icon) VALUES (@name, @color, @icon)`)
  const typeCheckingId = insType.run({ name: 'Checking', color: '#3b82f6', icon: 'wallet' }).lastInsertRowid
  const typeSavingsId  = insType.run({ name: 'Savings',  color: '#10b981', icon: 'piggy-bank' }).lastInsertRowid
  const typeWalletId   = insType.run({ name: 'Wallet',   color: '#8b5cf6', icon: 'smartphone' }).lastInsertRowid

  // ── Accounts ─────────────────────────────────────────────────────────────────
  const insAcc = db.prepare(`INSERT INTO "Account" (name, bankId, typeId, accountNumber, balance, currency, createdAt, updatedAt) VALUES (@name, @bankId, @typeId, @accountNumber, @balance, @currency, @createdAt, @updatedAt)`)
  const accMainId    = insAcc.run({ name: 'BCP Conta Ordenado', bankId: bcpId, typeId: typeCheckingId, accountNumber: 'PT50 0010 0001 1234 5678 9015 4', balance: 1247.83, currency: 'EUR', createdAt: now, updatedAt: now }).lastInsertRowid
  const accSavingsId = insAcc.run({ name: 'BCP Poupanca',       bankId: bcpId, typeId: typeSavingsId,  accountNumber: 'PT50 0010 0001 9876 5432 1015 2', balance: 8542.20, currency: 'EUR', createdAt: now, updatedAt: now }).lastInsertRowid
  const accRevolutId = insAcc.run({ name: 'Revolut',            bankId: revId, typeId: typeWalletId,   accountNumber: null,                              balance: 324.55,  currency: 'EUR', createdAt: now, updatedAt: now }).lastInsertRowid

  // ── Categories ───────────────────────────────────────────────────────────────
  const insCat = db.prepare(`INSERT INTO "Category" (name, type, color, icon, createdAt) VALUES (@name, @type, @color, @icon, @createdAt)`)
  const catDefs = [
    { name: 'Groceries',     type: 'EXPENSE', color: '#10b981', icon: 'shopping-cart' },
    { name: 'Rent',          type: 'EXPENSE', color: '#ef4444', icon: 'home' },
    { name: 'Transport',     type: 'EXPENSE', color: '#f59e0b', icon: 'car' },
    { name: 'Restaurants',   type: 'EXPENSE', color: '#8b5cf6', icon: 'utensils' },
    { name: 'Subscriptions', type: 'EXPENSE', color: '#06b6d4', icon: 'tv' },
    { name: 'Healthcare',    type: 'EXPENSE', color: '#ec4899', icon: 'heart-pulse' },
    { name: 'Entertainment', type: 'EXPENSE', color: '#f97316', icon: 'ticket' },
    { name: 'Shopping',      type: 'EXPENSE', color: '#84cc16', icon: 'bag-shopping' },
    { name: 'Utilities',     type: 'EXPENSE', color: '#0ea5e9', icon: 'zap' },
    { name: 'Travel',        type: 'EXPENSE', color: '#a855f7', icon: 'plane' },
    { name: 'Investing',     type: 'EXPENSE', color: '#1d4ed8', icon: 'trending-up' },
    { name: 'Gym',           type: 'EXPENSE', color: '#f43f5e', icon: 'dumbbell' },
    { name: 'Salary',        type: 'INCOME',  color: '#22c55e', icon: 'banknote' },
    { name: 'Freelance',     type: 'INCOME',  color: '#34d399', icon: 'laptop' },
    { name: 'Interest',      type: 'INCOME',  color: '#6ee7b7', icon: 'percent' },
  ]
  const cats = {}
  for (const c of catDefs) {
    cats[c.name] = insCat.run({ ...c, createdAt: now }).lastInsertRowid
  }

  // ── Category rules ───────────────────────────────────────────────────────────
  const insRule = db.prepare(`INSERT INTO "CategoryRule" (pattern, categoryId, createdAt) VALUES (@pattern, @categoryId, @createdAt)`)
  const rules = [
    { pattern: 'pingo doce',    categoryId: cats['Groceries'] },
    { pattern: 'continente',    categoryId: cats['Groceries'] },
    { pattern: 'lidl',          categoryId: cats['Groceries'] },
    { pattern: 'aldi',          categoryId: cats['Groceries'] },
    { pattern: 'minipreço',     categoryId: cats['Groceries'] },
    { pattern: 'renda',         categoryId: cats['Rent'] },
    { pattern: 'cp comboios',   categoryId: cats['Transport'] },
    { pattern: 'uber',          categoryId: cats['Transport'] },
    { pattern: 'bolt',          categoryId: cats['Transport'] },
    { pattern: 'galp',          categoryId: cats['Transport'] },
    { pattern: 'netflix',       categoryId: cats['Subscriptions'] },
    { pattern: 'spotify',       categoryId: cats['Subscriptions'] },
    { pattern: 'nzxt',          categoryId: cats['Subscriptions'] },
    { pattern: 'farmácia',      categoryId: cats['Healthcare'] },
    { pattern: 'dental',        categoryId: cats['Healthcare'] },
    { pattern: 'cinema',        categoryId: cats['Entertainment'] },
    { pattern: 'trading 212',   categoryId: cats['Investing'] },
    { pattern: 'fnac',          categoryId: cats['Shopping'] },
    { pattern: 'zara',          categoryId: cats['Shopping'] },
    { pattern: 'h&m',           categoryId: cats['Shopping'] },
    { pattern: 'edp',           categoryId: cats['Utilities'] },
    { pattern: 'nos ',          categoryId: cats['Utilities'] },
    { pattern: 'holmes place',  categoryId: cats['Gym'] },
    { pattern: 'ordenado',      categoryId: cats['Salary'] },
  ]
  for (const r of rules) insRule.run({ ...r, createdAt: now })

  // ── Budgets ──────────────────────────────────────────────────────────────────
  const insBudget = db.prepare(`INSERT INTO "Budget" (categoryId, amount, createdAt, updatedAt) VALUES (@categoryId, @amount, @createdAt, @updatedAt)`)
  for (const b of [
    { name: 'Groceries',     amount: 350 },
    { name: 'Restaurants',   amount: 150 },
    { name: 'Transport',     amount: 80  },
    { name: 'Subscriptions', amount: 40  },
    { name: 'Entertainment', amount: 60  },
    { name: 'Shopping',      amount: 100 },
    { name: 'Healthcare',    amount: 50  },
    { name: 'Gym',           amount: 45  },
  ]) insBudget.run({ categoryId: cats[b.name], amount: b.amount, createdAt: now, updatedAt: now })

  // ── Recurring bills ──────────────────────────────────────────────────────────
  const insBill = db.prepare(`INSERT INTO "RecurringBill" (name, amount, frequency, nextDueDate, categoryId, accountId, isActive, createdAt, updatedAt) VALUES (@name, @amount, @frequency, @nextDueDate, @categoryId, @accountId, @isActive, @createdAt, @updatedAt)`)
  const bill = (o) => insBill.run({ ...o, createdAt: now, updatedAt: now })
  bill({ name: 'Renda Apartamento', amount: 850,          frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 1),  categoryId: cats['Rent'],          accountId: accMainId,    isActive: 1 })
  bill({ name: 'Netflix',           amount: 15.99,        frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 8),  categoryId: cats['Subscriptions'], accountId: accRevolutId, isActive: 1 })
  bill({ name: 'Spotify',           amount: 9.99,         frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 12), categoryId: cats['Subscriptions'], accountId: accRevolutId, isActive: 1 })
  bill({ name: 'Holmes Place Gym',  amount: 42.90,        frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 5),  categoryId: cats['Gym'],           accountId: accRevolutId, isActive: 1 })
  bill({ name: 'NOS Internet',      amount: 34.90,        frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 20), categoryId: cats['Utilities'],     accountId: accMainId,    isActive: 1 })
  bill({ name: 'EDP Electricidade', amount: rnd(55, 110), frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 15), categoryId: cats['Utilities'],     accountId: accMainId,    isActive: 1 })
  bill({ name: 'Trading 212 DCA',   amount: 200,          frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 3),  categoryId: cats['Investing'],     accountId: accMainId,    isActive: 1 })

  // ── Transactions — 18 months ─────────────────────────────────────────────────
  let mainBalance = 320.00
  const insTx = db.prepare(`INSERT INTO "Transaction" (accountId, description, amount, type, date, valueDate, categoryId, runningBalance, notes, importHash, createdAt) VALUES (@accountId, @description, @amount, @type, @date, @valueDate, @categoryId, @runningBalance, @notes, @importHash, @createdAt)`)

  let txId = 1
  const now = new Date()
  const MONTHS = 18

  function tx(accountId, description, amount, type, txDate, categoryId = null, runningBal = null) {
    const id = txId++
    insTx.run({
      accountId,
      description,
      amount: type === 'DEBIT' ? -Math.abs(amount) : Math.abs(amount),
      type,
      date: txDate,
      valueDate: txDate,
      categoryId,
      runningBalance: runningBal,
      notes: null,
      importHash: `seed-${id}-${txDate}`,
      createdAt: now,
    })
  }

  for (let mo = MONTHS - 1; mo >= 0; mo--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - mo, 1))
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1

    const salary = rnd(2700, 2900)
    mainBalance += salary
    tx(accMainId, 'ORDENADO EMPRESA XYZ LDA', salary, 'CREDIT', date(y, m, 25), cats['Salary'], mainBalance)

    mainBalance -= 850
    tx(accMainId, 'TRANSFERENCIA RENDA APT', 850, 'DEBIT', date(y, m, 1), cats['Rent'], mainBalance)

    const edp = rnd(55, 115)
    mainBalance -= edp
    tx(accMainId, 'EDP COMERCIAL ELECTRICIDADE', edp, 'DEBIT', date(y, m, 15), cats['Utilities'], mainBalance)

    mainBalance -= 34.90
    tx(accMainId, 'NOS COMUNICACOES SA', 34.90, 'DEBIT', date(y, m, 20), cats['Utilities'], mainBalance)

    if (mo % 3 === 0) {
      const free = rnd(300, 800)
      mainBalance += free
      tx(accMainId, 'FREELANCE PROJETO DIGITAL', free, 'CREDIT', date(y, m, rnd(5, 20)), cats['Freelance'], mainBalance)
    }

    const savingsTransfer = rnd(150, 400)
    mainBalance -= savingsTransfer
    tx(accMainId, 'TRANSFERENCIA POUPANCA', savingsTransfer, 'DEBIT', date(y, m, 28), null, mainBalance)

    mainBalance -= 200
    tx(accMainId, 'TRADING 212 INVEST', 200, 'DEBIT', date(y, m, 3), cats['Investing'], mainBalance)

    const topup = rnd(200, 400)
    mainBalance -= topup
    tx(accMainId, 'TRANSFERENCIA REVOLUT', topup, 'DEBIT', date(y, m, 5), null, mainBalance)

    const groceryTrips = Math.floor(rnd(4, 6))
    for (let g = 0; g < groceryTrips; g++) {
      const store = pick(['Pingo Doce', 'Continente', 'Lidl', 'Aldi', 'Minipreço'])
      tx(accRevolutId, store.toUpperCase(), rnd(18, 75), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Groceries'])
    }

    const restNames = ["Tasca da Esquina", "Time Out Market", "McDonald's", "Nando's", "Pizza Hut", "Sushi Place", "Taberna Moderna", "O Corvo"]
    for (let r = 0; r < Math.floor(rnd(2, 6)); r++) {
      tx(accRevolutId, pick(restNames).toUpperCase(), rnd(12, 55), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Restaurants'])
    }

    const transportDefs = [
      { desc: 'UBER TRIP',            amt: () => rnd(5, 18) },
      { desc: 'BOLT TRIP',            amt: () => rnd(4, 15) },
      { desc: 'CP COMBOIOS PORTUGAL', amt: () => rnd(3, 12) },
      { desc: 'GALP COMBUSTIVEL',     amt: () => rnd(40, 70) },
    ]
    for (let t = 0; t < Math.floor(rnd(2, 5)); t++) {
      const tr = pick(transportDefs)
      tx(accRevolutId, tr.desc, tr.amt(), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Transport'])
    }

    tx(accRevolutId, 'NETFLIX.COM',      15.99, 'DEBIT', date(y, m, 8),  cats['Subscriptions'])
    tx(accRevolutId, 'SPOTIFY AB',        9.99, 'DEBIT', date(y, m, 12), cats['Subscriptions'])
    tx(accRevolutId, 'HOLMES PLACE PORTUGAL', 42.90, 'DEBIT', date(y, m, 5), cats['Gym'])

    if (Math.random() > 0.6) {
      const pharmNames = ['FARMACIA CENTRAL', 'FARMACIA SAUDE', 'DENTAL CLINIC LISBOA']
      tx(accRevolutId, pick(pharmNames), rnd(8, 85), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Healthcare'])
    }
    if (Math.random() > 0.5) {
      const shops = ['ZARA', 'H&M', 'FNAC PORTUGAL', 'EL CORTE INGLES', 'DECATHLON']
      tx(accRevolutId, pick(shops), rnd(20, 150), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Shopping'])
    }
    if (Math.random() > 0.55) {
      const ent = ['CINEMA NOS', 'TICKETMASTER', 'BOWLING STRIKE', 'ESCAPE ROOM']
      tx(accRevolutId, pick(ent), rnd(10, 60), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Entertainment'])
    }
    if (mo === 14 || mo === 6) {
      tx(accRevolutId, 'RYANAIR',     rnd(80, 220),  'DEBIT', date(y, m, 10), cats['Travel'])
      tx(accRevolutId, 'BOOKING.COM', rnd(150, 400), 'DEBIT', date(y, m, 12), cats['Travel'])
      if (mo === 14) tx(accRevolutId, 'AIRBNB MADRID', rnd(120, 300), 'DEBIT', date(y, m, 14), cats['Travel'])
    }
  }

  console.log(`  Transactions: ${txId - 1}`)
  db.prepare(`UPDATE "Account" SET balance = ? WHERE id = ?`).run(mainBalance, accMainId)

  // ── Savings goal + snapshots ──────────────────────────────────────────────────
  const goalId = db.prepare(`
    INSERT INTO "SavingsGoal" (accountId, name, targetAmount, currentAmount, interestType, interestValue, interestFrequencyDays, totalInterestEarned, contributionAmount, contributionFrequencyDays, deadline, notes, createdAt, updatedAt)
    VALUES (@accountId, @name, @targetAmount, @currentAmount, @interestType, @interestValue, @interestFrequencyDays, @totalInterestEarned, @contributionAmount, @contributionFrequencyDays, @deadline, @notes, @createdAt, @updatedAt)
  `).run({
    accountId: accSavingsId,
    name: 'BCP Poupança',
    targetAmount: 15000,
    currentAmount: 8542.20,
    interestType: 'PERCENTAGE',
    interestValue: 2.5,
    interestFrequencyDays: 180,
    totalInterestEarned: 312.40,
    contributionAmount: 250,
    contributionFrequencyDays: 30,
    deadline: new Date(Date.UTC(new Date().getUTCFullYear() + 2, 5, 30)).toISOString(),
    notes: 'Emergency fund + long-term savings',
    createdAt: now, updatedAt: now,
  }).lastInsertRowid

  const insSnap = db.prepare(`INSERT INTO "SavingsSnapshot" (goalId, date, amount, note) VALUES (@goalId, @date, @amount, @note)`)
  let savBal = 2100
  for (let mo = 17; mo >= 0; mo--) {
    savBal += rnd(200, 420)
    if (mo % 6 === 0) savBal += savBal * 0.0125
    insSnap.run({ goalId, date: monthsAgo(mo, 28), amount: Math.round(savBal * 100) / 100, note: mo % 6 === 0 ? 'interest' : 'contribution' })
  }
  console.log('  Savings goal + 18 snapshots')

  // ── Investment types + brokers ────────────────────────────────────────────────
  const insInvType = db.prepare(`INSERT INTO "InvestmentType" (name, color, icon) VALUES (@name, @color, @icon)`)
  const typeETFId    = insInvType.run({ name: 'ETF',    color: '#3b82f6', icon: 'trending-up' }).lastInsertRowid
  const typeStockId  = insInvType.run({ name: 'Stocks', color: '#8b5cf6', icon: 'bar-chart-2' }).lastInsertRowid
  const typeCryptoId = insInvType.run({ name: 'Crypto', color: '#f59e0b', icon: 'bitcoin' }).lastInsertRowid

  const insBroker = db.prepare(`INSERT INTO "Broker" (name, color, icon) VALUES (@name, @color, @icon)`)
  const brokerT212Id = insBroker.run({ name: 'Trading 212',         color: '#00cf73', icon: 'trending-up' }).lastInsertRowid
  const brokerIBKRId = insBroker.run({ name: 'Interactive Brokers', color: '#c41e3a', icon: 'landmark'    }).lastInsertRowid

  // ── Investments + price history ───────────────────────────────────────────────
  const insInv = db.prepare(`
    INSERT INTO "Investment" (name, typeId, brokerId, isin, ticker, shares, amountIn, currentValue, lastPriceFetched, currency, priceUpdatedAt, notes, createdAt, updatedAt)
    VALUES (@name, @typeId, @brokerId, @isin, @ticker, @shares, @amountIn, @currentValue, @lastPriceFetched, @currency, @priceUpdatedAt, @notes, @createdAt, @updatedAt)
  `)
  const insPrice = db.prepare(`INSERT INTO "PriceHistory" (investmentId, price, value, recordedAt) VALUES (@investmentId, @price, @value, @recordedAt)`)

  const invDefs = [
    { name: 'iShares Core MSCI World', typeId: typeETFId,    brokerId: brokerT212Id, isin: 'IE00B4L5Y983', ticker: 'IWDA.AS',  shares: 18.742, amountIn: 2800, startPrice: 72,    endPrice: 95,    currency: 'EUR' },
    { name: 'Vanguard S&P 500',        typeId: typeETFId,    brokerId: brokerT212Id, isin: 'IE00B3XXRP09', ticker: 'VUSA.AS',  shares: 22.15,  amountIn: 1750, startPrice: 76,    endPrice: 102,   currency: 'EUR' },
    { name: 'Apple Inc.',              typeId: typeStockId,  brokerId: brokerIBKRId, isin: null,           ticker: 'AAPL',     shares: 3.5,    amountIn: 620,  startPrice: 165,   endPrice: 213,   currency: 'USD' },
    { name: 'Bitcoin',                 typeId: typeCryptoId, brokerId: null,         isin: null,           ticker: 'BTC-EUR',  shares: 0.04182,amountIn: 1200, startPrice: 28000, endPrice: 87000, currency: 'EUR' },
  ]

  for (const def of invDefs) {
    const fxRate = def.currency === 'USD' ? 0.93 : 1
    const currentValue = Math.round(def.endPrice * def.shares * fxRate * 100) / 100
    const invId = insInv.run({
      name: def.name, typeId: def.typeId, brokerId: def.brokerId,
      isin: def.isin, ticker: def.ticker, shares: def.shares, amountIn: def.amountIn,
      currentValue, lastPriceFetched: def.endPrice * fxRate,
      currency: def.currency, priceUpdatedAt: new Date().toISOString(), notes: null,
      createdAt: now, updatedAt: now,
    }).lastInsertRowid

    const priceRange = def.endPrice - def.startPrice
    for (let mo = 17; mo >= 0; mo--) {
      const progress = (17 - mo) / 17
      const noise = rnd(-0.03, 0.04)
      const price = def.startPrice + priceRange * (progress + noise)
      const priceEUR = price * fxRate
      const snapDate = new Date(); snapDate.setUTCDate(1); snapDate.setUTCHours(0,0,0,0); snapDate.setUTCMonth(snapDate.getUTCMonth() - mo)
      insPrice.run({ investmentId: invId, price: Math.round(priceEUR * 10000) / 10000, value: Math.round(priceEUR * def.shares * 100) / 100, recordedAt: snapDate.toISOString() })
    }
  }
  console.log('  4 investments + price history')

  // ── Exchange rate ────────────────────────────────────────────────────────────
  db.prepare(`INSERT INTO "ExchangeRate" (fromCurrency, rate, updatedAt) VALUES ('USD', 0.93, '${now}')`).run()

  // ── Debts ────────────────────────────────────────────────────────────────────
  const insDebt = db.prepare(`
    INSERT INTO "Debt" (name, type, counterparty, principal, outstanding, interestRate, frequency, nextPaymentDate, startDate, endDate, status, accountId, notes, createdAt, updatedAt)
    VALUES (@name, @type, @counterparty, @principal, @outstanding, @interestRate, @frequency, @nextPaymentDate, @startDate, @endDate, @status, @accountId, @notes, @createdAt, @updatedAt)
  `)
  const insPayment = db.prepare(`INSERT INTO "DebtPayment" (debtId, date, amount, principal, interest, notes, createdAt) VALUES (@debtId, @date, @amount, @principal, @interest, @notes, @createdAt)`)

  const carLoanId = insDebt.run({
    name: 'Emprestimo Automovel', type: 'LOAN', counterparty: 'Caixa Geral de Depositos',
    principal: 12000, outstanding: 7840, interestRate: 5.2, frequency: 'MONTHLY',
    nextPaymentDate: monthsAgo(0, 15), startDate: monthsAgo(18, 1),
    endDate: new Date(Date.UTC(new Date().getUTCFullYear() + 3, 0, 1)).toISOString(),
    status: 'ACTIVE', accountId: accMainId, notes: 'Citroen C3 — 48 month loan',
  }).lastInsertRowid

  let carOutstanding = 9200
  for (let mo = 6; mo >= 1; mo--) {
    const interest  = Math.round(carOutstanding * (0.052 / 12) * 100) / 100
    const principal = Math.round((250 - interest) * 100) / 100
    carOutstanding  = Math.max(0, carOutstanding - principal)
    insPayment.run({ debtId: carLoanId, date: monthsAgo(mo, 15), amount: 250, principal, interest, notes: null })
  }

  const joanId = insDebt.run({
    name: 'Emprestimo ao Joao', type: 'RECEIVABLE', counterparty: 'Joao Silva',
    principal: 500, outstanding: 200, interestRate: null, frequency: 'MONTHLY',
    nextPaymentDate: monthsAgo(0, 20), startDate: monthsAgo(5, 10),
    endDate: null, status: 'ACTIVE', accountId: null, notes: 'Equipamento para projeto',
  }).lastInsertRowid

  insPayment.run({ debtId: joanId, date: monthsAgo(3, 20), amount: 300, principal: 300, interest: 0, notes: 'Primeira prestacao' })

  console.log('  2 debts + payments')
})()

const counts = {
  transactions: db.prepare(`SELECT COUNT(*) as n FROM "Transaction"`).get().n,
  accounts:     db.prepare(`SELECT COUNT(*) as n FROM "Account"`).get().n,
  investments:  db.prepare(`SELECT COUNT(*) as n FROM "Investment"`).get().n,
  goals:        db.prepare(`SELECT COUNT(*) as n FROM "SavingsGoal"`).get().n,
  debts:        db.prepare(`SELECT COUNT(*) as n FROM "Debt"`).get().n,
}
console.log(`\nDone! ${counts.transactions} transactions · ${counts.accounts} accounts · ${counts.investments} investments · ${counts.goals} savings goals · ${counts.debts} debts`)
db.close()
