// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { calculateInterest, applyPeriods, elapsedPeriods, isInterestDue } from '../services/interest'

const CREATED_AT = new Date('2026-01-01T00:00:00Z')

// ─── applyPeriods ─────────────────────────────────────────────────────────────

describe('applyPeriods', () => {
  it('applies fixed interest for one period', () => {
    expect(applyPeriods(1000, 'FIXED', 10, 1)).toBe(1010)
  })

  it('applies fixed interest for multiple periods (linear)', () => {
    expect(applyPeriods(1000, 'FIXED', 10, 3)).toBe(1030)
  })

  it('applies percentage interest for one period', () => {
    expect(applyPeriods(1000, 'PERCENTAGE', 2.5, 1)).toBeCloseTo(1025)
  })

  it('compounds percentage interest across multiple periods', () => {
    // 1000 * 1.025^3 ≈ 1076.89
    expect(applyPeriods(1000, 'PERCENTAGE', 2.5, 3)).toBeCloseTo(1076.89, 1)
  })

  it('returns the original amount for 0 periods', () => {
    expect(applyPeriods(1000, 'FIXED', 10, 0)).toBe(1000)
    expect(applyPeriods(1000, 'PERCENTAGE', 5, 0)).toBe(1000)
  })

  it('compounds correctly — percentage earns interest on previous interest', () => {
    const after1 = applyPeriods(1000, 'PERCENTAGE', 10, 1) // 1100
    const after2 = applyPeriods(after1, 'PERCENTAGE', 10, 1) // 1210
    expect(applyPeriods(1000, 'PERCENTAGE', 10, 2)).toBeCloseTo(after2)
  })
})

// ─── calculateInterest ────────────────────────────────────────────────────────

describe('calculateInterest', () => {
  it('returns earned amount (not new balance) for one period', () => {
    const earned = calculateInterest({
      interestType: 'PERCENTAGE',
      interestValue: 2.5,
      currentAmount: 1000,
      interestFrequencyDays: 30,
      lastInterestApplied: null,
      createdAt: CREATED_AT,
    })
    expect(earned).toBeCloseTo(25)
  })

  it('returns fixed amount for FIXED type', () => {
    const earned = calculateInterest({
      interestType: 'FIXED',
      interestValue: 10,
      currentAmount: 5000,
      interestFrequencyDays: 30,
      lastInterestApplied: null,
      createdAt: CREATED_AT,
    })
    expect(earned).toBe(10)
  })

  it('handles zero balance with percentage', () => {
    expect(calculateInterest({
      interestType: 'PERCENTAGE', interestValue: 5, currentAmount: 0,
      interestFrequencyDays: 30, lastInterestApplied: null, createdAt: CREATED_AT,
    })).toBe(0)
  })
})

// ─── elapsedPeriods ───────────────────────────────────────────────────────────

describe('elapsedPeriods', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns 0 when not enough time has passed', () => {
    vi.setSystemTime(new Date('2026-04-15T00:00:00Z'))
    expect(elapsedPeriods({
      lastInterestApplied: new Date('2026-04-01T00:00:00Z'),
      interestFrequencyDays: 30,
      createdAt: CREATED_AT,
    })).toBe(0)
  })

  it('returns 1 when exactly one period has passed', () => {
    vi.setSystemTime(new Date('2026-05-01T00:00:00Z'))
    expect(elapsedPeriods({
      lastInterestApplied: new Date('2026-04-01T00:00:00Z'),
      interestFrequencyDays: 30,
      createdAt: CREATED_AT,
    })).toBe(1)
  })

  it('returns 3 when three periods have passed', () => {
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'))
    expect(elapsedPeriods({
      lastInterestApplied: new Date('2026-04-01T00:00:00Z'),
      interestFrequencyDays: 30,
      createdAt: CREATED_AT,
    })).toBe(3)
  })

  it('uses createdAt as base when never applied before', () => {
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
    // 31 days after createdAt (2026-01-01), freq = 30 → 1 period
    expect(elapsedPeriods({
      lastInterestApplied: null,
      interestFrequencyDays: 30,
      createdAt: CREATED_AT,
    })).toBe(1)
  })

  it('returns 0 when no frequency is configured', () => {
    expect(elapsedPeriods({
      lastInterestApplied: null,
      interestFrequencyDays: null,
      createdAt: CREATED_AT,
    })).toBe(0)
  })
})

// ─── isInterestDue ────────────────────────────────────────────────────────────

describe('isInterestDue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns true when at least one period has elapsed', () => {
    vi.setSystemTime(new Date('2026-05-02T00:00:00Z'))
    expect(isInterestDue({
      lastInterestApplied: new Date('2026-04-01T00:00:00Z'),
      interestFrequencyDays: 30,
      createdAt: CREATED_AT,
    })).toBe(true)
  })

  it('returns false when no period has elapsed', () => {
    vi.setSystemTime(new Date('2026-04-15T00:00:00Z'))
    expect(isInterestDue({
      lastInterestApplied: new Date('2026-04-01T00:00:00Z'),
      interestFrequencyDays: 30,
      createdAt: CREATED_AT,
    })).toBe(false)
  })
})
