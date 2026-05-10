import { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Trash2, Plus, X, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts'
import AccountIcon from '../components/AccountIcon'
import { calcBudgetStatus, calcSpendingByCategory, calcBillsReservedByCategory } from '../utils/budgetStats'
import { calcBudgetHistory } from '../utils/budgetHistory'
import { useShortcutAction } from '../context/ShortcutContext'
import { FREQUENCY_LABELS } from '../utils/recurringBills'

const MONTHS = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December']

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

function isFutureOrCurrent(month: number, year: number) {
  const now = new Date()
  return year > now.getUTCFullYear() || (year === now.getUTCFullYear() && month >= now.getUTCMonth() + 1)
}

function isPast(month: number, year: number) {
  const now = new Date()
  return year < now.getUTCFullYear() || (year === now.getUTCFullYear() && month < now.getUTCMonth() + 1)
}

// â”€â”€â”€ Inline amount editor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AmountEditor({ budget, onSave, onClose }: {
  budget: Budget
  onSave: (amount: number) => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(budget.amount)
  const [saving, setSaving] = useState(false)

  async function save() {
    const n = parseFloat(value)
    if (!n || n <= 0) return
    setSaving(true)
    await onSave(n)
    setSaving(false)
    onClose()
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number" min="0" step="0.01" value={value}
        onChange={e => setValue(e.target.value)}
        className="w-24 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
        autoFocus onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose() }}
      />
      <button onClick={save} disabled={saving} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
        <Check size={14} />
      </button>
      <button onClick={onClose} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
        <X size={14} />
      </button>
    </div>
  )
}

// â”€â”€â”€ Add budget modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AddModal({ categories, budgets, onSave, onClose }: {
  categories: Category[]
  budgets: Budget[]
  onSave: (categoryId: number, amount: number) => Promise<void>
  onClose: () => void
}) {
  const budgetedIds = new Set(budgets.map(b => b.categoryId))
  const available = categories.filter(c => c.type === 'EXPENSE' && !budgetedIds.has(c.id))
  const [categoryId, setCategoryId] = useState<number | ''>(available[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!categoryId || !amount) return
    setSaving(true)
    await onSave(Number(categoryId), parseFloat(amount))
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">New budget</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"><X size={18} /></button>
        </div>
        {available.length === 0
          ? <p className="text-sm text-slate-500 dark:text-slate-400">All expense categories already have a budget.</p>
          : (
          <form onSubmit={save} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
              <select value={categoryId} onChange={e => setCategoryId(Number(e.target.value))}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500" required>
                {available.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Monthly limit (â‚¬) <span className="text-red-500">*</span>
              </label>
              <input type="number" min="0" step="0.01" placeholder="500" value={amount}
                onChange={e => setAmount(e.target.value)} autoFocus required
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 bg-slate-900 text-white text-sm py-2 rounded-lg hover:bg-slate-700 disabled:opacity-50">
                {saving ? 'Savingâ€¦' : 'Add'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// â”€â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function BudgetsPage() {
  // Month is 1-indexed, UTC-based so it matches how transaction dates are stored.
  const nowUTC = new Date()
  const [month, setMonth] = useState(nowUTC.getUTCMonth() + 1)
  const [year, setYear] = useState(nowUTC.getUTCFullYear())
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [loadError, setLoadError] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [historyMonths, setHistoryMonths] = useState(6)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null)

  // Load static data once — budgets, categories, bills, and all transactions.
  // Month navigation only changes client-side filtering, not the data set.
  useEffect(() => {
    Promise.all([
      window.api.listBudgets(),
      window.api.listCategories(),
      window.api.listTransactions(),
      window.api.listBills(),
    ]).then(([b, c, t, bl]) => {
      setBudgets(b)
      setCategories(c)
      setTransactions(t)
      setBills(bl)
    }).catch(() => setLoadError(true))
  }, [])

  useShortcutAction('prevMonth', prevMonth)
  useShortcutAction('nextMonth', nextMonth)
  useShortcutAction('createNew', () => setShowAdd(true))

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  async function handleSave(categoryId: number, amount: number) {
    try {
      await window.api.upsertBudget(categoryId, amount)
      setBudgets(await window.api.listBudgets())
    } catch (e: any) {
      alert(e?.message ?? 'Failed to save budget')
    }
  }

  async function handleDelete(id: number) {
    try {
      await window.api.deleteBudget(id)
      setDeleteId(null)
      setBudgets(await window.api.listBudgets())
    } catch (e: any) {
      alert(e?.message ?? 'Failed to delete budget')
    }
  }

  // month is 1-indexed; calcSpendingByCategory expects 0-indexed UTC month.
  const spending = useMemo(
    () => calcSpendingByCategory(transactions, month - 1, year),
    [transactions, month, year]
  )
  const billsReserved = useMemo(() => calcBillsReservedByCategory(bills), [bills])
  const billsByCategory = useMemo(() => {
    const map = new Map<number, RecurringBill[]>()
    bills.filter(b => b.isActive && b.categoryId).forEach(b => {
      map.set(b.categoryId!, [...(map.get(b.categoryId!) ?? []), b])
    })
    return map
  }, [bills])

  const canEdit = isFutureOrCurrent(month, year)
  const past = isPast(month, year)

  const budgetHistory = useMemo(
    () => calcBudgetHistory(transactions, budgets, historyMonths),
    [transactions, budgets, historyMonths]
  )

  const totalBudgeted = budgets.reduce((s, b) => s + parseFloat(b.amount), 0)
  const totalSpent = budgets.reduce((s, b) => {
    const tx = spending.get(b.categoryId) ?? 0
    const bl = billsReserved.get(b.categoryId) ?? 0
    return s + tx + bl
  }, 0)
  const totalSurplus = totalBudgeted - totalSpent

  if (loadError) {
    return <div className="text-sm text-red-500 pt-10 text-center">Failed to load budgets. Please restart the app.</div>
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Budgets</h1>
          {budgets.length > 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {fmt(totalSpent)} spent of {fmt(totalBudgeted)} budgeted this month
            </p>
          )}
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
          <Plus size={15} /> Add budget
        </button>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 mb-4">
        <button onClick={prevMonth} className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"><ChevronLeft size={18} /></button>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{MONTHS[month - 1]} {year}</p>
        <button onClick={nextMonth} className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"><ChevronRight size={18} /></button>
      </div>

      {/* Summary */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Budgeted</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{fmt(totalBudgeted)}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Spent</p>
            <p className="text-lg font-semibold text-red-500">{fmt(totalSpent)}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{past ? 'Surplus' : 'Remaining'}</p>
            <p className={`text-lg font-semibold ${totalSurplus >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {totalSurplus >= 0 ? '' : '−'}{fmt(Math.abs(totalSurplus))}
            </p>
          </div>
        </div>
      )}

      {/* Budget rows */}
      {budgets.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-sm">No budgets set yet.</p>
          <p className="text-xs mt-1">Add one â€” it applies to every month automatically.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {budgets.map(budget => {
            const txSpent = spending.get(budget.categoryId) ?? 0
            const billsAmount = billsReserved.get(budget.categoryId) ?? 0
            const spent = txSpent + billsAmount
            const status = calcBudgetStatus(budget.amount, spent)
            const barPct = Math.min(status.pct, 100)
            const barColor = status.over ? 'bg-red-500' : status.pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
            const surplus = status.budgeted - spent

            return (
              <div key={budget.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: budget.category.color ?? '#64748b' }}>
                    <AccountIcon icon={budget.category.icon} size={15} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{budget.category.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {fmt(spent)} spent
                      {billsAmount > 0 && txSpent > 0 && (
                        <span className="ml-1 text-slate-300 dark:text-slate-600">({fmt(txSpent)} + {fmt(billsAmount)} bills)</span>
                      )}
                      {billsAmount > 0 && txSpent === 0 && (
                        <span className="ml-1 text-slate-300 dark:text-slate-600">(bills)</span>
                      )}
                      {status.over
                        ? <span className="text-red-500 ml-1">Â· {fmt(Math.abs(status.remaining))} over</span>
                        : past && spent > 0
                          ? <span className="text-emerald-600 ml-1">Â· {fmt(surplus)} surplus</span>
                          : <span className="ml-1">Â· {fmt(status.remaining)} left</span>
                      }
                    </p>
                  </div>

                  {/* Limit display / inline editor */}
                  <div className="shrink-0 flex items-center gap-1">
                    {editingId === budget.id && canEdit ? (
                      <AmountEditor
                        budget={budget}
                        onSave={amount => handleSave(budget.categoryId, amount)}
                        onClose={() => setEditingId(null)}
                      />
                    ) : (
                      <>
                        <div className="text-right">
                          <p className="text-xs text-slate-400 dark:text-slate-500">limit</p>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{fmt(parseFloat(budget.amount))}</p>
                        </div>
                        {canEdit && (
                          <button onClick={() => setEditingId(budget.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all ml-1">
                            <Pencil size={13} />
                          </button>
                        )}
                        <button onClick={() => setDeleteId(budget.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barPct}%` }} />
                </div>

                {/* Recurring bills linked to this budget */}
                {(billsByCategory.get(budget.categoryId) ?? []).map(bill => (
                  <div key={bill.id} className="flex items-center justify-between mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <span>↻ {bill.name} ({FREQUENCY_LABELS[bill.frequency as keyof typeof FREQUENCY_LABELS]})</span>
                    <span>{fmt(parseFloat(bill.amount))}</span>
                  </div>
                ))}

                {/* Past month surplus badge */}
                {past && surplus > 0 && !status.over && (
                  <p className="text-xs text-emerald-600 mt-1.5">
                    âœ“ {fmt(surplus)} under budget this month
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Budget history */}
      {budgets.length > 0 && (
        <div className="mt-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Budget history</p>
            {historyOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
          </button>

          {historyOpen && (
            <div className="border-t border-slate-100 dark:border-slate-700 px-5 pb-5">
              {/* Range picker */}
              <div className="flex gap-1 mt-4 mb-5">
                {[3, 6, 12].map(n => (
                  <button key={n} onClick={() => setHistoryMonths(n)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${historyMonths === n ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    {n} months
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-4">
                {budgetHistory.map(({ budget, points, avgActual, timesOver }) => {
                  const limit = parseFloat(budget.amount)
                  const isExpanded = expandedCategoryId === budget.categoryId
                  const overColor = '#ef4444'
                  const okColor = budget.category.color ?? '#10b981'

                  return (
                    <div key={budget.id}>
                      {/* Category header */}
                      <button
                        onClick={() => setExpandedCategoryId(isExpanded ? null : budget.categoryId)}
                        className="w-full flex items-center gap-3 mb-2 group"
                      >
                        <div className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: budget.category.color ?? '#64748b' }}>
                          <AccountIcon icon={budget.category.icon} size={12} />
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1 text-left">
                          {budget.category.name}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          avg {fmt(avgActual)}
                          {timesOver > 0 && (
                            <span className="text-red-400 ml-2">{timesOver}× over</span>
                          )}
                        </span>
                        {isExpanded ? <ChevronUp size={13} className="text-slate-400 shrink-0" /> : <ChevronDown size={13} className="text-slate-400 shrink-0" />}
                      </button>

                      {/* Mini bar chart â€” always visible */}
                      <ResponsiveContainer width="100%" height={isExpanded ? 160 : 80}>
                        <BarChart data={points} barSize={isExpanded ? 24 : 14} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                            hide={!isExpanded} />
                          <YAxis
                            tickFormatter={v => `â‚¬${Math.round(v)}`}
                            tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={44}
                            hide={!isExpanded}
                          />
                          {isExpanded && (
                            <Tooltip
                              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f1f5f9' }}
                              formatter={(v: number, name: string) => [fmt(v), name === 'actual' ? 'Spent' : 'Budget']}
                            />
                          )}
                          <ReferenceLine y={limit} stroke={okColor} strokeDasharray="4 3" strokeWidth={1.5} />
                          <Bar dataKey="actual" radius={[3, 3, 0, 0]}>
                            {points.map((p, i) => (
                              <Cell key={i} fill={p.over ? overColor : okColor} fillOpacity={0.85} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>

                      {/* Expanded detail table */}
                      {isExpanded && (
                        <table className="w-full text-xs mt-2">
                          <thead>
                            <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
                              <th className="text-left pb-1.5">Month</th>
                              <th className="text-right pb-1.5">Spent</th>
                              <th className="text-right pb-1.5">Budget</th>
                              <th className="text-right pb-1.5">Variance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...points].reverse().map(p => {
                              const variance = p.budget - p.actual
                              return (
                                <tr key={`${p.year}-${p.month}`} className="border-b border-slate-50 dark:border-slate-800">
                                  <td className="py-1.5 text-slate-600 dark:text-slate-400">{p.label}</td>
                                  <td className={`py-1.5 text-right font-medium ${p.over ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                    {fmt(p.actual)}
                                  </td>
                                  <td className="py-1.5 text-right text-slate-400 dark:text-slate-500">{fmt(p.budget)}</td>
                                  <td className={`py-1.5 text-right font-medium ${variance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {variance >= 0 ? '+' : ''}{fmt(variance)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <AddModal categories={categories} budgets={budgets}
          onSave={handleSave} onClose={() => setShowAdd(false)} />
      )}

      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Remove budget?</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">This budget limit will be removed for all months.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 bg-red-600 text-white text-sm py-2 rounded-lg hover:bg-red-700">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
