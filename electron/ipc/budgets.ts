import type { IpcMain } from 'electron'
import { db } from '../db'
import {
  categoryJoinSelect, buildUpdate, hydrateCategory, nowIso,
} from './shared'

// Budgets
const stmtBudgetsList = db.prepare(`
  SELECT b.*, ${categoryJoinSelect}
  FROM "Budget" b
  JOIN "Category" c ON c.id = b.categoryId
  ORDER BY c.name ASC
`)
const stmtBudgetUpsert = db.prepare(`
  INSERT INTO "Budget" (categoryId, amount, createdAt, updatedAt)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(categoryId) DO UPDATE SET amount = excluded.amount, updatedAt = excluded.updatedAt
`)
const stmtBudgetByCategory = db.prepare(`
  SELECT b.*, ${categoryJoinSelect}
  FROM "Budget" b
  JOIN "Category" c ON c.id = b.categoryId
  WHERE b.categoryId = ?
`)
const stmtBudgetById = db.prepare(`SELECT * FROM "Budget" WHERE id = ?`)
const stmtBudgetDelete = db.prepare(`DELETE FROM "Budget" WHERE id = ?`)

// Categories
const stmtCatList = db.prepare(`SELECT * FROM "Category" ORDER BY name ASC`)
const stmtCatInsert = db.prepare(`
  INSERT INTO "Category" (name, type, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)
`)
const stmtCatById = db.prepare(`SELECT * FROM "Category" WHERE id = ?`)
const stmtCatDelete = db.prepare(`DELETE FROM "Category" WHERE id = ?`)

// Rules
const stmtRulesList = db.prepare(`
  SELECT cr.*, ${categoryJoinSelect}
  FROM "CategoryRule" cr
  JOIN "Category" c ON c.id = cr.categoryId
  ORDER BY cr.createdAt ASC
`)
const stmtRuleInsert = db.prepare(
  `INSERT INTO "CategoryRule" (pattern, categoryId, createdAt) VALUES (?, ?, ?)`,
)
const stmtRuleByIdJoined = db.prepare(`
  SELECT cr.*, ${categoryJoinSelect}
  FROM "CategoryRule" cr
  JOIN "Category" c ON c.id = cr.categoryId
  WHERE cr.id = ?
`)
const stmtRuleByIdRaw = db.prepare(`SELECT * FROM "CategoryRule" WHERE id = ?`)
const stmtRuleDelete = db.prepare(`DELETE FROM "CategoryRule" WHERE id = ?`)
const stmtRulesAll = db.prepare(`SELECT id, pattern, categoryId FROM "CategoryRule"`)
const stmtUncategorisedTxs = db.prepare(
  `SELECT id, description FROM "Transaction" WHERE categoryId IS NULL`,
)

export function registerBudgetsHandlers(ipcMain: IpcMain) {
  // ── Budgets ────────────────────────────────────────────────────────────────
  ipcMain.handle('budgets:list', () => {
    const rows = stmtBudgetsList.all() as any[]
    return rows.map(r => ({
      id: r.id, categoryId: r.categoryId, amount: r.amount,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
      category: hydrateCategory('cat', r),
    }))
  })

  ipcMain.handle('budgets:upsert', (_e, categoryId: number, amount: number) => {
    const now = nowIso()
    stmtBudgetUpsert.run(categoryId, amount, now, now)
    const row = stmtBudgetByCategory.get(categoryId) as any
    return {
      id: row.id, categoryId: row.categoryId, amount: row.amount,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
      category: hydrateCategory('cat', row),
    }
  })

  ipcMain.handle('budgets:delete', (_e, id: number) => {
    const row = stmtBudgetById.get(id)
    stmtBudgetDelete.run(id)
    return row
  })

  // ── Categories ─────────────────────────────────────────────────────────────
  ipcMain.handle('categories:list', () => stmtCatList.all())

  ipcMain.handle('categories:create', (_e, data: { name: string; type: string; color?: string | null; icon?: string | null }) => {
    const info = stmtCatInsert.run(data.name, data.type, data.color ?? null, data.icon ?? null, nowIso())
    return stmtCatById.get(info.lastInsertRowid)
  })

  ipcMain.handle('categories:update', (_e, id: number, data: { name?: string; type?: string; color?: string | null; icon?: string | null }) => {
    const { sql, params } = buildUpdate(data)
    if (sql) db.prepare(`UPDATE "Category" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })
    return stmtCatById.get(id)
  })

  ipcMain.handle('categories:delete', (_e, id: number) => {
    const row = stmtCatById.get(id)
    stmtCatDelete.run(id)
    return row
  })

  // ── Category rules ─────────────────────────────────────────────────────────
  ipcMain.handle('rules:list', () => {
    const rows = stmtRulesList.all() as any[]
    return rows.map(r => ({
      id: r.id, pattern: r.pattern, categoryId: r.categoryId, createdAt: r.createdAt,
      category: hydrateCategory('cat', r),
    }))
  })

  ipcMain.handle('rules:create', (_e, pattern: string, categoryId: number) => {
    const info = stmtRuleInsert.run(pattern.trim(), categoryId, nowIso())
    const row = stmtRuleByIdJoined.get(info.lastInsertRowid) as any
    return {
      id: row.id, pattern: row.pattern, categoryId: row.categoryId, createdAt: row.createdAt,
      category: hydrateCategory('cat', row),
    }
  })

  ipcMain.handle('rules:delete', (_e, id: number) => {
    const row = stmtRuleByIdRaw.get(id)
    stmtRuleDelete.run(id)
    return row
  })

  ipcMain.handle('rules:applyToAll', () => {
    const rules = stmtRulesAll.all() as Array<{ id: number; pattern: string; categoryId: number }>
    if (rules.length === 0) return { updated: 0 }
    const uncategorised = stmtUncategorisedTxs.all() as Array<{ id: number; description: string }>
    const groups = new Map<number, number[]>()
    for (const tx of uncategorised) {
      const lower = tx.description.toLowerCase()
      const match = rules.find(r => lower.includes(r.pattern.toLowerCase()))
      if (match) {
        const ids = groups.get(match.categoryId) ?? []
        ids.push(tx.id)
        groups.set(match.categoryId, ids)
      }
    }
    if (groups.size === 0) return { updated: 0 }
    let total = 0
    db.transaction(() => {
      for (const [categoryId, ids] of groups) {
        const placeholders = ids.map(() => '?').join(',')
        const info = db.prepare(`UPDATE "Transaction" SET categoryId = ? WHERE id IN (${placeholders})`).run(categoryId, ...ids)
        total += info.changes
      }
    })()
    return { updated: total }
  })
}
