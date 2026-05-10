// Resolves a report date range from either a preset (N months back) or custom
// from/to dates. All boundaries are UTC so they align with how transaction
// dates are stored (ISO UTC strings).

export function resolveRange(
  mode: 'preset' | 'custom',
  preset: number,
  customFrom: string,
  customTo: string,
): { from: Date; to: Date; months: number } {
  if (mode === 'custom' && customFrom && customTo) {
    const from = new Date(customFrom)
    const to   = new Date(customTo)
    to.setUTCHours(23, 59, 59, 999)
    const months = Math.max(1, Math.ceil(
      (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    ))
    return { from, to, months }
  }
  const to   = new Date()
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - preset + 1, 1))
  return { from, to, months: preset }
}
