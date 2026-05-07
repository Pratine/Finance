// @vitest-environment node
import { describe, it, expect } from 'vitest'

// Test pure parsing logic without hitting the DB.

function parseSeparator(header: string): string {
  return header.includes(';') ? ';' : ','
}

function parseRow(line: string, headers: string[], sep: string) {
  const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
  const get = (name: string) => cols[headers.indexOf(name)] ?? ''
  const state = get('State').toUpperCase()
  if (state !== 'COMPLETED') return null
  return {
    type: get('Type'),
    completedDate: get('Completed Date'),
    startedDate: get('Started Date'),
    description: get('Description'),
    amount: parseFloat(get('Amount')),
    balance: parseFloat(get('Balance')),
    currency: get('Currency'),
    state,
  }
}

const HEADER_COMMA = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance'
const HEADER_SEMI  = 'Type;Product;Started Date;Completed Date;Description;Amount;Fee;Currency;State;Balance'

describe('parseSeparator', () => {
  it('detects comma separator', () => expect(parseSeparator(HEADER_COMMA)).toBe(','))
  it('detects semicolon separator', () => expect(parseSeparator(HEADER_SEMI)).toBe(';'))
})

describe('parseRow', () => {
  const headers = HEADER_COMMA.split(',')

  it('parses a completed credit row', () => {
    const line = 'TRANSFER,Current,2026-04-01 10:00:00,2026-04-01 10:00:01,Salary,2949.85,0.00,EUR,COMPLETED,3000.00'
    const row = parseRow(line, headers, ',')
    expect(row).not.toBeNull()
    expect(row!.amount).toBeCloseTo(2949.85)
    expect(row!.description).toBe('Salary')
    expect(row!.balance).toBeCloseTo(3000)
  })

  it('parses a completed debit row (negative amount)', () => {
    const line = 'CARD_PAYMENT,Current,2026-04-05 12:00:00,2026-04-05 12:00:01,Netflix,-15.99,0.00,EUR,COMPLETED,2984.01'
    const row = parseRow(line, headers, ',')
    expect(row!.amount).toBeCloseTo(-15.99)
  })

  it('skips PENDING rows', () => {
    const line = 'CARD_PAYMENT,Current,2026-04-05 12:00:00,2026-04-05 12:00:01,Merchant,-10.00,0.00,EUR,PENDING,100.00'
    expect(parseRow(line, headers, ',')).toBeNull()
  })

  it('skips REVERTED rows', () => {
    const line = 'CARD_PAYMENT,Current,2026-04-05 12:00:00,2026-04-05 12:00:01,Merchant,-10.00,0.00,EUR,REVERTED,100.00'
    expect(parseRow(line, headers, ',')).toBeNull()
  })

  it('correctly determines credit vs debit from sign', () => {
    const credit = 'TRANSFER,Current,2026-04-01 10:00:00,2026-04-01 10:00:01,In,100.00,0.00,EUR,COMPLETED,200.00'
    const debit  = 'CARD_PAYMENT,Current,2026-04-01 10:00:00,2026-04-01 10:00:01,Out,-50.00,0.00,EUR,COMPLETED,150.00'
    expect(parseRow(credit, headers, ',')!.amount).toBeGreaterThan(0)
    expect(parseRow(debit,  headers, ',')!.amount).toBeLessThan(0)
  })
})
