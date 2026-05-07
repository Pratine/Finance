import { describe, it, expect } from 'vitest'

// Pure logic tests for import history display helpers.

const FORMAT_LABELS: Record<string, string> = { millennium: 'Millennium BCP', revolut: 'Revolut' }

function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format
}

function summarise(h: { imported: number; skipped: number; errors: number }): string {
  const parts = [`${h.imported} imported`]
  if (h.skipped > 0) parts.push(`${h.skipped} skipped`)
  if (h.errors > 0) parts.push(`${h.errors} errors`)
  return parts.join(' · ')
}

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

describe('formatLabel', () => {
  it('maps millennium to display name', () => {
    expect(formatLabel('millennium')).toBe('Millennium BCP')
  })

  it('maps revolut to display name', () => {
    expect(formatLabel('revolut')).toBe('Revolut')
  })

  it('falls back to raw value for unknown formats', () => {
    expect(formatLabel('unknown_bank')).toBe('unknown_bank')
  })
})

describe('summarise', () => {
  it('shows only imported when no skipped/errors', () => {
    expect(summarise({ imported: 42, skipped: 0, errors: 0 })).toBe('42 imported')
  })

  it('includes skipped when > 0', () => {
    expect(summarise({ imported: 30, skipped: 5, errors: 0 })).toBe('30 imported · 5 skipped')
  })

  it('includes errors when > 0', () => {
    expect(summarise({ imported: 10, skipped: 0, errors: 2 })).toBe('10 imported · 2 errors')
  })

  it('includes all three parts', () => {
    expect(summarise({ imported: 20, skipped: 3, errors: 1 })).toBe('20 imported · 3 skipped · 1 errors')
  })

  it('handles zero imported', () => {
    expect(summarise({ imported: 0, skipped: 10, errors: 0 })).toBe('0 imported · 10 skipped')
  })
})

describe('basename', () => {
  it('extracts filename from Windows path', () => {
    expect(basename('C:\\Users\\user\\Downloads\\statement.csv')).toBe('statement.csv')
  })

  it('extracts filename from Unix path', () => {
    expect(basename('/home/user/downloads/revolut-2025.csv')).toBe('revolut-2025.csv')
  })

  it('returns the string as-is if no separator', () => {
    expect(basename('statement.csv')).toBe('statement.csv')
  })
})
