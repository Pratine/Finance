import { describe, it, expect } from 'vitest'
import { computeBalanceDelta, toStoredAmount } from '../../electron/services/transactionCalcs'

describe('toStoredAmount', () => {
  it('CREDIT stores positive', () => {
    expect(toStoredAmount(500, 'CREDIT')).toBe(500)
  })

  it('DEBIT stores negative', () => {
    expect(toStoredAmount(200, 'DEBIT')).toBe(-200)
  })

  it('uses absolute value regardless of sign passed', () => {
    expect(toStoredAmount(-200, 'DEBIT')).toBe(-200)
    expect(toStoredAmount(-500, 'CREDIT')).toBe(500)
  })
})

describe('computeBalanceDelta (transaction edit)', () => {
  it('no change when amount and type are unchanged', () => {
    expect(computeBalanceDelta(-50, 'DEBIT', 50)).toBe(0)
    expect(computeBalanceDelta(100, 'CREDIT', 100)).toBe(0)
  })

  it('increasing a debit amount decreases balance further', () => {
    expect(computeBalanceDelta(-50, 'DEBIT', 80)).toBe(-30)
  })

  it('decreasing a debit amount increases balance', () => {
    expect(computeBalanceDelta(-80, 'DEBIT', 50)).toBe(30)
  })

  it('increasing a credit amount increases balance', () => {
    expect(computeBalanceDelta(500, 'CREDIT', 600)).toBe(100)
  })

  it('flipping DEBIT to CREDIT adjusts balance by both amounts', () => {
    expect(computeBalanceDelta(-50, 'CREDIT', 50)).toBe(100)
  })

  it('flipping CREDIT to DEBIT adjusts balance by both amounts', () => {
    expect(computeBalanceDelta(200, 'DEBIT', 200)).toBe(-400)
  })

  it('changing type and amount simultaneously', () => {
    expect(computeBalanceDelta(-30, 'CREDIT', 70)).toBe(100)
  })
})
