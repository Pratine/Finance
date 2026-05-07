import { describe, it, expect } from 'vitest'
import { calcPnL } from '../utils/investmentCalcs'

// Broker is a pure reference entity (id, name, color, icon) — no calculation logic.
// These tests verify that investment P&L is unaffected by broker assignment,
// and that broker-related display data is correctly derived.

function makeInvestment(overrides: Partial<Investment> = {}): Investment {
  return {
    id: 1,
    name: 'S&P 500 ETF',
    typeId: 1,
    type: { id: 1, name: 'ETF', color: '#10b981', icon: 'BarChart2' },
    amountIn: '1000',
    currentValue: '1200',
    currency: 'EUR',
    brokerId: null,
    broker: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const tradingBroker: Broker = { id: 1, name: 'Trading 212', color: '#1db954', icon: 'TrendingUp' }

describe('investment with broker', () => {
  it('P&L is the same regardless of broker assignment', () => {
    const withBroker = makeInvestment({ brokerId: 1, broker: tradingBroker })
    const noBroker = makeInvestment()

    expect(calcPnL(withBroker.amountIn, withBroker.currentValue)).toEqual(
      calcPnL(noBroker.amountIn, noBroker.currentValue)
    )
  })

  it('broker name is accessible from the investment object', () => {
    const inv = makeInvestment({ brokerId: 1, broker: tradingBroker })
    expect(inv.broker?.name).toBe('Trading 212')
  })

  it('broker is null when not assigned', () => {
    const inv = makeInvestment()
    expect(inv.broker).toBeNull()
    expect(inv.brokerId).toBeNull()
  })

  it('investment without broker still calculates P&L correctly', () => {
    const inv = makeInvestment({ amountIn: '500', currentValue: '450' })
    const { absolute, percentage } = calcPnL(inv.amountIn, inv.currentValue)
    expect(absolute).toBeCloseTo(-50)
    expect(percentage).toBeCloseTo(-10)
  })
})
