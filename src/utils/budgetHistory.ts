// Monthly budget vs actual history — pure calculations for the budget history chart.

export interface BudgetHistoryPoint {
  label: string   // "Jan 26"
  month: number   // 0-indexed
  year: number
  actual: number  // total spent in this month for the category
  budget: number  // the budget limit (constant across months)
  over: boolean
}

export interface CategoryBudgetHistory {
  budget: Budget
  points: BudgetHistoryPoint[]
  avgActual: number
  timesOver: number
}

// Computes per-month spending for a single category over the past N months.
function monthlySpend(
  transactions: Transaction[],
  categoryId: number,
  months: number,
): Array<{ month: number; year: number; actual: number }> {
  const now = new Date()
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)
    const m = d.getMonth()
    const y = d.getFullYear()
    const actual = transactions
      .filter(t => {
        if (t.type !== 'DEBIT' || t.categoryId !== categoryId) return false
        const td = new Date(t.date)
        return td.getUTCMonth() === m && td.getUTCFullYear() === y
      })
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0)
    return { month: m, year: y, actual }
  })
}

export function calcBudgetHistory(
  transactions: Transaction[],
  budgets: Budget[],
  months = 6,
): CategoryBudgetHistory[] {
  const now = new Date()

  return budgets.map(budget => {
    const limit = parseFloat(budget.amount)
    const spends = monthlySpend(transactions, budget.categoryId, months)

    const points: BudgetHistoryPoint[] = spends.map(({ month, year, actual }) => {
      const d = new Date(year, month, 1)
      const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
      return { label, month, year, actual, budget: limit, over: actual > limit }
    })

    // Exclude current (incomplete) month from averages
    const pastPoints = points.filter(p =>
      p.year < now.getFullYear() || (p.year === now.getFullYear() && p.month < now.getMonth())
    )
    const avgActual = pastPoints.length > 0
      ? pastPoints.reduce((s, p) => s + p.actual, 0) / pastPoints.length
      : 0
    const timesOver = pastPoints.filter(p => p.over).length

    return { budget, points, avgActual, timesOver }
  })
}
