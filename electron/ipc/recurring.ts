import type { IpcMain } from 'electron'
import { db } from '../db'
import {
  advanceByFrequency, buildUpdate, hydrateBill, hydrateIncome, intFromBool, nowIso, requireIso,
  billSelectJoin, incomeSelectJoin,
} from './shared'
import type { Frequency } from '../domainTypes'

export function registerRecurringHandlers(ipcMain: IpcMain) {
  // Income
  const stmtIncomeListOrdered = db.prepare(`${incomeSelectJoin} ORDER BY ri.nextExpectedDate ASC`)
  const stmtIncomeInsert = db.prepare(`
    INSERT INTO "RecurringIncome" (name, amount, frequency, nextExpectedDate, categoryId, accountId, notes, isActive, createdAt, updatedAt)
    VALUES (@name, @amount, @frequency, @nextExpectedDate, @categoryId, @accountId, @notes, @isActive, @createdAt, @updatedAt)
  `)
  const stmtIncomeByIdJoined = db.prepare(`${incomeSelectJoin} WHERE ri.id = ?`)
  const stmtIncomeByIdRaw = db.prepare(`SELECT * FROM "RecurringIncome" WHERE id = ?`)
  const stmtIncomeDelete = db.prepare(`DELETE FROM "RecurringIncome" WHERE id = ?`)
  const stmtIncomeSetNext = db.prepare(
    `UPDATE "RecurringIncome" SET nextExpectedDate = ?, updatedAt = ? WHERE id = ?`,
  )

  // Bills
  const stmtBillsListOrdered = db.prepare(`${billSelectJoin} ORDER BY rb.nextDueDate ASC`)
  const stmtBillInsert = db.prepare(`
    INSERT INTO "RecurringBill" (name, amount, frequency, nextDueDate, categoryId, accountId, notes, isActive, createdAt, updatedAt)
    VALUES (@name, @amount, @frequency, @nextDueDate, @categoryId, @accountId, @notes, @isActive, @createdAt, @updatedAt)
  `)
  const stmtBillByIdJoined = db.prepare(`${billSelectJoin} WHERE rb.id = ?`)
  const stmtBillByIdRaw = db.prepare(`SELECT * FROM "RecurringBill" WHERE id = ?`)
  const stmtBillDelete = db.prepare(`DELETE FROM "RecurringBill" WHERE id = ?`)
  const stmtBillSetNext = db.prepare(
    `UPDATE "RecurringBill" SET nextDueDate = ?, updatedAt = ? WHERE id = ?`,
  )

  // Shared
  const stmtTxInsertIncome = db.prepare(`
    INSERT INTO "Transaction" (accountId, categoryId, date, description, amount, type)
    VALUES (?, ?, ?, ?, ?, 'CREDIT')
  `)
  const stmtTxInsertBill = db.prepare(`
    INSERT INTO "Transaction" (accountId, categoryId, recurringBillId, date, description, amount, type)
    VALUES (?, ?, ?, ?, ?, ?, 'DEBIT')
  `)
  const stmtAccBalanceAdd = db.prepare(`UPDATE "Account" SET balance = balance + ?, updatedAt = ? WHERE id = ?`)
  const stmtAccBalanceSub = db.prepare(`UPDATE "Account" SET balance = balance - ?, updatedAt = ? WHERE id = ?`)

  // ── Recurring income ───────────────────────────────────────────────────────
  ipcMain.handle('income:list', () => {
    const rows = stmtIncomeListOrdered.all() as any[]
    return rows.map(hydrateIncome)
  })

  ipcMain.handle('income:create', (_e, data: any) => {
    const now = nowIso()
    const info = stmtIncomeInsert.run({
      name: data.name,
      amount: data.amount,
      frequency: data.frequency,
      nextExpectedDate: requireIso(data.nextExpectedDate),
      categoryId: data.categoryId ?? null,
      accountId: data.accountId ?? null,
      notes: data.notes ?? null,
      isActive: intFromBool(data.isActive ?? true) ?? 1,
      createdAt: now,
      updatedAt: now,
    })
    return hydrateIncome(stmtIncomeByIdJoined.get(info.lastInsertRowid))
  })

  ipcMain.handle('income:update', (_e, id: number, data: any) => {
    const allowed = ['name','amount','frequency','nextExpectedDate','categoryId','accountId','notes','isActive']
    const fields: Record<string, unknown> = {}
    for (const k of allowed) {
      if (data[k] !== undefined) {
        if (k === 'nextExpectedDate') fields[k] = requireIso(data[k])
        else if (k === 'isActive') fields[k] = intFromBool(data[k])
        else fields[k] = data[k]
      }
    }
    const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
    db.prepare(`UPDATE "RecurringIncome" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return hydrateIncome(stmtIncomeByIdJoined.get(id))
  })

  ipcMain.handle('income:delete', (_e, id: number) => {
    const row = stmtIncomeByIdRaw.get(id)
    stmtIncomeDelete.run(id)
    return row
  })

  ipcMain.handle('income:markReceived', (_e, id: number, actualAmount?: number) => {
    const income = stmtIncomeByIdRaw.get(id) as any
    if (!income) throw new Error(`RecurringIncome ${id} not found`)
    const next = advanceByFrequency(new Date(income.nextExpectedDate), income.frequency as Frequency)
    const creditAmount = Math.abs(actualAmount ?? Number(income.amount))

    db.transaction(() => {
      if (income.accountId) {
        stmtTxInsertIncome.run(income.accountId, income.categoryId, nowIso(), income.name, creditAmount)
        stmtAccBalanceAdd.run(creditAmount, nowIso(), income.accountId)
      }
      stmtIncomeSetNext.run(next.toISOString(), nowIso(), id)
    })()

    return hydrateIncome(stmtIncomeByIdJoined.get(id))
  })

  // ── Recurring bills ────────────────────────────────────────────────────────
  ipcMain.handle('bills:list', () => {
    const rows = stmtBillsListOrdered.all() as any[]
    return rows.map(hydrateBill)
  })

  ipcMain.handle('bills:create', (_e, data: any) => {
    const now = nowIso()
    const info = stmtBillInsert.run({
      name: data.name,
      amount: data.amount,
      frequency: data.frequency,
      nextDueDate: requireIso(data.nextDueDate),
      categoryId: data.categoryId ?? null,
      accountId: data.accountId ?? null,
      notes: data.notes ?? null,
      isActive: intFromBool(data.isActive ?? true) ?? 1,
      createdAt: now,
      updatedAt: now,
    })
    return hydrateBill(stmtBillByIdJoined.get(info.lastInsertRowid))
  })

  ipcMain.handle('bills:update', (_e, id: number, data: any) => {
    const allowed = ['name','amount','frequency','nextDueDate','categoryId','accountId','notes','isActive']
    const fields: Record<string, unknown> = {}
    for (const k of allowed) {
      if (data[k] !== undefined) {
        if (k === 'nextDueDate') fields[k] = requireIso(data[k])
        else if (k === 'isActive') fields[k] = intFromBool(data[k])
        else fields[k] = data[k]
      }
    }
    const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
    db.prepare(`UPDATE "RecurringBill" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return hydrateBill(stmtBillByIdJoined.get(id))
  })

  ipcMain.handle('bills:delete', (_e, id: number) => {
    const row = stmtBillByIdRaw.get(id)
    stmtBillDelete.run(id)
    return row
  })

  ipcMain.handle('bills:markPaid', (_e, id: number) => {
    const bill = stmtBillByIdRaw.get(id) as any
    if (!bill) throw new Error(`RecurringBill ${id} not found`)
    const next = advance(bill.nextDueDate, bill.frequency as Frequency)
    const billAmount = Math.abs(Number(bill.amount))

    db.transaction(() => {
      if (bill.accountId) {
        stmtTxInsertBill.run(bill.accountId, bill.categoryId ?? null, bill.id, nowIso(), bill.name, -billAmount)
        stmtAccBalanceSub.run(billAmount, nowIso(), bill.accountId)
      }
      stmtBillSetNext.run(next.toISOString(), nowIso(), id)
    })()

    return hydrateBill(stmtBillByIdJoined.get(id))
  })
}
