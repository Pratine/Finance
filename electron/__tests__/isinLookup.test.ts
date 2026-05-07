// @vitest-environment node
import { describe, it, expect } from 'vitest'

// Test ISIN validation and exchange suffix mapping without hitting the network.

function validateISIN(isin: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin.trim().toUpperCase())
}

const EXCHANGE_MAP: Record<string, string> = {
  AMS: '.AS', XETRA: '.DE', LSE: '.L', SIX: '.SW',
  EPA: '.PA', BME: '.MC', MIL: '.MI', US: '', NYQ: '', NMS: '',
}

function buildYahooTicker(ticker: string, exchCode: string): string {
  const suffix = EXCHANGE_MAP[exchCode] ?? ''
  return `${ticker}${suffix}`
}

describe('ISIN validation', () => {
  it('accepts valid ISINs', () => {
    expect(validateISIN('IE00B4L5Y983')).toBe(true) // IWDA
    expect(validateISIN('IE00B3RBWM25')).toBe(true) // VWCE
    expect(validateISIN('US9229087690')).toBe(true) // VOO
  })

  it('rejects invalid ISINs', () => {
    expect(validateISIN('INVALID')).toBe(false)
    expect(validateISIN('IE00B4L5Y98')).toBe(false)   // too short
    expect(validateISIN('1E00B4L5Y983')).toBe(false)  // starts with digit
    expect(validateISIN('')).toBe(false)
  })
})

describe('Yahoo Finance ticker construction', () => {
  it('appends .AS for Amsterdam', () => {
    expect(buildYahooTicker('IWDA', 'AMS')).toBe('IWDA.AS')
  })

  it('appends .DE for XETRA', () => {
    expect(buildYahooTicker('IWDA', 'XETRA')).toBe('IWDA.DE')
  })

  it('appends .L for LSE', () => {
    expect(buildYahooTicker('IWDA', 'LSE')).toBe('IWDA.L')
  })

  it('no suffix for US exchanges', () => {
    expect(buildYahooTicker('VOO', 'NYQ')).toBe('VOO')
    expect(buildYahooTicker('SPY', 'NMS')).toBe('SPY')
  })

  it('no suffix for unknown exchange', () => {
    expect(buildYahooTicker('IWDA', 'UNKNOWN')).toBe('IWDA')
  })
})
