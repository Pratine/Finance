import { describe, it, expect } from 'vitest'
import { calcBudgetHistory } from '../utils/budgetHistory'

let _id = 1
function nextId() { return _id++ }

function makeBudget(categoryId: number, amount: number): Budget {
  return {
    id: categoryId,
    categoryId,
    amount: String(amount),
    category: { id: categoryId, name: `Cat ${categoryId}`, type: 'EXPENSE', color: '#10b981', icon: null },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function makeTx(categoryId: number, amount: string, monthsAgo = 0): Transaction {
  const d = new Date()
  d.setUTCDate(15)
  d.setUTCMonth(d.getUTCMonth() - monthsAgo)
  return {
    id: nextId(),
    accountId: 1, valueDate: null, runningBalance: null,
    notes: null, description: 'test', type: 'DEBIT',
    category: null,
    categoryId,
    date: d.toISOString(),
    amount,
  }
}

describe('calcBudgetHistory', () => {
  it('returns one entry per budget', () => {
    const result = calcBudgetHistory([], [makeBudget(1, 200), makeBudget(2, 100)], 3)
    expect(result).toHaveLength(2)
  })

  it('each entry has the requested number of monthly points', () => {
    const result = calcBudgetHistory([], [makeBudget(1, 200)], 6)
    expect(result[0].points).toHaveLength(6)
  })

  it('sums spending for the correct category and month', () => {
    const txns = [
      makeTx(1, '-40', 0),
      makeTx(1, '-60', 0),
      makeTx(2, '-999', 0), // different category — should not count
    ]
    const result = calcBudgetHistory(txns, [makeBudget(1, 200)], 3)
    const thisMonth = result[0].points[result[0].points.length - 1]
    expect(thisMonth.actual).toBeCloseTo(100)
  })

  it('marks month as over when actual exceeds budget', () => {
    const txns = [makeTx(1, '-250', 0)]
    const result = calcBudgetHistory(txns, [makeBudget(1, 200)], 3)
    const thisMonth = result[0].points[result[0].points.length - 1]
    expect(thisMonth.over).toBe(true)
  })

  it('marks month as not over when actual is under budget', () => {
    const txns = [makeTx(1, '-150', 0)]
    const result = calcBudgetHistory(txns, [makeBudget(1, 200)], 3)
    const thisMonth = result[0].points[result[0].points.length - 1]
    expect(thisMonth.over).toBe(false)
  })

  it('budget limit is consistent across all points', () => {
    const result = calcBudgetHistory([], [makeBudget(1, 350)], 6)
    for (const p of result[0].points) {
      expect(p.budget).toBe(350)
    }
  })

  it('counts timesOver for completed past months only', () => {
    const txns = [
      makeTx(1, '-250', 1), // last month — over (250 > 200)
      makeTx(1, '-250', 2), // 2 months ago — over
      makeTx(1, '-100', 3), // 3 months ago — under
    ]
    const result = calcBudgetHistory(txns, [makeBudget(1, 200)], 4)
    expect(result[0].timesOver).toBe(2)
  })

  it('avgActual excludes the current (incomplete) month', () => {
    const txns = [
      makeTx(1, '-100', 1), // last month
      makeTx(1, '-200', 2), // 2 months ago
      makeTx(1, '-999', 0), // this month — should be excluded from avg
    ]
    const result = calcBudgetHistory(txns, [makeBudget(1, 300)], 3)
    // avg of 100 and 200 = 150 (current month excluded)
    expect(result[0].avgActual).toBeCloseTo(150)
  })

  it('returns empty array for no budgets', () => {
    expect(calcBudgetHistory([], [], 6)).toHaveLength(0)
  })

  it('each point has a non-empty label', () => {
    const result = calcBudgetHistory([], [makeBudget(1, 100)], 3)
    for (const p of result[0].points) {
      expect(p.label.length).toBeGreaterThan(0)
    }
  })
})
