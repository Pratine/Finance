import { describe, it, expect } from 'vitest'
import { resolveRange } from '../utils/reportRange'

describe('resolveRange — preset mode', () => {
  it('returns the preset as the month count', () => {
    const { months } = resolveRange('preset', 6, '', '')
    expect(months).toBe(6)
  })

  it('from is the UTC start of (months) ago', () => {
    const { from, months } = resolveRange('preset', 3, '', '')
    const now = new Date()
    const expectedMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1))
    expect(from.getUTCFullYear()).toBe(expectedMonth.getUTCFullYear())
    expect(from.getUTCMonth()).toBe(expectedMonth.getUTCMonth())
    expect(from.getUTCDate()).toBe(1)
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
    const { months } = resolveRange('custom', 6, '2026-01-01', '2026-03-31')
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

  it('to date is set to UTC end of day', () => {
    const { to } = resolveRange('custom', 6, '2026-01-01', '2026-06-30')
    expect(to.getUTCHours()).toBe(23)
    expect(to.getUTCMinutes()).toBe(59)
    expect(to.getUTCSeconds()).toBe(59)
  })
})
