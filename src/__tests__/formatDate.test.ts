import { describe, it, expect } from 'vitest'
import { fmtDate, fmtDateLong } from '../utils/formatDate'

describe('fmtDate', () => {
  it('formats as DD/MM/YYYY', () => {
    expect(fmtDate('2026-05-01T00:00:00.000Z')).toBe('01/05/2026')
  })

  it('pads single-digit day and month', () => {
    expect(fmtDate('2026-01-09T00:00:00.000Z')).toBe('09/01/2026')
  })

  it('accepts a Date object', () => {
    expect(fmtDate(new Date('2026-12-31T00:00:00.000Z'))).toBe('31/12/2026')
  })

  it('is not affected by system locale', () => {
    // Would produce 05/01/2026 in MM/DD/YYYY locales — we always want DD/MM/YYYY
    expect(fmtDate('2026-05-01T00:00:00.000Z')).toBe('01/05/2026')
  })
})

describe('fmtDateLong', () => {
  it('includes a weekday prefix before the date', () => {
    const result = fmtDateLong('2026-05-01T00:00:00.000Z')
    expect(result).toMatch(/^.+, 01\/05\/2026$/)
  })
})
