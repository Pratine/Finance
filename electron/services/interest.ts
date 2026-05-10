// Pure interest calculation logic — extracted so it can be unit tested independently.
import type { InterestType } from '../domainTypes'
export type { InterestType }

export interface InterestConfig {
  interestType: InterestType
  interestValue: number
  interestFrequencyDays: number | null
  lastInterestApplied: Date | null
  createdAt: Date
  currentAmount: number
}

// Returns how many full periods have elapsed since the last application (or creation).
export function elapsedPeriods(config: Pick<InterestConfig, 'lastInterestApplied' | 'interestFrequencyDays' | 'createdAt'>): number {
  const { lastInterestApplied, interestFrequencyDays, createdAt } = config
  if (!interestFrequencyDays) return 0
  const base = lastInterestApplied ?? createdAt
  const elapsed = Date.now() - base.getTime()
  return Math.floor(elapsed / (interestFrequencyDays * 86_400_000))
}

// Applies interest for N periods and returns the new balance.
// PERCENTAGE compounds (each period earns on the updated balance).
// FIXED adds a flat amount per period.
export function applyPeriods(currentAmount: number, interestType: InterestType, interestValue: number, periods: number): number {
  if (periods <= 0) return currentAmount
  if (interestType === 'FIXED') {
    return currentAmount + interestValue * periods
  }
  // Compound: amount * (1 + rate/100)^periods
  return currentAmount * Math.pow(1 + interestValue / 100, periods)
}

// Single-period convenience used by the manual "Apply interest" button.
export function calculateInterest(config: InterestConfig): number {
  return applyPeriods(config.currentAmount, config.interestType, config.interestValue, 1) - config.currentAmount
}

// Returns true if at least one period is due.
export function isInterestDue(config: Pick<InterestConfig, 'lastInterestApplied' | 'interestFrequencyDays' | 'createdAt'>): boolean {
  return elapsedPeriods(config) > 0
}
