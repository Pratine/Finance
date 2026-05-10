// Monthly budget vs actual history — pure calculations for the budget history chart.

export interface BudgetHistoryPoint {
  label: string   // "Jan 26"
  month: number   // 0-indexed UTC month
  year: number    // UTC year
  actual: number
  budget: number
  over: boolean
}

export interface CategoryBudgetHistory {
  budget: Budget
  points: BudgetHistoryPoint[]
  avgActual: number
  timesOver: number
}

export function calcBudgetHistory(
  transactions: Transaction[],
  budgets: Budget[],
  months = 6,
): CategoryBudgetHistory[] {
  const now = new Date()

  // ── Single O(N) pass: bucket spending by "categoryId:year-month" ─────────────
  const spending = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== 'DEBIT' || t.categoryId === null) continue
    const d = new Date(t.date)
    const key = `${t.categoryId}:${d.getUTCFullYear()}-${d.getUTCMonth()}`
    spending.set(key, (spending.get(key) ?? 0) + Math.abs(parseFloat(t.amount)))
  }

  // ── Build month list using UTC arithmetic ────────────────────────────────────
  const monthSlots = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth(), d }
  })

  return budgets.map(budget => {
    const limit = parseFloat(budget.amount)

    const points: BudgetHistoryPoint[] = monthSlots.map(({ year, month, d }) => {
      const actual = spending.get(`${budget.categoryId}:${year}-${month}`) ?? 0
      const label  = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
      return { label, month, year, actual, budget: limit, over: actual > limit }
    })

    // Exclude current (incomplete) month from averages
    const pastPoints = points.filter(p =>
      p.year < now.getUTCFullYear() ||
      (p.year === now.getUTCFullYear() && p.month < now.getUTCMonth())
    )
    const avgActual  = pastPoints.length > 0
      ? pastPoints.reduce((s, p) => s + p.actual, 0) / pastPoints.length
      : 0
    const timesOver = pastPoints.filter(p => p.over).length

    return { budget, points, avgActual, timesOver }
  })
}
