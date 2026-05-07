import { describe, it, expect } from 'vitest'
import { calcAlerts } from '../utils/alerts'

const NOW = new Date()
const MONTH = NOW.getUTCMonth()
const YEAR  = NOW.getUTCFullYear()

function daysFromNow(n: number): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

function monthTx(amount: string, categoryId: number | null, id: number): Transaction {
  return {
    id, accountId: 1, categoryId, valueDate: null, runningBalance: null,
    notes: null, description: 'test', type: 'DEBIT',
    date: new Date(Date.UTC(YEAR, MONTH, 10)).toISOString(),
    amount, category: null,
  }
}

function bill(id: number, name: string, daysUntil: number, isActive = true): RecurringBill {
  return {
    id, name, amount: '50', frequency: 'MONTHLY',
    nextDueDate: daysFromNow(daysUntil),
    categoryId: null, category: null, accountId: null, account: null,
    notes: null, isActive, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  }
}

function budget(id: number, catId: number, catName: string, amount: number): Budget {
  return {
    id, categoryId: catId, amount: String(amount),
    category: { id: catId, name: catName, type: 'EXPENSE', color: null, icon: null },
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  }
}

function goal(id: number, name: string, current: number, target: number): SavingsGoal {
  return {
    id, accountId: null, account: null, name,
    currentAmount: String(current), targetAmount: String(target),
    deadline: null, interestType: null, interestValue: null,
    interestFrequencyDays: null, lastInterestApplied: null,
    totalInterestEarned: '0', contributionAmount: null,
    contributionFrequencyDays: null, notes: null,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  }
}

const EMPTY = { bills: [], budgets: [], transactions: [], savings: [], month: MONTH, year: YEAR }

describe('calcAlerts — bills', () => {
  it('returns no alerts when no bills', () => {
    expect(calcAlerts(EMPTY)).toHaveLength(0)
  })

  it('flags an overdue bill as error', () => {
    const alerts = calcAlerts({ ...EMPTY, bills: [bill(1, 'Netflix', -2)] })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('error')
    expect(alerts[0].id).toBe('bill-overdue-1')
  })

  it('flags a bill due in 3 days as warning', () => {
    const alerts = calcAlerts({ ...EMPTY, bills: [bill(1, 'Rent', 3)] })
    expect(alerts[0].severity).toBe('warning')
    expect(alerts[0].id).toBe('bill-due-1')
  })

  it('flags a bill due today as warning', () => {
    const alerts = calcAlerts({ ...EMPTY, bills: [bill(1, 'Gym', 0)] })
    expect(alerts[0].severity).toBe('warning')
  })

  it('ignores a bill due in 4+ days', () => {
    expect(calcAlerts({ ...EMPTY, bills: [bill(1, 'Spotify', 4)] })).toHaveLength(0)
  })

  it('ignores inactive bills', () => {
    expect(calcAlerts({ ...EMPTY, bills: [bill(1, 'Old bill', -5, false)] })).toHaveLength(0)
  })
})

describe('calcAlerts — budgets', () => {
  it('flags a budget over 100% as error', () => {
    const txns = [monthTx('110', 1, 1)]
    const alerts = calcAlerts({ ...EMPTY, budgets: [budget(1, 1, 'Food', 100)], transactions: txns })
    expect(alerts.some(a => a.severity === 'error' && a.id === 'budget-over-1')).toBe(true)
  })

  it('flags a budget at 80% as warning', () => {
    const txns = [monthTx('80', 1, 1)]
    const alerts = calcAlerts({ ...EMPTY, budgets: [budget(1, 1, 'Food', 100)], transactions: txns })
    expect(alerts.some(a => a.severity === 'warning' && a.id === 'budget-warn-1')).toBe(true)
  })

  it('ignores a budget under 80%', () => {
    const txns = [monthTx('79', 1, 1)]
    expect(calcAlerts({ ...EMPTY, budgets: [budget(1, 1, 'Food', 100)], transactions: txns })).toHaveLength(0)
  })

  it('only counts transactions in the target month', () => {
    const lastMonth = new Date(Date.UTC(YEAR, MONTH - 1, 10)).toISOString()
    const txns = [{ ...monthTx('90', 1, 1), date: lastMonth }]
    expect(calcAlerts({ ...EMPTY, budgets: [budget(1, 1, 'Food', 100)], transactions: txns })).toHaveLength(0)
  })
})

describe('calcAlerts — savings goals', () => {
  it('flags a reached goal as success', () => {
    const alerts = calcAlerts({ ...EMPTY, savings: [goal(1, 'Emergency Fund', 5000, 5000)] })
    expect(alerts[0].severity).toBe('success')
    expect(alerts[0].id).toBe('savings-reached-1')
  })

  it('flags a 90%+ goal as info', () => {
    const alerts = calcAlerts({ ...EMPTY, savings: [goal(1, 'Holiday', 900, 1000)] })
    expect(alerts[0].severity).toBe('info')
    expect(alerts[0].id).toBe('savings-close-1')
  })

  it('ignores a goal under 90%', () => {
    expect(calcAlerts({ ...EMPTY, savings: [goal(1, 'Car', 800, 1000)] })).toHaveLength(0)
  })
})

describe('calcAlerts — ordering', () => {
  it('sorts errors before warnings before success/info', () => {
    const alerts = calcAlerts({
      ...EMPTY,
      bills: [bill(1, 'Rent', -1), bill(2, 'Netflix', 2)],
      savings: [goal(3, 'Fund', 1000, 1000)],
    })
    const severities = alerts.map(a => a.severity)
    expect(severities[0]).toBe('error')
    expect(severities[1]).toBe('warning')
    expect(severities[2]).toBe('success')
  })
})
