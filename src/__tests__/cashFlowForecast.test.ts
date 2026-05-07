import { describe, it, expect } from 'vitest'
import { buildForecast, avgMonthlyIncome } from '../utils/cashFlowForecast'

function makeTx(amount: string, type: 'CREDIT' | 'DEBIT', monthsAgo = 0): Transaction {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - monthsAgo)
  return {
    id: 1, accountId: 1, categoryId: null, valueDate: null,
    runningBalance: null, notes: null, description: 'test',
    category: null, tags: [],
    date: d.toISOString(), amount, type,
  }
}

function makeBill(name: string, amount: string, freq: RecurringBill['frequency']): RecurringBill {
  const next = new Date()
  next.setUTCDate(15)
  return {
    id: 1, name, amount, frequency: freq,
    nextDueDate: next.toISOString(),
    categoryId: null, category: null, accountId: null, account: null,
    notes: null, isActive: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
}

describe('avgMonthlyIncome', () => {
  it('returns 0 for no transactions', () => {
    expect(avgMonthlyIncome([])).toBe(0)
  })

  it('ignores DEBIT transactions', () => {
    const txns = [makeTx('500', 'DEBIT', 0), makeTx('500', 'DEBIT', 1)]
    expect(avgMonthlyIncome(txns)).toBe(0)
  })

  it('averages credits over the lookback period', () => {
    const txns = [
      makeTx('900', 'CREDIT', 0),
      makeTx('900', 'CREDIT', 1),
      makeTx('900', 'CREDIT', 2),
    ]
    expect(avgMonthlyIncome(txns, 3)).toBeCloseTo(900)
  })

  it('ignores credits older than lookback', () => {
    const txns = [
      makeTx('2000', 'CREDIT', 5), // outside 3-month window
      makeTx('900', 'CREDIT', 0),
    ]
    // Only 900 in last 3 months → 900/3 = 300
    expect(avgMonthlyIncome(txns, 3)).toBeCloseTo(300)
  })
})

describe('buildForecast', () => {
  it('returns the requested number of months', () => {
    const result = buildForecast(1000, [], [], [], 6)
    expect(result).toHaveLength(6)
    const result3 = buildForecast(1000, [], [], [], 3)
    expect(result3).toHaveLength(3)
  })

  it('starts balance from currentTotalBalance', () => {
    const result = buildForecast(5000, [], [], [], 1)
    // With no bills or income the balance should stay at 5000
    expect(result[0].projectedBalance).toBe(5000)
  })

  it('adds monthly bill expenses each month', () => {
    const bills = [makeBill('Rent', '800', 'MONTHLY')]
    const result = buildForecast(2000, bills, [], [], 2)
    // Each month: -800 (no income since no transactions)
    expect(result[0].expectedExpenses).toBeCloseTo(800)
    expect(result[1].expectedExpenses).toBeCloseTo(800)
  })

  it('running balance compounds across months', () => {
    const bills = [makeBill('Netflix', '15', 'MONTHLY')]
    const result = buildForecast(100, bills, [], [], 3)
    // Month 1: 100 - 15 = 85; Month 2: 85 - 15 = 70; Month 3: 70 - 15 = 55
    expect(result[0].projectedBalance).toBeCloseTo(85)
    expect(result[1].projectedBalance).toBeCloseTo(70)
    expect(result[2].projectedBalance).toBeCloseTo(55)
  })

  it('yearly bill fires in at most one month across a 6-month forecast', () => {
    const bills = [makeBill('Insurance', '1200', 'YEARLY')]
    const result = buildForecast(5000, bills, [], [], 6)
    const monthsWithExpense = result.filter(m => m.expectedExpenses > 0)
    // A yearly bill fires at most once in any 6-month window
    expect(monthsWithExpense.length).toBeLessThanOrEqual(1)
    // When it does fire, the full amount is shown
    if (monthsWithExpense.length === 1) {
      expect(monthsWithExpense[0].expectedExpenses).toBeCloseTo(1200)
    }
  })

  it('income from transactions increases projected balance', () => {
    const txns = [
      makeTx('3000', 'CREDIT', 0),
      makeTx('3000', 'CREDIT', 1),
      makeTx('3000', 'CREDIT', 2),
    ]
    const result = buildForecast(1000, [], txns, [], 1)
    expect(result[0].expectedIncome).toBeCloseTo(3000)
    expect(result[0].projectedBalance).toBeCloseTo(4000)
  })

  it('each month has a non-empty label', () => {
    const result = buildForecast(0, [], [], [], 6)
    for (const m of result) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.date).toMatch(/^\d{4}-\d{2}-01$/)
    }
  })
})
