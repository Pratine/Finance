import { describe, it, expect } from 'vitest'

// Mirrors the resolveRange logic from ReportsPage for unit testing.

function resolveRange(
  mode: 'preset' | 'custom',
  preset: number,
  customFrom: string,
  customTo: string,
): { from: Date; to: Date; months: number } {
  if (mode === 'custom' && customFrom && customTo) {
    const from = new Date(customFrom)
    const to   = new Date(customTo)
    to.setHours(23, 59, 59, 999)
    const months = Math.max(1, Math.ceil(
      (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    ))
    return { from, to, months }
  }
  const to   = new Date()
  const from = new Date(to.getFullYear(), to.getMonth() - preset + 1, 1)
  return { from, to, months: preset }
}

describe('resolveRange — preset mode', () => {
  it('returns the preset as the month count', () => {
    const { months } = resolveRange('preset', 6, '', '')
    expect(months).toBe(6)
  })

  it('from is the start of (months) ago', () => {
    const { from, months } = resolveRange('preset', 3, '', '')
    const now = new Date()
    const expectedMonth = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
    expect(from.getFullYear()).toBe(expectedMonth.getFullYear())
    expect(from.getMonth()).toBe(expectedMonth.getMonth())
  })

  it('to is approximately now', () => {
    const { to } = resolveRange('preset', 6, '', '')
    const diff = Math.abs(Date.now() - to.getTime())
    expect(diff).toBeLessThan(5000) // within 5 seconds
  })

  it('falls back to preset when custom dates are missing', () => {
    const { months } = resolveRange('custom', 6, '', '')
    expect(months).toBe(6)
  })
})

describe('resolveRange — custom mode', () => {
  it('computes ~3 months for a 90-day range', () => {
    const from = '2026-01-01'
    const to   = '2026-03-31'
    const { months } = resolveRange('custom', 6, from, to)
    expect(months).toBeGreaterThanOrEqual(2)
    expect(months).toBeLessThanOrEqual(4)
  })

  it('computes ~12 months for a full year', () => {
    const { months } = resolveRange('custom', 6, '2025-01-01', '2025-12-31')
    expect(months).toBeGreaterThanOrEqual(11)
    expect(months).toBeLessThanOrEqual(13)
  })

  it('minimum is 1 month even for a single day', () => {
    const { months } = resolveRange('custom', 6, '2026-05-07', '2026-05-07')
    expect(months).toBe(1)
  })

  it('from date is preserved exactly', () => {
    const { from } = resolveRange('custom', 6, '2026-01-15', '2026-06-15')
    expect(from.toISOString().slice(0, 10)).toBe('2026-01-15')
  })

  it('to date is set to end of day', () => {
    const { to } = resolveRange('custom', 6, '2026-01-01', '2026-06-30')
    expect(to.getHours()).toBe(23)
    expect(to.getMinutes()).toBe(59)
  })
})
