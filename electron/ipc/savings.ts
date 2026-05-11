import type { IpcMain } from 'electron'
import { db } from '../db'
import { buildUpdate, hydrateSavingsGoal, nowIso, toIso } from './shared'
import { elapsedPeriods, applyPeriods } from '../services/interest'
import type { InterestType } from '../domainTypes'

const stmtSavingsList = db.prepare(`SELECT * FROM "SavingsGoal" ORDER BY createdAt ASC`)
const stmtSavingsById = db.prepare(`SELECT * FROM "SavingsGoal" WHERE id = ?`)
const stmtSavingsDelete = db.prepare(`DELETE FROM "SavingsGoal" WHERE id = ?`)
const stmtAccountsSavings = db.prepare(`
  SELECT a.* FROM "Account" a
  JOIN "AccountType" t ON t.id = a.typeId
  WHERE t.name = 'Savings'
`)
const stmtGoalForAccount = db.prepare(`SELECT id FROM "SavingsGoal" WHERE accountId = ?`)
const stmtInterestGoals = db.prepare(`
  SELECT * FROM "SavingsGoal"
  WHERE interestType IS NOT NULL AND interestFrequencyDays IS NOT NULL
`)
const stmtSavingsInsertWithName = db.prepare(`
  INSERT INTO "SavingsGoal" (name, accountId, targetAmount, currentAmount, createdAt, updatedAt)
  VALUES (?, ?, 0, ?, ?, ?)
`)
const stmtSnapshotInsert = db.prepare(
  `INSERT INTO "SavingsSnapshot" (goalId, amount, note, date) VALUES (?, ?, ?, ?)`,
)
const stmtSavingsInsert = db.prepare(`
  INSERT INTO "SavingsGoal" (accountId, name, targetAmount, currentAmount, deadline, interestType, interestValue, interestFrequencyDays, lastInterestApplied, totalInterestEarned, contributionAmount, contributionFrequencyDays, notes, createdAt, updatedAt)
  VALUES (@accountId, @name, @targetAmount, @currentAmount, @deadline, @interestType, @interestValue, @interestFrequencyDays, @lastInterestApplied, @totalInterestEarned, @contributionAmount, @contributionFrequencyDays, @notes, @createdAt, @updatedAt)
`)
const stmtSavingsApplyInterest = db.prepare(`
  UPDATE "SavingsGoal"
  SET currentAmount = ?, lastInterestApplied = ?, totalInterestEarned = ?, updatedAt = ?
  WHERE id = ?
`)
const stmtAccountSetBalance = db.prepare(`UPDATE "Account" SET balance = ?, updatedAt = ? WHERE id = ?`)
const stmtSnapshotsByGoal = db.prepare(`SELECT * FROM "SavingsSnapshot" WHERE goalId = ? ORDER BY date ASC`)
const stmtTxBalanceByAccount = db.prepare(`
  SELECT date, runningBalance FROM "Transaction"
  WHERE accountId = ? AND runningBalance IS NOT NULL
  ORDER BY date ASC
`)

export function registerSavingsHandlers(ipcMain: IpcMain) {
  ipcMain.handle('savings:list', () => {
    const rows = stmtSavingsList.all() as any[]
    return rows.map(hydrateSavingsGoal)
  })

  ipcMain.handle('savings:sync', () => {
    const savingsAccounts = stmtAccountsSavings.all() as any[]

    for (const acc of savingsAccounts) {
      db.transaction(() => {
        const existing = stmtGoalForAccount.get(acc.id)
        if (existing) return
        const currentAmount = Number(acc.balance)
        const now = nowIso()
        const info = stmtSavingsInsertWithName.run(acc.name, acc.id, currentAmount, now, now)
        if (currentAmount > 0) {
          stmtSnapshotInsert.run(info.lastInsertRowid, currentAmount, 'initial', now)
        }
      })()
    }

    const interestGoals = stmtInterestGoals.all() as any[]

    for (const goal of interestGoals) {
      if (!goal.interestFrequencyDays || !goal.interestValue || !goal.interestType) continue
      const periods = elapsedPeriods({
        lastInterestApplied: goal.lastInterestApplied ? new Date(goal.lastInterestApplied) : null,
        interestFrequencyDays: goal.interestFrequencyDays,
        createdAt: new Date(goal.createdAt),
      })
      if (periods <= 0) continue
      const base = goal.lastInterestApplied ? new Date(goal.lastInterestApplied) : new Date(goal.createdAt)
      const newAmount = applyPeriods(
        Number(goal.currentAmount),
        goal.interestType as InterestType,
        Number(goal.interestValue),
        periods,
      )
      const newLastApplied = new Date(base.getTime() + periods * goal.interestFrequencyDays * 86_400_000)
      const earned = newAmount - Number(goal.currentAmount)
      db.transaction(() => {
        const now = nowIso()
        stmtSavingsApplyInterest.run(newAmount, newLastApplied.toISOString(), Number(goal.totalInterestEarned) + earned, now, goal.id)
        if (goal.accountId) {
          stmtAccountSetBalance.run(newAmount, now, goal.accountId)
        }
        stmtSnapshotInsert.run(goal.id, newAmount, 'interest', now)
      })()
    }
  })

  ipcMain.handle('savings:create', (_e, data: any) => {
    return db.transaction(() => {
      const now = nowIso()
      const info = stmtSavingsInsert.run({
        accountId: data.accountId ?? null,
        name: data.name,
        targetAmount: data.targetAmount ?? 0,
        currentAmount: data.currentAmount ?? 0,
        deadline: toIso(data.deadline),
        interestType: data.interestType ?? null,
        interestValue: data.interestValue ?? null,
        interestFrequencyDays: data.interestFrequencyDays ?? null,
        lastInterestApplied: toIso(data.lastInterestApplied),
        totalInterestEarned: data.totalInterestEarned ?? 0,
        contributionAmount: data.contributionAmount ?? null,
        contributionFrequencyDays: data.contributionFrequencyDays ?? null,
        notes: data.notes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      const id = Number(info.lastInsertRowid)
      if (Number(data.currentAmount ?? 0) > 0) {
        stmtSnapshotInsert.run(id, Number(data.currentAmount), 'initial', now)
      }
      return hydrateSavingsGoal(stmtSavingsById.get(id))
    })()
  })

  ipcMain.handle('savings:update', (_e, id: number, data: any) => {
    return db.transaction(() => {
      const current = stmtSavingsById.get(id) as any
      if (!current) throw new Error(`SavingsGoal ${id} not found`)
      const allowed = ['accountId','name','targetAmount','currentAmount','deadline','interestType','interestValue','interestFrequencyDays','lastInterestApplied','totalInterestEarned','contributionAmount','contributionFrequencyDays','notes']
      const fields: Record<string, unknown> = {}
      for (const k of allowed) {
        if (data[k] !== undefined) {
          fields[k] = (k === 'deadline' || k === 'lastInterestApplied') ? toIso(data[k]) : data[k]
        }
      }
      const { sql, params } = buildUpdate(fields, { updatedAt: nowIso() })
      db.prepare(`UPDATE "SavingsGoal" SET ${sql} WHERE id = @__id`).run({ ...params, __id: id })

      if (data.currentAmount !== undefined && Number(data.currentAmount) !== Number(current.currentAmount)) {
        stmtSnapshotInsert.run(id, Number(data.currentAmount), 'update', nowIso())
      }
      return hydrateSavingsGoal(stmtSavingsById.get(id))
    })()
  })

  ipcMain.handle('savings:delete', (_e, id: number) => {
    const row = stmtSavingsById.get(id)
    stmtSavingsDelete.run(id)
    return row
  })

  ipcMain.handle('savings:history', (_e, goalId: number) => {
    const goal = stmtSavingsById.get(goalId) as any
    if (!goal) throw new Error(`SavingsGoal ${goalId} not found`)
    const snapshots = stmtSnapshotsByGoal.all(goalId) as any[]

    const points = new Map<string, number>()
    for (const s of snapshots) {
      const date = new Date(s.date).toISOString().slice(0, 10)
      points.set(date, Number(s.amount))
    }

    if (goal.accountId) {
      const txns = stmtTxBalanceByAccount.all(goal.accountId) as Array<{ date: string; runningBalance: number }>
      for (const t of txns) {
        const date = new Date(t.date).toISOString().slice(0, 10)
        if (!points.has(date)) points.set(date, Number(t.runningBalance))
      }
    }

    return [...points.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount }))
  })

  ipcMain.handle('savings:applyInterest', (_e, id: number) => {
    const goal = stmtSavingsById.get(id) as any
    if (!goal) throw new Error(`SavingsGoal ${id} not found`)
    if (!goal.interestType || goal.interestValue === null || !goal.interestFrequencyDays) {
      throw new Error('No interest configuration set for this goal')
    }
    const periods = elapsedPeriods({
      lastInterestApplied: goal.lastInterestApplied ? new Date(goal.lastInterestApplied) : null,
      interestFrequencyDays: goal.interestFrequencyDays,
      createdAt: new Date(goal.createdAt),
    })
    const effectivePeriods = Math.max(1, periods)
    const newAmount = applyPeriods(
      Number(goal.currentAmount),
      goal.interestType as InterestType,
      Number(goal.interestValue),
      effectivePeriods,
    )
    const base = goal.lastInterestApplied ? new Date(goal.lastInterestApplied) : new Date(goal.createdAt)
    const newLastApplied = new Date(base.getTime() + effectivePeriods * goal.interestFrequencyDays * 86_400_000)
    const earned = newAmount - Number(goal.currentAmount)

    db.transaction(() => {
      const now = nowIso()
      stmtSavingsApplyInterest.run(newAmount, newLastApplied.toISOString(), Number(goal.totalInterestEarned) + earned, now, id)
      if (goal.accountId) {
        stmtAccountSetBalance.run(newAmount, now, goal.accountId)
      }
      stmtSnapshotInsert.run(id, newAmount, 'interest', now)
    })()

    return hydrateSavingsGoal(stmtSavingsById.get(id))
  })
}
