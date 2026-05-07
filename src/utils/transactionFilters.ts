// Pure filter logic extracted from TransactionsPage so it can be unit tested.

export interface TransactionFilter {
  search: string
  accountId: number | ''
  typeFilter: 'ALL' | 'CREDIT' | 'DEBIT'
  categoryFilter: number | '' | 'uncategorised'
  tagFilter: number | ''
  from: string
  to: string
  minAmount: string
  maxAmount: string
}

// Matches a single transaction against a free-text query.
// Checks description (substring) and amount (prefix match on formatted value).
export function matchesSearch(t: Transaction, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (t.description.toLowerCase().includes(q)) return true
  // Amount match: strip € / minus / spaces and compare
  const absAmt = Math.abs(parseFloat(t.amount))
  const amtStr = absAmt.toFixed(2)         // "49.99"
  const amtClean = q.replace(/[€\s,]/g, '').replace(',', '.')
  if (amtStr.startsWith(amtClean) && amtClean.length > 0) return true
  return false
}

export function applyFilters(transactions: Transaction[], f: TransactionFilter): Transaction[] {
  return transactions.filter((t) => {
    if (f.accountId !== '' && t.accountId !== Number(f.accountId)) return false
    if (f.typeFilter !== 'ALL' && t.type !== f.typeFilter) return false
    if (f.categoryFilter === 'uncategorised' && t.categoryId !== null) return false
    if (f.categoryFilter !== '' && f.categoryFilter !== 'uncategorised' && t.categoryId !== Number(f.categoryFilter)) return false
    if (f.from && t.date.slice(0, 10) < f.from) return false
    if (f.to && t.date.slice(0, 10) > f.to) return false
    const abs = Math.abs(parseFloat(t.amount))
    if (f.minAmount && abs < parseFloat(f.minAmount)) return false
    if (f.maxAmount && abs > parseFloat(f.maxAmount)) return false
    if (f.search && !matchesSearch(t, f.search)) return false
    if (f.tagFilter !== '' && !t.tags?.some(tt => tt.tag.id === Number(f.tagFilter))) return false
    return true
  })
}
