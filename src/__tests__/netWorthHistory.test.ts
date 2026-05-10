import { describe, it, expect } from 'vitest'
import { buildNetWorthHistory } from '../utils/netWorthHistory'

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1, accountId: 1, categoryId: null, category: null,
    date: '2026-04-15T00:00:00.000Z', valueDate: null,
    description: 'Test', amount: '-50', type: 'DEBIT',
    runningBalance: '1000', notes: null,
    ...overrides,
  }
}

describe('buildNetWorthHistory', () => {
  it('returns empty array with no data', () => {
    expect(buildNetWorthHistory([], [])).toHaveLength(0)
  })

  it('builds points from transactions only', () => {
    const txns = [
      makeTx({ date: '2026-04-01T00:00:00.000Z', runningBalance: '1000', accountId: 1 }),
      makeTx({ id: 2, date: '2026-04-15T00:00:00.000Z', runningBalance: '950', accountId: 1 }),
    ]
    const result = buildNetWorthHistory(txns, [])
    expect(result).toHaveLength(2)
    expect(result[0].date).toBe('2026-04-01')
    expect(result[0].accounts).toBeCloseTo(1000)
    expect(result[0].investments).toBe(0)
    expect(result[1].accounts).toBeCloseTo(950)
  })

  it('carries forward last account balance to days with no transactions', () => {
    const txns = [makeTx({ date: '2026-04-01T00:00:00.000Z', runningBalance: '1000', accountId: 1 })]
    const priceHistory = [{ date: '2026-04-10', value: 500 }]
    const result = buildNetWorthHistory(txns, priceHistory)
    // April 10 has no transaction but should carry forward balance of 1000
    const apr10 = result.find(r => r.date === '2026-04-10')
    expect(apr10).toBeDefined()
    expect(apr10!.accounts).toBeCloseTo(1000)
    expect(apr10!.investments).toBeCloseTo(500)
    expect(apr10!.total).toBeCloseTo(1500)
  })

  it('sums multiple accounts on the same date', () => {
    const txns = [
      makeTx({ accountId: 1, runningBalance: '1000', date: '2026-04-01T00:00:00.000Z' }),
      makeTx({ id: 2, accountId: 2, runningBalance: '500', date: '2026-04-01T00:00:00.000Z' }),
    ]
    const result = buildNetWorthHistory(txns, [])
    expect(result[0].accounts).toBeCloseTo(1500)
  })

  it('total = accounts + investments', () => {
    const txns = [makeTx({ runningBalance: '2000', date: '2026-05-01T00:00:00.000Z' })]
    const history = [{ date: '2026-05-01', value: 800 }]
    const result = buildNetWorthHistory(txns, history)
    expect(result[0].total).toBeCloseTo(2800)
  })

  it('preserves negative running balances (overdrafts subtract from net worth)', () => {
    // Regression test: Math.abs was previously applied, turning -500 into +500,
    // which added overdrafts to net worth instead of subtracting them.
    const txns = [
      makeTx({ accountId: 1, runningBalance: '1000', date: '2026-06-01T00:00:00.000Z' }),
      makeTx({ id: 2, accountId: 2, runningBalance: '-500', date: '2026-06-01T00:00:00.000Z' }),
    ]
    const result = buildNetWorthHistory(txns, [])
    expect(result[0].accounts).toBeCloseTo(500)  // 1000 + (-500) = 500, not 1500
    expect(result[0].total).toBeCloseTo(500)
  })

  it('negative running balance alone produces a negative net worth', () => {
    const txns = [makeTx({ runningBalance: '-2000', date: '2026-06-01T00:00:00.000Z' })]
    const result = buildNetWorthHistory(txns, [])
    expect(result[0].accounts).toBeCloseTo(-2000)
    expect(result[0].total).toBeCloseTo(-2000)
  })
})
