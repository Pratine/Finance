// Groups a flat transaction list into virtual list items for date-grouped rendering.
// Extracted from TransactionsPage so it can be unit tested independently.

export type VItem =
  | { kind: 'header'; date: string; creditSum: number; debitSum: number }
  | { kind: 'row'; tx: Transaction; isFirst: boolean; isLast: boolean }

export function buildVItems(txns: Transaction[]): VItem[] {
  const items: VItem[] = []
  const map = new Map<string, Transaction[]>()
  for (const t of txns) {
    const key = t.date.slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  for (const [date, group] of map.entries()) {
    const creditSum = group.filter(t => t.type === 'CREDIT').reduce((s, t) => s + parseFloat(t.amount), 0)
    const debitSum  = group.filter(t => t.type === 'DEBIT').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0)
    items.push({ kind: 'header', date, creditSum, debitSum })
    group.forEach((tx, i) => items.push({ kind: 'row', tx, isFirst: i === 0, isLast: i === group.length - 1 }))
  }
  return items
}
