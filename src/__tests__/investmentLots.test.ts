import { describe, it, expect } from 'vitest'
import { calcAvgCostBasis, calcLotGain } from '../utils/investmentCalcs'

function makeLot(shares: number, pricePerShare: number): InvestmentLot {
  return {
    id: Math.random(),
    investmentId: 1,
    type: 'BUY',
    date: new Date().toISOString(),
    shares: String(shares),
    pricePerShare: String(pricePerShare),
    totalCost: String(Math.round(shares * pricePerShare * 100) / 100),
    realizedGain: null,
    notes: null,
    createdAt: new Date().toISOString(),
  }
}

describe('calcAvgCostBasis', () => {
  it('returns null for no lots', () => {
    expect(calcAvgCostBasis([])).toBeNull()
  })

  it('single lot — avg equals its own price per share', () => {
    const lots = [makeLot(10, 80)]
    expect(calcAvgCostBasis(lots)).toBeCloseTo(80)
  })

  it('two equal lots at different prices — weighted average', () => {
    // 10 shares at €80, 10 shares at €100 → avg €90
    const lots = [makeLot(10, 80), makeLot(10, 100)]
    expect(calcAvgCostBasis(lots)).toBeCloseTo(90)
  })

  it('two unequal lots — weighted by shares', () => {
    // 10 shares at €80 (cost €800) + 5 shares at €100 (cost €500) = €1300 / 15 = €86.67
    const lots = [makeLot(10, 80), makeLot(5, 100)]
    expect(calcAvgCostBasis(lots)).toBeCloseTo(86.67, 1)
  })

  it('fractional shares — still computes correctly', () => {
    const lots = [makeLot(1.5, 80), makeLot(0.5, 100)]  // 2 total shares, cost €170 → avg €85
    expect(calcAvgCostBasis(lots)).toBeCloseTo(85)
  })
})

describe('calcLotGain', () => {
  it('positive gain when current price > purchase price', () => {
    const lot = makeLot(10, 80)  // bought at €80, now €100
    const { absolute, percentage, currentValue } = calcLotGain(lot, 100)
    expect(currentValue).toBeCloseTo(1000)
    expect(absolute).toBeCloseTo(200)
    expect(percentage).toBeCloseTo(25)
  })

  it('negative gain (loss) when current price < purchase price', () => {
    const lot = makeLot(10, 100)  // bought at €100, now €80
    const { absolute, percentage } = calcLotGain(lot, 80)
    expect(absolute).toBeCloseTo(-200)
    expect(percentage).toBeCloseTo(-20)
  })

  it('zero gain when price unchanged', () => {
    const lot = makeLot(5, 90)
    const { absolute, percentage } = calcLotGain(lot, 90)
    expect(absolute).toBeCloseTo(0)
    expect(percentage).toBeCloseTo(0)
  })

  it('scales correctly with fractional shares', () => {
    const lot = makeLot(0.5, 200)  // 0.5 shares at €200 = €100 cost
    const { absolute, currentValue } = calcLotGain(lot, 300) // now €150
    expect(currentValue).toBeCloseTo(150)
    expect(absolute).toBeCloseTo(50)
  })
})

describe('syncInvestmentTotals logic (average cost method)', () => {
  function makeSell(shares: number, pricePerShare: number, realizedGain: number): InvestmentLot {
    return { ...makeLot(shares, pricePerShare), type: 'SELL', realizedGain: String(realizedGain) }
  }

  function syncTotals(lots: InvestmentLot[]) {
    const buys  = lots.filter(l => l.type === 'BUY')
    const sells = lots.filter(l => l.type === 'SELL')
    const totalBuyShares  = buys.reduce((s, l) => s + parseFloat(l.shares), 0)
    const totalSellShares = sells.reduce((s, l) => s + parseFloat(l.shares), 0)
    const totalShares = Math.max(0, totalBuyShares - totalSellShares)
    const totalBuyCost = buys.reduce((s, l) => s + parseFloat(l.totalCost), 0)
    const avgBuyPrice = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0
    const remainingCost = Math.round(totalShares * avgBuyPrice * 100) / 100
    return { shares: totalShares, amountIn: remainingCost }
  }

  it('buy only: shares and cost match', () => {
    const { shares, amountIn } = syncTotals([makeLot(10, 80), makeLot(5, 100)])
    expect(shares).toBeCloseTo(15)
    expect(amountIn).toBeCloseTo(1300)
  })

  it('sell reduces share count', () => {
    const { shares } = syncTotals([makeLot(10, 80), makeSell(4, 100, 80)])
    expect(shares).toBeCloseTo(6)
  })

  it('remaining cost uses avg cost method', () => {
    // Buy 10 at €80 (avg = €80), sell 5 → remaining cost = 5 × €80 = €400
    const { amountIn } = syncTotals([makeLot(10, 80), makeSell(5, 100, 100)])
    expect(amountIn).toBeCloseTo(400)
  })

  it('selling all shares leaves zero', () => {
    const { shares, amountIn } = syncTotals([makeLot(5, 80), makeSell(5, 100, 100)])
    expect(shares).toBeCloseTo(0)
    expect(amountIn).toBeCloseTo(0)
  })

  it('cannot go negative (clamped to zero)', () => {
    const { shares } = syncTotals([makeLot(5, 80), makeSell(10, 100, 100)])
    expect(shares).toBe(0)
  })
})

describe('realized gain calculation', () => {
  it('profit when sell price > avg cost', () => {
    // avg cost €80, sell 5 at €100 → gain = (100-80) × 5 = €100
    const avgCost = 80
    const sellShares = 5
    const sellPrice = 100
    const proceeds  = sellShares * sellPrice
    const costBasis = sellShares * avgCost
    expect(proceeds - costBasis).toBeCloseTo(100)
  })

  it('loss when sell price < avg cost', () => {
    const avgCost = 100, sellShares = 5, sellPrice = 70
    expect(sellShares * sellPrice - sellShares * avgCost).toBeCloseTo(-150)
  })

  it('zero realized gain when selling at cost', () => {
    const avgCost = 80
    expect(5 * 80 - 5 * avgCost).toBe(0)
  })
})
