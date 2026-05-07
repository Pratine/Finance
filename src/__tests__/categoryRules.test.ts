import { describe, it, expect } from 'vitest'
import { matchRule } from '../utils/categoryRules'

const rules = [
  { id: 1, pattern: 'trading 212', categoryId: 10 },
  { id: 2, pattern: 'pingo doce',  categoryId: 20 },
  { id: 3, pattern: 'spotify',     categoryId: 30 },
  { id: 4, pattern: 'uber eats',   categoryId: 40 },
]

describe('matchRule', () => {
  it('matches case-insensitively', () => {
    expect(matchRule('COMPRA 8663 Trading 212 Limassol', rules)).toBe(10)
    expect(matchRule('COMPRA 8663 PINGO DOCE PORTO', rules)).toBe(20)
  })

  it('matches substring anywhere in description', () => {
    expect(matchRule('COMPRA 8663 PAYPAL SPOTIFY P4B...', rules)).toBe(30)
    expect(matchRule('COMPRA 8663 UBER EATS PARIS', rules)).toBe(40)
  })

  it('returns first matching rule when multiple could match', () => {
    const overlapping = [
      { id: 1, pattern: 'uber', categoryId: 99 },
      { id: 2, pattern: 'uber eats', categoryId: 40 },
    ]
    expect(matchRule('UBER EATS PARIS', overlapping)).toBe(99) // first wins
  })

  it('returns null when no rule matches', () => {
    expect(matchRule('COMPRA 8663 UNKNOWN MERCHANT', rules)).toBeNull()
  })

  it('returns null for empty rules list', () => {
    expect(matchRule('PINGO DOCE', [])).toBeNull()
  })

  it('ignores already-categorised logic (pure matching only)', () => {
    // The caller decides whether to apply; the matcher just finds the category
    expect(matchRule('PINGO DOCE MATOSINHOS', rules)).toBe(20)
  })
})
