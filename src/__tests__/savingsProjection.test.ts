import { describe, it, expect } from 'vitest'
import { projectGoalDate } from '../utils/savingsProjection'

const BASE = {
  currentAmount: 0,
  targetAmount: 1000,
  contributionAmount: null,
  contributionFrequencyDays: null,
  interestType: null as null,
  interestValue: null,
  interestFrequencyDays: null,
}

describe('projectGoalDate', () => {
  it('returns null when goal already reached', () => {
    expect(projectGoalDate({ ...BASE, currentAmount: 1000 })).toBeNull()
  })

  it('returns null when there is no growth configured', () => {
    expect(projectGoalDate({ ...BASE, currentAmount: 500 })).toBeNull()
  })

  it('projects using fixed contributions only', () => {
    // €100 every 30 days from €0 to €1000 → 10 contributions → 300 days
    const result = projectGoalDate({
      ...BASE,
      contributionAmount: 100,
      contributionFrequencyDays: 30,
    })
    expect(result).not.toBeNull()
    expect(result!.periodsRemaining).toBe(10)
    expect(result!.daysRemaining).toBe(300)
  })

  it('projects with partial progress already made', () => {
    // €500 already, €100 every 30d → 5 more contributions → 150 days
    const result = projectGoalDate({
      ...BASE,
      currentAmount: 500,
      contributionAmount: 100,
      contributionFrequencyDays: 30,
    })
    expect(result).not.toBeNull()
    expect(result!.periodsRemaining).toBe(5)
    expect(result!.daysRemaining).toBe(150)
  })

  it('projects using fixed interest only', () => {
    // €10 every 30d from €900 → reaches €1000 after 3 payments → 90 days
    const result = projectGoalDate({
      ...BASE,
      currentAmount: 900,
      interestType: 'FIXED',
      interestValue: 10,
      interestFrequencyDays: 30,
    })
    expect(result).not.toBeNull()
    // 900 + 10 = 910, +10 = 920, ..., +10*10 = 1000 → 10 periods
    expect(result!.daysRemaining).toBe(300)
  })

  it('projects with percentage interest compounding', () => {
    // 10% every 30d from €826.45 → at least 2 periods to reach €1000
    // 826.45 * 1.1 = 909.09, * 1.1 = 1000 → 2 periods → 60 days
    const result = projectGoalDate({
      ...BASE,
      currentAmount: 826.45,
      interestType: 'PERCENTAGE',
      interestValue: 10,
      interestFrequencyDays: 30,
    })
    expect(result).not.toBeNull()
    expect(result!.daysRemaining).toBe(60)
  })

  it('combines contributions and interest — reaches goal faster', () => {
    // Use 5% per 30 days so interest meaningfully accelerates progress
    const withInterest = projectGoalDate({
      ...BASE,
      currentAmount: 0,
      contributionAmount: 100,
      contributionFrequencyDays: 30,
      interestType: 'PERCENTAGE',
      interestValue: 5,
      interestFrequencyDays: 30,
    })
    const withoutInterest = projectGoalDate({
      ...BASE,
      currentAmount: 0,
      contributionAmount: 100,
      contributionFrequencyDays: 30,
    })
    expect(withInterest).not.toBeNull()
    expect(withoutInterest).not.toBeNull()
    expect(withInterest!.daysRemaining).toBeLessThan(withoutInterest!.daysRemaining)
  })

  it('accounts for days already elapsed in interest cycle', () => {
    // If 20 days of a 30-day cycle have passed, interest fires after 10 more days
    const sooner = projectGoalDate({
      ...BASE,
      currentAmount: 900,
      interestType: 'FIXED',
      interestValue: 100,
      interestFrequencyDays: 30,
      daysSinceLastInterest: 20, // only 10 more days until next payment
    })
    const later = projectGoalDate({
      ...BASE,
      currentAmount: 900,
      interestType: 'FIXED',
      interestValue: 100,
      interestFrequencyDays: 30,
      daysSinceLastInterest: 0, // full 30 days to wait
    })
    expect(sooner!.daysRemaining).toBeLessThan(later!.daysRemaining)
  })
})
