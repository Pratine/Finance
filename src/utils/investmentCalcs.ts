// Pure investment calculation utilities — extracted for testability.

export interface PnL {
  absolute: number   // currentValue - amountIn
  percentage: number // (absolute / amountIn) * 100, or 0 if amountIn is 0
}

export function calcPnL(amountIn: string | number, currentValue: string | number): PnL {
  const invested = parseFloat(String(amountIn))
  const current = parseFloat(String(currentValue))
  const absolute = current - invested
  const percentage = invested === 0 ? 0 : (absolute / invested) * 100
  return { absolute, percentage }
}

export function fmt(value: number): string {
  return value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

export function fmtPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

// CAGR: (end/start)^(1/years) - 1
// startDate should be the first buy lot's date (not the investment record's createdAt).
// Returns null when there's not enough time to be meaningful (< 7 days).
export function calcCAGR(amountIn: string | number, currentValue: string | number, startDate: string): number | null {
  const invested = parseFloat(String(amountIn))
  const current = parseFloat(String(currentValue))
  if (invested <= 0) return null
  const days = (Date.now() - new Date(startDate).getTime()) / 86_400_000
  if (days < 7) return null
  const years = days / 365.25
  return (Math.pow(current / invested, 1 / years) - 1) * 100
}

export function daysHeld(startDate: string): number {
  return Math.floor((Date.now() - new Date(startDate).getTime()) / 86_400_000)
}

// Average cost basis across BUY lots only: totalBuyCost / totalBuyShares.
// SELL lots are excluded — their totalCost is sale proceeds, not a cost.
export function calcAvgCostBasis(lots: InvestmentLot[]): number | null {
  const buys = lots.filter(l => l.type === 'BUY')
  if (buys.length === 0) return null
  const totalShares = buys.reduce((s, l) => s + parseFloat(l.shares), 0)
  const totalCost   = buys.reduce((s, l) => s + parseFloat(l.totalCost), 0)
  return totalShares > 0 ? totalCost / totalShares : null
}

// Per-lot unrealised gain given the current price per share
export function calcLotGain(lot: InvestmentLot, currentPricePerShare: number) {
  const shares = parseFloat(lot.shares)
  const cost   = parseFloat(lot.totalCost)
  const currentValue = shares * currentPricePerShare
  const absolute  = currentValue - cost
  const percentage = cost > 0 ? (absolute / cost) * 100 : 0
  return { absolute, percentage, currentValue }
}

export function fmtCAGR(value: number | null): string {
  if (value === null) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}% p.a.`
}
