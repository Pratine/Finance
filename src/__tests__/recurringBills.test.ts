import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { monthlyEquivalent, daysUntilDue, dueStatus } from '../utils/recurringBills'

describe('monthlyEquivalent', () => {
  it('weekly: 52 payments per year / 12', () => {
    expect(monthlyEquivalent(10, 'WEEKLY')).toBeCloseTo(43.33, 1)
  })

  it('monthly: same amount', () => {
    expect(monthlyEquivalent(100, 'MONTHLY')).toBe(100)
  })

  it('quarterly: amount * 4 / 12', () => {
    expect(monthlyEquivalent(300, 'QUARTERLY')).toBe(100)
  })

  it('yearly: amount / 12', () => {
    expect(monthlyEquivalent(120, 'YEARLY')).toBe(10)
  })
})

describe('daysUntilDue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns positive days when due in the future', () => {
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'))
    expect(daysUntilDue('2026-05-15T00:00:00.000Z')).toBe(14)
  })

  it('returns 0 when due today', () => {
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'))
    expect(daysUntilDue('2026-05-01T00:00:00.000Z')).toBe(0)
  })

  it('returns negative days when overdue', () => {
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    expect(daysUntilDue('2026-05-05T00:00:00.000Z')).toBe(-5)
  })
})

describe('dueStatus', () => {
  it('overdue when days < 0', () => expect(dueStatus(-3)).toBe('overdue'))
  it('due-soon when days 0–7', () => {
    expect(dueStatus(0)).toBe('due-soon')
    expect(dueStatus(7)).toBe('due-soon')
  })
  it('upcoming when days > 7', () => expect(dueStatus(8)).toBe('upcoming'))
})
