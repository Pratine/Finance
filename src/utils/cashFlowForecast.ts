// Projects future account balances based on recurring bills, historical income
// patterns, and savings goal contributions.

export interface ForecastItem {
  name: string
  amount: number
  type: 'income' | 'expense' | 'savings'
}

export interface ForecastMonth {
  label: string        // e.g. "Jun 26"
  date: string         // YYYY-MM-01
  expectedIncome: number
  expectedExpenses: number
  expectedSavings: number
  net: number          // income - expenses - savings
  projectedBalance: number
  items: ForecastItem[]
}

type Frequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

// Returns how many times a frequency fires in a calendar month (fractional for WEEKLY).
function occurrencesInMonth(freq: Frequency): number {
  switch (freq) {
    case 'WEEKLY':    return 52 / 12
    case 'MONTHLY':   return 1
    case 'QUARTERLY': return 1 / 3
    case 'YEARLY':    return 1 / 12
  }
}

// Advance a date by one period of the given frequency.
function advanceByFrequency(d: Date, freq: Frequency): Date {
  const next = new Date(d)
  switch (freq) {
    case 'WEEKLY':    next.setUTCDate(next.getUTCDate() + 7); break
    case 'MONTHLY':   next.setUTCMonth(next.getUTCMonth() + 1); break
    case 'QUARTERLY': next.setUTCMonth(next.getUTCMonth() + 3); break
    case 'YEARLY':    next.setUTCFullYear(next.getUTCFullYear() + 1); break
  }
  return next
}

// Returns all occurrence dates of a bill that fall within [start, end).
function billOccurrencesInRange(nextDueDate: string, freq: Frequency, start: Date, end: Date): Date[] {
  const dates: Date[] = []
  let cur = new Date(nextDueDate)
  // Walk backward to before start so we don't miss bills whose next date is after start
  // but whose current cycle starts before it
  while (cur >= start) cur = advanceByFrequency(cur, reverseFrequency(freq))
  cur = advanceByFrequency(cur, freq)
  while (cur < end) {
    if (cur >= start) dates.push(new Date(cur))
    cur = advanceByFrequency(cur, freq)
  }
  return dates
}

// Walk one period backward — used to find the period that covers 'start'.
function reverseFrequency(freq: Frequency): Frequency { return freq } // placeholder; actual reverse below
function previousOccurrence(date: Date, freq: Frequency): Date {
  const d = new Date(date)
  switch (freq) {
    case 'WEEKLY':    d.setUTCDate(d.getUTCDate() - 7); break
    case 'MONTHLY':   d.setUTCMonth(d.getUTCMonth() - 1); break
    case 'QUARTERLY': d.setUTCMonth(d.getUTCMonth() - 3); break
    case 'YEARLY':    d.setUTCFullYear(d.getUTCFullYear() - 1); break
  }
  return d
}

function billDatesInMonth(nextDueDate: string, freq: Frequency, year: number, month: number): Date[] {
  const start = new Date(Date.UTC(year, month, 1))
  const end   = new Date(Date.UTC(year, month + 1, 1))
  const dates: Date[] = []
  // Start from a point guaranteed to be before or at start
  let cur = new Date(nextDueDate)
  // Walk forward to find the first occurrence at or after epoch, then walk to find those in range
  // Simpler: walk backward from nextDueDate until before start, then walk forward into range
  while (cur >= end) cur = previousOccurrence(cur, freq)
  while (cur < start) cur = advanceByFrequency(cur, freq)
  while (cur < end) {
    dates.push(new Date(cur))
    cur = advanceByFrequency(cur, freq)
  }
  return dates
}

// Derives average monthly income from the last N months of transactions.
export function avgMonthlyIncome(transactions: Transaction[], lookbackMonths = 3): number {
  const now = new Date()
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - lookbackMonths, 1))
  const credits = transactions.filter(t => {
    if (t.type !== 'CREDIT') return false
    return new Date(t.date) >= cutoff
  })
  const total = credits.reduce((s, t) => s + parseFloat(t.amount), 0)
  return total / Math.max(lookbackMonths, 1)
}

export function buildForecast(
  currentTotalBalance: number,
  bills: RecurringBill[],
  transactions: Transaction[],
  savingsGoals: SavingsGoal[],
  months = 6,
  recurringIncome: Array<{ name: string; amount: string; frequency: string; nextExpectedDate: string; isActive: boolean }> = [],
): ForecastMonth[] {
  // Use recurring income totals if available; fall back to historical average
  const activeIncome = recurringIncome.filter(i => i.isActive)
  const monthlyIncome = activeIncome.length > 0
    ? activeIncome.reduce((s, i) => s + monthlyEquivalent(parseFloat(i.amount), i.frequency as Frequency), 0)
    : avgMonthlyIncome(transactions, 3)

  function monthlyEquivalent(amount: number, freq: Frequency): number {
    const map: Record<Frequency, number> = { WEEKLY: 52/12, MONTHLY: 1, QUARTERLY: 1/3, YEARLY: 1/12 }
    return amount * map[freq]
  }
  const now = new Date()
  const result: ForecastMonth[] = []
  let runningBalance = currentTotalBalance

  for (let i = 1; i <= months; i++) {
    const year  = new Date(now.getFullYear(), now.getMonth() + i, 1).getFullYear()
    const month = new Date(now.getFullYear(), now.getMonth() + i, 1).getMonth()
    const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    const date  = `${year}-${String(month + 1).padStart(2, '0')}-01`

    const items: ForecastItem[] = []

    // ── Income ──────────────────────────────────────────────────────────────
    items.push({ name: 'Expected income', amount: monthlyIncome, type: 'income' })

    // ── Bills (active only) ──────────────────────────────────────────────────
    for (const bill of bills) {
      if (!bill.isActive) continue
      const freq = bill.frequency as Frequency
      const dates = billDatesInMonth(bill.nextDueDate, freq, year, month)
      for (const _d of dates) {
        items.push({ name: bill.name, amount: parseFloat(bill.amount), type: 'expense' })
      }
    }

    // ── Savings contributions ────────────────────────────────────────────────
    for (const goal of savingsGoals) {
      if (!goal.contributionAmount || !goal.contributionFrequencyDays) continue
      const target = parseFloat(goal.targetAmount)
      const current = parseFloat(goal.currentAmount)
      if (target > 0 && current >= target) continue // already reached
      // Convert frequency days → approximate occurrences per month
      const occurrences = Math.round(30 / goal.contributionFrequencyDays)
      const monthly = parseFloat(goal.contributionAmount) * Math.max(1, occurrences)
      items.push({ name: `${goal.name} contribution`, amount: monthly, type: 'savings' })
    }

    const expectedIncome   = items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0)
    const expectedExpenses = items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0)
    const expectedSavings  = items.filter(i => i.type === 'savings').reduce((s, i) => s + i.amount, 0)
    const net = expectedIncome - expectedExpenses - expectedSavings

    runningBalance += net
    result.push({ label, date, expectedIncome, expectedExpenses, expectedSavings, net, projectedBalance: runningBalance, items })
  }

  return result
}
