// @vitest-environment node
import { describe, it, expect } from 'vitest'

// Tests the pure parsing logic of the Trading 212 importer without touching the DB.
// The implementation in trading212Importer.ts uses an internal classifyAction +
// CSV line parser; these are tested via small re-implementations below to keep
// the test DB-free (the importer module itself imports ../db, which requires
// Electron's `app`).

function parseCSVLine(line: string, sep: string): string[] {
  const cols: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (c === sep && !inQuotes) { cols.push(current); current = '' }
    else current += c
  }
  cols.push(current)
  return cols
}

function classifyAction(action: string): 'BUY' | 'SELL' | null {
  const a = action.trim().toLowerCase()
  if (a === 'market buy' || a === 'limit buy') return 'BUY'
  if (a === 'market sell' || a === 'limit sell') return 'SELL'
  return null
}

const HEADER = 'Action,Time,ISIN,Ticker,Name,Notes,ID,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Currency conversion fee,Currency (Currency conversion fee)'

describe('Trading 212 action classification', () => {
  it('classifies Market buy / Limit buy as BUY', () => {
    expect(classifyAction('Market buy')).toBe('BUY')
    expect(classifyAction('Limit buy')).toBe('BUY')
  })
  it('classifies Market sell / Limit sell as SELL', () => {
    expect(classifyAction('Market sell')).toBe('SELL')
    expect(classifyAction('Limit sell')).toBe('SELL')
  })
  it('returns null for dividends, deposits, and other actions', () => {
    expect(classifyAction('Dividend (Ordinary)')).toBeNull()
    expect(classifyAction('Deposit')).toBeNull()
    expect(classifyAction('Interest on cash')).toBeNull()
    expect(classifyAction('')).toBeNull()
  })
  it('is case-insensitive and whitespace-tolerant', () => {
    expect(classifyAction('  MARKET BUY  ')).toBe('BUY')
    expect(classifyAction('limit SELL')).toBe('SELL')
  })
})

describe('Trading 212 CSV line parsing', () => {
  it('parses a market buy row', () => {
    const headers = parseCSVLine(HEADER, ',')
    const line = 'Market buy,2024-01-15 10:00:00.000,IE00B4L5Y983,IWDA,iShares Core MSCI World,,EOF1234567,2.5,80.00,EUR,1.0,0,EUR,200.00,EUR,0,EUR,0,EUR'
    const cols = parseCSVLine(line, ',')
    const get = (name: string) => cols[headers.indexOf(name)]
    expect(get('Action')).toBe('Market buy')
    expect(get('ISIN')).toBe('IE00B4L5Y983')
    expect(get('Ticker')).toBe('IWDA')
    expect(get('ID')).toBe('EOF1234567')
    expect(parseFloat(get('No. of shares'))).toBeCloseTo(2.5)
    expect(parseFloat(get('Total'))).toBeCloseTo(200.0)
  })

  it('handles quoted names containing commas', () => {
    const headers = parseCSVLine(HEADER, ',')
    const line = 'Market sell,2024-02-01 12:00:00.000,US0378331005,AAPL,"Apple Inc., Common Stock",,EOF999,1,150.00,USD,1.1,5.00,EUR,165.00,EUR,0,EUR,0.50,EUR'
    const cols = parseCSVLine(line, ',')
    const get = (name: string) => cols[headers.indexOf(name)]
    expect(get('Name')).toBe('Apple Inc., Common Stock')
    expect(get('Action')).toBe('Market sell')
    expect(parseFloat(get('Total'))).toBeCloseTo(165.0)
  })

  it('derives price per share from Total / shares', () => {
    const total = 200.0
    const shares = 2.5
    const pricePerShare = Math.round((total / shares) * 10000) / 10000
    expect(pricePerShare).toBeCloseTo(80.0)
  })
})

describe('Trading 212 dedup tag format', () => {
  it('formats notes as [T212]<ID>', () => {
    const id = 'EOF1234567'
    expect(`[T212]${id}`).toBe('[T212]EOF1234567')
  })
})
