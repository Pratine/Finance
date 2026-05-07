// Pure utilities for recurring bill calculations — extracted for testability.

export type Frequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  WEEKLY:    'Weekly',
  MONTHLY:   'Monthly',
  QUARTERLY: 'Every 3 months',
  YEARLY:    'Yearly',
}

// How many times per year each frequency occurs.
const PERIODS_PER_YEAR: Record<Frequency, number> = {
  WEEKLY: 52, MONTHLY: 12, QUARTERLY: 4, YEARLY: 1,
}

// Converts a bill's amount to its monthly equivalent cost.
export function monthlyEquivalent(amount: number, frequency: Frequency): number {
  return (amount * PERIODS_PER_YEAR[frequency]) / 12
}

// Days until (positive) or since (negative) a due date.
export function daysUntilDue(nextDueDate: string): number {
  const due = new Date(nextDueDate)
  due.setUTCHours(0, 0, 0, 0)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

export type DueStatus = 'overdue' | 'due-soon' | 'upcoming'

export function dueStatus(days: number): DueStatus {
  if (days < 0) return 'overdue'
  if (days <= 7) return 'due-soon'
  return 'upcoming'
}
