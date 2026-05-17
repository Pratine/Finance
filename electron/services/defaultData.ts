// Seeds a minimal set of default categories, banks, account types, investment
// types and brokers on first launch. Only runs when the tables are all empty —
// never overwrites data the user has already created.
import { db } from '../db'

const DEFAULT_CATEGORIES = [
  // Expenses
  { name: 'Groceries',     type: 'EXPENSE', color: '#10b981', icon: 'shopping-cart' },
  { name: 'Rent',          type: 'EXPENSE', color: '#ef4444', icon: 'home' },
  { name: 'Transport',     type: 'EXPENSE', color: '#f59e0b', icon: 'car' },
  { name: 'Restaurants',   type: 'EXPENSE', color: '#8b5cf6', icon: 'utensils' },
  { name: 'Subscriptions', type: 'EXPENSE', color: '#06b6d4', icon: 'tv' },
  { name: 'Healthcare',    type: 'EXPENSE', color: '#ec4899', icon: 'heart-pulse' },
  { name: 'Entertainment', type: 'EXPENSE', color: '#f97316', icon: 'ticket' },
  { name: 'Shopping',      type: 'EXPENSE', color: '#84cc16', icon: 'shopping-bag' },
  { name: 'Utilities',     type: 'EXPENSE', color: '#0ea5e9', icon: 'zap' },
  { name: 'Travel',        type: 'EXPENSE', color: '#a855f7', icon: 'plane' },
  { name: 'Gym',           type: 'EXPENSE', color: '#f43f5e', icon: 'dumbbell' },
  { name: 'Education',     type: 'EXPENSE', color: '#14b8a6', icon: 'book-open' },
  { name: 'Insurance',     type: 'EXPENSE', color: '#64748b', icon: 'shield' },
  { name: 'Taxes',         type: 'EXPENSE', color: '#dc2626', icon: 'receipt' },
  { name: 'Investing',     type: 'EXPENSE', color: '#1d4ed8', icon: 'trending-up' },
  { name: 'Other',         type: 'EXPENSE', color: '#94a3b8', icon: 'circle-ellipsis' },
  // Income
  { name: 'Salary',        type: 'INCOME',  color: '#22c55e', icon: 'banknote' },
  { name: 'Freelance',     type: 'INCOME',  color: '#34d399', icon: 'laptop' },
  { name: 'Dividends',     type: 'INCOME',  color: '#86efac', icon: 'trending-up' },
  { name: 'Interest',      type: 'INCOME',  color: '#6ee7b7', icon: 'percent' },
  { name: 'Rental Income', type: 'INCOME',  color: '#4ade80', icon: 'home' },
  { name: 'Other Income',  type: 'INCOME',  color: '#a3e635', icon: 'circle-ellipsis' },
]

const DEFAULT_BANKS = [
  { name: 'Millennium BCP',   color: '#c41e3a', icon: 'building-2' },
  { name: 'Caixa Geral',      color: '#005a2b', icon: 'landmark' },
  { name: 'Santander',        color: '#ec0000', icon: 'landmark' },
  { name: 'BPI',              color: '#003b8e', icon: 'landmark' },
  { name: 'Novo Banco',       color: '#e8820c', icon: 'landmark' },
  { name: 'Revolut',          color: '#0075eb', icon: 'credit-card' },
  { name: 'Wise',             color: '#00b9ff', icon: 'send' },
  { name: 'MB Way',           color: '#ff6600', icon: 'smartphone' },
]

const DEFAULT_ACCOUNT_TYPES = [
  { name: 'Checking', color: '#3b82f6', icon: 'wallet' },
  { name: 'Savings',  color: '#10b981', icon: 'piggy-bank' },
  { name: 'Wallet',   color: '#8b5cf6', icon: 'smartphone' },
  { name: 'Business', color: '#f59e0b', icon: 'briefcase' },
  { name: 'Cash',     color: '#22c55e', icon: 'banknote' },
]

const DEFAULT_INVESTMENT_TYPES = [
  { name: 'ETF',         color: '#3b82f6', icon: 'trending-up' },
  { name: 'Stocks',      color: '#8b5cf6', icon: 'bar-chart-2' },
  { name: 'Crypto',      color: '#f59e0b', icon: 'bitcoin' },
  { name: 'Bonds',       color: '#10b981', icon: 'landmark' },
  { name: 'Real Estate', color: '#ef4444', icon: 'home' },
  { name: 'Commodities', color: '#f97316', icon: 'package' },
]

const DEFAULT_BROKERS = [
  { name: 'Trading 212',         color: '#00cf73', icon: 'trending-up' },
  { name: 'Interactive Brokers', color: '#c41e3a', icon: 'landmark' },
  { name: 'DEGIRO',              color: '#005a8e', icon: 'bar-chart-2' },
  { name: 'XTB',                 color: '#e30613', icon: 'trending-up' },
  { name: 'eToro',               color: '#6bc632', icon: 'users' },
]

export function seedDefaultData(): void {
  // Fast early-exit on the common path: if ANY seeded table already has rows
  // we assume the user has data and skip seeding entirely. Avoids 5 COUNT(*)
  // queries on every launch — just one bounded LIMIT 1 probe per table, stopping
  // at the first hit.
  const hasAny = (table: string): boolean =>
    db.prepare(`SELECT 1 FROM "${table}" LIMIT 1`).get() != null

  if (
    hasAny('Category') ||
    hasAny('Bank') ||
    hasAny('AccountType') ||
    hasAny('InvestmentType') ||
    hasAny('Broker')
  ) {
    return
  }

  const now = new Date().toISOString()

  db.transaction(() => {
    const catStmt = db.prepare(`INSERT INTO "Category" (name, type, color, icon, createdAt) VALUES (@name, @type, @color, @icon, @createdAt)`)
    for (const c of DEFAULT_CATEGORIES) catStmt.run({ ...c, createdAt: now })

    const bankStmt = db.prepare(`INSERT INTO "Bank" (name, color, icon) VALUES (@name, @color, @icon)`)
    for (const b of DEFAULT_BANKS) bankStmt.run(b)

    const atStmt = db.prepare(`INSERT INTO "AccountType" (name, color, icon) VALUES (@name, @color, @icon)`)
    for (const t of DEFAULT_ACCOUNT_TYPES) atStmt.run(t)

    const itStmt = db.prepare(`INSERT INTO "InvestmentType" (name, color, icon) VALUES (@name, @color, @icon)`)
    for (const t of DEFAULT_INVESTMENT_TYPES) itStmt.run(t)

    const brkStmt = db.prepare(`INSERT INTO "Broker" (name, color, icon) VALUES (@name, @color, @icon)`)
    for (const b of DEFAULT_BROKERS) brkStmt.run(b)
  })()
}
