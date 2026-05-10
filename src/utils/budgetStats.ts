// Pure budget calculation utilities — extracted for testability.

export interface BudgetStatus {
  budgeted: number
  spent: number
  remaining: number    // negative = over budget
  pct: number          // spent / budgeted * 100, uncapped
  over: boolean
}

export function calcBudgetStatus(budgeted: string | number, spent: number): BudgetStatus {
  const b = parseFloat(String(budgeted))
  const remaining = b - spent
  const pct = b > 0 ? Math.round((spent / b) * 100) : spent > 0 ? Infinity : 0
  return { budgeted: b, spent, remaining, pct, over: spent > b }
}

// Returns a map of categoryId → total amount reserved by active recurring bills.
export function calcBillsReservedByCategory(bills: RecurringBill[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const bill of bills) {
    if (!bill.isActive || bill.categoryId === null) continue
    const prev = map.get(bill.categoryId) ?? 0
    map.set(bill.categoryId, prev + parseFloat(bill.amount))
  }
  return map
}

// Returns a map of categoryId → total amount spent (absolute) for a given month/year.
// month is 0-indexed UTC month; year is UTC year — use UTC consistently with how
// transaction dates are stored (ISO strings, always UTC).
export function calcSpendingByCategory(
  transactions: Transaction[],
  month: number,
  year: number,
): Map<number, number> {
  const map = new Map<number, number>()
  for (const t of transactions) {
    if (t.type !== 'DEBIT' || t.categoryId === null) continue
    const d = new Date(t.date)
    if (d.getUTCMonth() !== month || d.getUTCFullYear() !== year) continue
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + Math.abs(parseFloat(t.amount)))
  }
  return map
}
