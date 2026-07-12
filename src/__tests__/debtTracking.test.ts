import { describe, it, expect } from 'vitest'
import { calcPctPaid, calcPaymentSplit, calcNetDebt, PERIODS_PER_YEAR, calcInstallment, buildAmortisationSchedule, periodsPerYearFromDays } from '../utils/debtCalcs'

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

describe('periodsPerYearFromDays', () => {
  it('maps 7 days to 52', () => expect(periodsPerYearFromDays(7)).toBe(52))
  it('maps 30 days to 12', () => expect(periodsPerYearFromDays(30)).toBe(12))
  it('maps 90 days to 4', () => expect(periodsPerYearFromDays(90)).toBe(4))
  it('maps 93 days to 4 (longest real-world quarter)', () => expect(periodsPerYearFromDays(93)).toBe(4))
  it('maps 94 days to 1', () => expect(periodsPerYearFromDays(94)).toBe(1))
  it('maps 365 days to 1', () => expect(periodsPerYearFromDays(365)).toBe(1))
})

describe('calcInstallment', () => {
  it('computes PMT for a standard monthly mortgage', () => {
    // €100,000 at 3.5% TAN, 360 monthly installments = €449.04
    // r = 0.035/12 = 0.002916̄; PMT = 100000 * r / (1 - (1+r)^-360)
    const pmt = calcInstallment(100_000, 3.5, 'MONTHLY', 360)
    expect(pmt).toBeCloseTo(449.04, 2)
  })

  it('returns outstanding/n when rate is zero', () => {
    expect(calcInstallment(12_000, 0, 'MONTHLY', 12)).toBeCloseTo(1000, 5)
  })

  it('handles single installment', () => {
    const pmt = calcInstallment(1000, 5, 'MONTHLY', 1)
    // Interest = 1000 * 0.05/12 = 4.1667; PMT = 1000 + 4.1667 = 1004.17
    expect(pmt).toBeCloseTo(1004.17, 2)
  })

  it('null frequency falls back to monthly', () => {
    const withNull    = calcInstallment(100_000, 3.5, null, 360)
    const withMonthly = calcInstallment(100_000, 3.5, 'MONTHLY', 360)
    expect(withNull).toBeCloseTo(withMonthly, 5)
  })

  it('quarterly frequency divides annual rate by 4', () => {
    // €10,000 at 4% TAN quarterly, 20 periods (5 years)
    // r = 0.04/4 = 0.01; PMT = 10000 * 0.01 / (1 - 1.01^-20) = 554.15
    const pmt = calcInstallment(10_000, 4, 'QUARTERLY', 20)
    expect(pmt).toBeCloseTo(554.15, 2)
  })

  it('returns 0 for totalPeriods=0 (no Infinity)', () => {
    expect(calcInstallment(10_000, 5, 'MONTHLY', 0)).toBe(0)
  })
})

describe('buildAmortisationSchedule', () => {
  const nextDate = new Date('2026-01-01')

  it('generates the correct number of rows', () => {
    const rows = buildAmortisationSchedule(100_000, 3.5, 'MONTHLY', 12, nextDate)
    expect(rows).toHaveLength(12)
  })

  it('final balance is zero (no dust)', () => {
    const rows = buildAmortisationSchedule(10_000, 5, 'MONTHLY', 24, nextDate)
    expect(rows[rows.length - 1].balance).toBe(0)
  })

  it('period numbers are sequential starting from 1', () => {
    const rows = buildAmortisationSchedule(5_000, 4, 'MONTHLY', 6, nextDate)
    rows.forEach((r, i) => expect(r.period).toBe(i + 1))
  })

  it('interest component decreases over time (French amortisation)', () => {
    const rows = buildAmortisationSchedule(50_000, 6, 'MONTHLY', 60, nextDate)
    expect(rows[0].interest).toBeGreaterThan(rows[rows.length - 1].interest)
  })

  it('payment = principal + interest for each row', () => {
    const rows = buildAmortisationSchedule(20_000, 4, 'MONTHLY', 24, nextDate)
    for (const r of rows) {
      expect(r.payment).toBeCloseTo(r.principal + r.interest, 1)
    }
  })

  it('handles zero rate — equal principal splits', () => {
    const rows = buildAmortisationSchedule(1_200, 0, 'MONTHLY', 12, nextDate)
    expect(rows).toHaveLength(12)
    expect(rows[0].interest).toBe(0)
    expect(rows[0].principal).toBeCloseTo(100, 1)
  })

  it('advances monthly dates correctly', () => {
    const rows = buildAmortisationSchedule(10_000, 5, 'MONTHLY', 3, new Date('2026-03-15'))
    expect(rows[0].date).toBe('2026-03-15')
    expect(rows[1].date).toBe('2026-04-15')
    expect(rows[2].date).toBe('2026-05-15')
  })
})
