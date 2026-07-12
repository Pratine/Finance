// Pure interest calculation logic — extracted so it can be unit tested independently.
import type { InterestType } from '../domainTypes'

export interface InterestConfig {
  interestType: InterestType
  interestValue: number
  interestFrequencyDays: number | null
  lastInterestApplied: Date | null
  createdAt: Date
  currentAmount: number
}

// Returns how many full periods have elapsed since the last application (or creation).
export function elapsedPeriods(
  config: Pick<InterestConfig, 'lastInterestApplied' | 'interestFrequencyDays' | 'createdAt'>,
  now = Date.now(),
): number {
  const { lastInterestApplied, interestFrequencyDays, createdAt } = config
  if (!interestFrequencyDays) return 0
  const base = lastInterestApplied ?? createdAt
  return Math.floor((now - base.getTime()) / (interestFrequencyDays * 86_400_000))
}

// Applies interest for N periods and returns the new balance.
// TAN:        annual nominal rate divided by periods-per-year, then compounded.
// PERCENTAGE: rate applied directly per period (legacy — rate is per-period, not annual).
// FIXED:      flat amount added per period.
export function applyPeriods(
  currentAmount: number,
  interestType: InterestType,
  interestValue: number,
  periods: number,
  frequencyDays?: number | null,
): number {
  if (periods <= 0) return currentAmount
  if (interestType === 'FIXED') {
    return currentAmount + interestValue * periods
  }
  if (interestType === 'TAN') {
    // Convert annual nominal rate to per-period rate using frequency.
    // Default to monthly (30 days) if no frequency is set.
    const freqDays = frequencyDays ?? 30
    const periodsPerYear = 365 / freqDays
    const periodRate = interestValue / 100 / periodsPerYear
    return currentAmount * Math.pow(1 + periodRate, periods)
  }
  // PERCENTAGE: compound using rate as-is per period (legacy behaviour).
  return currentAmount * Math.pow(1 + interestValue / 100, periods)
}

// Single-period convenience used by the manual "Apply interest" button.
export function calculateInterest(config: InterestConfig): number {
  return applyPeriods(
    config.currentAmount,
    config.interestType,
    config.interestValue,
    1,
    config.interestFrequencyDays,
  ) - config.currentAmount
}

// Returns true if at least one period is due.
export function isInterestDue(config: Pick<InterestConfig, 'lastInterestApplied' | 'interestFrequencyDays' | 'createdAt'>): boolean {
  return elapsedPeriods(config) > 0
}
