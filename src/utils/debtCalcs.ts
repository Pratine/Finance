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

// Splits a payment into principal and interest components based on the debt's
// frequency and annual interest rate. Falls back to monthly (÷12) when no
// frequency is set.
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

// Net debt position: positive means more owed than receivable.
export function calcNetDebt(totalOwed: number, totalOwedToMe: number): number {
  return totalOwed - totalOwedToMe
}
