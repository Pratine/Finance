import { describe, it, expect } from 'vitest'
import { applyFilters, matchesSearch, type TransactionFilter } from '../utils/transactionFilters'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let _id = 1
function nextId() { return _id++ }

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: nextId(),
    accountId: 1,
    categoryId: null,
    date: '2026-04-24T00:00:00.000Z',
    valueDate: null,
    description: 'SALARY TRANSFER',
    amount: '2949.85',
    type: 'CREDIT',
    runningBalance: null,
    notes: null,
    category: null,
    ...overrides,
  }
}

const BASE_FILTER: TransactionFilter = {
  search: '',
  accountId: '',
  tagFilter: '',
  typeFilter: 'ALL',
  categoryFilter: '',
  from: '',
  to: '',
  minAmount: '',
  maxAmount: '',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('applyFilters', () => {
  it('returns all transactions when no filter is set', () => {
    const txns = [makeTx(), makeTx({ id: 2 })]
    expect(applyFilters(txns, BASE_FILTER)).toHaveLength(2)
  })

  it('filters by account', () => {
    const txns = [makeTx({ accountId: 1 }), makeTx({ id: 2, accountId: 2 })]
    const result = applyFilters(txns, { ...BASE_FILTER, accountId: 1 })
    expect(result).toHaveLength(1)
    expect(result[0].accountId).toBe(1)
  })

  it('filters credits only', () => {
    const txns = [makeTx({ type: 'CREDIT' }), makeTx({ id: 2, type: 'DEBIT', amount: '-50' })]
    const result = applyFilters(txns, { ...BASE_FILTER, typeFilter: 'CREDIT' })
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('CREDIT')
  })

  it('filters debits only', () => {
    const txns = [makeTx({ type: 'CREDIT' }), makeTx({ id: 2, type: 'DEBIT', amount: '-50' })]
    const result = applyFilters(txns, { ...BASE_FILTER, typeFilter: 'DEBIT' })
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('DEBIT')
  })

  it('filters uncategorised transactions', () => {
    const cat: Category = { id: 1, name: 'Salary', type: 'INCOME', color: null, icon: null }
    const txns = [
      makeTx({ categoryId: null, category: null }),
      makeTx({ id: 2, categoryId: 1, category: cat }),
    ]
    const result = applyFilters(txns, { ...BASE_FILTER, categoryFilter: 'uncategorised' })
    expect(result).toHaveLength(1)
    expect(result[0].categoryId).toBeNull()
  })

  it('filters by specific category', () => {
    const cat: Category = { id: 5, name: 'Fuel', type: 'EXPENSE', color: null, icon: null }
    const txns = [
      makeTx({ categoryId: null, category: null }),
      makeTx({ id: 2, categoryId: 5, category: cat }),
    ]
    const result = applyFilters(txns, { ...BASE_FILTER, categoryFilter: 5 })
    expect(result).toHaveLength(1)
    expect(result[0].categoryId).toBe(5)
  })

  it('filters by date range — from', () => {
    const txns = [
      makeTx({ date: '2026-03-01T00:00:00.000Z' }),
      makeTx({ id: 2, date: '2026-04-24T00:00:00.000Z' }),
    ]
    const result = applyFilters(txns, { ...BASE_FILTER, from: '2026-04-01' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
  })

  it('filters by date range — to', () => {
    const t1 = makeTx({ date: '2026-03-01T00:00:00.000Z' })
    const t2 = makeTx({ date: '2026-04-24T00:00:00.000Z' })
    const result = applyFilters([t1, t2], { ...BASE_FILTER, to: '2026-03-31' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(t1.id)
  })

  it('filters by description search', () => {
    const txns = [makeTx({ description: 'PINGO DOCE' }), makeTx({ id: 2, description: 'SALARY' })]
    expect(applyFilters(txns, { ...BASE_FILTER, search: 'pingo' })).toHaveLength(1)
  })

  it('filters by amount search', () => {
    const txns = [makeTx({ amount: '49.99' }), makeTx({ id: 2, amount: '100.00' })]
    expect(applyFilters(txns, { ...BASE_FILTER, search: '49.99' })).toHaveLength(1)
  })

  it('filters by minimum amount', () => {
    const txns = [
      makeTx({ amount: '5.00' }),
      makeTx({ id: 2, amount: '200.00' }),
    ]
    const result = applyFilters(txns, { ...BASE_FILTER, minAmount: '100' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
  })

  it('filters by maximum amount', () => {
    const txns = [
      makeTx({ amount: '5.00' }),
      makeTx({ id: 2, amount: '200.00' }),
    ]
    const result = applyFilters(txns, { ...BASE_FILTER, maxAmount: '50' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('uses absolute value for amount filter — works for debits too', () => {
    const txns = [makeTx({ type: 'DEBIT', amount: '-350.00' })]
    expect(applyFilters(txns, { ...BASE_FILTER, minAmount: '300' })).toHaveLength(1)
    expect(applyFilters(txns, { ...BASE_FILTER, maxAmount: '100' })).toHaveLength(0)
  })

  it('filters by description search (case-insensitive)', () => {
    const txns = [
      makeTx({ description: 'SALARY TRANSFER' }),
      makeTx({ id: 2, description: 'COMPRA UBER EATS' }),
    ]
    const result = applyFilters(txns, { ...BASE_FILTER, search: 'uber' })
    expect(result).toHaveLength(1)
    expect(result[0].description).toContain('UBER')
  })

  it('combines multiple filters with AND logic', () => {
    const txns = [
      makeTx({ type: 'CREDIT', amount: '2949.85', description: 'SALARY' }),
      makeTx({ id: 2, type: 'CREDIT', amount: '50.00', description: 'REFUND' }),
      makeTx({ id: 3, type: 'DEBIT', amount: '-20.00', description: 'PHARMACY' }),
    ]
    const result = applyFilters(txns, {
      ...BASE_FILTER,
      typeFilter: 'CREDIT',
      minAmount: '100',
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('returns empty array when nothing matches', () => {
    const txns = [makeTx()]
    const result = applyFilters(txns, { ...BASE_FILTER, search: 'xyznonexistent' })
    expect(result).toHaveLength(0)
  })
})

describe('tag filter', () => {
  function txWithTag(id: number, tagId: number): Transaction {
    return makeTx({
      id,
      tags: [{ tag: { id: tagId, name: 'business', color: '#3b82f6' } }],
    })
  }
  function txNoTag(id: number): Transaction {
    return makeTx({ id, tags: [] })
  }

  it('shows all transactions when tagFilter is empty string', () => {
    const txns = [txWithTag(1, 10), txNoTag(2)]
    expect(applyFilters(txns, { ...BASE_FILTER, tagFilter: '' })).toHaveLength(2)
  })

  it('filters to only transactions with the selected tag', () => {
    const txns = [txWithTag(1, 10), txNoTag(2), txWithTag(3, 99)]
    const result = applyFilters(txns, { ...BASE_FILTER, tagFilter: 10 })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('returns empty when no transactions have the tag', () => {
    const txns = [txNoTag(1), txNoTag(2)]
    expect(applyFilters(txns, { ...BASE_FILTER, tagFilter: 10 })).toHaveLength(0)
  })
})

describe('matchesSearch', () => {
  function tx(description: string, amount: string): Transaction {
    return makeTx({ description, amount })
  }

  it('returns true for empty query', () => {
    expect(matchesSearch(tx('LIDL', '25.00'), '')).toBe(true)
    expect(matchesSearch(tx('LIDL', '25.00'), '   ')).toBe(true)
  })

  it('matches description case-insensitively', () => {
    expect(matchesSearch(tx('Pingo Doce', '40.00'), 'pingo')).toBe(true)
    expect(matchesSearch(tx('Pingo Doce', '40.00'), 'PINGO')).toBe(true)
    expect(matchesSearch(tx('Pingo Doce', '40.00'), 'doce')).toBe(true)
  })

  it('does not match unrelated description', () => {
    expect(matchesSearch(tx('NETFLIX', '15.99'), 'spotify')).toBe(false)
  })

  it('matches exact amount string', () => {
    expect(matchesSearch(tx('UBER', '12.50'), '12.50')).toBe(true)
  })

  it('matches amount prefix', () => {
    expect(matchesSearch(tx('RENT', '850.00'), '850')).toBe(true)
  })

  it('matches negative amount by absolute value', () => {
    expect(matchesSearch(tx('RENT', '-850.00'), '850')).toBe(true)
  })

  it('does not match a partial amount that is not a prefix', () => {
    expect(matchesSearch(tx('SHOP', '123.45'), '23')).toBe(false)
  })

  it('returns false when neither description nor amount matches', () => {
    expect(matchesSearch(tx('SALARY', '2800.00'), 'netflix')).toBe(false)
  })
})
