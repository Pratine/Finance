// Pure debt calculation utilities — extracted for testability.

// Periods per year for each payment frequency.
export const PERIODS_PER_YEAR: Record<string, number> = {
  WEEKLY: 52, MONTHLY: 12, QUARTERLY: 4, YEARLY: 1,
}

// Maps a frequency-in-days value to the canonical periods-per-year count.
// Used by savings interest (which stores frequency as days, not an enum).
// Threshold 93 covers real-world calendar quarters (91–93 days).
export function periodsPerYearFromDays(frequencyDays: number): number {
  if (frequencyDays <= 7)  return 52
  if (frequencyDays <= 31) return 12
  if (frequencyDays <= 93) return 4
  return 1
}

// Percentage of the debt that has been paid off.
export function calcPctPaid(outstanding: number, principal: number): number {
  if (principal === 0) return 100
  return Math.round(((principal - outstanding) / principal) * 100)
}

// Fixed installment (PMT) using the French amortisation formula.
// tanPct is TAN in percent (e.g. 3.5 for 3.5% p.a.).
export function calcInstallment(
  outstanding: number,
  tanPct: number,
  frequency: string | null,
  totalPeriods: number,
): number {
  if (totalPeriods <= 0) return 0
  const n = frequency ? (PERIODS_PER_YEAR[frequency] ?? 12) : 12
  const r = tanPct / 100 / n
  if (r === 0) return outstanding / totalPeriods
  return (outstanding * r) / (1 - Math.pow(1 + r, -totalPeriods))
}

// Splits a payment into principal and interest components based on TAN and
// payment frequency. When totalPeriods is provided, the interest for this
// period is calculated via the French amortisation (standard mortgage method).
export function calcPaymentSplit(
  amount: number,
  outstanding: number,
  annualRatePct: number,
  frequency: string | null,
): { principal: number; interest: number } {
  const periods = frequency ? (PERIODS_PER_YEAR[frequency] ?? 12) : 12
  const periodRate = annualRatePct / 100 / periods
  // Round amount first so interest + principal === roundedAmount exactly.
  const roundedAmount = Math.round(amount * 100) / 100
  const interest = Math.round(Math.min(outstanding * periodRate, roundedAmount) * 100) / 100
  const principal = Math.max(0, roundedAmount - interest)
  return { principal, interest }
}

export type AmortisationRow = {
  period: number
  date: string        // ISO date string
  payment: number
  principal: number
  interest: number
  balance: number
}

// Generate a forward-looking amortisation schedule from the current outstanding
// balance for the remaining number of periods.
// Safely advance a UTC date by N months, clamping to the last day of the target
// month so e.g. Jan 31 + 1 month → Feb 28, not Mar 2.
// targetDay is the original day-of-month (passed in so repeated clamping doesn't
// permanently lower it — Feb 28 should still land on Mar 31, not Mar 28).
function addUTCMonths(date: Date, months: number, targetDay: number): void {
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(targetDay, lastDay))
}

export function buildAmortisationSchedule(
  outstanding: number,
  tanPct: number,
  frequency: string | null,
  remainingPeriods: number,
  nextDate: Date,
): AmortisationRow[] {
  const n = frequency ? (PERIODS_PER_YEAR[frequency] ?? 12) : 12
  const r = tanPct / 100 / n
  const pmtRaw = r === 0
    ? outstanding / remainingPeriods
    : (outstanding * r) / (1 - Math.pow(1 + r, -remainingPeriods))
  // If PMT rounds to zero (degenerate: tiny balance over many periods), floor to
  // 1 cent so every non-last period emits a real payment row.
  const pmt = Math.max(pmtRaw, 0.005)

  const rows: AmortisationRow[] = []
  let balance = outstanding
  const date = new Date(nextDate)
  const targetDay = date.getUTCDate() // original day-of-month, preserved for month-end clamping

  for (let i = 1; i <= remainingPeriods; i++) {
    // Round interest first; derive principal from payment so rows always sum exactly.
    const isLastPeriod = i === remainingPeriods
    const rawPayment = isLastPeriod ? balance + balance * r : Math.min(pmt, balance + balance * r)
    const payment    = Math.round(rawPayment * 100) / 100
    const interest   = Math.round(balance * r * 100) / 100
    const principal  = Math.round((payment - interest) * 100) / 100
    balance = Math.max(0, balance - principal)

    rows.push({
      period: i,
      date:      date.toISOString().slice(0, 10),
      payment,
      principal,
      interest,
      balance:   Math.round(balance * 100) / 100,
    })

    // Advance date by one period
    switch ((frequency ?? 'MONTHLY').toUpperCase()) {
      case 'WEEKLY':    date.setUTCDate(date.getUTCDate() + 7); break
      case 'QUARTERLY': addUTCMonths(date, 3); break
      case 'YEARLY':    date.setUTCFullYear(date.getUTCFullYear() + 1); break
      default:          addUTCMonths(date, 1); break
    }
  }

  return rows
}

// Net debt position: positive means more owed than receivable.
export function calcNetDebt(totalOwed: number, totalOwedToMe: number): number {
  return totalOwed - totalOwedToMe
}
