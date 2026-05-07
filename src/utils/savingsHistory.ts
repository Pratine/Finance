// Converts raw { date, amount } snapshots into a monthly series suitable for charting.
// Gaps are filled by carrying forward the last known balance.

export interface SavingsHistoryPoint {
  label: string  // e.g. "Jan 25"
  amount: number
  date: string   // YYYY-MM-DD (first of month)
}

export function buildMonthlySavingsHistory(
  points: Array<{ date: string; amount: number }>,
  targetAmount: number,
): SavingsHistoryPoint[] {
  if (points.length === 0) return []

  // Build a date → amount map (last value wins per date)
  const byDate = new Map<string, number>()
  for (const p of points) {
    byDate.set(p.date, p.amount)
  }

  // Determine the range: from first snapshot to today (all in UTC to avoid tz drift)
  const sorted = [...byDate.keys()].sort()
  const firstDate = sorted[0] // YYYY-MM-DD
  const now = new Date()
  const endYear = now.getUTCFullYear()
  const endMonth = now.getUTCMonth()

  // Walk month by month, carry-forward the last known value
  const result: SavingsHistoryPoint[] = []
  let year = parseInt(firstDate.slice(0, 4))
  let month = parseInt(firstDate.slice(5, 7)) - 1 // 0-based
  let lastKnown = 0

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}` // YYYY-MM

    // Find the last data point within this month
    let monthValue: number | null = null
    for (const [d, v] of byDate.entries()) {
      if (d.startsWith(monthStr)) {
        monthValue = v
      }
    }

    if (monthValue !== null) lastKnown = monthValue

    const d = new Date(Date.UTC(year, month, 1))
    const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    result.push({
      label,
      amount: lastKnown,
      date: `${year}-${String(month + 1).padStart(2, '0')}-01`,
    })

    month++
    if (month > 11) { month = 0; year++ }
  }

  return result
}
