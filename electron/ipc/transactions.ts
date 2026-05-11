import type { IpcMain } from 'electron'
import { db } from '../db'
import {
  categoryJoinSelect, buildUpdate, hydrateTransaction, hydrateCategory,
  getTransactionFull, nowIso, requireIso,
} from './shared'
import { computeBalanceDelta, toStoredAmount } from '../services/transactionCalcs'

// Prepared statements (dynamic-WHERE queries stay inline).
const stmtTxRaw         = db.prepare(`SELECT * FROM "Transaction" WHERE id = ?`)
const stmtTxDelete      = db.prepare(`DELETE FROM "Transaction" WHERE id = ?`)
const stmtAccBalanceAdd = db.prepare(`UPDATE "Account" SET balance = balance + ?, updatedAt = ? WHERE id = ?`)
const stmtAccBalanceSub = db.prepare(`UPDATE "Account" SET balance = balance - ?, updatedAt = ? WHERE id = ?`)
const stmtTxCategorise  = db.prepare(`UPDATE "Transaction" SET categoryId = ? WHERE id = ?`)
const stmtTxInsertBasic = db.prepare(`
  INSERT INTO "Transaction" (accountId, categoryId, date, description, amount, type, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)
const stmtTxInsertTransferDebit = db.prepare(`
  INSERT INTO "Transaction" (accountId, categoryId, date, description, amount, type)
  VALUES (?, ?, ?, ?, ?, 'DEBIT')
`)
const stmtTxInsertTransferCredit = db.prepare(`
  INSERT INTO "Transaction" (accountId, categoryId, date, description, amount, type)
  VALUES (?, ?, ?, ?, ?, 'CREDIT')
`)
const stmtSplitsDelete  = db.prepare(`DELETE FROM "TransactionSplit" WHERE transactionId = ?`)
const stmtSplitInsert   = db.prepare(`INSERT INTO "TransactionSplit" (transactionId, categoryId, amount, notes) VALUES (?, ?, ?, ?)`)
const stmtSplitsList    = db.prepare(`
  SELECT s.*, ${categoryJoinSelect}
  FROM "TransactionSplit" s
  LEFT JOIN "Category" c ON c.id = s.categoryId
  WHERE s.transactionId = ?
  ORDER BY s.id ASC
`)

// Tags
const stmtTagsList   = db.prepare(`SELECT * FROM "Tag" ORDER BY name ASC`)
const stmtTagByName  = db.prepare(`SELECT * FROM "Tag" WHERE name = ?`)
const stmtTagInsert  = db.prepare(`INSERT INTO "Tag" (name, color) VALUES (?, ?)`)
const stmtTagById    = db.prepare(`SELECT * FROM "Tag" WHERE id = ?`)
const stmtTagDelete  = db.prepare(`DELETE FROM "Tag" WHERE id = ?`)
const stmtTxTagInsert = db.prepare(`INSERT OR IGNORE INTO "TransactionTag" (transactionId, tagId) VALUES (?, ?)`)
const stmtTxTagDelete = db.prepare(`DELETE FROM "TransactionTag" WHERE transactionId = ? AND tagId = ?`)

export function registerTransactionsHandlers(ipcMain: IpcMain) {
  ipcMain.handle('transactions:list', (_e, accountId?: number) => {
    const where = accountId != null ? `WHERE t.accountId = ?` : ''
    const params = accountId != null ? [accountId] : []
    const rows = db.prepare(`
      SELECT t.*, ${categoryJoinSelect}
      FROM "Transaction" t
      LEFT JOIN "Category" c ON c.id = t.categoryId
      ${where}
      ORDER BY t.date DESC
    `).all(...params) as any[]
    return rows.map(r => hydrateTransaction(r))
  })

  ipcMain.handle('transactions:listPaged', (_e, opts: {
    accountId?: number; take: number; skip: number
  }) => {
    const where = opts.accountId != null ? `WHERE t.accountId = ?` : ''
    const baseParams = opts.accountId != null ? [opts.accountId] : []
    const rows = db.prepare(`
      SELECT t.*, ${categoryJoinSelect}
      FROM "Transaction" t
      LEFT JOIN "Category" c ON c.id = t.categoryId
      ${where}
      ORDER BY t.date DESC
      LIMIT ? OFFSET ?
    `).all(...baseParams, opts.take, opts.skip) as any[]
    const total = (db.prepare(`
      SELECT COUNT(*) AS c FROM "Transaction" t ${where}
    `).get(...baseParams) as { c: number }).c
    const transactions = rows.map(r => hydrateTransaction(r, { includeTagsAndSplits: true }))
    return { transactions, total }
  })

  ipcMain.handle('transactions:bulkCategorise', (_e, ids: number[], categoryId: number | null) => {
    if (ids.length === 0) return { updated: 0 }
    const placeholders = ids.map(() => '?').join(',')
    const info = db.prepare(`UPDATE "Transaction" SET categoryId = ? WHERE id IN (${placeholders})`).run(categoryId, ...ids)
    return { updated: info.changes }
  })

  ipcMain.handle('transactions:getSplits', (_e, transactionId: number) => {
    const rows = stmtSplitsList.all(transactionId) as any[]
    return rows.map(s => ({
      id: s.id, transactionId: s.transactionId, categoryId: s.categoryId,
      amount: s.amount, notes: s.notes, category: hydrateCategory('cat', s),
    }))
  })

  ipcMain.handle('transactions:setSplits', (_e, transactionId: number, splits: Array<{ categoryId: number | null; amount: number; notes?: string | null }>) => {
    return db.transaction(() => {
      stmtSplitsDelete.run(transactionId)
      for (const s of splits) {
        stmtSplitInsert.run(transactionId, s.categoryId ?? null, s.amount, s.notes ?? null)
      }
      return getTransactionFull(transactionId)
    })()
  })

  ipcMain.handle('transactions:update', (_e, id: number, data: {
    date?: string
    description?: string
    amount?: number
    type?: 'CREDIT' | 'DEBIT'
    notes?: string
  }) => {
    const current = stmtTxRaw.get(id) as any
    if (!current) throw new Error(`Transaction ${id} not found`)
    const updateData: Record<string, unknown> = {}
    if (data.date !== undefined)        updateData.date        = requireIso(data.date)
    if (data.description !== undefined) updateData.description = data.description.trim()
    if (data.notes !== undefined)       updateData.notes       = data.notes || null

    if (data.amount !== undefined || data.type !== undefined) {
      const newType = (data.type ?? current.type) as 'CREDIT' | 'DEBIT'
      const newAbs  = Math.abs(data.amount ?? Math.abs(Number(current.amount)))
      const balanceDelta = computeBalanceDelta(Number(current.amount), newType, newAbs)
      updateData.amount = toStoredAmount(newAbs, newType)
      updateData.type   = newType
      db.transaction(() => {
        const { sql, params } = buildUpdate(updateData)
        if (sql) db.prepare(`UPDATE "Transaction" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
        stmtAccBalanceAdd.run(balanceDelta, nowIso(), current.accountId)
      })()
      return getTransactionFull(id)
    }

    const { sql, params } = buildUpdate(updateData)
    if (sql) db.prepare(`UPDATE "Transaction" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return getTransactionFull(id)
  })

  ipcMain.handle('transactions:categorise', (_e, id: number, categoryId: number | null) => {
    stmtTxCategorise.run(categoryId, id)
    return getTransactionFull(id)
  })

  // ── Tags ───────────────────────────────────────────────────────────────────
  ipcMain.handle('tags:list', () => stmtTagsList.all())

  ipcMain.handle('tags:create', (_e, data: { name: string; color?: string | null }) => {
    const name = data.name.trim().toLowerCase()
    const existing = stmtTagByName.get(name)
    if (existing) return existing
    const info = stmtTagInsert.run(name, data.color ?? null)
    return stmtTagById.get(info.lastInsertRowid)
  })

  ipcMain.handle('tags:delete', (_e, id: number) => {
    const row = stmtTagById.get(id)
    stmtTagDelete.run(id)
    return row
  })

  ipcMain.handle('tags:addToTransaction', (_e, transactionId: number, tagId: number) => {
    stmtTxTagInsert.run(transactionId, tagId)
    return getTransactionFull(transactionId)
  })

  ipcMain.handle('tags:removeFromTransaction', (_e, transactionId: number, tagId: number) => {
    stmtTxTagDelete.run(transactionId, tagId)
    return getTransactionFull(transactionId)
  })

  ipcMain.handle('transactions:create', (_e, data: {
    accountId: number
    date: string
    description: string
    amount: number
    type: 'CREDIT' | 'DEBIT'
    categoryId?: number | null
    notes?: string
  }) => {
    const absAmount = Math.abs(data.amount)
    const storedAmount = data.type === 'DEBIT' ? -absAmount : absAmount
    return db.transaction(() => {
      const info = stmtTxInsertBasic.run(
        data.accountId, data.categoryId ?? null, requireIso(data.date),
        data.description.trim(), storedAmount, data.type, data.notes ?? null,
      )
      stmtAccBalanceAdd.run(storedAmount, nowIso(), data.accountId)
      return getTransactionFull(Number(info.lastInsertRowid))
    })()
  })

  ipcMain.handle('transactions:delete', (_e, id: number) => {
    return db.transaction(() => {
      const tx = stmtTxRaw.get(id) as any
      if (!tx) throw new Error(`Transaction ${id} not found`)
      stmtTxDelete.run(id)
      stmtAccBalanceSub.run(Number(tx.amount), nowIso(), tx.accountId)
      return tx
    })()
  })

  ipcMain.handle('transactions:transfer', (_e, data: {
    fromAccountId: number
    toAccountId: number
    amount: number
    date: string
    description: string
    categoryId?: number | null
  }) => {
    const abs = Math.abs(data.amount)
    const desc = data.description.trim() || 'Transfer'
    return db.transaction(() => {
      const dateIso = requireIso(data.date)
      const debitInfo  = stmtTxInsertTransferDebit.run(data.fromAccountId, data.categoryId ?? null, dateIso, desc, -abs)
      const creditInfo = stmtTxInsertTransferCredit.run(data.toAccountId,   data.categoryId ?? null, dateIso, desc,  abs)
      stmtAccBalanceSub.run(abs, nowIso(), data.fromAccountId)
      stmtAccBalanceAdd.run(abs, nowIso(), data.toAccountId)
      return {
        debit:  getTransactionFull(Number(debitInfo.lastInsertRowid)),
        credit: getTransactionFull(Number(creditInfo.lastInsertRowid)),
      }
    })()
  })
}
