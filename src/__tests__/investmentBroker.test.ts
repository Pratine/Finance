import { describe, it, expect } from 'vitest'
import { calcPnL } from '../utils/investmentCalcs'

function makeInvestment(overrides: Partial<Investment> = {}): Investment {
  return {
    id: 1,
    name: 'S&P 500 ETF',
    typeId: 1,
    type: { id: 1, name: 'ETF', color: '#10b981', icon: 'BarChart2' },
    amountIn: '1000',
    currentValue: '1200',
    currency: 'EUR',
    isin: null,
    ticker: null,
    shares: null,
    lastPriceFetched: null,
    priceUpdatedAt: null,
    brokerId: null,
    broker: null,
    notes: null,
    lots: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('investment P&L with and without broker', () => {
  it('calculates P&L correctly for a losing investment regardless of broker', () => {
    const inv = makeInvestment({ amountIn: '500', currentValue: '450' })
    const { absolute, percentage } = calcPnL(inv.amountIn, inv.currentValue)
    expect(absolute).toBeCloseTo(-50)
    expect(percentage).toBeCloseTo(-10)
  })

  it('calculates P&L correctly for a gaining investment with broker assigned', () => {
    const broker: Broker = { id: 1, name: 'Trading 212', color: '#1db954', icon: 'TrendingUp' }
    const inv = makeInvestment({ brokerId: 1, broker, amountIn: '1000', currentValue: '1300' })
    const { absolute, percentage } = calcPnL(inv.amountIn, inv.currentValue)
    expect(absolute).toBeCloseTo(300)
    expect(percentage).toBeCloseTo(30)
  })
})
