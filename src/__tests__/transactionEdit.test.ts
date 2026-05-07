import { describe, it, expect } from 'vitest'

// Pure logic for the balance-delta calculation done in transactions:update IPC handler.

function computeBalanceDelta(
  currentStoredAmount: number, // negative for DEBIT, positive for CREDIT
  newType: 'CREDIT' | 'DEBIT',
  newAbsAmount: number,
): number {
  const newStored = newType === 'DEBIT' ? -Math.abs(newAbsAmount) : Math.abs(newAbsAmount)
  return newStored - currentStoredAmount
}

describe('transaction edit balance delta', () => {
  it('no change when amount and type are unchanged', () => {
    expect(computeBalanceDelta(-50, 'DEBIT', 50)).toBe(0)
    expect(computeBalanceDelta(100, 'CREDIT', 100)).toBe(0)
  })

  it('increasing a debit amount decreases balance further', () => {
    // Was -50, now -80 → delta = -30
    expect(computeBalanceDelta(-50, 'DEBIT', 80)).toBe(-30)
  })

  it('decreasing a debit amount increases balance', () => {
    // Was -80, now -50 → delta = +30
    expect(computeBalanceDelta(-80, 'DEBIT', 50)).toBe(30)
  })

  it('increasing a credit amount increases balance', () => {
    // Was +500, now +600 → delta = +100
    expect(computeBalanceDelta(500, 'CREDIT', 600)).toBe(100)
  })

  it('flipping DEBIT to CREDIT adjusts balance by both amounts', () => {
    // Was -50 (debit), now +50 (credit) → balance goes up by 100
    expect(computeBalanceDelta(-50, 'CREDIT', 50)).toBe(100)
  })

  it('flipping CREDIT to DEBIT adjusts balance by both amounts', () => {
    // Was +200 (credit), now -200 (debit) → balance goes down by 400
    expect(computeBalanceDelta(200, 'DEBIT', 200)).toBe(-400)
  })

  it('changing type and amount simultaneously', () => {
    // Was -30 (debit 30), now credit 70 → delta = 70 - (-30) = 100
    expect(computeBalanceDelta(-30, 'CREDIT', 70)).toBe(100)
  })
})

// Pagination helper: remaining count
describe('pagination remaining count', () => {
  function remaining(loaded: number, total: number) {
    return Math.max(0, total - loaded)
  }

  it('zero when all loaded', () => expect(remaining(200, 200)).toBe(0))
  it('correct when partial', () => expect(remaining(200, 413)).toBe(213))
  it('zero when loaded exceeds total (edge case)', () => expect(remaining(500, 413)).toBe(0))
})
