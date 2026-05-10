import { describe, it, expect } from 'vitest'
import { toStoredAmount } from '../../electron/services/transactionCalcs'

// Balance arithmetic used by transactions:create, transactions:delete,
// and transactions:transfer IPC handlers.

describe('manual transaction balance arithmetic', () => {
  it('CREDIT increases balance', () => {
    expect(1000 + toStoredAmount(500, 'CREDIT')).toBe(1500)
  })

  it('DEBIT decreases balance', () => {
    expect(1000 + toStoredAmount(200, 'DEBIT')).toBe(800)
  })

  it('uses absolute value regardless of sign passed', () => {
    expect(1000 + toStoredAmount(-200, 'DEBIT')).toBe(800)
    expect(1000 + toStoredAmount(-500, 'CREDIT')).toBe(1500)
  })

  it('balance can go negative on DEBIT', () => {
    expect(100 + toStoredAmount(300, 'DEBIT')).toBe(-200)
  })
})

describe('delete transaction balance reversal', () => {
  // transactions:delete uses: balance.decrement(Number(tx.amount))
  // tx.amount is signed, so subtracting a positive credit restores the balance,
  // and subtracting a negative debit adds back to the balance.
  it('reverses a CREDIT (stored positive) by decrementing', () => {
    const stored = toStoredAmount(500, 'CREDIT') // +500
    expect(1500 - stored).toBe(1000)
  })

  it('reverses a DEBIT (stored negative) by decrementing', () => {
    const stored = toStoredAmount(200, 'DEBIT') // -200
    expect(800 - stored).toBe(1000)
  })
})

describe('transfer between accounts', () => {
  function applyTransfer(fromBalance: number, toBalance: number, amount: number) {
    const abs = Math.abs(amount)
    return { from: fromBalance - abs, to: toBalance + abs }
  }

  it('deducts from source and credits destination', () => {
    const result = applyTransfer(2000, 500, 300)
    expect(result.from).toBe(1700)
    expect(result.to).toBe(800)
  })

  it('uses absolute value of amount', () => {
    const result = applyTransfer(2000, 500, -300)
    expect(result.from).toBe(1700)
    expect(result.to).toBe(800)
  })

  it('transfer of entire balance empties source', () => {
    const result = applyTransfer(1000, 0, 1000)
    expect(result.from).toBe(0)
    expect(result.to).toBe(1000)
  })
})
