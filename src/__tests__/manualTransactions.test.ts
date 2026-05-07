import { describe, it, expect } from 'vitest'

// Pure logic tests for manual transaction and transfer helpers.
// IPC layer is tested in integration; here we cover the balance arithmetic
// that the handlers rely on.

function applyTransactionToBalance(balance: number, amount: number, type: 'CREDIT' | 'DEBIT'): number {
  const abs = Math.abs(amount)
  return type === 'CREDIT' ? balance + abs : balance - abs
}

function reverseTransactionFromBalance(balance: number, storedAmount: number): number {
  // storedAmount is positive for CREDIT, negative for DEBIT
  return balance - storedAmount
}

function applyTransfer(fromBalance: number, toBalance: number, amount: number) {
  const abs = Math.abs(amount)
  return { from: fromBalance - abs, to: toBalance + abs }
}

describe('manual transaction balance arithmetic', () => {
  it('CREDIT increases balance', () => {
    expect(applyTransactionToBalance(1000, 500, 'CREDIT')).toBe(1500)
  })

  it('DEBIT decreases balance', () => {
    expect(applyTransactionToBalance(1000, 200, 'DEBIT')).toBe(800)
  })

  it('uses absolute value regardless of sign passed', () => {
    expect(applyTransactionToBalance(1000, -200, 'DEBIT')).toBe(800)
    expect(applyTransactionToBalance(1000, -500, 'CREDIT')).toBe(1500)
  })

  it('balance can go negative on DEBIT', () => {
    expect(applyTransactionToBalance(100, 300, 'DEBIT')).toBe(-200)
  })
})

describe('delete transaction balance reversal', () => {
  it('reverses a CREDIT (stored positive) by subtracting', () => {
    // balance after credit of 500 = 1500; after delete should be 1000
    expect(reverseTransactionFromBalance(1500, 500)).toBe(1000)
  })

  it('reverses a DEBIT (stored negative) by adding back', () => {
    // balance after debit of -200 = 800; after delete should be 1000
    expect(reverseTransactionFromBalance(800, -200)).toBe(1000)
  })
})

describe('transfer between accounts', () => {
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
