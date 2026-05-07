// Pure calculation utilities for the dashboard — extracted for testability.

export interface MonthlyStats {
  totalIn: number
  totalOut: number
  net: number
}

export function calcMonthlyStats(
  transactions: Transaction[],
  month: number, // 0-indexed
  year: number,
): MonthlyStats {
  const inMonth = transactions.filter((t) => {
    const d = new Date(t.date)
    return d.getUTCMonth() === month && d.getUTCFullYear() === year
  })
  const totalIn = inMonth
    .filter((t) => t.type === 'CREDIT')
    .reduce((s, t) => s + parseFloat(t.amount), 0)
  const totalOut = inMonth
    .filter((t) => t.type === 'DEBIT')
    .reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0)
  return { totalIn, totalOut, net: totalIn - totalOut }
}

export function calcNetWorth(accounts: Account[], investments: Investment[]): number {
  const accountsTotal = accounts.reduce((s, a) => s + parseFloat(a.balance), 0)
  const investmentsTotal = investments.reduce((s, i) => s + parseFloat(i.currentValue), 0)
  return accountsTotal + investmentsTotal
}

export function calcSavingsTotal(goals: SavingsGoal[]): { current: number; target: number } {
  return {
    current: goals.reduce((s, g) => s + parseFloat(g.currentAmount), 0),
    target: goals.reduce((s, g) => s + parseFloat(g.targetAmount), 0),
  }
}
