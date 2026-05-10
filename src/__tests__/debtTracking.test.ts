import { describe, it, expect } from 'vitest'
import { calcPctPaid, calcPaymentSplit, calcNetDebt, PERIODS_PER_YEAR } from '../utils/debtCalcs'

describe('calcPctPaid', () => {
  it('returns 0 when nothing paid', () => {
    expect(calcPctPaid(1000, 1000)).toBe(0)
  })

  it('returns 50 when half paid', () => {
    expect(calcPctPaid(500, 1000)).toBe(50)
  })

  it('returns 100 when fully paid', () => {
    expect(calcPctPaid(0, 1000)).toBe(100)
  })

  it('returns 100 for zero-principal edge case', () => {
    expect(calcPctPaid(0, 0)).toBe(100)
  })
})

describe('calcPaymentSplit', () => {
  it('at 6% annual rate monthly, interest on €10000 is €50', () => {
    const { principal, interest } = calcPaymentSplit(500, 10000, 6, 'MONTHLY')
    expect(interest).toBeCloseTo(50, 1)
    expect(principal).toBeCloseTo(450, 1)
  })

  it('quarterly frequency divides annual rate by 4', () => {
    // 12% annual ÷ 4 periods = 3% per quarter; €10000 × 3% = €300 interest
    const { interest } = calcPaymentSplit(1000, 10000, 12, 'QUARTERLY')
    expect(interest).toBeCloseTo(300, 1)
  })

  it('weekly frequency divides annual rate by 52', () => {
    // 52% annual ÷ 52 = 1% per week; €10000 × 1% = €100 interest
    const { interest } = calcPaymentSplit(500, 10000, 52, 'WEEKLY')
    expect(interest).toBeCloseTo(100, 1)
  })

  it('yearly frequency divides annual rate by 1', () => {
    // 10% annual, yearly payment; €10000 × 10% = €1000 interest
    const { interest } = calcPaymentSplit(2000, 10000, 10, 'YEARLY')
    expect(interest).toBeCloseTo(1000, 1)
  })

  it('null frequency falls back to monthly (÷12)', () => {
    const { interest: withNull }    = calcPaymentSplit(500, 10000, 6, null)
    const { interest: withMonthly } = calcPaymentSplit(500, 10000, 6, 'MONTHLY')
    expect(withNull).toBeCloseTo(withMonthly, 5)
  })

  it('with 0% rate, entire payment goes to principal', () => {
    const { principal, interest } = calcPaymentSplit(300, 5000, 0, 'MONTHLY')
    expect(principal).toBe(300)
    expect(interest).toBe(0)
  })

  it('interest never exceeds the payment amount', () => {
    const { interest, principal } = calcPaymentSplit(10, 100000, 500, 'MONTHLY')
    expect(interest).toBeLessThanOrEqual(10)
    expect(principal).toBeGreaterThanOrEqual(0)
    expect(interest + principal).toBeCloseTo(10, 5)
  })
})

describe('calcNetDebt', () => {
  it('positive net means I owe more than owed to me', () => {
    expect(calcNetDebt(8000, 2000)).toBe(6000)
  })

  it('negative net means owed to me exceeds what I owe', () => {
    expect(calcNetDebt(1000, 8000)).toBe(-7000)
  })

  it('zero when balanced', () => {
    expect(calcNetDebt(1000, 1000)).toBe(0)
  })
})

describe('PERIODS_PER_YEAR', () => {
  it('covers all four frequencies', () => {
    expect(PERIODS_PER_YEAR['WEEKLY']).toBe(52)
    expect(PERIODS_PER_YEAR['MONTHLY']).toBe(12)
    expect(PERIODS_PER_YEAR['QUARTERLY']).toBe(4)
    expect(PERIODS_PER_YEAR['YEARLY']).toBe(1)
  })
})
