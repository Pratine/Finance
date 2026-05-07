import { describe, it, expect } from 'vitest'
import { monthlyEquivalent, daysUntilDue, dueStatus } from '../utils/recurringBills'

// Recurring income reuses the same pure utilities as recurring bills.
// These tests verify them from the income perspective.

describe('monthlyEquivalent for income', () => {
  it('monthly salary stays the same', () => {
    expect(monthlyEquivalent(2800, 'MONTHLY')).toBe(2800)
  })

  it('weekly freelance income annualised correctly', () => {
    // 500/week × 52 weeks / 12 months ≈ 2166.67
    expect(monthlyEquivalent(500, 'WEEKLY')).toBeCloseTo(2166.67, 0)
  })

  it('quarterly bonus divided by 3', () => {
    expect(monthlyEquivalent(3000, 'QUARTERLY')).toBeCloseTo(1000)
  })

  it('yearly bonus divided by 12', () => {
    expect(monthlyEquivalent(12000, 'YEARLY')).toBeCloseTo(1000)
  })
})

describe('daysUntilDue for income', () => {
  it('future date returns positive days', () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    expect(daysUntilDue(future.toISOString())).toBe(5)
  })

  it('past date returns negative days (late)', () => {
    const past = new Date()
    past.setDate(past.getDate() - 3)
    expect(daysUntilDue(past.toISOString())).toBe(-3)
  })

  it('today returns 0', () => {
    const today = new Date()
    today.setUTCHours(12, 0, 0, 0)
    expect(Math.abs(daysUntilDue(today.toISOString()))).toBeLessThanOrEqual(1)
  })
})

describe('dueStatus for income (overdue = late payment)', () => {
  it('past date is "overdue" (income not received)', () => {
    expect(dueStatus(-2)).toBe('overdue')
  })

  it('within 7 days is "due-soon" (income expected soon)', () => {
    expect(dueStatus(5)).toBe('due-soon')
    expect(dueStatus(0)).toBe('due-soon')
  })

  it('far future is "upcoming"', () => {
    expect(dueStatus(15)).toBe('upcoming')
  })
})
