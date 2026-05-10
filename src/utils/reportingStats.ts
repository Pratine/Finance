// Pure reporting calculation utilities.

export interface MonthlyBreakdown {
  label: string   // e.g. "Jan 26"
  month: number   // 0-indexed
  year: number
  income: number
  expenses: number
  net: number
}

// Returns one entry per month in the range [startMonth..now], newest last.
export function calcMonthlyBreakdown(
  transactions: Transaction[],
  months: number, // how many months back to include
): MonthlyBreakdown[] {
  const result: MonthlyBreakdown[] = []
  const now = new Date()

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const m = d.getUTCMonth()
    const y = d.getUTCFullYear()

    const inMonth = transactions.filter(t => {
      const td = new Date(t.date)
      return td.getUTCMonth() === m && td.getUTCFullYear() === y
    })

    const income = inMonth
      .filter(t => t.type === 'CREDIT')
      .reduce((s, t) => s + parseFloat(t.amount), 0)

    const expenses = inMonth
      .filter(t => t.type === 'DEBIT')
      .reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0)

    result.push({
      label: d.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      month: m,
      year: y,
      income,
      expenses,
      net: income - expenses,
    })
  }

  return result
}

// Returns cumulative net balance per month (running total of income - expenses).
export function calcCumulativeBalance(breakdown: MonthlyBreakdown[]): Array<MonthlyBreakdown & { cumulative: number }> {
  let cumulative = 0
  return breakdown.map(b => {
    cumulative += b.net
    return { ...b, cumulative }
  })
}

export interface CategoryBreakdown {
  name: string
  color: string
  total: number
  pct: number
}

export interface CategoryTrendPoint {
  label: string             // e.g. "Jan 26"
  month: number
  year: number
  [categoryName: string]: number | string  // dynamic keys per category
}

// Returns a monthly time series of spending per category.
// Only DEBIT transactions with a category are counted.
// `topN` limits to the N highest-spending categories across the whole period.
export function calcCategoryTrends(
  transactions: Transaction[],
  months: number,
  topN = 6,
): { series: CategoryTrendPoint[]; categories: Array<{ name: string; color: string }> } {
  const now = new Date()

  // Build month labels and collect per-month per-category totals
  const monthKeys: Array<{ label: string; month: number; year: number }> = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthKeys.push({
      label: d.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' }),
      month: d.getMonth(),
      year: d.getFullYear(),
    })
  }

  // category → month-index → total
  const catMonthTotals = new Map<string, { color: string; byMonth: number[] }>()

  for (const t of transactions) {
    if (t.type !== 'DEBIT' || !t.category) continue
    const td = new Date(t.date)
    const tm = td.getUTCMonth()
    const ty = td.getUTCFullYear()
    const mi = monthKeys.findIndex(k => k.month === tm && k.year === ty)
    if (mi === -1) continue

    const name = t.category.name
    if (!catMonthTotals.has(name)) {
      catMonthTotals.set(name, { color: t.category.color ?? '#64748b', byMonth: new Array(months).fill(0) })
    }
    catMonthTotals.get(name)!.byMonth[mi] += Math.abs(parseFloat(t.amount))
  }

  // Pick top N categories by total spend across the period
  const ranked = [...catMonthTotals.entries()]
    .map(([name, { color, byMonth }]) => ({ name, color, total: byMonth.reduce((s, v) => s + v, 0), byMonth }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN)

  const series: CategoryTrendPoint[] = monthKeys.map((mk, mi) => {
    const point: CategoryTrendPoint = { label: mk.label, month: mk.month, year: mk.year }
    for (const cat of ranked) {
      point[cat.name] = cat.byMonth[mi]
    }
    return point
  })

  return {
    series,
    categories: ranked.map(c => ({ name: c.name, color: c.color })),
  }
}

// Returns expense breakdown by category for a given period, sorted descending.
export function calcCategoryBreakdown(
  transactions: Transaction[],
  months: number,
): CategoryBreakdown[] {
  const now = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)

  const map = new Map<string, { color: string; total: number }>()

  for (const t of transactions) {
    if (t.type !== 'DEBIT' || !t.category) continue
    if (new Date(t.date) < cutoff) continue
    const key = t.category.name
    const prev = map.get(key) ?? { color: t.category.color ?? '#64748b', total: 0 }
    map.set(key, { ...prev, total: prev.total + Math.abs(parseFloat(t.amount)) })
  }

  const total = [...map.values()].reduce((s, v) => s + v.total, 0)
  return [...map.entries()]
    .map(([name, { color, total: t }]) => ({ name, color, total: t, pct: total > 0 ? (t / total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total)
}
