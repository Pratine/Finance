// Pure debt calculation utilities — extracted for testability.

// Periods per year for each payment frequency.
export const PERIODS_PER_YEAR: Record<string, number> = {
  WEEKLY: 52, MONTHLY: 12, QUARTERLY: 4, YEARLY: 1,
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
  const interest = parseFloat(Math.min(outstanding * periodRate, amount).toFixed(2))
  const principal = parseFloat(Math.max(0, amount - interest).toFixed(2))
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
export function buildAmortisationSchedule(
  outstanding: number,
  tanPct: number,
  frequency: string | null,
  remainingPeriods: number,
  nextDate: Date,
): AmortisationRow[] {
  const n = frequency ? (PERIODS_PER_YEAR[frequency] ?? 12) : 12
  const r = tanPct / 100 / n
  const pmt = r === 0
    ? outstanding / remainingPeriods
    : (outstanding * r) / (1 - Math.pow(1 + r, -remainingPeriods))

  const rows: AmortisationRow[] = []
  let balance = outstanding
  const date = new Date(nextDate)

  for (let i = 1; i <= remainingPeriods && balance > 0.005; i++) {
    const interest = parseFloat((balance * r).toFixed(2))
    const paymentThisPeriod = Math.min(pmt, balance + interest)
    const principal = parseFloat(Math.max(0, paymentThisPeriod - interest).toFixed(2))
    balance = parseFloat(Math.max(0, balance - principal).toFixed(2))

    rows.push({
      period: i,
      date: date.toISOString().slice(0, 10),
      payment: parseFloat(paymentThisPeriod.toFixed(2)),
      principal,
      interest,
      balance,
    })

    // Advance date by one period
    const d = new Date(date)
    switch ((frequency ?? 'MONTHLY').toUpperCase()) {
      case 'WEEKLY':    d.setUTCDate(d.getUTCDate() + 7); break
      case 'QUARTERLY': d.setUTCMonth(d.getUTCMonth() + 3); break
      case 'YEARLY':    d.setUTCFullYear(d.getUTCFullYear() + 1); break
      default:          d.setUTCMonth(d.getUTCMonth() + 1); break
    }
    date.setTime(d.getTime())
  }

  return rows
}

// Net debt position: positive means more owed than receivable.
export function calcNetDebt(totalOwed: number, totalOwedToMe: number): number {
  return totalOwed - totalOwedToMe
}
