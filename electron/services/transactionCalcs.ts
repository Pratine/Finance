// Pure transaction arithmetic — extracted from ipc.ts for testability.

// Computes the signed stored amount from an absolute amount and transaction type.
export function toStoredAmount(absAmount: number, type: 'CREDIT' | 'DEBIT'): number {
  return type === 'DEBIT' ? -Math.abs(absAmount) : Math.abs(absAmount)
}

// Computes the account balance delta when editing a transaction's amount or type.
// currentStoredAmount: the signed value already in the DB (negative = debit, positive = credit).
export function computeBalanceDelta(
  currentStoredAmount: number,
  newType: 'CREDIT' | 'DEBIT',
  newAbsAmount: number,
): number {
  return toStoredAmount(newAbsAmount, newType) - currentStoredAmount
}
