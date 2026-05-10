import { useEffect, useState } from 'react'
import { useShortcutAction } from '../context/ShortcutContext'
import { Plus, PiggyBank, X, Pencil, Trash2, CalendarClock, Sparkles, TrendingUp, BarChart2 } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { projectGoalDate, formatProjectedDate } from '../utils/savingsProjection'
import { buildMonthlySavingsHistory } from '../utils/savingsHistory'

const FREQUENCY_OPTIONS = [
  { label: 'Daily',           days: 1   },
  { label: 'Weekly',          days: 7   },
  { label: 'Every 2 weeks',   days: 14  },
  { label: 'Monthly',         days: 30  },
  { label: 'Every 3 months',  days: 90  },
  { label: 'Every 6 months',  days: 180 },
  { label: 'Yearly',          days: 365 },
]

function FrequencySelect({ value, onChange, disabled }: {
  value: string
  onChange: (days: string) => void
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-400"
    >
      <option value="">Select periodâ€¦</option>
      {FREQUENCY_OPTIONS.map(o => (
        <option key={o.days} value={o.days}>{o.label}</option>
      ))}
    </select>
  )
}

type FormState = {
  name: string
  targetAmount: string
  accountId: number | ''
  deadline: string
  interestType: 'PERCENTAGE' | 'FIXED' | ''
  interestValue: string
  interestFrequencyDays: string
  contributionAmount: string
  contributionFrequencyDays: string
  notes: string
}

const EMPTY_FORM: FormState = {
  name: '',
  targetAmount: '',
  accountId: '',
  deadline: '',
  interestType: '',
  interestValue: '',
  interestFrequencyDays: '',
  contributionAmount: '',
  contributionFrequencyDays: '',
  notes: '',
}

function freqLabel(days: number | null): string {
  if (!days) return ''
  const match = FREQUENCY_OPTIONS.find(o => o.days === days)
  return match ? match.label.toLowerCase() : `every ${days}d`
}

function fmt(value: string | number) {
  return parseFloat(String(value)).toLocaleString('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  })
}

function progressPct(current: number, target: string) {
  const t = parseFloat(target)
  if (!t) return 0
  return Math.round((current / t) * 100)
}

function daysLeft(deadline: string | null) {
  if (!deadline) return null
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
}

function nextInterestDate(last: string | null, freqDays: number | null) {
  if (!freqDays) return null
  const base = last ? new Date(last) : new Date()
  const next = new Date(base.getTime() + freqDays * 86400000)
  return next
}

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / 86400000)
}

function daysSinceDate(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

// Always use goal.currentAmount as the source of truth.
// For linked accounts the IPC layer keeps account.balance in sync when interest is applied.
function effectiveAmount(goal: SavingsGoal): number {
  return parseFloat(goal.currentAmount)
}

// â”€â”€â”€ History chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function GoalHistoryChart({ goalId, targetAmount }: { goalId: number; targetAmount: number }) {
  const [data, setData] = useState<Array<{ label: string; amount: number }> | null>(null)

  useEffect(() => {
    window.api.getSavingsHistory(goalId).then(raw => {
      setData(buildMonthlySavingsHistory(raw, targetAmount))
    })
  }, [goalId, targetAmount])

  if (data === null) return <p className="text-xs text-slate-400 py-4 text-center">Loadingâ€¦</p>
  if (data.length < 2) return (
    <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center">
      Not enough history yet â€” chart will appear as balance snapshots accumulate.
    </p>
  )

  const max = Math.max(...data.map(d => d.amount), targetAmount)

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${goalId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={44}
            tickFormatter={v => `â‚¬${(v / 1000).toFixed(0)}k`}
            domain={[0, Math.ceil(max * 1.05)]}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f1f5f9' }}
            formatter={(v: number) => [v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }), 'Balance']}
          />
          {targetAmount > 0 && (
            <ReferenceLine
              y={targetAmount} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1}
              label={{ value: 'Target', position: 'insideTopRight', fontSize: 9, fill: '#10b981' }}
            />
          )}
          <Area type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} fill={`url(#grad-${goalId})`} dot={false} activeDot={{ r: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function SavingsPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [savingsAccounts, setSavingsAccounts] = useState<Account[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SavingsGoal | null>(null)
  const [saving, setSaving] = useState(false)
  const [applyingId, setApplyingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedChartId, setExpandedChartId] = useState<number | null>(null)

  async function load() {
    try {
      const [g, accounts] = await Promise.all([
        window.api.listSavings(),
        window.api.listAccounts(),
      ])
      setGoals(g)
      // Only savings-type accounts that don't already have a linked goal
      const linkedIds = new Set(g.map(goal => goal.accountId).filter(Boolean))
      setSavingsAccounts(
        accounts.filter(a =>
          a.type.name.toLowerCase() === 'savings' && !linkedIds.has(a.id)
        )
      )
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load savings data')
    }
  }

  useEffect(() => {
    // sync runs once on mount: auto-creates goals for savings accounts and
    // applies any elapsed interest. Kept separate from load() so that
    // subsequent refreshes (after create/update) don't re-trigger it.
    window.api.syncSavings().then(load).catch(() => load())
  }, [])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }
  useShortcutAction('createNew', openCreate)

  function openEdit(goal: SavingsGoal) {
    // Temporarily add the goal's own account back to the dropdown so it remains selectable
    if (goal.account && !savingsAccounts.find(a => a.id === goal.accountId)) {
      setSavingsAccounts(prev => [...prev, goal.account!])
    }
    setEditingId(goal.id)
    setForm({
      name: goal.name,
      targetAmount: goal.targetAmount,
      accountId: goal.accountId ?? '',
      deadline: goal.deadline ? goal.deadline.slice(0, 10) : '',
      interestType: goal.interestType ?? '',
      interestValue: goal.interestValue ?? '',
      interestFrequencyDays: goal.interestFrequencyDays ? String(goal.interestFrequencyDays) : '',
      contributionAmount: goal.contributionAmount ?? '',
      contributionFrequencyDays: goal.contributionFrequencyDays ? String(goal.contributionFrequencyDays) : '',
      notes: goal.notes ?? '',
    })
    setError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.targetAmount) return
    setSaving(true)
    setError(null)
    try {
      const hasInterest = form.interestType !== '' && form.interestValue !== ''
      const hasContribution = form.contributionAmount !== '' && form.contributionFrequencyDays !== ''
      const linkedAccount = form.accountId !== '' ? savingsAccounts.find(a => a.id === Number(form.accountId)) : null
      const payload = {
        name: form.name.trim(),
        targetAmount: parseFloat(form.targetAmount),
        currentAmount: linkedAccount ? parseFloat(linkedAccount.balance) : 0,
        accountId: form.accountId !== '' ? Number(form.accountId) : null,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
        interestType: hasInterest ? form.interestType : null,
        interestValue: hasInterest ? parseFloat(form.interestValue) : null,
        interestFrequencyDays: hasInterest && form.interestFrequencyDays ? parseInt(form.interestFrequencyDays) : null,
        contributionAmount: hasContribution ? parseFloat(form.contributionAmount) : null,
        contributionFrequencyDays: hasContribution ? parseInt(form.contributionFrequencyDays) : null,
        notes: form.notes.trim() || null,
      }
      if (editingId !== null) {
        await window.api.updateSavings(editingId, payload)
      } else {
        await window.api.createSavings(payload)
      }
      closeForm()
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleApplyInterest(goal: SavingsGoal) {
    setApplyingId(goal.id)
    try {
      await window.api.applyInterest(goal.id)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to apply interest')
    } finally {
      setApplyingId(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await window.api.deleteSavings(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch (e: any) {
      setDeleteTarget(null)
      setError(e?.message ?? 'Failed to delete savings goal')
    }
  }

  const totalSaved = goals.reduce((s, g) => s + effectiveAmount(g), 0)
  const totalTarget = goals.reduce((s, g) => s + parseFloat(g.targetAmount), 0)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Savings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {fmt(totalSaved)} saved of {fmt(totalTarget)} across {goals.length} goal{goals.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
        >
          <Plus size={15} /> Add goal
        </button>
      </div>

      {goals.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <PiggyBank size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No savings goals yet. Create one to get started.</p>
        </div>
      )}

      <div className="grid gap-4">
        {goals.map((goal) => {
          const current = effectiveAmount(goal)
          const pct = progressPct(current, goal.targetAmount)
          const reached = pct >= 100
          const over = pct > 100
          const days = daysLeft(goal.deadline)
          const nextInterest = nextInterestDate(goal.lastInterestApplied, goal.interestFrequencyDays)
          const daysToInterest = nextInterest ? daysUntil(nextInterest) : null
          const interestDue = daysToInterest !== null && daysToInterest <= 0

          const projection = !over ? projectGoalDate({
            currentAmount: current,
            targetAmount: parseFloat(goal.targetAmount),
            contributionAmount: goal.contributionAmount ? parseFloat(goal.contributionAmount) : null,
            contributionFrequencyDays: goal.contributionFrequencyDays,
            interestType: goal.interestType as 'PERCENTAGE' | 'FIXED' | null,
            interestValue: goal.interestValue ? parseFloat(goal.interestValue) : null,
            interestFrequencyDays: goal.interestFrequencyDays,
            daysSinceLastInterest: daysSinceDate(goal.lastInterestApplied),
          }) : null

          return (
            <div key={goal.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-5 py-4 group">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{goal.name}</p>
                    {over && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                        {pct}% â€” Over goal
                      </span>
                    )}
                    {reached && !over && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                        Reached âœ“
                      </span>
                    )}
                    {interestDue && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                        Interest due
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-400 dark:text-slate-500">
                    {goal.account && (
                      <span>{goal.account.bank.name} Â· {goal.account.name}</span>
                    )}
                    {days !== null && (
                      <span className={`flex items-center gap-1 ${days < 30 ? 'text-amber-500' : ''}`}>
                        <CalendarClock size={11} />
                        {days > 0 ? `${days}d left` : days === 0 ? 'Due today' : `${Math.abs(days)}d overdue`}
                      </span>
                    )}
                    {goal.contributionAmount && goal.contributionFrequencyDays && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <TrendingUp size={11} />
                        {fmt(goal.contributionAmount)} {freqLabel(goal.contributionFrequencyDays)}
                      </span>
                    )}
                    {goal.interestType && goal.interestValue && (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <Sparkles size={11} />
                        {goal.interestType === 'PERCENTAGE'
                          ? `${goal.interestValue}% ${freqLabel(goal.interestFrequencyDays)}`
                          : `${fmt(goal.interestValue)} ${freqLabel(goal.interestFrequencyDays)}`}
                        {daysToInterest !== null && daysToInterest > 0 && ` Â· next in ${daysToInterest}d`}
                      </span>
                    )}
                    {projection && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <CalendarClock size={11} />
                        Goal by {formatProjectedDate(projection)} Â· {projection.daysRemaining}d
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{fmt(current)}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">of {fmt(goal.targetAmount)}</p>
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {goal.interestType && !goal.account && (
                    <button
                      onClick={() => handleApplyInterest(goal)}
                      disabled={applyingId === goal.id}
                      className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                      title="Apply interest"
                    >
                      <Sparkles size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedChartId(expandedChartId === goal.id ? null : goal.id)}
                    className={`p-1.5 rounded-lg transition-colors ${expandedChartId === goal.id ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-400 dark:text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                    title="Show history"
                  >
                    <BarChart2 size={14} />
                  </button>
                  <button
                    onClick={() => openEdit(goal)}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(goal)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Interest earned */}
              {parseFloat(goal.totalInterestEarned) > 0 && (
                <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                  <Sparkles size={10} />
                  {fmt(parseFloat(goal.totalInterestEarned))} earned from interest
                </p>
              )}

              {(() => {
                const interestEarned = parseFloat(goal.totalInterestEarned ?? '0')
                const target = parseFloat(goal.targetAmount)
                const totalPct = Math.min(pct, 100)
                const interestPct = target > 0 ? Math.min((interestEarned / target) * 100, totalPct) : 0
                const basePct = totalPct - interestPct
                const barColor = over ? 'bg-amber-400' : reached ? 'bg-emerald-400' : 'bg-slate-300'
                return (
                  <>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                      {/* Contribution portion */}
                      <div className={`h-full transition-all ${barColor}`} style={{ width: `${basePct}%` }} />
                      {/* Interest portion */}
                      {interestPct > 0 && (
                        <div className="h-full bg-emerald-700 transition-all" style={{ width: `${interestPct}%` }} />
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      {interestPct > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-700">
                          <span className="w-2 h-2 rounded-sm bg-emerald-700 inline-block shrink-0" />
                          {fmt(interestEarned)} interest
                        </span>
                      ) : <span />}
                      <p className="text-xs text-slate-400 dark:text-slate-500">{pct}%</p>
                    </div>
                  </>
                )
              })()}
              {expandedChartId === goal.id && (
                <GoalHistoryChart goalId={goal.id} targetAmount={parseFloat(goal.targetAmount)} />
              )}
            </div>
          )
        })}
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId !== null ? 'Edit goal' : 'New savings goal'}
              </h2>
              <button onClick={closeForm} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Emergency fund"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  readOnly={form.accountId !== ''}
                  className={`w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100 ${form.accountId !== '' ? 'bg-slate-50 dark:bg-slate-900 text-slate-500 cursor-not-allowed' : ''}`}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target (â‚¬) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="5000"
                  value={form.targetAmount}
                  onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Linked savings account
                </label>
                <select
                  value={form.accountId}
                  onChange={(e) => {
                    const id = e.target.value === '' ? '' : Number(e.target.value)
                    const acc = savingsAccounts.find(a => a.id === id)
                    setForm({ ...form, accountId: id, name: acc ? acc.name : form.name })
                  }}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 bg-white dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">None (track manually)</option>
                  {savingsAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} Â· {a.bank.name}</option>
                  ))}
                </select>
                {form.accountId !== '' && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Current amount will be taken from the account balance automatically.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Deadline</label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Contribution plan */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-blue-500" /> Contribution plan
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Amount (â‚¬)</label>
                    <input
                      type="number" min="0" step="0.01" placeholder="100"
                      value={form.contributionAmount}
                      onChange={e => setForm({ ...form, contributionAmount: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Frequency</label>
                    <FrequencySelect
                      value={form.contributionFrequencyDays}
                      onChange={v => setForm({ ...form, contributionFrequencyDays: v })}
                    />
                  </div>
                </div>
              </div>

              {/* Interest configuration */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-emerald-500" /> Interest
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Type</label>
                    <select
                      value={form.interestType}
                      onChange={(e) => setForm({ ...form, interestType: e.target.value as FormState['interestType'] })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 bg-white dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="">None</option>
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FIXED">Fixed amount (â‚¬)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      {form.interestType === 'PERCENTAGE' ? 'Rate (%)' : form.interestType === 'FIXED' ? 'Amount (â‚¬)' : 'Value'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={form.interestType === 'PERCENTAGE' ? '2.5' : '10.00'}
                      value={form.interestValue}
                      onChange={(e) => setForm({ ...form, interestValue: e.target.value })}
                      disabled={!form.interestType}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Paid every</label>
                  <FrequencySelect
                    value={form.interestFrequencyDays}
                    onChange={v => setForm({ ...form, interestFrequencyDays: v })}
                    disabled={!form.interestType}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional notesâ€¦"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100 resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-slate-900 text-white text-sm py-2 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Savingâ€¦' : editingId !== null ? 'Save changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Delete goal?</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              <span className="font-medium text-slate-700 dark:text-slate-300">{deleteTarget.name}</span> will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-slate-300 text-slate-700 text-sm py-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-600 text-white text-sm py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
