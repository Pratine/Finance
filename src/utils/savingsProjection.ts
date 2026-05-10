// Projects the date when a savings goal will be reached by simulating
// contributions and interest day-by-day. Both have independent frequencies.
// The simulation is capped at 50 years (~18 250 iterations) which runs in < 1ms.

export interface ProjectionParams {
  currentAmount: number
  targetAmount: number
  contributionAmount: number | null
  contributionFrequencyDays: number | null
  interestType: 'PERCENTAGE' | 'FIXED' | null
  interestValue: number | null
  interestFrequencyDays: number | null
  // Days already elapsed since last interest payment (so the first payment
  // in the projection fires at the right time, not always from day 0).
  daysSinceLastInterest?: number
}

export interface ProjectionResult {
  projectedDate: Date        // estimated date the goal will be reached
  daysRemaining: number      // calendar days from today
  periodsRemaining: number   // contribution periods remaining
}

const MAX_DAYS = 365 * 50

export function projectGoalDate(params: ProjectionParams, now = Date.now()): ProjectionResult | null {
  const {
    currentAmount,
    targetAmount,
    contributionAmount,
    contributionFrequencyDays,
    interestType,
    interestValue,
    interestFrequencyDays,
    daysSinceLastInterest = 0,
  } = params

  if (currentAmount >= targetAmount) return null
  const hasContribution = contributionAmount != null && contributionAmount > 0 && contributionFrequencyDays != null && contributionFrequencyDays > 0
  const hasInterest = interestType != null && interestValue != null && interestValue > 0 && interestFrequencyDays != null && interestFrequencyDays > 0
  if (!hasContribution && !hasInterest) return null

  let balance = currentAmount
  let daysSinceContrib = 0
  // Start interest counter from wherever it currently is in its cycle
  let daysSinceInterest = daysSinceLastInterest
  let contributionPeriods = 0

  for (let day = 1; day <= MAX_DAYS; day++) {
    if (hasContribution) {
      daysSinceContrib++
      if (daysSinceContrib >= contributionFrequencyDays!) {
        balance += contributionAmount!
        contributionPeriods++
        daysSinceContrib = 0
      }
    }

    if (hasInterest) {
      daysSinceInterest++
      if (daysSinceInterest >= interestFrequencyDays!) {
        // Interest timer resets from the moment it was paid
        balance = interestType === 'PERCENTAGE'
          ? balance * (1 + interestValue! / 100)
          : balance + interestValue!
        daysSinceInterest = 0
      }
    }

    if (balance >= targetAmount) {
      const projectedDate = new Date(now + day * 86_400_000)
      return { projectedDate, daysRemaining: day, periodsRemaining: contributionPeriods }
    }
  }

  return null // unreachable within 50 years
}

export function formatProjectedDate(result: ProjectionResult | null): string | null {
  if (!result) return null
  const d = result.projectedDate
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()}`
}
