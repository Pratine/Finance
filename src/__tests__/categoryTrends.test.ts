import { describe, it, expect } from 'vitest'
import { calcCategoryTrends } from '../utils/reportingStats'

let _id = 1
function nextId() { return _id++ }

function makeTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: nextId(), accountId: 1, categoryId: null, valueDate: null,
    runningBalance: null, notes: null, category: null,
    date: new Date().toISOString(),
    description: 'test', amount: '-50', type: 'DEBIT',
    ...overrides,
  }
}

function cat(id: number, name: string, color = '#ff0000'): Category {
  return { id, name, type: 'EXPENSE', color, icon: null }
}

// Build a date string N months back from now
function monthsAgo(n: number, day = 15): string {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - n, day)
  d.setUTCHours(12, 0, 0, 0)
  return d.toISOString()
}

describe('calcCategoryTrends', () => {
  it('returns empty categories for no transactions', () => {
    const { series, categories } = calcCategoryTrends([], 3)
    expect(categories).toHaveLength(0)
    expect(series).toHaveLength(3)
  })

  it('only includes DEBIT transactions', () => {
    const txns = [
      makeTx({ type: 'CREDIT', amount: '100', category: cat(1, 'Salary'), date: monthsAgo(0) }),
    ]
    const { categories } = calcCategoryTrends(txns, 3)
    expect(categories).toHaveLength(0)
  })

  it('only includes transactions with a category', () => {
    const txns = [
      makeTx({ category: null, date: monthsAgo(0) }),
    ]
    const { categories } = calcCategoryTrends(txns, 3)
    expect(categories).toHaveLength(0)
  })

  it('aggregates spending per category per month', () => {
    const food = cat(1, 'Food', '#10b981')
    const txns = [
      makeTx({ id: 1, category: food, amount: '-50', date: monthsAgo(0) }),
      makeTx({ id: 2, category: food, amount: '-30', date: monthsAgo(0) }),
      makeTx({ id: 3, category: food, amount: '-20', date: monthsAgo(1) }),
    ]
    const { series, categories } = calcCategoryTrends(txns, 3)
    expect(categories).toHaveLength(1)
    expect(categories[0].name).toBe('Food')

    const thisMonth = series[series.length - 1]
    const lastMonth = series[series.length - 2]
    expect(thisMonth['Food']).toBeCloseTo(80)
    expect(lastMonth['Food']).toBeCloseTo(20)
  })

  it('excludes transactions outside the range', () => {
    const food = cat(1, 'Food')
    const txns = [
      makeTx({ category: food, amount: '-100', date: monthsAgo(5) }),
    ]
    const { categories } = calcCategoryTrends(txns, 3)
    expect(categories).toHaveLength(0)
  })

  it('ranks categories by total spend and limits to topN', () => {
    const food = cat(1, 'Food')
    const rent = cat(2, 'Rent')
    const transport = cat(3, 'Transport')
    const txns = [
      makeTx({ id: 1, category: rent,      amount: '-800', date: monthsAgo(0) }),
      makeTx({ id: 2, category: food,      amount: '-200', date: monthsAgo(0) }),
      makeTx({ id: 3, category: transport, amount: '-50',  date: monthsAgo(0) }),
    ]
    const { categories } = calcCategoryTrends(txns, 3, 2)
    expect(categories).toHaveLength(2)
    expect(categories[0].name).toBe('Rent')
    expect(categories[1].name).toBe('Food')
  })

  it('produces one series point per month', () => {
    const { series } = calcCategoryTrends([], 6)
    expect(series).toHaveLength(6)
  })

  it('series points have a label string', () => {
    const { series } = calcCategoryTrends([], 3)
    for (const point of series) {
      expect(typeof point.label).toBe('string')
      expect(point.label.length).toBeGreaterThan(0)
    }
  })

  it('category color is preserved in output', () => {
    const food = cat(1, 'Food', '#aabbcc')
    const txns = [makeTx({ category: food, amount: '-10', date: monthsAgo(0) })]
    const { categories } = calcCategoryTrends(txns, 3)
    expect(categories[0].color).toBe('#aabbcc')
  })
})
