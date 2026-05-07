import { describe, it, expect } from 'vitest'

// Pure logic tests for debt tracking calculations.

function pctPaid(outstanding: number, principal: number): number {
  if (principal === 0) return 100
  return Math.round(((principal - outstanding) / principal) * 100)
}

function newOutstanding(current: number, principalPayment: number): number {
  return Math.max(0, current - principalPayment)
}

function autoSplitPayment(amount: number, outstanding: number, annualRatePct: number) {
  const monthlyRate = annualRatePct / 100 / 12
  const interest = Math.min(outstanding * monthlyRate, amount)
  const principal = Math.max(0, amount - interest)
  return { principal, interest }
}

function isDebtPaid(outstanding: number): boolean {
  return outstanding <= 0
}

function netDebt(loans: number[], receivables: number[]): number {
  const owed = loans.reduce((s, v) => s + v, 0)
  const owedToMe = receivables.reduce((s, v) => s + v, 0)
  return owed - owedToMe
}

describe('pctPaid', () => {
  it('returns 0 when nothing paid', () => {
    expect(pctPaid(1000, 1000)).toBe(0)
  })

  it('returns 50 when half paid', () => {
    expect(pctPaid(500, 1000)).toBe(50)
  })

  it('returns 100 when fully paid', () => {
    expect(pctPaid(0, 1000)).toBe(100)
  })

  it('returns 100 for zero-principal edge case', () => {
    expect(pctPaid(0, 0)).toBe(100)
  })
})

describe('newOutstanding', () => {
  it('reduces outstanding by principal amount', () => {
    expect(newOutstanding(1000, 200)).toBe(800)
  })

  it('clamps to zero when overpaid', () => {
    expect(newOutstanding(100, 300)).toBe(0)
  })

  it('full payment reaches zero', () => {
    expect(newOutstanding(500, 500)).toBe(0)
  })
})

describe('autoSplitPayment', () => {
  it('at 6% annual rate, monthly interest on €10000 is €50', () => {
    const { principal, interest } = autoSplitPayment(500, 10000, 6)
    expect(interest).toBeCloseTo(50, 1)
    expect(principal).toBeCloseTo(450, 1)
  })

  it('with 0% rate, entire payment goes to principal', () => {
    const { principal, interest } = autoSplitPayment(300, 5000, 0)
    expect(principal).toBe(300)
    expect(interest).toBe(0)
  })

  it('interest never exceeds the payment amount', () => {
    // very high rate, small payment
    const { interest, principal } = autoSplitPayment(10, 100000, 500)
    expect(interest).toBeLessThanOrEqual(10)
    expect(principal).toBeGreaterThanOrEqual(0)
    expect(interest + principal).toBeCloseTo(10, 5)
  })
})

describe('isDebtPaid', () => {
  it('marks as paid when outstanding is 0', () => {
    expect(isDebtPaid(0)).toBe(true)
  })

  it('not paid when outstanding > 0', () => {
    expect(isDebtPaid(0.01)).toBe(false)
  })
})

describe('netDebt', () => {
  it('positive net means I owe more than owed to me', () => {
    expect(netDebt([5000, 3000], [2000])).toBe(6000)
  })

  it('negative net means owed to me exceeds what I owe', () => {
    expect(netDebt([1000], [5000, 3000])).toBe(-7000)
  })

  it('zero when balanced', () => {
    expect(netDebt([1000], [1000])).toBe(0)
  })

  it('works with empty arrays', () => {
    expect(netDebt([], [2000])).toBe(-2000)
    expect(netDebt([2000], [])).toBe(2000)
  })
})
