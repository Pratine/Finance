// Reconstructs daily net worth from transaction running balances and investment price history.

export interface NetWorthPoint {
  date: string          // YYYY-MM-DD
  accounts: number      // sum of all account balances on this date
  investments: number   // total investment portfolio value on this date
  total: number         // accounts + investments
}

// From transactions, build a map of date → { accountId → lastKnownBalance }.
// Carries forward the last known balance for days with no activity.
function buildAccountBalanceMap(transactions: Transaction[]): Map<string, Map<number, number>> {
  // Sort ascending
  const sorted = [...transactions]
    .filter(t => t.runningBalance !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // accountId → last known balance
  const latest = new Map<number, number>()
  // date string → snapshot of all account balances
  const byDate = new Map<string, Map<number, number>>()

  for (const t of sorted) {
    const date = t.date.slice(0, 10)
    latest.set(t.accountId, Math.abs(parseFloat(t.runningBalance!)))
    byDate.set(date, new Map(latest))
  }

  return byDate
}

export function buildNetWorthHistory(
  transactions: Transaction[],
  priceHistory: Array<{ date: string; value: number }>,
): NetWorthPoint[] {
  const accountMap = buildAccountBalanceMap(transactions)
  const investMap = new Map(priceHistory.map(p => [p.date, p.value]))

  // Collect all unique dates from both sources
  const allDates = [...new Set([...accountMap.keys(), ...investMap.keys()])].sort()
  if (allDates.length === 0) return []

  const result: NetWorthPoint[] = []
  let lastAccountSnapshot = new Map<number, number>()
  let lastInvestValue = 0

  for (const date of allDates) {
    if (accountMap.has(date)) lastAccountSnapshot = accountMap.get(date)!
    if (investMap.has(date)) lastInvestValue = investMap.get(date)!

    const accounts = [...lastAccountSnapshot.values()].reduce((s, v) => s + v, 0)
    result.push({ date, accounts, investments: lastInvestValue, total: accounts + lastInvestValue })
  }

  return result
}
