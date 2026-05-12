// Derives actionable alerts from app data. Pure function — no side effects.

export type AlertSeverity = 'error' | 'warning' | 'success' | 'info'

export interface AppAlert {
  id: string
  severity: AlertSeverity
  title: string
  body: string
  route?: string  // optional nav target when clicking the alert
}

interface AlertsInput {
  bills: RecurringBill[]
  budgets: Budget[]
  transactions: Transaction[]
  savings: SavingsGoal[]
  month: number  // 0-indexed, for budget spend calculation
  year: number
}

export function calcAlerts({
  bills,
  budgets,
  transactions,
  savings,
  month,
  year,
}: AlertsInput): AppAlert[] {
  const alerts: AppAlert[] = []
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // ── Bills ────────────────────────────────────────────────────────────────────
  for (const bill of bills) {
    if (!bill.isActive) continue
    const due = new Date(bill.nextDueDate)
    due.setUTCHours(0, 0, 0, 0)
    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)

    if (days < 0) {
      alerts.push({
        id: `bill-overdue-${bill.id}`,
        severity: 'error',
        title: `${bill.name} is overdue`,
        body: `Was due ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago.`,
        route: '/bills',
      })
    } else if (days <= 3) {
      alerts.push({
        id: `bill-due-${bill.id}`,
        severity: 'warning',
        title: `${bill.name} due ${days === 0 ? 'today' : `in ${days} day${days !== 1 ? 's' : ''}`}`,
        body: `${Number(bill.amount).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} · ${bill.frequency.charAt(0) + bill.frequency.slice(1).toLowerCase()}`,
        route: '/bills',
      })
    }
  }

  // ── Budgets ──────────────────────────────────────────────────────────────────
  const monthTxns = transactions.filter(t => {
    const d = new Date(t.date)
    return d.getUTCMonth() === month && d.getUTCFullYear() === year && t.type === 'DEBIT'
  })

  for (const budget of budgets) {
    const limit = Number(budget.amount)
    if (!limit) continue
    const spent = monthTxns
      .filter(t => t.categoryId === budget.categoryId)
      .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    const pct = (spent / limit) * 100

    if (pct >= 100) {
      alerts.push({
        id: `budget-over-${budget.id}`,
        severity: 'error',
        title: `${budget.category.name} budget exceeded`,
        body: `Spent ${spent.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} of ${limit.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} limit (${Math.round(pct)}%).`,
        route: '/budgets',
      })
    } else if (pct >= 80) {
      alerts.push({
        id: `budget-warn-${budget.id}`,
        severity: 'warning',
        title: `${budget.category.name} budget at ${Math.round(pct)}%`,
        body: `${spent.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} spent of ${limit.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} limit.`,
        route: '/budgets',
      })
    }
  }

  // ── Savings goals ─────────────────────────────────────────────────────────────
  for (const goal of savings) {
    const current = Number(goal.currentAmount)
    const target = Number(goal.targetAmount)
    if (!target) continue
    const pct = (current / target) * 100

    if (pct >= 100) {
      alerts.push({
        id: `savings-reached-${goal.id}`,
        severity: 'success',
        title: `${goal.name} goal reached!`,
        body: `Saved ${current.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} — target of ${target.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} achieved.`,
        route: '/savings',
      })
    } else if (pct >= 90) {
      alerts.push({
        id: `savings-close-${goal.id}`,
        severity: 'info',
        title: `${goal.name} is 90% complete`,
        body: `${(target - current).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} remaining to reach your goal.`,
        route: '/savings',
      })
    }
  }

  // Sort: errors first, then warnings, then success/info
  const order: Record<AlertSeverity, number> = { error: 0, warning: 1, success: 2, info: 3 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity])
}
