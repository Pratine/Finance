// @vitest-environment node
import { describe, it, expect } from 'vitest'

// Test the response parsing logic in isolation without making real HTTP calls.
// We replicate the parsing code so the pure logic is testable.

function parseYahooResponse(raw: string): { price: number; currency: string; name: string } {
  const json = JSON.parse(raw)
  const result = json?.chart?.result?.[0]
  if (!result) {
    const error = json?.chart?.error?.description ?? 'Ticker not found'
    throw new Error(error)
  }
  const meta = result.meta
  const price: number = meta.regularMarketPrice ?? meta.previousClose
  if (!price) throw new Error('No price available')
  return {
    price,
    currency: meta.currency ?? 'EUR',
    name: meta.longName ?? meta.shortName ?? 'Unknown',
  }
}

const VALID_RESPONSE = JSON.stringify({
  chart: {
    result: [{
      meta: {
        regularMarketPrice: 75.42,
        currency: 'USD',
        longName: 'Vanguard S&P 500 ETF',
        shortName: 'VOO',
      },
    }],
    error: null,
  },
})

const EUR_ETF_RESPONSE = JSON.stringify({
  chart: {
    result: [{
      meta: {
        regularMarketPrice: 89.12,
        currency: 'EUR',
        longName: 'iShares Core MSCI World UCITS ETF',
        shortName: 'IWDA',
      },
    }],
    error: null,
  },
})

const ERROR_RESPONSE = JSON.stringify({
  chart: {
    result: null,
    error: { code: 'Not Found', description: 'No fundamentals data found for any of the summaryTypes=financialData' },
  },
})

const NO_PRICE_RESPONSE = JSON.stringify({
  chart: {
    result: [{
      meta: { currency: 'USD', shortName: 'TEST' },
    }],
    error: null,
  },
})

describe('Yahoo Finance response parsing', () => {
  it('extracts price, currency and name from a valid response', () => {
    const r = parseYahooResponse(VALID_RESPONSE)
    expect(r.price).toBe(75.42)
    expect(r.currency).toBe('USD')
    expect(r.name).toBe('Vanguard S&P 500 ETF')
  })

  it('works for EUR-denominated ETFs', () => {
    const r = parseYahooResponse(EUR_ETF_RESPONSE)
    expect(r.price).toBe(89.12)
    expect(r.currency).toBe('EUR')
  })

  it('throws when ticker not found', () => {
    expect(() => parseYahooResponse(ERROR_RESPONSE)).toThrow()
  })

  it('throws when no price field is present', () => {
    expect(() => parseYahooResponse(NO_PRICE_RESPONSE)).toThrow('No price available')
  })

  it('calculates correct total value from price × shares', () => {
    const { price } = parseYahooResponse(VALID_RESPONSE)
    const shares = 10
    expect(price * shares).toBeCloseTo(754.2)
  })
})
