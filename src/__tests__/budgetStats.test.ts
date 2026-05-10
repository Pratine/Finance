import { describe, it, expect } from 'vitest'
import { calcBudgetStatus, calcSpendingByCategory, calcBillsReservedByCategory } from '../utils/budgetStats'

let _id = 1
function nextId() { return _id++ }

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: nextId(), accountId: 1, categoryId: 1, category: null,
    date: '2026-04-15T00:00:00.000Z', valueDate: null,
    description: 'Test', amount: '-50', type: 'DEBIT',
    runningBalance: null, notes: null,
    ...overrides,
  }
}

// ─── calcBudgetStatus ─────────────────────────────────────────────────────────

describe('calcBudgetStatus', () => {
  it('calculates remaining and surplus when under budget', () => {
    const s = calcBudgetStatus('500', 200)
    expect(s.budgeted).toBe(500)
    expect(s.spent).toBe(200)
    expect(s.remaining).toBe(300)
    expect(s.pct).toBe(40)
    expect(s.over).toBe(false)
  })

  it('flags over budget and returns negative remaining', () => {
    const s = calcBudgetStatus('200', 350)
    expect(s.remaining).toBe(-150)
    expect(s.over).toBe(true)
    expect(s.pct).toBe(175)
  })

  it('returns 100% when exactly at budget', () => {
    const s = calcBudgetStatus('300', 300)
    expect(s.pct).toBe(100)
    expect(s.over).toBe(false)
    expect(s.remaining).toBe(0)
  })

  it('handles zero budget with no spending', () => {
    const s = calcBudgetStatus('0', 0)
    expect(s.pct).toBe(0)
    expect(s.over).toBe(false)
  })

  it('surplus equals remaining when under budget', () => {
    const s = calcBudgetStatus('1000', 600)
    expect(s.remaining).toBe(400) // this is the surplus for past months
  })
})

// ─── calcBillsReservedByCategory ──────────────────────────────────────────────

function makeBill(overrides: Partial<RecurringBill> = {}): RecurringBill {
  return {
    id: nextId(), name: 'Netflix', amount: '15', frequency: 'MONTHLY',
    nextDueDate: '2026-05-15T00:00:00.000Z', categoryId: 1, category: null,
    accountId: null, account: null,
    notes: null, isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('calcBillsReservedByCategory', () => {
  it('sums active bill amounts by category', () => {
    const bills = [makeBill({ amount: '15' }), makeBill({ id: 2, amount: '10' })]
    const map = calcBillsReservedByCategory(bills)
    expect(map.get(1)).toBeCloseTo(25)
  })

  it('excludes inactive bills', () => {
    const bills = [makeBill({ isActive: false })]
    expect(calcBillsReservedByCategory(bills).size).toBe(0)
  })

  it('excludes bills with no category', () => {
    const bills = [makeBill({ categoryId: null })]
    expect(calcBillsReservedByCategory(bills).size).toBe(0)
  })

  it('combined with transactions gives total budget spent', () => {
    // Budget €30, bill €15 → remaining €15
    const reserved = calcBillsReservedByCategory([makeBill({ amount: '15' })])
    const txSpent = 0
    const totalSpent = txSpent + (reserved.get(1) ?? 0)
    const status = calcBudgetStatus('30', totalSpent)
    expect(status.remaining).toBeCloseTo(15)
  })
})

// ─── calcSpendingByCategory ───────────────────────────────────────────────────

describe('calcSpendingByCategory', () => {
  it('sums debit amounts by category for the given month', () => {
    const txns = [
      makeTx({ categoryId: 1, amount: '-50', type: 'DEBIT', date: '2026-04-10T00:00:00.000Z' }),
      makeTx({ id: 2, categoryId: 1, amount: '-30', type: 'DEBIT', date: '2026-04-20T00:00:00.000Z' }),
      makeTx({ id: 3, categoryId: 2, amount: '-100', type: 'DEBIT', date: '2026-04-15T00:00:00.000Z' }),
    ]
    const map = calcSpendingByCategory(txns, 3, 2026) // April = 3
    expect(map.get(1)).toBeCloseTo(80)
    expect(map.get(2)).toBeCloseTo(100)
  })

  it('applies same budget to any month (budget is persistent)', () => {
    const txns = [
      makeTx({ date: '2026-04-15T00:00:00.000Z', amount: '-50' }),
      makeTx({ id: 2, date: '2026-05-15T00:00:00.000Z', amount: '-70' }),
    ]
    const aprilSpend = calcSpendingByCategory(txns, 3, 2026)
    const maySpend = calcSpendingByCategory(txns, 4, 2026)
    expect(aprilSpend.get(1)).toBeCloseTo(50)
    expect(maySpend.get(1)).toBeCloseTo(70)
  })

  it('excludes credits', () => {
    const txns = [makeTx({ categoryId: 1, amount: '1000', type: 'CREDIT' })]
    expect(calcSpendingByCategory(txns, 3, 2026).size).toBe(0)
  })

  it('excludes uncategorised transactions', () => {
    const txns = [makeTx({ categoryId: null, amount: '-50' })]
    expect(calcSpendingByCategory(txns, 3, 2026).size).toBe(0)
  })

  it('excludes transactions from other months', () => {
    const txns = [makeTx({ date: '2026-03-15T00:00:00.000Z' })]
    expect(calcSpendingByCategory(txns, 3, 2026).size).toBe(0) // April
  })
})
