import { describe, it, expect } from 'vitest'
import { calcMonthlyBreakdown, calcCumulativeBalance, calcCategoryBreakdown } from '../utils/reportingStats'

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1, accountId: 1, categoryId: null, category: null,
    date: '2026-04-15T00:00:00.000Z', valueDate: null,
    description: 'Test', amount: '100', type: 'CREDIT',
    runningBalance: null, notes: null,
    ...overrides,
  }
}

describe('calcMonthlyBreakdown', () => {
  it('returns the requested number of months', () => {
    const result = calcMonthlyBreakdown([], 6)
    expect(result).toHaveLength(6)
  })

  it('sums income and expenses per month', () => {
    const now = new Date()
    const iso = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-15T00:00:00.000Z`
    const txns = [
      makeTx({ date: iso, amount: '1000', type: 'CREDIT' }),
      makeTx({ id: 2, date: iso, amount: '-250', type: 'DEBIT' }),
    ]
    const result = calcMonthlyBreakdown(txns, 1)
    expect(result[0].income).toBeCloseTo(1000)
    expect(result[0].expenses).toBeCloseTo(250)
    expect(result[0].net).toBeCloseTo(750)
  })

  it('excludes transactions outside the range', () => {
    const txns = [makeTx({ date: '2020-01-01T00:00:00.000Z', amount: '9999', type: 'CREDIT' })]
    const result = calcMonthlyBreakdown(txns, 3)
    expect(result.every(r => r.income === 0)).toBe(true)
  })
})

describe('calcCumulativeBalance', () => {
  it('accumulates net across months', () => {
    const breakdown = [
      { label: 'Jan', month: 0, year: 2026, income: 1000, expenses: 600, net: 400 },
      { label: 'Feb', month: 1, year: 2026, income: 1000, expenses: 800, net: 200 },
      { label: 'Mar', month: 2, year: 2026, income: 1000, expenses: 700, net: 300 },
    ]
    const result = calcCumulativeBalance(breakdown)
    expect(result[0].cumulative).toBeCloseTo(400)
    expect(result[1].cumulative).toBeCloseTo(600)
    expect(result[2].cumulative).toBeCloseTo(900)
  })
})

describe('calcCategoryBreakdown', () => {
  it('groups expenses by category and computes percentage', () => {
    const cat: Category = { id: 1, name: 'Food', type: 'EXPENSE', color: '#green', icon: null }
    const now = new Date()
    const iso = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-15T00:00:00.000Z`
    const txns = [
      makeTx({ type: 'DEBIT', amount: '-300', categoryId: 1, category: cat, date: iso }),
      makeTx({ id: 2, type: 'DEBIT', amount: '-100', categoryId: 1, category: cat, date: iso }),
    ]
    const result = calcCategoryBreakdown(txns, 1)
    expect(result[0].name).toBe('Food')
    expect(result[0].total).toBeCloseTo(400)
    expect(result[0].pct).toBeCloseTo(100)
  })

  it('excludes credits', () => {
    const now = new Date()
    const iso = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-15T00:00:00.000Z`
    const txns = [makeTx({ type: 'CREDIT', amount: '1000', date: iso })]
    expect(calcCategoryBreakdown(txns, 1)).toHaveLength(0)
  })
})
