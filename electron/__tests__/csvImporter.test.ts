// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  normalise,
  parseDate,
  parseDecimal,
  rowHash,
  isDataRow,
  type RawRow,
} from '../services/csvImporter'

// ─── normalise ────────────────────────────────────────────────────────────────

describe('normalise', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalise('  hello  ')).toBe('hello')
  })

  it('strips null bytes (UTF-16 LE decoded as UTF-8)', () => {
    expect(normalise('D\x00a\x00t\x00a\x00')).toBe('Data')
  })

  it('strips space-per-character pattern', () => {
    expect(normalise('D a t a')).toBe('Data')
  })

  it('leaves normal strings untouched', () => {
    expect(normalise('Millennium BCP')).toBe('Millennium BCP')
  })

  it('returns empty string for all-spaces input after stripping', () => {
    expect(normalise('   ')).toBe('')
  })
})

// ─── parseDate ────────────────────────────────────────────────────────────────

describe('parseDate', () => {
  it('parses DD-MM-YYYY format correctly', () => {
    const d = parseDate('24-04-2026')
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(3) // April is month 3 (0-indexed)
    expect(d.getUTCDate()).toBe(24)
  })

  it('handles leading zeros in day and month', () => {
    const d = parseDate('01-01-2025')
    expect(d.getUTCFullYear()).toBe(2025)
    expect(d.getUTCMonth()).toBe(0)
    expect(d.getUTCDate()).toBe(1)
  })

  it('normalises input before parsing', () => {
    const d = parseDate('  24-04-2026  ')
    expect(d.getUTCFullYear()).toBe(2026)
  })
})

// ─── parseDecimal ─────────────────────────────────────────────────────────────

describe('parseDecimal', () => {
  it('parses a positive decimal', () => {
    expect(parseDecimal('255.45')).toBe(255.45)
  })

  it('parses a negative decimal', () => {
    expect(parseDecimal('-4.35')).toBe(-4.35)
  })

  it('handles comma as decimal separator', () => {
    // comma replaced with dot before parseFloat
    expect(parseDecimal('255,45')).toBe(255.45)
  })

  it('stops parsing at the comma when both dot and comma are present', () => {
    // '1.234,56' → replace comma → '1.234.56' is invalid, parseFloat reads up to second dot → 1.234
    expect(parseDecimal('1.234,56')).toBe(1.234)
  })

  it('trims whitespace before parsing', () => {
    expect(parseDecimal('  100.00  ')).toBe(100)
  })
})

// ─── rowHash ──────────────────────────────────────────────────────────────────

describe('rowHash', () => {
  const row: RawRow = {
    dataLancamento: '24-04-2026',
    dataValor: '24-04-2026',
    descricao: 'TRANSFERENCIA - VENCIMENTO',
    montante: '2949.85',
    tipo: 'Crédito',
    saldo: '2980.30',
  }

  it('produces a 64-character hex SHA-256 string', () => {
    const hash = rowHash(row)
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('is deterministic — same input always gives same hash', () => {
    expect(rowHash(row)).toBe(rowHash(row))
  })

  it('changes when any field changes', () => {
    const modified = { ...row, montante: '100.00' }
    expect(rowHash(row)).not.toBe(rowHash(modified))
  })

  it('does NOT change when saldo changes (saldo excluded from hash)', () => {
    const withDifferentSaldo = { ...row, saldo: '999.99' }
    expect(rowHash(row)).toBe(rowHash(withDifferentSaldo))
  })
})

// ─── isDataRow ────────────────────────────────────────────────────────────────

describe('isDataRow', () => {
  it('accepts a valid data row', () => {
    expect(isDataRow(['24-04-2026', '24-04-2026', 'SALARY', '2949.85', 'Crédito', '2980.30'])).toBe(true)
  })

  it('rejects a row with too few columns', () => {
    expect(isDataRow(['24-04-2026', '24-04-2026'])).toBe(false)
  })

  it('rejects the header row', () => {
    expect(isDataRow(['Data lançamento', 'Data valor', 'Descrição', 'Montante', 'Tipo', 'Saldo'])).toBe(false)
  })

  it('rejects footer/metadata rows', () => {
    expect(isDataRow(['O millenniumbcp.pt é um serviço', '', '', '', '', ''])).toBe(false)
  })

  it('rejects empty rows', () => {
    expect(isDataRow(['', '', '', '', '', ''])).toBe(false)
  })
})

// ─── Duplicate detection ───────────────────────────────────────────────────────

describe('duplicate detection via rowHash', () => {
  it('detects the MB WAY duplicates present in the sample CSV', () => {
    const mbWayDebit: RawRow = {
      dataLancamento: '27-04-2026',
      dataValor: '27-04-2026',
      descricao: 'TRF MB WAY P/ DAVID FREITAS RIBEIRO FURTADO DE',
      montante: '-5.40',
      tipo: 'Débito',
      saldo: '671.38',
    }
    const mbWayDebitDuplicate: RawRow = { ...mbWayDebit, saldo: '823.73' }

    // Both rows hash to the same value because saldo is not part of the hash
    expect(rowHash(mbWayDebit)).toBe(rowHash(mbWayDebitDuplicate))
  })

  it('does not mark different amounts as duplicates', () => {
    const r1: RawRow = { dataLancamento: '27-04-2026', dataValor: '27-04-2026', descricao: 'COMPRA', montante: '-5.40', tipo: 'Débito', saldo: '100.00' }
    const r2: RawRow = { ...r1, montante: '-10.00' }
    expect(rowHash(r1)).not.toBe(rowHash(r2))
  })
})
