import { describe, it, expect } from 'vitest'
import { buildVItems } from '../utils/transactionGroups'

function tx(id: number, date: string, type: 'CREDIT' | 'DEBIT', amount: string): Transaction {
  return {
    id, accountId: 1, categoryId: null, category: null,
    valueDate: null, runningBalance: null, notes: null,
    description: 'test', date, type, amount,
  }
}

describe('buildVItems', () => {
  it('returns empty array for no transactions', () => {
    expect(buildVItems([])).toHaveLength(0)
  })

  it('produces one header + one row for a single transaction', () => {
    const items = buildVItems([tx(1, '2026-05-01', 'CREDIT', '100')])
    expect(items).toHaveLength(2)
    expect(items[0].kind).toBe('header')
    expect(items[1].kind).toBe('row')
  })

  it('groups transactions on the same date under one header', () => {
    const items = buildVItems([
      tx(1, '2026-05-01', 'CREDIT', '100'),
      tx(2, '2026-05-01', 'DEBIT',  '40'),
    ])
    expect(items).toHaveLength(3)
    expect(items.filter(i => i.kind === 'header')).toHaveLength(1)
    expect(items.filter(i => i.kind === 'row')).toHaveLength(2)
  })

  it('emits a header per distinct date', () => {
    const items = buildVItems([
      tx(1, '2026-05-01', 'CREDIT', '100'),
      tx(2, '2026-05-02', 'DEBIT',  '50'),
    ])
    expect(items.filter(i => i.kind === 'header')).toHaveLength(2)
  })

  it('marks isFirst and isLast correctly for a single-row group', () => {
    const items = buildVItems([tx(1, '2026-05-01', 'CREDIT', '100')])
    const row = items[1] as { kind: 'row'; isFirst: boolean; isLast: boolean }
    expect(row.isFirst).toBe(true)
    expect(row.isLast).toBe(true)
  })

  it('marks isFirst/isLast correctly for a multi-row group', () => {
    const items = buildVItems([
      tx(1, '2026-05-01', 'DEBIT', '10'),
      tx(2, '2026-05-01', 'DEBIT', '20'),
      tx(3, '2026-05-01', 'DEBIT', '30'),
    ])
    const rows = items.filter(i => i.kind === 'row') as Array<{ kind: 'row'; isFirst: boolean; isLast: boolean }>
    expect(rows[0].isFirst).toBe(true);  expect(rows[0].isLast).toBe(false)
    expect(rows[1].isFirst).toBe(false); expect(rows[1].isLast).toBe(false)
    expect(rows[2].isFirst).toBe(false); expect(rows[2].isLast).toBe(true)
  })

  it('sums creditSum and debitSum correctly in the header', () => {
    const items = buildVItems([
      tx(1, '2026-05-01', 'CREDIT', '200'),
      tx(2, '2026-05-01', 'CREDIT', '50.50'),
      tx(3, '2026-05-01', 'DEBIT',  '30'),
    ])
    const header = items[0] as { kind: 'header'; creditSum: number; debitSum: number }
    expect(header.creditSum).toBeCloseTo(250.50)
    expect(header.debitSum).toBeCloseTo(30)
  })

  it('handles debit amounts stored as negative strings', () => {
    const items = buildVItems([tx(1, '2026-05-01', 'DEBIT', '-75.00')])
    const header = items[0] as { kind: 'header'; debitSum: number }
    expect(header.debitSum).toBeCloseTo(75)
  })

  it('total item count equals headers + transactions', () => {
    const txns = [
      tx(1, '2026-01-01', 'CREDIT', '100'),
      tx(2, '2026-01-01', 'DEBIT',  '20'),
      tx(3, '2026-01-02', 'DEBIT',  '15'),
      tx(4, '2026-01-03', 'CREDIT', '500'),
      tx(5, '2026-01-03', 'CREDIT', '200'),
    ]
    expect(buildVItems(txns)).toHaveLength(3 + 5)
  })
})
