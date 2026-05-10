// Pure lot calculation logic — extracted from ipc.ts so it can be unit tested
// without a database connection. ipc.ts calls calcInvestmentTotals and writes
// the result; tests call it directly.

// Accepts string, number, or Prisma Decimal — all coerce correctly via Number().
interface LotLike {
  type: string
  shares: unknown
  totalCost: unknown
}

export interface InvestmentTotals {
  shares: number
  amountIn: number
}

// Computes the remaining share count and cost basis using the average cost method.
// Returns { shares: 0, amountIn: 0 } when the lot list is empty (all lots deleted).
export function calcInvestmentTotals(lots: LotLike[]): InvestmentTotals {
  if (lots.length === 0) return { shares: 0, amountIn: 0 }

  const buys  = lots.filter(l => l.type === 'BUY')
  const sells = lots.filter(l => l.type === 'SELL')

  const totalBuyShares  = buys.reduce((s, l) => s + Number(l.shares), 0)
  const totalSellShares = sells.reduce((s, l) => s + Number(l.shares), 0)
  const totalShares     = Math.max(0, totalBuyShares - totalSellShares)
  const totalBuyCost    = buys.reduce((s, l) => s + Number(l.totalCost), 0)
  const avgBuyPrice     = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0
  const amountIn        = Math.round(totalShares * avgBuyPrice * 100) / 100

  return { shares: totalShares, amountIn }
}
