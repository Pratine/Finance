import type { IpcMain } from 'electron'
import { db } from '../db'
import {
  accountSelect, accountJoins, buildUpdate, hydrateAccount, getAccountFull, nowIso,
} from './shared'

// ── Banks ────────────────────────────────────────────────────────────────────
const stmtBanksList   = db.prepare(`SELECT * FROM "Bank" ORDER BY name ASC`)
const stmtBankCreate  = db.prepare(`INSERT INTO "Bank" (name, color, icon) VALUES (?, ?, ?)`)
const stmtBankById    = db.prepare(`SELECT * FROM "Bank" WHERE id = ?`)
const stmtBankDelete  = db.prepare(`DELETE FROM "Bank" WHERE id = ?`)

// ── Account types ────────────────────────────────────────────────────────────
const stmtTypesList   = db.prepare(`SELECT * FROM "AccountType" ORDER BY name ASC`)
const stmtTypeCreate  = db.prepare(`INSERT INTO "AccountType" (name, color, icon) VALUES (?, ?, ?)`)
const stmtTypeById    = db.prepare(`SELECT * FROM "AccountType" WHERE id = ?`)
const stmtTypeDelete  = db.prepare(`DELETE FROM "AccountType" WHERE id = ?`)

// ── Accounts ─────────────────────────────────────────────────────────────────
const stmtAccountsList = db.prepare(`SELECT ${accountSelect} FROM "Account" a ${accountJoins} ORDER BY a.name ASC`)
const stmtAccountInsert = db.prepare(`
  INSERT INTO "Account" (name, bankId, accountNumber, typeId, balance, currency, createdAt, updatedAt)
  VALUES (@name, @bankId, @accountNumber, @typeId, @balance, @currency, @createdAt, @updatedAt)
`)
const stmtAccountBalanceRaw = db.prepare(`SELECT balance FROM "Account" WHERE id = ?`)
const stmtBalanceCorrection = db.prepare(`
  INSERT INTO "BalanceCorrection" (accountId, oldBalance, newBalance, note, createdAt)
  VALUES (?, ?, ?, ?, ?)
`)
const stmtSavingsRenameForAccount = db.prepare(
  `UPDATE "SavingsGoal" SET name = ?, updatedAt = ? WHERE accountId = ?`,
)
const stmtCorrectionsForAccount = db.prepare(`
  SELECT * FROM "BalanceCorrection"
  WHERE accountId = ?
  ORDER BY createdAt DESC
  LIMIT 20
`)
const stmtAccountRaw    = db.prepare(`SELECT * FROM "Account" WHERE id = ?`)
const stmtAccountDelete = db.prepare(`DELETE FROM "Account" WHERE id = ?`)

export function registerAccountsHandlers(ipcMain: IpcMain) {
  // Banks
  ipcMain.handle('banks:list', () => stmtBanksList.all())

  ipcMain.handle('banks:create', (_e, data: { name: string; color?: string | null; icon?: string | null }) => {
    const info = stmtBankCreate.run(data.name, data.color ?? null, data.icon ?? null)
    return stmtBankById.get(info.lastInsertRowid)
  })

  ipcMain.handle('banks:update', (_e, id: number, data: { name?: string; color?: string | null; icon?: string | null }) => {
    const { sql, params } = buildUpdate(data)
    if (sql) db.prepare(`UPDATE "Bank" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return stmtBankById.get(id)
  })

  ipcMain.handle('banks:delete', (_e, id: number) => {
    const row = stmtBankById.get(id)
    stmtBankDelete.run(id)
    return row
  })

  // Account types
  ipcMain.handle('accountTypes:list', () => stmtTypesList.all())

  ipcMain.handle('accountTypes:create', (_e, data: { name: string; color?: string | null; icon?: string | null }) => {
    const info = stmtTypeCreate.run(data.name, data.color ?? null, data.icon ?? null)
    return stmtTypeById.get(info.lastInsertRowid)
  })

  ipcMain.handle('accountTypes:update', (_e, id: number, data: { name?: string; color?: string | null; icon?: string | null }) => {
    const { sql, params } = buildUpdate(data)
    if (sql) db.prepare(`UPDATE "AccountType" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return stmtTypeById.get(id)
  })

  ipcMain.handle('accountTypes:delete', (_e, id: number) => {
    const row = stmtTypeById.get(id)
    stmtTypeDelete.run(id)
    return row
  })

  // Accounts
  ipcMain.handle('accounts:list', () => {
    const rows = stmtAccountsList.all() as any[]
    return rows.map(hydrateAccount)
  })

  ipcMain.handle('accounts:create', (_e, data: any) => {
    const now = nowIso()
    const info = stmtAccountInsert.run({
      name: data.name,
      bankId: data.bankId,
      accountNumber: data.accountNumber ?? null,
      typeId: data.typeId,
      balance: data.balance ?? 0,
      currency: data.currency ?? 'EUR',
      createdAt: now,
      updatedAt: now,
    })
    return getAccountFull(Number(info.lastInsertRowid))
  })

  ipcMain.handle('accounts:update', (_e, id: number, data: any) => {
    const { _note, ...rest } = data
    return db.transaction(() => {
      if (rest.balance !== undefined) {
        const current = stmtAccountBalanceRaw.get(id) as { balance: number } | undefined
        if (!current) throw new Error(`Account ${id} not found`)
        if (Number(current.balance) !== Number(rest.balance)) {
          stmtBalanceCorrection.run(id, Number(current.balance), Number(rest.balance), _note ?? null, nowIso())
        }
      }
      const allowed = ['name','bankId','accountNumber','typeId','balance','currency']
      const fields: Record<string, unknown> = {}
      for (const k of allowed) if (rest[k] !== undefined) fields[k] = rest[k]
      const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
      db.prepare(`UPDATE "Account" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })

      if (rest.name) {
        stmtSavingsRenameForAccount.run(rest.name, nowIso(), id)
      }
      return getAccountFull(id)
    })()
  })

  ipcMain.handle('accounts:corrections', (_e, accountId: number) =>
    stmtCorrectionsForAccount.all(accountId))

  ipcMain.handle('accounts:delete', (_e, id: number) => {
    const row = stmtAccountRaw.get(id)
    stmtAccountDelete.run(id)
    return row
  })
}
