// Shared string-union domain types used throughout the main process.
// These replace Prisma enums, which SQLite does not support natively.
// Values are enforced at the application layer; the DB stores plain strings.

export type Frequency   = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
export type InterestType = 'PERCENTAGE' | 'FIXED'
export type DebtType    = 'LOAN' | 'RECEIVABLE'
export type DebtStatus  = 'ACTIVE' | 'PAID' | 'WRITTEN_OFF'
export type LotType     = 'BUY' | 'SELL'
export type TxType      = 'CREDIT' | 'DEBIT'
export type CategoryType = 'INCOME' | 'EXPENSE'
