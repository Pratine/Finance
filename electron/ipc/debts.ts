import type { IpcMain } from 'electron'
import { db } from '../db'
import {
  buildUpdate, hydrateDebt, nowIso, toIso, requireIso, advanceByFrequency,
} from './shared'
import type { Frequency, DebtType, DebtStatus } from '../domainTypes'

export function registerDebtsHandlers(ipcMain: IpcMain) {
  // Statements are prepared here (inside the register function) rather than at
  // module level because module imports execute before runMigrations() in
  // app.whenReady() — referencing migration-added columns at module scope crashes.
  const stmtDebtsList     = db.prepare(`SELECT * FROM "Debt" ORDER BY createdAt ASC`)
  const stmtDebtById      = db.prepare(`SELECT * FROM "Debt" WHERE id = ?`)
  const stmtDebtInsert    = db.prepare(`
    INSERT INTO "Debt" (name, type, counterparty, principal, outstanding, interestRate, frequency, nextPaymentDate, startDate, endDate, status, accountId, notes, createdAt, updatedAt)
    VALUES (@name, @type, @counterparty, @principal, @outstanding, @interestRate, @frequency, @nextPaymentDate, @startDate, @endDate, 'ACTIVE', @accountId, @notes, @createdAt, @updatedAt)
  `)
  const stmtDebtDelete    = db.prepare(`DELETE FROM "Debt" WHERE id = ?`)
  const stmtDebtUpdateAfterPayment = db.prepare(`
    UPDATE "Debt" SET outstanding = ?, status = ?, nextPaymentDate = ?, updatedAt = ? WHERE id = ?
  `)
  const stmtDebtUpdateAfterReverse = db.prepare(
    `UPDATE "Debt" SET outstanding = ?, status = ?, updatedAt = ? WHERE id = ?`,
  )
  const stmtPaymentInsert = db.prepare(`
    INSERT INTO "DebtPayment" (debtId, date, amount, principal, interest, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const stmtPaymentLinkTx = db.prepare(
    `UPDATE "DebtPayment" SET linkedTransactionId = ? WHERE id = ?`,
  )
  const stmtPaymentById   = db.prepare(`SELECT * FROM "DebtPayment" WHERE id = ?`)
  const stmtPaymentDelete = db.prepare(`DELETE FROM "DebtPayment" WHERE id = ?`)
  const stmtTxInsertForDebt = db.prepare(`
    INSERT INTO "Transaction" (accountId, date, description, amount, type)
    VALUES (?, ?, ?, ?, ?)
  `)
  const stmtTxById        = db.prepare(`SELECT * FROM "Transaction" WHERE id = ?`)
  const stmtTxDelete      = db.prepare(`DELETE FROM "Transaction" WHERE id = ?`)
  const stmtAccBalanceAdd = db.prepare(`UPDATE "Account" SET balance = balance + ?, updatedAt = ? WHERE id = ?`)
  const stmtAccBalanceSub = db.prepare(`UPDATE "Account" SET balance = balance - ?, updatedAt = ? WHERE id = ?`)
  // ── List ───────────────────────────────────────────────────────────────────
  // Batch-fetch payments for every debt in a single query, group by debtId,
  // then hand the pre-grouped lists to hydrateDebt (avoids N+1).
  ipcMain.handle('debts:list', () => {
    const rows = stmtDebtsList.all() as any[]
    if (rows.length === 0) return []
    const ids = rows.map(r => r.id)
    const placeholders = ids.map(() => '?').join(',')
    const payments = db.prepare(
      `SELECT * FROM "DebtPayment" WHERE debtId IN (${placeholders}) ORDER BY date DESC`,
    ).all(...ids) as any[]
    const paymentsByDebt = new Map<number, any[]>()
    for (const p of payments) {
      const arr = paymentsByDebt.get(p.debtId) ?? []
      arr.push(p)
      paymentsByDebt.set(p.debtId, arr)
    }
    return rows.map(r => hydrateDebt(r, paymentsByDebt.get(r.id) ?? []))
  })

  ipcMain.handle('debts:create', (_e, data: {
    name: string
    type: DebtType
    counterparty: string
    principal: number
    interestRate?: number | null
    frequency?: Frequency | null
    nextPaymentDate?: string | null
    startDate: string
    endDate?: string | null
    accountId?: number | null
    notes?: string | null
  }) => {
    const now = nowIso()
    const info = stmtDebtInsert.run({
      name: data.name,
      type: data.type,
      counterparty: data.counterparty,
      principal: data.principal,
      outstanding: data.principal,
      interestRate: data.interestRate ?? null,
      frequency: data.frequency ?? null,
      nextPaymentDate: toIso(data.nextPaymentDate),
      startDate: requireIso(data.startDate),
      endDate: toIso(data.endDate),
      accountId: data.accountId ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    return hydrateDebt(stmtDebtById.get(info.lastInsertRowid))
  })

  ipcMain.handle('debts:update', (_e, id: number, data: {
    name?: string
    counterparty?: string
    interestRate?: number | null
    frequency?: Frequency | null
    nextPaymentDate?: string | null
    endDate?: string | null
    status?: DebtStatus
    accountId?: number | null
    notes?: string | null
  }) => {
    const allowed: Array<keyof typeof data> = ['name','counterparty','interestRate','frequency','nextPaymentDate','endDate','status','accountId','notes']
    const fields: Record<string, unknown> = {}
    for (const k of allowed) {
      if (data[k] !== undefined) {
        if (k === 'nextPaymentDate' || k === 'endDate') fields[k] = toIso(data[k] as any)
        else fields[k] = data[k]
      }
    }
    const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
    db.prepare(`UPDATE "Debt" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return hydrateDebt(stmtDebtById.get(id))
  })

  ipcMain.handle('debts:delete', (_e, id: number) => {
    const row = stmtDebtById.get(id)
    stmtDebtDelete.run(id)
    return row
  })

  ipcMain.handle('debts:recordPayment', (_e, data: {
    debtId: number
    date: string
    amount: number
    principal: number
    interest: number
    notes?: string | null
  }) => {
    const debt = stmtDebtById.get(data.debtId) as any
    if (!debt) throw new Error(`Debt ${data.debtId} not found`)
    const newOutstanding = Math.max(0, Number(debt.outstanding) - data.principal)
    const newStatus: DebtStatus = newOutstanding <= 0 ? 'PAID' : 'ACTIVE'

    const nextDate: string | null = (newStatus === 'ACTIVE' && debt.frequency && debt.nextPaymentDate)
      ? advanceByFrequency(new Date(debt.nextPaymentDate), debt.frequency as Frequency).toISOString()
      : null

    db.transaction(() => {
      const payInfo = stmtPaymentInsert.run(
        data.debtId, requireIso(data.date), data.amount, data.principal, data.interest, data.notes ?? null,
      )
      stmtDebtUpdateAfterPayment.run(newOutstanding, newStatus, nextDate, nowIso(), data.debtId)
      // LOAN (I owe) → paying out is DEBIT; RECEIVABLE (owed to me) → receiving is CREDIT
      if (debt.accountId && data.amount > 0) {
        const txType = (debt.type as DebtType) === 'LOAN' ? 'DEBIT' : 'CREDIT'
        const txAmount = txType === 'DEBIT' ? -data.amount : data.amount
        const txInfo = stmtTxInsertForDebt.run(
          debt.accountId, requireIso(data.date), `Payment: ${debt.name}`, txAmount, txType,
        )
        stmtAccBalanceAdd.run(txAmount, nowIso(), debt.accountId)
        // Link the transaction to the payment so deletePayment can find it
        // reliably (renaming the debt no longer breaks the lookup).
        stmtPaymentLinkTx.run(Number(txInfo.lastInsertRowid), Number(payInfo.lastInsertRowid))
      }
    })()

    return hydrateDebt(stmtDebtById.get(data.debtId))
  })

  ipcMain.handle('debts:deletePayment', (_e, paymentId: number) => {
    const payment = stmtPaymentById.get(paymentId) as any
    if (!payment) throw new Error(`DebtPayment ${paymentId} not found`)
    const debt = stmtDebtById.get(payment.debtId) as any
    if (!debt) throw new Error(`Debt ${payment.debtId} not found`)
    const restored = Math.min(Number(debt.principal), Number(debt.outstanding) + Number(payment.principal))

    const linkedTx = payment.linkedTransactionId != null
      ? stmtTxById.get(payment.linkedTransactionId) as any
      : null

    db.transaction(() => {
      stmtPaymentDelete.run(paymentId)
      stmtDebtUpdateAfterReverse.run(restored, restored > 0 ? 'ACTIVE' : 'PAID', nowIso(), debt.id)
      if (linkedTx) {
        stmtTxDelete.run(linkedTx.id)
        stmtAccBalanceSub.run(Number(linkedTx.amount), nowIso(), debt.accountId)
      }
    })()

    return hydrateDebt(stmtDebtById.get(debt.id))
  })
}
