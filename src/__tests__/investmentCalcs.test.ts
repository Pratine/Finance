import { describe, it, expect } from 'vitest'
import { calcPnL, fmtPct, calcCAGR, daysHeld, fmtCAGR } from '../utils/investmentCalcs'

describe('calcPnL', () => {
  it('returns positive gain when current > invested', () => {
    const { absolute, percentage } = calcPnL(1000, 1200)
    expect(absolute).toBeCloseTo(200)
    expect(percentage).toBeCloseTo(20)
  })

  it('returns negative loss when current < invested', () => {
    const { absolute, percentage } = calcPnL(1000, 800)
    expect(absolute).toBeCloseTo(-200)
    expect(percentage).toBeCloseTo(-20)
  })

  it('returns zero when current equals invested', () => {
    const { absolute, percentage } = calcPnL(500, 500)
    expect(absolute).toBe(0)
    expect(percentage).toBe(0)
  })

  it('returns zero percentage when amountIn is 0 (no division by zero)', () => {
    const { absolute, percentage } = calcPnL(0, 100)
    expect(absolute).toBe(100)
    expect(percentage).toBe(0)
  })

  it('accepts string inputs', () => {
    const { absolute } = calcPnL('2000.50', '2500.75')
    expect(absolute).toBeCloseTo(500.25)
  })

  it('calculates portfolio-level totals correctly', () => {
    const totalIn = 1000 + 2000 + 500
    const totalCurrent = 1200 + 1800 + 600
    const { absolute, percentage } = calcPnL(totalIn, totalCurrent)
    expect(absolute).toBeCloseTo(100)
    expect(percentage).toBeCloseTo(2.857, 2)
  })
})

describe('calcCAGR', () => {
  function dateYearsAgo(years: number) {
    const d = new Date()
    d.setFullYear(d.getFullYear() - years)
    return d.toISOString()
  }

  it('returns null for investments held less than 7 days', () => {
    const yesterday = new Date(Date.now() - 3 * 86_400_000).toISOString()
    expect(calcCAGR(1000, 1100, yesterday)).toBeNull()
  })

  it('returns null when amountIn is 0', () => {
    expect(calcCAGR(0, 500, dateYearsAgo(1))).toBeNull()
  })

  it('computes ~10% CAGR for 10% gain over exactly 1 year', () => {
    const cagr = calcCAGR(1000, 1100, dateYearsAgo(1))
    expect(cagr).not.toBeNull()
    expect(cagr!).toBeCloseTo(10, 0)
  })

  it('computes positive CAGR for a doubling investment', () => {
    // Double in ~7 years → CAGR around 10%
    const cagr = calcCAGR(1000, 2000, dateYearsAgo(7))
    expect(cagr).not.toBeNull()
    expect(cagr!).toBeGreaterThan(8)
    expect(cagr!).toBeLessThan(12)
  })

  it('returns negative CAGR for a losing investment', () => {
    const cagr = calcCAGR(1000, 800, dateYearsAgo(2))
    expect(cagr).not.toBeNull()
    expect(cagr!).toBeLessThan(0)
  })
})

describe('daysHeld', () => {
  it('returns 0 for today', () => {
    expect(daysHeld(new Date().toISOString())).toBe(0)
  })

  it('returns approximately 365 for a date one year ago', () => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 1)
    expect(daysHeld(d.toISOString())).toBeCloseTo(365, -1)
  })
})

describe('fmtCAGR', () => {
  it('returns — for null', () => {
    expect(fmtCAGR(null)).toBe('—')
  })

  it('formats positive CAGR with + and p.a.', () => {
    expect(fmtCAGR(12.5)).toBe('+12.5% p.a.')
  })

  it('formats negative CAGR correctly', () => {
    expect(fmtCAGR(-3.2)).toBe('-3.2% p.a.')
  })
})

describe('fmtPct', () => {
  it('prefixes positive values with +', () => {
    expect(fmtPct(12.5)).toBe('+12.50%')
  })

  it('does not double-prefix negative values', () => {
    expect(fmtPct(-5.3)).toBe('-5.30%')
  })

  it('formats zero as +0.00%', () => {
    expect(fmtPct(0)).toBe('+0.00%')
  })
})
