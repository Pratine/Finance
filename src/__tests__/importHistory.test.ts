import { describe, it, expect } from 'vitest'
import { FORMAT_LABELS } from '../utils/importFormats'

describe('FORMAT_LABELS', () => {
  it('maps millennium to display name', () => {
    expect(FORMAT_LABELS['millennium']).toBe('Millennium BCP')
  })

  it('maps revolut to display name', () => {
    expect(FORMAT_LABELS['revolut']).toBe('Revolut')
  })

  it('returns undefined for unknown formats (caller falls back to raw value)', () => {
    expect(FORMAT_LABELS['unknown_bank']).toBeUndefined()
  })
})

// basename logic: filePath.split(/[/\\]/).pop() — used by ipc.ts logImport
// and displayed in ImportPage history. Tested here as a pure function.
function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

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
