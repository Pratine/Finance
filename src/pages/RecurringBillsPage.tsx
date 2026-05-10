import { useEffect, useState, useMemo } from 'react'
import { useShortcutAction } from '../context/ShortcutContext'
import { Plus, Pencil, Trash2, X, CheckCircle, PauseCircle, PlayCircle } from 'lucide-react'
import AccountIcon from '../components/AccountIcon'
import {
  FREQUENCY_LABELS, monthlyEquivalent, daysUntilDue, dueStatus,
  type Frequency,
} from '../utils/recurringBills'
import { fmtDate } from '../utils/formatDate'

const FREQUENCIES: Frequency[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

type FormState = {
  name: string
  amount: string
  frequency: Frequency
  nextDueDate: string
  categoryId: number | ''
  accountId: number | ''
  notes: string
  isActive: boolean
}

function emptyForm(): FormState {
  return {
    name: '', amount: '', frequency: 'MONTHLY',
    nextDueDate: new Date().toISOString().slice(0, 10),
    categoryId: '', accountId: '', notes: '', isActive: true,
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function DueBadge({ days }: { days: number }) {
  const status = dueStatus(days)
  if (status === 'overdue') return (
    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
      {Math.abs(days)}d overdue
    </span>
  )
  if (status === 'due-soon') return (
    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
      {days === 0 ? 'Due today' : `Due in ${days}d`}
    </span>
  )
  return <span className="text-xs text-slate-400">in {days}d</span>
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RecurringBillsPage() {
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RecurringBill | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markingPaidId, setMarkingPaidId] = useState<number | null>(null)

  async function load() {
    try {
      const [b, c, bdg, accs] = await Promise.all([
        window.api.listBills(),
        window.api.listCategories(),
        window.api.listBudgets(),
        window.api.listAccounts(),
      ])
      setBills(b)
      setCategories(c)
      setBudgets(bdg)
      setAccounts(accs)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load data')
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setError(null)
    setShowForm(true)
  }
  useShortcutAction('createNew', openCreate)

  function openEdit(bill: RecurringBill) {
    setEditingId(bill.id)
    setForm({
      name: bill.name,
      amount: bill.amount,
      frequency: bill.frequency,
      nextDueDate: bill.nextDueDate.slice(0, 10),
      categoryId: bill.categoryId ?? '',
      accountId: bill.accountId ?? '',
      notes: bill.notes ?? '',
      isActive: bill.isActive,
    })
    setError(null)
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditingId(null); setError(null) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.amount) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        amount: parseFloat(form.amount),
        frequency: form.frequency,
        nextDueDate: new Date(form.nextDueDate).toISOString(),
        categoryId: form.categoryId !== '' ? Number(form.categoryId) : null,
        accountId: form.accountId !== '' ? Number(form.accountId) : null,
        notes: form.notes.trim() || null,
        isActive: form.isActive,
      }
      if (editingId !== null) {
        await window.api.updateBill(editingId, payload)
      } else {
        await window.api.createBill(payload)
      }
      closeForm()
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkPaid(id: number) {
    setMarkingPaidId(id)
    setError(null)
    try {
      await window.api.markBillPaid(id)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to mark as paid')
    } finally {
      setMarkingPaidId(null)
    }
  }

  async function handleToggleActive(bill: RecurringBill) {
    try {
      const updated = await window.api.updateBill(bill.id, { isActive: !bill.isActive })
      setBills(prev => prev.map(b => b.id === updated.id ? updated : b))
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update bill')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await window.api.deleteBill(deleteTarget.id)
      setBills(prev => prev.filter(b => b.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e: any) {
      setDeleteTarget(null)
      setError(e?.message ?? 'Failed to delete bill')
    }
  }

  // Map categoryId → budget for quick lookup on each bill card
  const budgetByCategory = useMemo(
    () => new Map(budgets.map(b => [b.categoryId, b])),
    [budgets]
  )

  const active = bills.filter(b => b.isActive)
  const inactive = bills.filter(b => !b.isActive)
  const totalMonthly = active.reduce(
    (s, b) => s + monthlyEquivalent(parseFloat(b.amount), b.frequency), 0
  )
  const overdueCount = active.filter(b => daysUntilDue(b.nextDueDate) < 0).length

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Recurring Bills</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {fmt(totalMonthly)}/month · {active.length} active
            {overdueCount > 0 && <span className="text-red-500 ml-2">· {overdueCount} overdue</span>}
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
          <Plus size={15} /> Add bill
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 flex justify-between items-center">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {bills.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <p className="text-sm">No recurring bills yet.</p>
        </div>
      )}

      {/* Active bills */}
      {active.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {active.map(bill => {
            const days = daysUntilDue(bill.nextDueDate)
            const status = dueStatus(days)
            const borderColor = status === 'overdue' ? 'border-red-200' : status === 'due-soon' ? 'border-amber-200' : 'border-slate-200'

            return (
              <div key={bill.id} className={`bg-white dark:bg-slate-800 border ${borderColor} rounded-xl px-4 py-3.5 group flex items-center gap-4`}>
                {bill.category && (
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: bill.category.color ?? '#64748b' }}>
                    <AccountIcon icon={bill.category.icon} size={16} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{bill.name}</p>
                    <DueBadge days={days} />
                  </div>
                  {(() => {
                    const budget = bill.categoryId ? budgetByCategory.get(bill.categoryId) : null
                    return (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{FREQUENCY_LABELS[bill.frequency]} · next {fmtDate(bill.nextDueDate)}</span>
                        {budget && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: `${budget.category.color}22`, color: budget.category.color ?? '#64748b' }}>
                            {budget.category.name}
                          </span>
                        )}
                        {bill.account && (
                          <span className="text-slate-300 dark:text-slate-600">→ {bill.account.name}</span>
                        )}
                      </p>
                    )
                  })()}
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fmt(parseFloat(bill.amount))}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{fmt(monthlyEquivalent(parseFloat(bill.amount), bill.frequency))}/mo</p>
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => handleMarkPaid(bill.id)}
                    disabled={markingPaidId === bill.id}
                    className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-40" title="Mark as paid">
                    <CheckCircle size={15} className={markingPaidId === bill.id ? 'animate-pulse' : ''} />
                  </button>
                  <button onClick={() => handleToggleActive(bill)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Pause">
                    <PauseCircle size={15} />
                  </button>
                  <button onClick={() => openEdit(bill)}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(bill)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paused bills */}
      {inactive.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Paused</p>
          <div className="flex flex-col gap-2">
            {inactive.map(bill => (
              <div key={bill.id} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 group flex items-center gap-4 opacity-60">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{bill.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{FREQUENCY_LABELS[bill.frequency]} · {fmt(parseFloat(bill.amount))}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleToggleActive(bill)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Resume">
                    <PlayCircle size={15} />
                  </button>
                  <button onClick={() => openEdit(bill)}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(bill)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId !== null ? 'Edit bill' : 'New recurring bill'}
              </h2>
              <button onClick={closeForm} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. Netflix" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} required
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amount (€) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="0.01" placeholder="9.99" value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })} required
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Frequency</label>
                  <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value as Frequency })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500">
                    {FREQUENCIES.map(f => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Next due date <span className="text-red-500">*</span></label>
                <input type="date" value={form.nextDueDate}
                  onChange={e => setForm({ ...form, nextDueDate: e.target.value })} required
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Budget</label>
                <select
                  value={form.categoryId}
                  onChange={e => setForm({ ...form, categoryId: e.target.value === '' ? '' : Number(e.target.value) })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
                >
                  <option value="">No budget</option>
                  {budgets.map(b => (
                    <option key={b.id} value={b.categoryId}>
                      {b.category.name} — limit {fmt(parseFloat(b.amount))}
                    </option>
                  ))}
                </select>
                {budgets.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">No budgets set yet. Add one in the Budgets page first.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Debit account
                  <span className="text-slate-400 font-normal ml-1 text-xs">(creates a transaction when paid)</span>
                </label>
                <select value={form.accountId}
                  onChange={e => setForm({ ...form, accountId: e.target.value === '' ? '' : Number(e.target.value) })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500">
                  <option value="">None</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.bank.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                <textarea rows={2} placeholder="Optional notes…" value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100 resize-none" />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3 mt-1">
                <button type="button" onClick={closeForm} className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-slate-900 text-white text-sm py-2 rounded-lg hover:bg-slate-700 disabled:opacity-50">
                  {saving ? 'Saving…' : editingId !== null ? 'Save changes' : 'Create'}
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
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Delete bill?</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              <span className="font-medium text-slate-700 dark:text-slate-300">{deleteTarget.name}</span> will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 text-white text-sm py-2 rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
