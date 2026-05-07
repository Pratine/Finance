// Always formats dates as DD/MM/YYYY regardless of the system locale.
// Electron apps can run on machines with any locale, so we never rely on
// toLocaleDateString() defaults.

export function fmtDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

// Formatted with weekday for use in grouped lists: "Mon, 15/05/2026"
export function fmtDateLong(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const weekday = d.toLocaleDateString('pt-PT', { weekday: 'short', timeZone: 'UTC' })
  return `${weekday}, ${fmtDate(iso)}`
}
