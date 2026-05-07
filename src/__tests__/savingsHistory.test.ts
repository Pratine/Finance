import { describe, it, expect } from 'vitest'
import { buildMonthlySavingsHistory } from '../utils/savingsHistory'

function pt(date: string, amount: number) { return { date, amount } }

describe('buildMonthlySavingsHistory', () => {
  it('returns empty array for no data', () => {
    expect(buildMonthlySavingsHistory([], 1000)).toEqual([])
  })

  it('single point produces one month entry', () => {
    const result = buildMonthlySavingsHistory([pt('2025-01-15', 500)], 1000)
    expect(result[0].amount).toBe(500)
    expect(result[0].label).toMatch(/Jan/)
  })

  it('carries forward last known balance across months with no data', () => {
    const result = buildMonthlySavingsHistory([
      pt('2025-01-10', 500),
      pt('2025-04-05', 800),
    ], 1000)
    const jan = result.find(r => r.date.startsWith('2025-01'))!
    const feb = result.find(r => r.date.startsWith('2025-02'))!
    const mar = result.find(r => r.date.startsWith('2025-03'))!
    const apr = result.find(r => r.date.startsWith('2025-04'))!
    expect(jan.amount).toBe(500)
    expect(feb.amount).toBe(500) // carried forward
    expect(mar.amount).toBe(500) // carried forward
    expect(apr.amount).toBe(800)
  })

  it('uses the last data point in a month when there are multiple', () => {
    const result = buildMonthlySavingsHistory([
      pt('2025-03-01', 100),
      pt('2025-03-15', 200),
      pt('2025-03-31', 300),
    ], 1000)
    const mar = result.find(r => r.date.startsWith('2025-03'))!
    expect(mar.amount).toBe(300)
  })

  it('handles multiple points in same month with carry-forward', () => {
    const result = buildMonthlySavingsHistory([
      pt('2025-01-01', 0),
      pt('2025-02-01', 100),
    ], 500)
    expect(result.length).toBeGreaterThanOrEqual(2)
    const jan = result.find(r => r.date.startsWith('2025-01'))!
    const feb = result.find(r => r.date.startsWith('2025-02'))!
    expect(jan.amount).toBe(0)
    expect(feb.amount).toBe(100)
  })

  it('always ends with the current month', () => {
    const result = buildMonthlySavingsHistory([pt('2025-01-01', 1000)], 2000)
    const last = result[result.length - 1]
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    expect(last.date.startsWith(currentMonth)).toBe(true)
  })
})
