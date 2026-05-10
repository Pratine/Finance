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

// Frequency is declared globally in src/types/electron.d.ts — no local copy needed.

// Returns how many times a frequency fires in a calendar month (fractional for non-monthly).
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
    default: throw new Error(`Unknown frequency: ${freq}`)
  }
  return next
}

function previousOccurrence(date: Date, freq: Frequency): Date {
  const d = new Date(date)
  switch (freq) {
    case 'WEEKLY':    d.setUTCDate(d.getUTCDate() - 7); break
    case 'MONTHLY':   d.setUTCMonth(d.getUTCMonth() - 1); break
    case 'QUARTERLY': d.setUTCMonth(d.getUTCMonth() - 3); break
    case 'YEARLY':    d.setUTCFullYear(d.getUTCFullYear() - 1); break
    default: throw new Error(`Unknown frequency: ${freq}`)
  }
  return d
}

function billDatesInMonth(nextDueDate: string, freq: Frequency, year: number, month: number): Date[] {
  const start = new Date(Date.UTC(year, month, 1))
  const end   = new Date(Date.UTC(year, month + 1, 1))
  const dates: Date[] = []
  let cur = new Date(nextDueDate)
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
  const credits = transactions.filter(t => t.type === 'CREDIT' && new Date(t.date) >= cutoff)
  const total = credits.reduce((s, t) => s + parseFloat(t.amount), 0)
  return total / Math.max(lookbackMonths, 1)
}

function monthlyEquivalent(amount: number, freq: Frequency): number {
  return amount * occurrencesInMonth(freq)
}

export function buildForecast(
  currentTotalBalance: number,
  bills: RecurringBill[],
  transactions: Transaction[],
  savingsGoals: SavingsGoal[],
  months = 6,
  recurringIncome: Array<{ name: string; amount: string; frequency: string; nextExpectedDate: string; isActive: boolean }> = [],
): ForecastMonth[] {
  const activeIncome = recurringIncome.filter(i => i.isActive)
  const monthlyIncome = activeIncome.length > 0
    ? activeIncome.reduce((s, i) => {
        const freq = i.frequency as Frequency
        return s + monthlyEquivalent(parseFloat(i.amount), freq)
      }, 0)
    : avgMonthlyIncome(transactions, 3)

  const now = new Date()
  const result: ForecastMonth[] = []
  let runningBalance = currentTotalBalance

  for (let i = 1; i <= months; i++) {
    // Use UTC arithmetic so the forecast is timezone-independent.
    const d     = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))
    const year  = d.getUTCFullYear()
    const month = d.getUTCMonth()
    const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    const date  = `${year}-${String(month + 1).padStart(2, '0')}-01`

    const items: ForecastItem[] = []

    items.push({ name: 'Expected income', amount: monthlyIncome, type: 'income' })

    for (const bill of bills) {
      if (!bill.isActive) continue
      const freq = bill.frequency as Frequency
      const dates = billDatesInMonth(bill.nextDueDate, freq, year, month)
      for (const _ of dates) {
        items.push({ name: bill.name, amount: parseFloat(bill.amount), type: 'expense' })
      }
    }

    for (const goal of savingsGoals) {
      if (!goal.contributionAmount || !goal.contributionFrequencyDays) continue
      const target  = parseFloat(goal.targetAmount)
      const current = parseFloat(goal.currentAmount)
      if (target > 0 && current >= target) continue
      // Convert contribution frequency to a monthly amount.
      // Use the same occurrencesInMonth logic — don't round, so yearly (365 days)
      // contributes 1/12 per month rather than 0.
      const occurrences = 30 / goal.contributionFrequencyDays
      const monthly = parseFloat(goal.contributionAmount) * occurrences
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
