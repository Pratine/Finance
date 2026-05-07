import { describe, it, expect } from 'vitest'
import { calcMonthlyStats, calcNetWorth, calcSavingsTotal } from '../utils/dashboardStats'

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1, accountId: 1, categoryId: null, category: null,
    date: '2026-04-15T00:00:00.000Z', valueDate: null,
    description: 'Test', amount: '100', type: 'CREDIT',
    runningBalance: null, notes: null,
    ...overrides,
  }
}

function makeAccount(balance: string): Account {
  return {
    id: 1, name: 'Test', bankId: 1,
    bank: { id: 1, name: 'Bank', color: null, icon: null },
    accountNumber: null, typeId: 1,
    type: { id: 1, name: 'Checking', color: null, icon: null },
    balance, currency: 'EUR',
  }
}

function makeInvestment(amountIn: string, currentValue: string): Investment {
  return {
    id: 1, name: 'ETF', typeId: 1, brokerId: null, broker: null,
    type: { id: 1, name: 'ETF', color: null, icon: null },
    amountIn, currentValue, currency: 'EUR', notes: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeGoal(currentAmount: string, targetAmount: string): SavingsGoal {
  return {
    id: 1, name: 'Goal', accountId: null, account: null,
    currentAmount, targetAmount, deadline: null,
    interestType: null, interestValue: null, interestFrequencyDays: null,
    lastInterestApplied: null, contributionAmount: null, contributionFrequencyDays: null,
    notes: null, totalInterestEarned: '0',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

// ─── calcMonthlyStats ─────────────────────────────────────────────────────────

describe('calcMonthlyStats', () => {
  it('sums credits and debits for the given month', () => {
    const txns = [
      makeTx({ date: '2026-04-10T00:00:00.000Z', amount: '1000', type: 'CREDIT' }),
      makeTx({ id: 2, date: '2026-04-15T00:00:00.000Z', amount: '-250', type: 'DEBIT' }),
      makeTx({ id: 3, date: '2026-03-20T00:00:00.000Z', amount: '500', type: 'CREDIT' }), // different month
    ]
    const stats = calcMonthlyStats(txns, 3, 2026) // April = month 3
    expect(stats.totalIn).toBeCloseTo(1000)
    expect(stats.totalOut).toBeCloseTo(250)
    expect(stats.net).toBeCloseTo(750)
  })

  it('returns zeros when no transactions in the month', () => {
    const stats = calcMonthlyStats([], 3, 2026)
    expect(stats.totalIn).toBe(0)
    expect(stats.totalOut).toBe(0)
    expect(stats.net).toBe(0)
  })

  it('net is negative when expenses exceed income', () => {
    const txns = [
      makeTx({ amount: '100', type: 'CREDIT' }),
      makeTx({ id: 2, amount: '-500', type: 'DEBIT' }),
    ]
    const stats = calcMonthlyStats(txns, 3, 2026)
    expect(stats.net).toBeCloseTo(-400)
  })
})

// ─── calcNetWorth ─────────────────────────────────────────────────────────────

describe('calcNetWorth', () => {
  it('sums all account balances and investment current values', () => {
    const accounts = [makeAccount('1000'), makeAccount('500')]
    const investments = [makeInvestment('800', '1200')]
    expect(calcNetWorth(accounts, investments)).toBeCloseTo(2700)
  })

  it('works with no investments', () => {
    expect(calcNetWorth([makeAccount('750')], [])).toBeCloseTo(750)
  })

  it('works with no accounts', () => {
    expect(calcNetWorth([], [makeInvestment('1000', '1100')])).toBeCloseTo(1100)
  })

  it('returns 0 with no data', () => {
    expect(calcNetWorth([], [])).toBe(0)
  })
})

// ─── calcSavingsTotal ─────────────────────────────────────────────────────────

describe('calcSavingsTotal', () => {
  it('sums current and target across all goals', () => {
    const goals = [makeGoal('500', '1000'), makeGoal('200', '500')]
    const { current, target } = calcSavingsTotal(goals)
    expect(current).toBeCloseTo(700)
    expect(target).toBeCloseTo(1500)
  })

  it('returns zeros for empty list', () => {
    const { current, target } = calcSavingsTotal([])
    expect(current).toBe(0)
    expect(target).toBe(0)
  })
})
