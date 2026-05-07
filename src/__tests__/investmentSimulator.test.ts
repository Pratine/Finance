import { describe, it, expect } from 'vitest'
import { simulate } from '../utils/investmentSimulator'

const BASE = {
  monthlyContribution: 100,
  annualROI: 0,
  annualDividendYield: 0,
  years: 10,
  reinvestDividends: false,
  contributionGrowthType: 'none' as const,
  contributionGrowthValue: 0,
}

describe('simulate', () => {
  it('with no ROI and no dividends, final value equals total invested', () => {
    const r = simulate(BASE)
    expect(r.totalInvested).toBeCloseTo(12000) // 100 * 120 months
    expect(r.finalValue).toBeCloseTo(12000)
    expect(r.totalGains).toBeCloseTo(0)
    expect(r.totalDividends).toBeCloseTo(0)
  })

  it('positive ROI grows the portfolio beyond contributions', () => {
    const r = simulate({ ...BASE, annualROI: 7 })
    expect(r.finalValue).toBeGreaterThan(r.totalInvested)
    expect(r.totalGains).toBeGreaterThan(0)
  })

  it('dividends accumulate over time', () => {
    const r = simulate({ ...BASE, annualDividendYield: 4 })
    expect(r.totalDividends).toBeGreaterThan(0)
  })

  it('reinvesting dividends produces a higher final value than taking them as cash', () => {
    const reinvested = simulate({ ...BASE, annualROI: 7, annualDividendYield: 3, reinvestDividends: true })
    const cash = simulate({ ...BASE, annualROI: 7, annualDividendYield: 3, reinvestDividends: false })
    expect(reinvested.finalValue).toBeGreaterThan(cash.finalValue)
  })

  it('grandTotal with cash dividends includes both portfolio and dividends', () => {
    const r = simulate({ ...BASE, annualDividendYield: 4, reinvestDividends: false })
    expect(r.grandTotal).toBeCloseTo(r.finalValue + r.totalDividends)
  })

  it('produces a yearly snapshot for each year', () => {
    const r = simulate({ ...BASE, years: 5 })
    expect(r.snapshots).toHaveLength(5)
    expect(r.snapshots[0].year).toBe(1)
    expect(r.snapshots[4].year).toBe(5)
  })

  it('portfolio value in snapshots increases over time with positive ROI', () => {
    const r = simulate({ ...BASE, annualROI: 7 })
    for (let i = 1; i < r.snapshots.length; i++) {
      expect(r.snapshots[i].portfolioValue).toBeGreaterThan(r.snapshots[i - 1].portfolioValue)
    }
  })

  it('longer time in market produces higher returns (compounding)', () => {
    const short = simulate({ ...BASE, annualROI: 7, years: 10 })
    const long = simulate({ ...BASE, annualROI: 7, years: 20 })
    const shortRatio = short.finalValue / short.totalInvested
    const longRatio = long.finalValue / long.totalInvested
    expect(longRatio).toBeGreaterThan(shortRatio)
  })
})

describe('contribution growth', () => {
  it('no growth produces the same result as before', () => {
    const withNone = simulate({ ...BASE, contributionGrowthType: 'none', contributionGrowthValue: 0 })
    expect(withNone.totalInvested).toBeCloseTo(12000)
  })

  it('fixed growth increases total invested beyond flat contribution', () => {
    // Year 1: €100/mo, Year 2: €150/mo, ..., Year 10: €550/mo
    const withGrowth = simulate({ ...BASE, contributionGrowthType: 'fixed', contributionGrowthValue: 50 })
    const flat = simulate(BASE)
    expect(withGrowth.totalInvested).toBeGreaterThan(flat.totalInvested)
  })

  it('percentage growth increases total invested beyond flat contribution', () => {
    const withGrowth = simulate({ ...BASE, contributionGrowthType: 'percentage', contributionGrowthValue: 10 })
    const flat = simulate(BASE)
    expect(withGrowth.totalInvested).toBeGreaterThan(flat.totalInvested)
  })

  it('fixed growth snapshot shows increasing monthly contribution each year', () => {
    const r = simulate({ ...BASE, years: 3, contributionGrowthType: 'fixed', contributionGrowthValue: 50 })
    expect(r.snapshots[0].monthlyContribution).toBeCloseTo(100)
    expect(r.snapshots[1].monthlyContribution).toBeCloseTo(150)
    expect(r.snapshots[2].monthlyContribution).toBeCloseTo(200)
  })

  it('percentage growth snapshot compounds correctly each year', () => {
    const r = simulate({ ...BASE, years: 3, contributionGrowthType: 'percentage', contributionGrowthValue: 10 })
    expect(r.snapshots[0].monthlyContribution).toBeCloseTo(100)
    expect(r.snapshots[1].monthlyContribution).toBeCloseTo(110)
    expect(r.snapshots[2].monthlyContribution).toBeCloseTo(121)
  })
})
