// @ts-check
'use strict'

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rnd(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100
}

function date(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 10, 0, 0))
}

// Build a date N months before today
function monthsAgo(n, day = 15) {
  const d = new Date()
  d.setUTCDate(day)
  d.setUTCHours(10, 0, 0, 0)
  d.setUTCMonth(d.getUTCMonth() - n)
  return new Date(d)
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database...')

  // ── Clear existing data (SQLite uses DELETE FROM, no TRUNCATE) ──────────────
  // Reset autoincrement counters
  for (const t of [
    'TransactionTag','TransactionSplit','Tag','ImportHistory','DebtPayment','Debt',
    'SavingsSnapshot','PriceHistory','ExchangeRate','BalanceCorrection','InvestmentLot',
    'Transaction','SavingsGoal','Budget','RecurringBill','RecurringIncome',
    'CategoryRule','Investment','Account','Category','AccountType','Bank','Broker','InvestmentType',
  ]) { await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`) }
  await prisma.$executeRaw`DELETE FROM sqlite_sequence`

  // ── Banks ───────────────────────────────────────────────────────────────────
  const [bcp, revolut, cgd] = await Promise.all([
    prisma.bank.create({ data: { name: 'Millennium BCP', color: '#c41e3a', icon: 'building-2' } }),
    prisma.bank.create({ data: { name: 'Revolut',        color: '#0075eb', icon: 'credit-card' } }),
    prisma.bank.create({ data: { name: 'Caixa Geral',    color: '#005a2b', icon: 'landmark' } }),
  ])

  // ── Account types ───────────────────────────────────────────────────────────
  const [typeChecking, typeSavings, typeWallet] = await Promise.all([
    prisma.accountType.create({ data: { name: 'Checking', color: '#3b82f6', icon: 'wallet' } }),
    prisma.accountType.create({ data: { name: 'Savings',  color: '#10b981', icon: 'piggy-bank' } }),
    prisma.accountType.create({ data: { name: 'Wallet',   color: '#8b5cf6', icon: 'smartphone' } }),
  ])

  // ── Accounts ────────────────────────────────────────────────────────────────
  const [accMain, accSavings, accRevolut] = await Promise.all([
    prisma.account.create({ data: { name: 'BCP Conta Ordenado', bankId: bcp.id, typeId: typeChecking.id, accountNumber: 'PT50 0010 0001 1234 5678 9015 4', balance: 1247.83, currency: 'EUR' } }),
    prisma.account.create({ data: { name: 'BCP Poupança',       bankId: bcp.id, typeId: typeSavings.id,  accountNumber: 'PT50 0010 0001 9876 5432 1015 2', balance: 8542.20, currency: 'EUR' } }),
    prisma.account.create({ data: { name: 'Revolut',            bankId: revolut.id, typeId: typeWallet.id, balance: 324.55, currency: 'EUR' } }),
  ])

  // ── Categories ──────────────────────────────────────────────────────────────
  const catDefs = [
    // Expense
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
    // Income
    { name: 'Salary',        type: 'INCOME',  color: '#22c55e', icon: 'banknote' },
    { name: 'Freelance',     type: 'INCOME',  color: '#34d399', icon: 'laptop' },
    { name: 'Interest',      type: 'INCOME',  color: '#6ee7b7', icon: 'percent' },
  ]
  const cats = {}
  for (const c of catDefs) {
    cats[c.name] = await prisma.category.create({ data: c })
  }

  // ── Category rules ──────────────────────────────────────────────────────────
  const rules = [
    { pattern: 'pingo doce',    categoryId: cats['Groceries'].id },
    { pattern: 'continente',    categoryId: cats['Groceries'].id },
    { pattern: 'lidl',          categoryId: cats['Groceries'].id },
    { pattern: 'aldi',          categoryId: cats['Groceries'].id },
    { pattern: 'minipreço',     categoryId: cats['Groceries'].id },
    { pattern: 'renda',         categoryId: cats['Rent'].id },
    { pattern: 'cp comboios',   categoryId: cats['Transport'].id },
    { pattern: 'uber',          categoryId: cats['Transport'].id },
    { pattern: 'bolt',          categoryId: cats['Transport'].id },
    { pattern: 'galp',          categoryId: cats['Transport'].id },
    { pattern: 'netflix',       categoryId: cats['Subscriptions'].id },
    { pattern: 'spotify',       categoryId: cats['Subscriptions'].id },
    { pattern: 'nzxt',          categoryId: cats['Subscriptions'].id },
    { pattern: 'farmácia',      categoryId: cats['Healthcare'].id },
    { pattern: 'dental',        categoryId: cats['Healthcare'].id },
    { pattern: 'cinema',        categoryId: cats['Entertainment'].id },
    { pattern: 'trading 212',   categoryId: cats['Investing'].id },
    { pattern: 'fnac',          categoryId: cats['Shopping'].id },
    { pattern: 'zara',          categoryId: cats['Shopping'].id },
    { pattern: 'h&m',           categoryId: cats['Shopping'].id },
    { pattern: 'edp',           categoryId: cats['Utilities'].id },
    { pattern: 'nos ',          categoryId: cats['Utilities'].id },
    { pattern: 'holmes place',  categoryId: cats['Gym'].id },
    { pattern: 'ordenado',      categoryId: cats['Salary'].id },
  ]
  for (const r of rules) {
    await prisma.categoryRule.create({ data: r })
  }

  // ── Budgets ─────────────────────────────────────────────────────────────────
  const budgetDefs = [
    { name: 'Groceries',     amount: 350 },
    { name: 'Restaurants',   amount: 150 },
    { name: 'Transport',     amount: 80  },
    { name: 'Subscriptions', amount: 40  },
    { name: 'Entertainment', amount: 60  },
    { name: 'Shopping',      amount: 100 },
    { name: 'Healthcare',    amount: 50  },
    { name: 'Gym',           amount: 45  },
  ]
  for (const b of budgetDefs) {
    await prisma.budget.create({ data: { categoryId: cats[b.name].id, amount: b.amount } })
  }

  // ── Recurring bills ─────────────────────────────────────────────────────────
  await Promise.all([
    prisma.recurringBill.create({ data: { name: 'Renda Apartamento', amount: 850, frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 1), categoryId: cats['Rent'].id, accountId: accMain.id, isActive: true } }),
    prisma.recurringBill.create({ data: { name: 'Netflix',           amount: 15.99, frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 8), categoryId: cats['Subscriptions'].id, accountId: accRevolut.id, isActive: true } }),
    prisma.recurringBill.create({ data: { name: 'Spotify',           amount: 9.99, frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 12), categoryId: cats['Subscriptions'].id, accountId: accRevolut.id, isActive: true } }),
    prisma.recurringBill.create({ data: { name: 'Holmes Place Gym',  amount: 42.90, frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 5), categoryId: cats['Gym'].id, accountId: accRevolut.id, isActive: true } }),
    prisma.recurringBill.create({ data: { name: 'NOS Internet',      amount: 34.90, frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 20), categoryId: cats['Utilities'].id, accountId: accMain.id, isActive: true } }),
    prisma.recurringBill.create({ data: { name: 'EDP Electricidade', amount: rnd(55, 110), frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 15), categoryId: cats['Utilities'].id, accountId: accMain.id, isActive: true } }),
    prisma.recurringBill.create({ data: { name: 'Trading 212 DCA',   amount: 200, frequency: 'MONTHLY', nextDueDate: monthsAgo(0, 3), categoryId: cats['Investing'].id, accountId: accMain.id, isActive: true } }),
  ])

  // ── Transactions — 18 months ─────────────────────────────────────────────────
  // We build them month by month, tracking running balance for the main account.
  let mainBalance = 1247.83
  // Reconstruct what it was 18 months ago by subtracting net inflows we'll add
  // (approximate — we set it and then track forward)
  mainBalance = 320.00  // starting point 18 months ago

  const txns = []
  let txId = 1

  function tx(accountId, description, amount, type, txDate, categoryId = null, runningBal = null) {
    txns.push({
      id: txId++,
      accountId,
      description,
      amount: type === 'DEBIT' ? -Math.abs(amount) : Math.abs(amount),
      type,
      date: txDate,
      valueDate: txDate,
      categoryId,
      runningBalance: runningBal,
      notes: null,
      importHash: `seed-${txId}-${txDate.getTime()}`,
    })
  }

  const now = new Date()
  const MONTHS = 18

  for (let mo = MONTHS - 1; mo >= 0; mo--) {
    const y = new Date(now.getFullYear(), now.getMonth() - mo, 1).getFullYear()
    const m = new Date(now.getFullYear(), now.getMonth() - mo, 1).getMonth() + 1

    // ── Salary on 25th ──────────────────────────────────────────────────────
    const salary = rnd(2700, 2900)
    mainBalance += salary
    tx(accMain.id, 'ORDENADO EMPRESA XYZ LDA', salary, 'CREDIT', date(y, m, 25), cats['Salary'].id, mainBalance)

    // ── Rent on 1st ─────────────────────────────────────────────────────────
    mainBalance -= 850
    tx(accMain.id, 'TRANSFERENCIA RENDA APT', 850, 'DEBIT', date(y, m, 1), cats['Rent'].id, mainBalance)

    // ── Utilities ───────────────────────────────────────────────────────────
    const edp = rnd(55, 115)
    mainBalance -= edp
    tx(accMain.id, 'EDP COMERCIAL ELECTRICIDADE', edp, 'DEBIT', date(y, m, 15), cats['Utilities'].id, mainBalance)

    mainBalance -= 34.90
    tx(accMain.id, 'NOS COMUNICACOES SA', 34.90, 'DEBIT', date(y, m, 20), cats['Utilities'].id, mainBalance)

    // ── Freelance some months ───────────────────────────────────────────────
    if (mo % 3 === 0) {
      const free = rnd(300, 800)
      mainBalance += free
      tx(accMain.id, 'FREELANCE PROJETO DIGITAL', free, 'CREDIT', date(y, m, rnd(5, 20)), cats['Freelance'].id, mainBalance)
    }

    // ── Transfer to savings ─────────────────────────────────────────────────
    const savingsTransfer = rnd(150, 400)
    mainBalance -= savingsTransfer
    tx(accMain.id, 'TRANSFERENCIA POUPANCA', savingsTransfer, 'DEBIT', date(y, m, 28), null, mainBalance)

    // ── Trading 212 investment DCA ──────────────────────────────────────────
    mainBalance -= 200
    tx(accMain.id, 'TRADING 212 INVEST', 200, 'DEBIT', date(y, m, 3), cats['Investing'].id, mainBalance)

    // ── Revolut top-up ──────────────────────────────────────────────────────
    const topup = rnd(200, 400)
    mainBalance -= topup
    tx(accMain.id, 'TRANSFERENCIA REVOLUT', topup, 'DEBIT', date(y, m, 5), null, mainBalance)

    // ── Groceries (Revolut) — 4-6 times/month ──────────────────────────────
    const groceryTrips = Math.floor(rnd(4, 6))
    for (let g = 0; g < groceryTrips; g++) {
      const store = pick(['Pingo Doce', 'Continente', 'Lidl', 'Aldi', 'Minipreço'])
      tx(accRevolut.id, store.toUpperCase(), rnd(18, 75), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Groceries'].id)
    }

    // ── Restaurants ────────────────────────────────────────────────────────
    const restCount = Math.floor(rnd(2, 6))
    const restNames = ['Tasca da Esquina', 'Time Out Market', 'McDonald\'s', 'Nando\'s', 'Pizza Hut', 'Sushi Place', 'Taberna Moderna', 'O Corvo']
    for (let r = 0; r < restCount; r++) {
      tx(accRevolut.id, pick(restNames).toUpperCase(), rnd(12, 55), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Restaurants'].id)
    }

    // ── Transport ───────────────────────────────────────────────────────────
    const transportDefs = [
      { desc: 'UBER TRIP', amt: () => rnd(5, 18) },
      { desc: 'BOLT TRIP', amt: () => rnd(4, 15) },
      { desc: 'CP COMBOIOS PORTUGAL', amt: () => rnd(3, 12) },
      { desc: 'GALP COMBUSTIVEL', amt: () => rnd(40, 70) },
    ]
    for (let t = 0; t < Math.floor(rnd(2, 5)); t++) {
      const tr = pick(transportDefs)
      tx(accRevolut.id, tr.desc, tr.amt(), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Transport'].id)
    }

    // ── Subscriptions ───────────────────────────────────────────────────────
    tx(accRevolut.id, 'NETFLIX.COM', 15.99, 'DEBIT', date(y, m, 8), cats['Subscriptions'].id)
    tx(accRevolut.id, 'SPOTIFY AB', 9.99, 'DEBIT', date(y, m, 12), cats['Subscriptions'].id)

    // ── Gym ─────────────────────────────────────────────────────────────────
    tx(accRevolut.id, 'HOLMES PLACE PORTUGAL', 42.90, 'DEBIT', date(y, m, 5), cats['Gym'].id)

    // ── Healthcare (occasional) ──────────────────────────────────────────────
    if (Math.random() > 0.6) {
      const pharmNames = ['FARMÁCIA CENTRAL', 'FARMÁCIA SAÚDE', 'DENTAL CLINIC LISBOA']
      tx(accRevolut.id, pick(pharmNames), rnd(8, 85), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Healthcare'].id)
    }

    // ── Shopping (occasional) ────────────────────────────────────────────────
    if (Math.random() > 0.5) {
      const shops = ['ZARA', 'H&M', 'FNAC PORTUGAL', 'EL CORTE INGLES', 'DECATHLON']
      tx(accRevolut.id, pick(shops), rnd(20, 150), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Shopping'].id)
    }

    // ── Entertainment (occasional) ───────────────────────────────────────────
    if (Math.random() > 0.55) {
      const ent = ['CINEMA NOS', 'TICKETMASTER', 'BOWLING STRIKE', 'ESCAPE ROOM']
      tx(accRevolut.id, pick(ent), rnd(10, 60), 'DEBIT', date(y, m, Math.floor(rnd(1, 28))), cats['Entertainment'].id)
    }

    // ── Travel (once or twice a year) ────────────────────────────────────────
    if (mo === 14 || mo === 6) {
      tx(accRevolut.id, 'RYANAIR', rnd(80, 220), 'DEBIT', date(y, m, 10), cats['Travel'].id)
      tx(accRevolut.id, 'BOOKING.COM', rnd(150, 400), 'DEBIT', date(y, m, 12), cats['Travel'].id)
      if (mo === 14) {
        tx(accRevolut.id, 'AIRBNB MADRID', rnd(120, 300), 'DEBIT', date(y, m, 14), cats['Travel'].id)
      }
    }
  }

  // Insert all transactions
  await prisma.transaction.createMany({ data: txns, skipDuplicates: true })
  console.log(`  ✓ ${txns.length} transactions`)

  // ── Update account balances to realistic values ───────────────────────────
  await prisma.account.update({ where: { id: accMain.id }, data: { balance: mainBalance } })

  // ── Savings goal + snapshots ──────────────────────────────────────────────
  const savingsGoal = await prisma.savingsGoal.create({
    data: {
      accountId: accSavings.id,
      name: 'BCP Poupança',
      targetAmount: 15000,
      currentAmount: 8542.20,
      interestType: 'PERCENTAGE',
      interestValue: 2.5,
      interestFrequencyDays: 180,
      totalInterestEarned: 312.40,
      contributionAmount: 250,
      contributionFrequencyDays: 30,
      deadline: new Date(Date.UTC(new Date().getUTCFullYear() + 2, 5, 30)),
      notes: 'Emergency fund + long-term savings',
    },
  })

  // Add 18 months of savings snapshots (realistic growth curve)
  let savBal = 2100
  for (let mo = 17; mo >= 0; mo--) {
    savBal += rnd(200, 420)
    if (mo % 6 === 0) savBal += savBal * 0.0125  // interest twice a year
    await prisma.savingsSnapshot.create({
      data: {
        goalId: savingsGoal.id,
        date: monthsAgo(mo, 28),
        amount: Math.round(savBal * 100) / 100,
        note: mo % 6 === 0 ? 'interest' : 'contribution',
      },
    })
  }
  console.log('  ✓ Savings goal + 18 snapshots')

  // ── Investment types + brokers ────────────────────────────────────────────
  const [typeETF, typeStock, typeCrypto] = await Promise.all([
    prisma.investmentType.create({ data: { name: 'ETF',    color: '#3b82f6', icon: 'trending-up' } }),
    prisma.investmentType.create({ data: { name: 'Stocks', color: '#8b5cf6', icon: 'bar-chart-2' } }),
    prisma.investmentType.create({ data: { name: 'Crypto', color: '#f59e0b', icon: 'bitcoin' } }),
  ])

  const [brokerT212, brokerIBKR] = await Promise.all([
    prisma.broker.create({ data: { name: 'Trading 212',         color: '#00cf73', icon: 'trending-up' } }),
    prisma.broker.create({ data: { name: 'Interactive Brokers', color: '#c41e3a', icon: 'landmark' } }),
  ])

  // ── Investments + price history ───────────────────────────────────────────
  const invDefs = [
    {
      name: 'iShares Core MSCI World',
      typeId: typeETF.id, brokerId: brokerT212.id,
      isin: 'IE00B4L5Y983', ticker: 'IWDA.AS',
      shares: 18.742, amountIn: 2800,
      // price 18 months ago ~€72, now ~€95 (realistic MSCI World growth)
      startPrice: 72, endPrice: 95, currency: 'EUR',
    },
    {
      name: 'Vanguard S&P 500',
      typeId: typeETF.id, brokerId: brokerT212.id,
      isin: 'IE00B3XXRP09', ticker: 'VUSA.AS',
      shares: 22.15, amountIn: 1750,
      startPrice: 76, endPrice: 102, currency: 'EUR',
    },
    {
      name: 'Apple Inc.',
      typeId: typeStock.id, brokerId: brokerIBKR.id,
      isin: null, ticker: 'AAPL',
      shares: 3.5, amountIn: 620,
      startPrice: 165, endPrice: 213, currency: 'USD',
    },
    {
      name: 'Bitcoin',
      typeId: typeCrypto.id, brokerId: null,
      isin: null, ticker: 'BTC-EUR',
      shares: 0.04182, amountIn: 1200,
      startPrice: 28000, endPrice: 87000, currency: 'EUR',
    },
  ]

  for (const def of invDefs) {
    const currentValue = def.endPrice * def.shares * (def.currency === 'USD' ? 0.93 : 1)
    const inv = await prisma.investment.create({
      data: {
        name: def.name,
        typeId: def.typeId,
        brokerId: def.brokerId,
        isin: def.isin,
        ticker: def.ticker,
        shares: def.shares,
        amountIn: def.amountIn,
        currentValue: Math.round(currentValue * 100) / 100,
        lastPriceFetched: def.endPrice * (def.currency === 'USD' ? 0.93 : 1),
        currency: def.currency === 'USD' ? 'USD' : 'EUR',
        priceUpdatedAt: new Date(),
        notes: null,
      },
    })

    // Generate 18 monthly price history snapshots
    const priceRange = def.endPrice - def.startPrice
    for (let mo = 17; mo >= 0; mo--) {
      // Simulate realistic growth with some noise
      const progress = (17 - mo) / 17
      const noise = rnd(-0.03, 0.04)
      const price = def.startPrice + priceRange * (progress + noise)
      const priceEUR = price * (def.currency === 'USD' ? 0.93 : 1)
      const value = priceEUR * def.shares
      const snapDate = monthsAgo(mo, 1)
      snapDate.setUTCHours(0, 0, 0, 0)

      await prisma.priceHistory.create({
        data: {
          investmentId: inv.id,
          price: Math.round(priceEUR * 10000) / 10000,
          value: Math.round(value * 100) / 100,
          recordedAt: snapDate,
        },
      })
    }
  }
  console.log('  ✓ 4 investments + price history')

  // Exchange rate
  await prisma.exchangeRate.create({ data: { fromCurrency: 'USD', rate: 0.93 } })

  // ── Debts ─────────────────────────────────────────────────────────────────
  const carLoan = await prisma.debt.create({
    data: {
      name: 'Empréstimo Automóvel',
      type: 'LOAN',
      counterparty: 'Caixa Geral de Depósitos',
      principal: 12000,
      outstanding: 7840,
      interestRate: 5.2,
      frequency: 'MONTHLY',
      nextPaymentDate: monthsAgo(0, 15),
      startDate: monthsAgo(18, 1),
      endDate: new Date(Date.UTC(new Date().getUTCFullYear() + 3, 0, 1)),
      status: 'ACTIVE',
      accountId: accMain.id,
      notes: 'Citroën C3 — 48 month loan',
    },
  })

  // Add 6 months of car loan payments
  let carOutstanding = 9200
  for (let mo = 6; mo >= 1; mo--) {
    const interest = Math.round(carOutstanding * (0.052 / 12) * 100) / 100
    const principal = Math.round((250 - interest) * 100) / 100
    carOutstanding = Math.max(0, carOutstanding - principal)
    await prisma.debtPayment.create({
      data: {
        debtId: carLoan.id,
        date: monthsAgo(mo, 15),
        amount: 250,
        principal,
        interest,
        notes: null,
      },
    })
  }

  await prisma.debt.create({
    data: {
      name: 'Empréstimo ao João',
      type: 'RECEIVABLE',
      counterparty: 'João Silva',
      principal: 500,
      outstanding: 200,
      interestRate: null,
      frequency: 'MONTHLY',
      nextPaymentDate: monthsAgo(0, 20),
      startDate: monthsAgo(5, 10),
      endDate: null,
      status: 'ACTIVE',
      notes: 'Equipamento para projeto',
    },
  })

  await prisma.debtPayment.create({
    data: {
      debtId: (await prisma.debt.findFirst({ where: { name: 'Empréstimo ao João' } })).id,
      date: monthsAgo(3, 20),
      amount: 300,
      principal: 300,
      interest: 0,
      notes: 'Primeira prestação',
    },
  })

  console.log('  ✓ 2 debts + payments')

  // Advance all sequences past the max inserted ID so future INSERTs don't collide
  const tables = ['AccountType', 'Bank', 'Broker', 'InvestmentType', 'Category', 'CategoryRule',
                   'Account', 'Budget', 'SavingsGoal', 'SavingsSnapshot', 'Investment', 'PriceHistory',
                   'RecurringBill', 'Transaction', 'Debt', 'DebtPayment']
  for (const t of tables) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('"${t}_id_seq"', COALESCE((SELECT MAX(id) FROM "${t}"), 0) + 1, false)`
    )
  }
  console.log('  ✓ Sequences advanced')

  // Final summary
  const counts = await Promise.all([
    prisma.transaction.count(),
    prisma.account.count(),
    prisma.investment.count(),
    prisma.savingsGoal.count(),
    prisma.debt.count(),
  ])
  console.log(`\n✅ Done! ${counts[0]} transactions · ${counts[1]} accounts · ${counts[2]} investments · ${counts[3]} savings goals · ${counts[4]} debts`)
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
