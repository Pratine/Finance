// @ts-check
'use strict'

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const dbPath = path.join(__dirname, 'prisma', 'dev.db')

const migrationsDir = path.join(__dirname, 'migrations')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.prepare(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)`).run()
const applied = new Set(db.prepare(`SELECT name FROM _migrations`).all().map(r => r.name))
const dirs = fs.readdirSync(migrationsDir).filter(n => fs.statSync(path.join(migrationsDir, n)).isDirectory()).sort()

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
function rndInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
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
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

const now = new Date().toISOString()
const MONTHS = 48 // 4 years

// ─── Seed ─────────────────────────────────────────────────────────────────────

console.log('Seeding database with 4 years of data...')

db.transaction(() => {
  for (const t of [
    'TransactionTag','TransactionSplit','Tag','ImportHistory','DebtPayment','Debt',
    'SavingsSnapshot','PriceHistory','ExchangeRate','BalanceCorrection','InvestmentLot',
    'Transaction','SavingsGoal','Budget','RecurringBill','RecurringIncome',
    'CategoryRule','Investment','Account','Category','AccountType','Bank','Broker','InvestmentType',
  ]) { db.prepare(`DELETE FROM "${t}"`).run() }
  db.prepare(`DELETE FROM sqlite_sequence`).run()

  // ── Banks ─────────────────────────────────────────────────────────────────────
  const insBank = db.prepare(`INSERT INTO "Bank" (name, color, icon) VALUES (@name, @color, @icon)`)
  const bcpId    = insBank.run({ name: 'Millennium BCP', color: '#c41e3a', icon: 'building-2'  }).lastInsertRowid
  const revId    = insBank.run({ name: 'Revolut',        color: '#0075eb', icon: 'credit-card' }).lastInsertRowid
  const caixaId  = insBank.run({ name: 'Caixa Geral',    color: '#005a2b', icon: 'landmark'    }).lastInsertRowid

  // ── Account types ─────────────────────────────────────────────────────────────
  const insType = db.prepare(`INSERT INTO "AccountType" (name, color, icon) VALUES (@name, @color, @icon)`)
  const typeCheckingId = insType.run({ name: 'Checking', color: '#3b82f6', icon: 'wallet'      }).lastInsertRowid
  const typeSavingsId  = insType.run({ name: 'Savings',  color: '#10b981', icon: 'piggy-bank'  }).lastInsertRowid
  const typeWalletId   = insType.run({ name: 'Wallet',   color: '#8b5cf6', icon: 'smartphone'  }).lastInsertRowid

  // ── Accounts ──────────────────────────────────────────────────────────────────
  const insAcc = db.prepare(`INSERT INTO "Account" (name, bankId, typeId, accountNumber, balance, currency, createdAt, updatedAt) VALUES (@name, @bankId, @typeId, @accountNumber, @balance, @currency, @createdAt, @updatedAt)`)
  const accMainId    = insAcc.run({ name: 'BCP Conta Ordenado', bankId: bcpId,   typeId: typeCheckingId, accountNumber: 'PT50 0010 0001 1234 5678 9015 4', balance: 3847.62, currency: 'EUR', createdAt: now, updatedAt: now }).lastInsertRowid
  const accSavingsId = insAcc.run({ name: 'BCP Poupança',       bankId: bcpId,   typeId: typeSavingsId,  accountNumber: 'PT50 0010 0001 9876 5432 1015 2', balance: 18420.50, currency: 'EUR', createdAt: now, updatedAt: now }).lastInsertRowid
  const accRevolutId = insAcc.run({ name: 'Revolut',            bankId: revId,   typeId: typeWalletId,   accountNumber: null,                              balance: 612.35,  currency: 'EUR', createdAt: now, updatedAt: now }).lastInsertRowid
  const accCaixaId   = insAcc.run({ name: 'Caixa Geral',        bankId: caixaId, typeId: typeCheckingId, accountNumber: 'PT50 0035 0001 0011 2233 4450 7', balance: 1250.00, currency: 'EUR', createdAt: now, updatedAt: now }).lastInsertRowid

  // ── Categories ────────────────────────────────────────────────────────────────
  const insCat = db.prepare(`INSERT INTO "Category" (name, type, color, icon, createdAt) VALUES (@name, @type, @color, @icon, @createdAt)`)
  const catDefs = [
    { name: 'Groceries',      type: 'EXPENSE', color: '#10b981', icon: 'shopping-cart'  },
    { name: 'Rent',           type: 'EXPENSE', color: '#ef4444', icon: 'home'            },
    { name: 'Transport',      type: 'EXPENSE', color: '#f59e0b', icon: 'car'             },
    { name: 'Restaurants',    type: 'EXPENSE', color: '#8b5cf6', icon: 'utensils'        },
    { name: 'Subscriptions',  type: 'EXPENSE', color: '#06b6d4', icon: 'tv'             },
    { name: 'Healthcare',     type: 'EXPENSE', color: '#ec4899', icon: 'heart-pulse'     },
    { name: 'Entertainment',  type: 'EXPENSE', color: '#f97316', icon: 'ticket'          },
    { name: 'Shopping',       type: 'EXPENSE', color: '#84cc16', icon: 'bag-shopping'    },
    { name: 'Utilities',      type: 'EXPENSE', color: '#0ea5e9', icon: 'zap'             },
    { name: 'Travel',         type: 'EXPENSE', color: '#a855f7', icon: 'plane'           },
    { name: 'Investing',      type: 'EXPENSE', color: '#1d4ed8', icon: 'trending-up'     },
    { name: 'Gym',            type: 'EXPENSE', color: '#f43f5e', icon: 'dumbbell'        },
    { name: 'Education',      type: 'EXPENSE', color: '#0891b2', icon: 'book-open'       },
    { name: 'Salary',         type: 'INCOME',  color: '#22c55e', icon: 'banknote'        },
    { name: 'Freelance',      type: 'INCOME',  color: '#34d399', icon: 'laptop'          },
    { name: 'Interest',       type: 'INCOME',  color: '#6ee7b7', icon: 'percent'         },
    { name: 'Bonus',          type: 'INCOME',  color: '#fbbf24', icon: 'gift'            },
  ]
  const cats = {}
  for (const c of catDefs) cats[c.name] = insCat.run({ ...c, createdAt: now }).lastInsertRowid

  // ── Category rules ────────────────────────────────────────────────────────────
  const insRule = db.prepare(`INSERT INTO "CategoryRule" (pattern, categoryId, createdAt) VALUES (@pattern, @categoryId, @createdAt)`)
  const rules = [
    { pattern: 'pingo doce',     categoryId: cats['Groceries']     },
    { pattern: 'continente',     categoryId: cats['Groceries']     },
    { pattern: 'lidl',           categoryId: cats['Groceries']     },
    { pattern: 'aldi',           categoryId: cats['Groceries']     },
    { pattern: 'minipreço',      categoryId: cats['Groceries']     },
    { pattern: 'renda',          categoryId: cats['Rent']          },
    { pattern: 'cp comboios',    categoryId: cats['Transport']     },
    { pattern: 'uber',           categoryId: cats['Transport']     },
    { pattern: 'bolt',           categoryId: cats['Transport']     },
    { pattern: 'galp',           categoryId: cats['Transport']     },
    { pattern: 'netflix',        categoryId: cats['Subscriptions'] },
    { pattern: 'spotify',        categoryId: cats['Subscriptions'] },
    { pattern: 'farmácia',       categoryId: cats['Healthcare']    },
    { pattern: 'dental',         categoryId: cats['Healthcare']    },
    { pattern: 'cinema',         categoryId: cats['Entertainment'] },
    { pattern: 'trading 212',    categoryId: cats['Investing']     },
    { pattern: 'fnac',           categoryId: cats['Shopping']      },
    { pattern: 'zara',           categoryId: cats['Shopping']      },
    { pattern: 'h&m',            categoryId: cats['Shopping']      },
    { pattern: 'edp',            categoryId: cats['Utilities']     },
    { pattern: 'nos ',           categoryId: cats['Utilities']     },
    { pattern: 'holmes place',   categoryId: cats['Gym']           },
    { pattern: 'ordenado',       categoryId: cats['Salary']        },
    { pattern: 'udemy',          categoryId: cats['Education']     },
    { pattern: 'coursera',       categoryId: cats['Education']     },
  ]
  for (const r of rules) insRule.run({ ...r, createdAt: now })

  // ── Tags ──────────────────────────────────────────────────────────────────────
  const insTag = db.prepare(`INSERT INTO "Tag" (name, color) VALUES (@name, @color)`)
  const tagPersonalId  = insTag.run({ name: 'Personal',  color: '#8b5cf6' }).lastInsertRowid
  const tagWorkId      = insTag.run({ name: 'Work',      color: '#3b82f6' }).lastInsertRowid
  const tagRecurringId = insTag.run({ name: 'Recurring', color: '#10b981' }).lastInsertRowid
  const tagTaxId       = insTag.run({ name: 'Tax',       color: '#f59e0b' }).lastInsertRowid

  // ── Budgets ───────────────────────────────────────────────────────────────────
  const insBudget = db.prepare(`INSERT INTO "Budget" (categoryId, amount, createdAt, updatedAt) VALUES (@categoryId, @amount, @createdAt, @updatedAt)`)
  for (const b of [
    { name: 'Groceries',     amount: 380  },
    { name: 'Restaurants',   amount: 180  },
    { name: 'Transport',     amount: 90   },
    { name: 'Subscriptions', amount: 45   },
    { name: 'Entertainment', amount: 70   },
    { name: 'Shopping',      amount: 120  },
    { name: 'Healthcare',    amount: 60   },
    { name: 'Gym',           amount: 45   },
    { name: 'Education',     amount: 50   },
  ]) insBudget.run({ categoryId: cats[b.name], amount: b.amount, createdAt: now, updatedAt: now })

  // ── Recurring bills ───────────────────────────────────────────────────────────
  const insBill = db.prepare(`INSERT INTO "RecurringBill" (name, amount, frequency, nextDueDate, categoryId, accountId, isActive, createdAt, updatedAt) VALUES (@name, @amount, @frequency, @nextDueDate, @categoryId, @accountId, @isActive, @createdAt, @updatedAt)`)
  const bill = (o) => insBill.run({ ...o, createdAt: now, updatedAt: now })
  bill({ name: 'Renda Apartamento',   amount: 900,          frequency: 'MONTHLY',  nextDueDate: monthsAgo(0, 1),  categoryId: cats['Rent'],          accountId: accMainId,    isActive: 1 })
  bill({ name: 'Netflix',             amount: 17.99,        frequency: 'MONTHLY',  nextDueDate: monthsAgo(0, 8),  categoryId: cats['Subscriptions'], accountId: accRevolutId, isActive: 1 })
  bill({ name: 'Spotify',             amount: 10.99,        frequency: 'MONTHLY',  nextDueDate: monthsAgo(0, 12), categoryId: cats['Subscriptions'], accountId: accRevolutId, isActive: 1 })
  bill({ name: 'Holmes Place Gym',    amount: 44.90,        frequency: 'MONTHLY',  nextDueDate: monthsAgo(0, 5),  categoryId: cats['Gym'],           accountId: accRevolutId, isActive: 1 })
  bill({ name: 'NOS Internet',        amount: 36.90,        frequency: 'MONTHLY',  nextDueDate: monthsAgo(0, 20), categoryId: cats['Utilities'],     accountId: accMainId,    isActive: 1 })
  bill({ name: 'EDP Electricidade',   amount: rnd(60, 110), frequency: 'MONTHLY',  nextDueDate: monthsAgo(0, 15), categoryId: cats['Utilities'],     accountId: accMainId,    isActive: 1 })
  bill({ name: 'Trading 212 DCA',     amount: 250,          frequency: 'MONTHLY',  nextDueDate: monthsAgo(0, 3),  categoryId: cats['Investing'],     accountId: accMainId,    isActive: 1 })
  bill({ name: 'Apple One',           amount: 21.95,        frequency: 'MONTHLY',  nextDueDate: monthsAgo(0, 18), categoryId: cats['Subscriptions'], accountId: accRevolutId, isActive: 1 })
  bill({ name: 'Car Insurance',       amount: 420,          frequency: 'YEARLY',   nextDueDate: monthsAgo(0, 1),  categoryId: cats['Transport'],     accountId: accMainId,    isActive: 1 })
  bill({ name: 'Domain & Hosting',    amount: 89,           frequency: 'YEARLY',   nextDueDate: monthsAgo(0, 6),  categoryId: cats['Subscriptions'], accountId: accRevolutId, isActive: 1 })

  // ── Recurring income ──────────────────────────────────────────────────────────
  const insIncome = db.prepare(`INSERT INTO "RecurringIncome" (name, amount, frequency, nextExpectedDate, categoryId, accountId, isActive, createdAt, updatedAt) VALUES (@name, @amount, @frequency, @nextExpectedDate, @categoryId, @accountId, @isActive, @createdAt, @updatedAt)`)
  const inc = (o) => insIncome.run({ ...o, createdAt: now, updatedAt: now })
  inc({ name: 'Salário XYZ Lda',       amount: 2850,  frequency: 'MONTHLY',  nextExpectedDate: monthsAgo(0, 25), categoryId: cats['Salary'],    accountId: accMainId,  isActive: 1 })
  inc({ name: 'Freelance Recorrente',  amount: 500,   frequency: 'QUARTERLY',nextExpectedDate: monthsAgo(0, 15), categoryId: cats['Freelance'], accountId: accMainId,  isActive: 1 })
  inc({ name: 'Rendimento Poupança',   amount: 38,    frequency: 'MONTHLY',  nextExpectedDate: monthsAgo(0, 28), categoryId: cats['Interest'],  accountId: accCaixaId, isActive: 1 })

  // ── Transactions — 4 years ────────────────────────────────────────────────────
  let mainBalance = 850.00
  const insTx = db.prepare(`INSERT INTO "Transaction" (accountId, description, amount, type, date, valueDate, categoryId, runningBalance, notes, importHash, createdAt) VALUES (@accountId, @description, @amount, @type, @date, @valueDate, @categoryId, @runningBalance, @notes, @importHash, @createdAt)`)
  const insTagTx = db.prepare(`INSERT INTO "TransactionTag" (transactionId, tagId) VALUES (?, ?)`)

  let txId = 1
  const loopNow = new Date()
  const txIds = { recurring: [], work: [] }

  function tx(accountId, description, amount, type, txDate, categoryId = null, runningBal = null, tags = []) {
    const id = txId++
    insTx.run({
      accountId, description,
      amount: type === 'DEBIT' ? -Math.abs(amount) : Math.abs(amount),
      type, date: txDate, valueDate: txDate,
      categoryId, runningBalance: runningBal,
      notes: null, importHash: `seed-${id}-${txDate}`, createdAt: now,
    })
    for (const tagId of tags) insTagTx.run(id, tagId)
    return id
  }

  for (let mo = MONTHS - 1; mo >= 0; mo--) {
    const d = new Date(Date.UTC(loopNow.getUTCFullYear(), loopNow.getUTCMonth() - mo, 1))
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1

    // Salary grows slightly over 4 years
    const yearIdx = Math.floor((MONTHS - 1 - mo) / 12)
    const salaryBase = [2650, 2780, 2850, 2920][Math.min(yearIdx, 3)]
    const salary = rnd(salaryBase - 30, salaryBase + 60)
    mainBalance += salary
    tx(accMainId, 'ORDENADO XYZ LDA', salary, 'CREDIT', date(y, m, 25), cats['Salary'], mainBalance, [tagRecurringId, tagWorkId])

    // Rent increases once per year
    const rent = [750, 800, 850, 900][Math.min(yearIdx, 3)]
    mainBalance -= rent
    tx(accMainId, 'TRANSFERENCIA RENDA APT', rent, 'DEBIT', date(y, m, 1), cats['Rent'], mainBalance, [tagRecurringId])

    // Utilities
    const edp = rnd(50, 120)
    mainBalance -= edp
    tx(accMainId, 'EDP COMERCIAL ELECTRICIDADE', edp, 'DEBIT', date(y, m, 15), cats['Utilities'], mainBalance, [tagRecurringId])
    mainBalance -= 36.90
    tx(accMainId, 'NOS COMUNICACOES SA', 36.90, 'DEBIT', date(y, m, 20), cats['Utilities'], mainBalance, [tagRecurringId])

    // Freelance quarterly
    if (mo % 3 === 0) {
      const free = rnd(350, 900)
      mainBalance += free
      tx(accMainId, 'FATURA FREELANCE', free, 'CREDIT', date(y, m, rndInt(5, 20)), cats['Freelance'], mainBalance, [tagWorkId])
    }

    // Annual bonus (December)
    if (m === 12) {
      const bonus = rnd(1200, 2800)
      mainBalance += bonus
      tx(accMainId, 'SUBSIDIO NATAL XYZ LDA', bonus, 'CREDIT', date(y, m, 20), cats['Bonus'], mainBalance, [tagWorkId])
    }
    // Vacation subsidy (June)
    if (m === 6) {
      const bonus = rnd(1000, 1800)
      mainBalance += bonus
      tx(accMainId, 'SUBSIDIO FERIAS XYZ LDA', bonus, 'CREDIT', date(y, m, 10), cats['Bonus'], mainBalance, [tagWorkId])
    }

    // Monthly savings transfer (grows over time)
    const savingsBase = [200, 280, 350, 420][Math.min(yearIdx, 3)]
    const savTransfer = rnd(savingsBase - 50, savingsBase + 100)
    mainBalance -= savTransfer
    tx(accMainId, 'TRANSFERENCIA POUPANCA BCP', savTransfer, 'DEBIT', date(y, m, 28), null, mainBalance)

    // Investment DCA
    const dcaAmount = [150, 200, 250, 250][Math.min(yearIdx, 3)]
    mainBalance -= dcaAmount
    tx(accMainId, 'TRADING 212 INVEST', dcaAmount, 'DEBIT', date(y, m, 3), cats['Investing'], mainBalance, [tagRecurringId])

    // Revolut top-up
    const topup = rnd(250, 500)
    mainBalance -= topup
    tx(accMainId, 'TRANSFERENCIA REVOLUT', topup, 'DEBIT', date(y, m, 5), null, mainBalance)

    // Car loan payment (from Caixa, for first 30 months)
    if (mo >= MONTHS - 30) {
      const loanPmt = 280
      tx(accCaixaId, 'PRESTACAO EMPRESTIMO AUTOMOVEL', loanPmt, 'DEBIT', date(y, m, 15), null, null, [tagRecurringId])
    }

    // Groceries (Revolut)
    for (let g = 0; g < rndInt(4, 7); g++) {
      const store = pick(['Pingo Doce', 'Continente', 'Lidl', 'Aldi', 'Minipreço', 'El Corte Inglés'])
      tx(accRevolutId, store.toUpperCase(), rnd(20, 85), 'DEBIT', date(y, m, rndInt(1, 28)), cats['Groceries'])
    }

    // Restaurants
    const restNames = ["Tasca da Esquina","Time Out Market","McDonald's","Nando's","Pizza Hut","Sushi Palace","Taberna Moderna","O Corvo","Cervejaria Ramiro","A Cevicheria","Zé da Mouraria"]
    for (let r = 0; r < rndInt(3, 8); r++) {
      tx(accRevolutId, pick(restNames).toUpperCase(), rnd(12, 65), 'DEBIT', date(y, m, rndInt(1, 28)), cats['Restaurants'])
    }

    // Transport
    const transportDefs = [
      { desc: 'UBER TRIP',            amt: () => rnd(5, 22)  },
      { desc: 'BOLT TRIP',            amt: () => rnd(4, 18)  },
      { desc: 'CP COMBOIOS PORTUGAL', amt: () => rnd(3, 15)  },
      { desc: 'GALP COMBUSTIVEL',     amt: () => rnd(45, 80) },
    ]
    for (let t = 0; t < rndInt(2, 6); t++) {
      const tr = pick(transportDefs)
      tx(accRevolutId, tr.desc, tr.amt(), 'DEBIT', date(y, m, rndInt(1, 28)), cats['Transport'])
    }

    // Fixed subscriptions
    tx(accRevolutId, 'NETFLIX.COM',              17.99, 'DEBIT', date(y, m, 8),  cats['Subscriptions'], null, [tagRecurringId])
    tx(accRevolutId, 'SPOTIFY AB',               10.99, 'DEBIT', date(y, m, 12), cats['Subscriptions'], null, [tagRecurringId])
    tx(accRevolutId, 'HOLMES PLACE PORTUGAL',    44.90, 'DEBIT', date(y, m, 5),  cats['Gym'],           null, [tagRecurringId])
    if (mo < 30) tx(accRevolutId, 'APPLE ONE',   21.95, 'DEBIT', date(y, m, 18), cats['Subscriptions'], null, [tagRecurringId])

    // Healthcare — random
    if (Math.random() > 0.5) {
      const ph = pick(['FARMACIA CENTRAL','FARMACIA SAUDE','DENTAL CLINIC LISBOA','CLINICA MEDICA ALVALADE'])
      tx(accRevolutId, ph, rnd(8, 120), 'DEBIT', date(y, m, rndInt(1, 28)), cats['Healthcare'], null, [tagPersonalId])
    }

    // Shopping — random
    if (Math.random() > 0.45) {
      const shops = ['ZARA','H&M','FNAC PORTUGAL','EL CORTE INGLES','DECATHLON','IKEA','MANGO','PRIMARK']
      tx(accRevolutId, pick(shops), rnd(20, 180), 'DEBIT', date(y, m, rndInt(1, 28)), cats['Shopping'])
    }

    // Entertainment — random
    if (Math.random() > 0.5) {
      const ent = ['CINEMA NOS','TICKETMASTER','BOWLING STRIKE','ESCAPE ROOM LISBOA','FNAC BILHETES','MEO ARENA']
      tx(accRevolutId, pick(ent), rnd(10, 80), 'DEBIT', date(y, m, rndInt(1, 28)), cats['Entertainment'])
    }

    // Education — sporadic
    if (Math.random() > 0.8) {
      const edu = ['UDEMY COURSE','COURSERA SUBSCRIPTION','LIVROS FNAC','O REILLY MEDIA']
      tx(accRevolutId, pick(edu), rnd(12, 60), 'DEBIT', date(y, m, rndInt(1, 28)), cats['Education'], null, [tagPersonalId])
    }

    // Annual car insurance
    if (m === 3) {
      tx(accMainId, 'SEGURO AUTOMOVEL FIDELIDADE', rnd(380, 460), 'DEBIT', date(y, m, rndInt(1, 10)), cats['Transport'], mainBalance)
    }

    // Travel — twice per year, specific months
    if (m === 7 || m === 8) {
      const dest = pick(['RYANAIR PORTO FCO','TAP AIR PORTUGAL','RYANAIR LIS BCN','EASYJET LIS AMS'])
      tx(accRevolutId, dest, rnd(80, 280), 'DEBIT', date(y, m, 10), cats['Travel'])
      tx(accRevolutId, pick(['BOOKING.COM','AIRBNB','HOTELS.COM']), rnd(200, 600), 'DEBIT', date(y, m, 12), cats['Travel'])
    }
    if (m === 12 || m === 1) {
      if (Math.random() > 0.5) {
        tx(accRevolutId, 'RYANAIR', rnd(60, 200), 'DEBIT', date(y, m, rndInt(5, 15)), cats['Travel'])
      }
    }

    // Savings interest (Caixa)
    if (m === 1 || m === 7) {
      const interest = rnd(35, 65)
      tx(accCaixaId, 'JUROS DEPOSITO PRAZO', interest, 'CREDIT', date(y, m, rndInt(1, 5)), cats['Interest'])
    }
  }

  console.log(`  Transactions: ${txId - 1}`)

  // ── Savings goals + snapshots ─────────────────────────────────────────────────
  const insGoal = db.prepare(`
    INSERT INTO "SavingsGoal" (accountId, name, targetAmount, currentAmount, interestType, interestValue, interestFrequencyDays, totalInterestEarned, contributionAmount, contributionFrequencyDays, deadline, notes, createdAt, updatedAt)
    VALUES (@accountId, @name, @targetAmount, @currentAmount, @interestType, @interestValue, @interestFrequencyDays, @totalInterestEarned, @contributionAmount, @contributionFrequencyDays, @deadline, @notes, @createdAt, @updatedAt)
  `)
  const insSnap = db.prepare(`INSERT INTO "SavingsSnapshot" (goalId, date, amount, note) VALUES (@goalId, @date, @amount, @note)`)

  // Goal 1 — Emergency fund (nearly reached)
  const emergencyId = insGoal.run({
    accountId: accSavingsId, name: 'Fundo de Emergência',
    targetAmount: 12000, currentAmount: 10840.50,
    interestType: 'PERCENTAGE', interestValue: 2.75, interestFrequencyDays: 180,
    totalInterestEarned: 640.20, contributionAmount: 300, contributionFrequencyDays: 30,
    deadline: new Date(Date.UTC(new Date().getUTCFullYear(), 11, 31)).toISOString(),
    notes: '6 months of expenses as emergency buffer',
    createdAt: now, updatedAt: now,
  }).lastInsertRowid

  let emBal = 800
  for (let mo = MONTHS - 1; mo >= 0; mo--) {
    emBal += rnd(220, 420)
    if (mo % 6 === 0) emBal += emBal * 0.01375
    emBal = Math.min(emBal, 10840.50)
    insSnap.run({ goalId: emergencyId, date: monthsAgo(mo, 28), amount: Math.round(emBal * 100) / 100, note: mo % 6 === 0 ? 'Semi-annual interest' : null })
  }

  // Goal 2 — House down payment (long-term, in progress)
  const houseId = insGoal.run({
    accountId: null, name: 'Entrada Casa Própria',
    targetAmount: 50000, currentAmount: 18420.50,
    interestType: null, interestValue: null, interestFrequencyDays: null,
    totalInterestEarned: 0, contributionAmount: 500, contributionFrequencyDays: 30,
    deadline: new Date(Date.UTC(new Date().getUTCFullYear() + 3, 5, 30)).toISOString(),
    notes: 'Down payment + purchase costs for a 2-bedroom apartment',
    createdAt: now, updatedAt: now,
  }).lastInsertRowid

  let houseBal = 2000
  for (let mo = MONTHS - 1; mo >= 0; mo--) {
    houseBal += rnd(350, 600)
    insSnap.run({ goalId: houseId, date: monthsAgo(mo, 28), amount: Math.round(houseBal * 100) / 100, note: null })
  }

  // Goal 3 — Vacation fund (small, recurring)
  const vacId = insGoal.run({
    accountId: null, name: 'Fundo de Férias',
    targetAmount: 3000, currentAmount: 1840.00,
    interestType: null, interestValue: null, interestFrequencyDays: null,
    totalInterestEarned: 0, contributionAmount: 120, contributionFrequencyDays: 30,
    deadline: new Date(Date.UTC(new Date().getUTCFullYear(), 5, 1)).toISOString(),
    notes: 'Summer holiday budget',
    createdAt: now, updatedAt: now,
  }).lastInsertRowid

  let vacBal = 200
  for (let mo = 23; mo >= 0; mo--) {
    vacBal += rnd(80, 180)
    // Reset after summer (spend the savings)
    if (mo === 16 || mo === 4) vacBal = rnd(100, 300)
    insSnap.run({ goalId: vacId, date: monthsAgo(mo, 28), amount: Math.round(Math.min(vacBal, 3000) * 100) / 100, note: (mo === 16 || mo === 4) ? 'Summer spent' : null })
  }

  console.log('  3 savings goals + snapshots')

  // ── Investment types + brokers ─────────────────────────────────────────────────
  const insInvType = db.prepare(`INSERT INTO "InvestmentType" (name, color, icon) VALUES (@name, @color, @icon)`)
  const typeETFId    = insInvType.run({ name: 'ETF',    color: '#3b82f6', icon: 'trending-up' }).lastInsertRowid
  const typeStockId  = insInvType.run({ name: 'Stocks', color: '#8b5cf6', icon: 'bar-chart-2' }).lastInsertRowid
  const typeCryptoId = insInvType.run({ name: 'Crypto', color: '#f59e0b', icon: 'bitcoin'     }).lastInsertRowid
  const typeBondId   = insInvType.run({ name: 'Bonds',  color: '#6ee7b7', icon: 'shield'      }).lastInsertRowid

  const insBroker = db.prepare(`INSERT INTO "Broker" (name, color, icon) VALUES (@name, @color, @icon)`)
  const brokerT212Id = insBroker.run({ name: 'Trading 212',         color: '#00cf73', icon: 'trending-up' }).lastInsertRowid
  const brokerIBKRId = insBroker.run({ name: 'Interactive Brokers', color: '#c41e3a', icon: 'landmark'    }).lastInsertRowid

  // ── Investments ───────────────────────────────────────────────────────────────
  const insInv = db.prepare(`
    INSERT INTO "Investment" (name, typeId, brokerId, isin, ticker, shares, amountIn, currentValue, lastPriceFetched, currency, priceUpdatedAt, notes, createdAt, updatedAt)
    VALUES (@name, @typeId, @brokerId, @isin, @ticker, @shares, @amountIn, @currentValue, @lastPriceFetched, @currency, @priceUpdatedAt, @notes, @createdAt, @updatedAt)
  `)
  const insPrice = db.prepare(`INSERT INTO "PriceHistory" (investmentId, price, value, recordedAt) VALUES (@investmentId, @price, @value, @recordedAt)`)
  const insLot   = db.prepare(`INSERT INTO "InvestmentLot" (investmentId, type, date, shares, pricePerShare, totalCost, realizedGain, notes, createdAt) VALUES (@investmentId, @type, @date, @shares, @pricePerShare, @totalCost, @realizedGain, @notes, @createdAt)`)

  // Investment definitions
  // startPrice = price 4 years ago, endPrice = price today
  const invDefs = [
    {
      name: 'iShares Core MSCI World', typeId: typeETFId, brokerId: brokerT212Id,
      isin: 'IE00B4L5Y983', ticker: 'IWDA.AS', currency: 'EUR',
      startPrice: 62, endPrice: 98,
      // Monthly DCA: buy ~1 share per month at prevailing price
      dca: { monthly: true, amountEUR: 100 },
    },
    {
      name: 'Vanguard S&P 500', typeId: typeETFId, brokerId: brokerT212Id,
      isin: 'IE00B3XXRP09', ticker: 'VUSA.AS', currency: 'EUR',
      startPrice: 70, endPrice: 108,
      dca: { monthly: true, amountEUR: 80 },
    },
    {
      name: 'Apple Inc.', typeId: typeStockId, brokerId: brokerIBKRId,
      isin: null, ticker: 'AAPL', currency: 'USD',
      startPrice: 145, endPrice: 215,
      dca: { monthly: false, lots: [
        { mo: 46, shares: 2, price: 148 },
        { mo: 40, shares: 1, price: 162 },
        { mo: 28, shares: 1.5, price: 175 },
        { mo: 14, shares: 2, price: 190 },
        { mo:  4, shares: 1, price: 208 },
      ]},
    },
    {
      name: 'Bitcoin', typeId: typeCryptoId, brokerId: null,
      isin: null, ticker: 'BTC-EUR', currency: 'EUR',
      startPrice: 24000, endPrice: 82000,
      dca: { monthly: false, lots: [
        { mo: 45, shares: 0.01,  price: 25000 },
        { mo: 38, shares: 0.005, price: 30000 },
        { mo: 30, shares: 0.008, price: 42000 },
        { mo: 20, shares: 0.005, price: 58000 },
        { mo:  8, shares: 0.004, price: 71000 },
      ]},
    },
    {
      name: 'MSCI Emerging Markets', typeId: typeETFId, brokerId: brokerT212Id,
      isin: 'IE00B4L5YC18', ticker: 'VFEA.DE', currency: 'EUR',
      startPrice: 22, endPrice: 28,
      dca: { monthly: true, amountEUR: 50 },
    },
    {
      name: 'iShares Euro Govt Bond', typeId: typeBondId, brokerId: brokerIBKRId,
      isin: 'IE00B4WXJH41', ticker: 'SEGA.DE', currency: 'EUR',
      startPrice: 110, endPrice: 104,
      dca: { monthly: false, lots: [
        { mo: 36, shares: 5, price: 112 },
        { mo: 18, shares: 5, price: 108 },
      ]},
    },
  ]

  const fxUSD = 0.93

  for (const def of invDefs) {
    const fxRate = def.currency === 'USD' ? fxUSD : 1
    const priceRange = def.endPrice - def.startPrice

    // Build lots
    const lots = []
    if (def.dca.monthly) {
      for (let mo = MONTHS - 1; mo >= 0; mo--) {
        const progress = (MONTHS - 1 - mo) / (MONTHS - 1)
        const noise = (Math.random() - 0.5) * 0.06
        const price = def.startPrice + priceRange * (progress + noise)
        const shares = Math.round((def.dca.amountEUR / (price * fxRate)) * 10000) / 10000
        lots.push({ mo, shares, price: Math.round(price * 100) / 100 })
      }
    } else {
      for (const l of def.dca.lots) {
        lots.push(l)
      }
    }

    const totalShares = Math.round(lots.reduce((s, l) => s + l.shares, 0) * 10000) / 10000
    const totalCostEUR = Math.round(lots.reduce((s, l) => s + l.shares * l.price * fxRate, 0) * 100) / 100
    const currentValue = Math.round(def.endPrice * totalShares * fxRate * 100) / 100

    const invId = insInv.run({
      name: def.name, typeId: def.typeId, brokerId: def.brokerId,
      isin: def.isin, ticker: def.ticker, shares: totalShares,
      amountIn: totalCostEUR, currentValue,
      lastPriceFetched: Math.round(def.endPrice * fxRate * 100) / 100,
      currency: def.currency, priceUpdatedAt: now,
      notes: null, createdAt: now, updatedAt: now,
    }).lastInsertRowid

    // Insert lots
    for (const l of lots) {
      const d = new Date(Date.UTC(loopNow.getUTCFullYear(), loopNow.getUTCMonth() - l.mo, rndInt(1, 20), 10, 0, 0))
      const totalCostLot = Math.round(l.shares * l.price * fxRate * 100) / 100
      insLot.run({
        investmentId: invId, type: 'BUY',
        date: d.toISOString(), shares: l.shares,
        pricePerShare: Math.round(l.price * fxRate * 100) / 100,
        totalCost: totalCostLot, realizedGain: null,
        notes: def.dca.monthly ? 'DCA' : null, createdAt: now,
      })
    }

    // Price history — monthly snapshots
    for (let mo = MONTHS - 1; mo >= 0; mo--) {
      const progress = (MONTHS - 1 - mo) / (MONTHS - 1)
      const noise = (Math.random() - 0.5) * 0.08
      const price = Math.max(1, def.startPrice + priceRange * (progress + noise))
      const priceEUR = Math.round(price * fxRate * 10000) / 10000
      const snap = new Date(); snap.setUTCDate(1); snap.setUTCHours(0, 0, 0, 0); snap.setUTCMonth(snap.getUTCMonth() - mo)
      insPrice.run({ investmentId: invId, price: priceEUR, value: Math.round(priceEUR * totalShares * 100) / 100, recordedAt: snap.toISOString() })
    }
  }

  db.prepare(`INSERT INTO "ExchangeRate" (fromCurrency, rate, updatedAt) VALUES ('USD', 0.93, '${now}')`).run()
  console.log(`  ${invDefs.length} investments + lots + price history`)

  // ── Debts ─────────────────────────────────────────────────────────────────────
  const insDebt = db.prepare(`
    INSERT INTO "Debt" (name, type, counterparty, principal, outstanding, interestRate, frequency, nextPaymentDate, startDate, endDate, status, accountId, notes, createdAt, updatedAt)
    VALUES (@name, @type, @counterparty, @principal, @outstanding, @interestRate, @frequency, @nextPaymentDate, @startDate, @endDate, @status, @accountId, @notes, @createdAt, @updatedAt)
  `)
  const insPayment = db.prepare(`INSERT INTO "DebtPayment" (debtId, date, amount, principal, interest, notes, createdAt) VALUES (@debtId, @date, @amount, @principal, @interest, @notes, @createdAt)`)

  // Debt 1 — Car loan (active, 30 months in, 18 remaining)
  const carLoanId = insDebt.run({
    name: 'Empréstimo Automóvel', type: 'LOAN', counterparty: 'Caixa Geral de Depósitos',
    principal: 14000, outstanding: 5880, interestRate: 5.5, frequency: 'MONTHLY',
    nextPaymentDate: monthsAgo(0, 15), startDate: monthsAgo(30, 1),
    endDate: new Date(Date.UTC(new Date().getUTCFullYear() + 2, 5, 1)).toISOString(),
    status: 'ACTIVE', accountId: accCaixaId, notes: 'Citroën C3 — 48-month loan',
    createdAt: now, updatedAt: now,
  }).lastInsertRowid

  let carOutstanding = 13200
  for (let mo = 30; mo >= 1; mo--) {
    const interest  = Math.round(carOutstanding * (0.055 / 12) * 100) / 100
    const principal = Math.round((292 - interest) * 100) / 100
    carOutstanding  = Math.max(0, carOutstanding - principal)
    insPayment.run({ debtId: carLoanId, date: monthsAgo(mo, 15), amount: 292, principal, interest, notes: null, createdAt: now })
  }

  // Debt 2 — Personal loan (PAID OFF — was a laptop purchase)
  const laptopLoanId = insDebt.run({
    name: 'Crédito Pessoal MacBook', type: 'LOAN', counterparty: 'Millennium BCP',
    principal: 2200, outstanding: 0, interestRate: 8.9, frequency: 'MONTHLY',
    nextPaymentDate: null, startDate: monthsAgo(36, 1),
    endDate: monthsAgo(12, 1),
    status: 'PAID', accountId: accMainId, notes: 'MacBook Pro — 24-month consumer credit',
    createdAt: now, updatedAt: now,
  }).lastInsertRowid

  let lapOutstanding = 2200
  for (let mo = 36; mo >= 13; mo--) {
    const interest  = Math.round(lapOutstanding * (0.089 / 12) * 100) / 100
    const principal = Math.round((102 - interest) * 100) / 100
    lapOutstanding  = Math.max(0, lapOutstanding - principal)
    insPayment.run({ debtId: laptopLoanId, date: monthsAgo(mo, 10), amount: 102, principal, interest, notes: null, createdAt: now })
  }

  // Debt 3 — Receivable (lent money to a friend)
  const friendId = insDebt.run({
    name: 'Empréstimo ao João', type: 'RECEIVABLE', counterparty: 'João Silva',
    principal: 800, outstanding: 300, interestRate: null, frequency: 'MONTHLY',
    nextPaymentDate: monthsAgo(0, 20), startDate: monthsAgo(8, 10),
    endDate: null, status: 'ACTIVE', accountId: null,
    notes: 'Equipment for a shared project',
    createdAt: now, updatedAt: now,
  }).lastInsertRowid

  insPayment.run({ debtId: friendId, date: monthsAgo(6, 20), amount: 300, principal: 300, interest: 0, notes: 'First installment', createdAt: now })
  insPayment.run({ debtId: friendId, date: monthsAgo(3, 20), amount: 200, principal: 200, interest: 0, notes: 'Second installment', createdAt: now })

  console.log('  3 debts + payment history')
})()

const counts = {
  transactions: db.prepare(`SELECT COUNT(*) as n FROM "Transaction"`).get().n,
  accounts:     db.prepare(`SELECT COUNT(*) as n FROM "Account"`).get().n,
  investments:  db.prepare(`SELECT COUNT(*) as n FROM "Investment"`).get().n,
  lots:         db.prepare(`SELECT COUNT(*) as n FROM "InvestmentLot"`).get().n,
  goals:        db.prepare(`SELECT COUNT(*) as n FROM "SavingsGoal"`).get().n,
  debts:        db.prepare(`SELECT COUNT(*) as n FROM "Debt"`).get().n,
  tags:         db.prepare(`SELECT COUNT(*) as n FROM "Tag"`).get().n,
}
console.log(`\nDone! ${counts.transactions} transactions · ${counts.accounts} accounts · ${counts.investments} investments (${counts.lots} lots) · ${counts.goals} savings goals · ${counts.debts} debts · ${counts.tags} tags`)
db.close()
