import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, CheckCircle, PauseCircle, PlayCircle, TrendingUp } from 'lucide-react'
import AccountIcon from '../components/AccountIcon'
import { FREQUENCY_LABELS, monthlyEquivalent, daysUntilDue, dueStatus, type Frequency } from '../utils/recurringBills'
import { fmtDate } from '../utils/formatDate'

const FREQUENCIES: Frequency[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

type FormState = {
  name: string; amount: string; frequency: Frequency
  nextExpectedDate: string; categoryId: number | ''; accountId: number | ''
  notes: string; isActive: boolean
}

function emptyForm(): FormState {
  return {
    name: '', amount: '', frequency: 'MONTHLY',
    nextExpectedDate: new Date().toISOString().slice(0, 10),
    categoryId: '', accountId: '', notes: '', isActive: true,
  }
}

function DueBadge({ days }: { days: number }) {
  const status = dueStatus(days)
  if (status === 'overdue') return (
    <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
      {Math.abs(days)}d late
    </span>
  )
  if (status === 'due-soon') return (
    <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
      {days === 0 ? 'Expected today' : `In ${days}d`}
    </span>
  )
  return <span className="text-xs text-slate-400 dark:text-slate-500">in {days}d</span>
}

// â”€â”€â”€ Receive modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ReceiveModal({
  item,
  onClose,
  onConfirm,
}: {
  item: RecurringIncome
  onClose: () => void
  onConfirm: (amount: number) => Promise<void>
}) {
  const expected = parseFloat(item.amount)
  const [amount, setAmount] = useState(expected.toFixed(2))
  const [saving, setSaving] = useState(false)
  const actual = parseFloat(amount) || 0
  const diff = actual - expected

  async function submit() {
    if (!amount || actual <= 0) return
    setSaving(true)
    try { await onConfirm(actual) }
    finally { setSaving(false) }
  }

  const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Mark as received</h2>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          <span className="font-medium text-slate-900 dark:text-slate-100">{item.name}</span>
          <span className="text-slate-400 dark:text-slate-500"> Â· expected {fmt(expected)}</span>
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Actual amount received (â‚¬)
          </label>
          <input
            type="number" min="0" step="0.01" value={amount}
            onChange={e => setAmount(e.target.value)}
            onFocus={e => e.target.select()}
            autoFocus
            className={inputCls}
          />
          {Math.abs(diff) > 0.01 && (
            <p className={`text-xs mt-1.5 flex items-center gap-1 ${diff > 0 ? 'text-emerald-600' : 'text-amber-500'}`}>
              <TrendingUp size={11} />
              {diff > 0 ? '+' : ''}{fmt(diff)} vs expected
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || actual <= 0}
            className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {saving ? 'Savingâ€¦' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RecurringIncomePage() {
  const [items, setItems] = useState<RecurringIncome[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RecurringIncome | null>(null)
  const [receivingItem, setReceivingItem] = useState<RecurringIncome | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const [inc, cats, accs] = await Promise.all([
        window.api.listIncome(),
        window.api.listCategories(),
        window.api.listAccounts(),
      ])
      setItems(inc)
      setCategories(cats.filter(c => c.type === 'INCOME'))
      setAccounts(accs)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load data')
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() { setEditingId(null); setForm(emptyForm()); setError(null); setShowForm(true) }
  function openEdit(item: RecurringIncome) {
    setEditingId(item.id)
    setForm({
      name: item.name, amount: item.amount, frequency: item.frequency,
      nextExpectedDate: item.nextExpectedDate.slice(0, 10),
      categoryId: item.categoryId ?? '', accountId: item.accountId ?? '',
      notes: item.notes ?? '', isActive: item.isActive,
    })
    setError(null); setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditingId(null); setError(null) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.amount) return
    setSaving(true); setError(null)
    try {
      const payload = {
        name: form.name.trim(), amount: String(parseFloat(form.amount)), frequency: form.frequency,
        nextExpectedDate: new Date(form.nextExpectedDate).toISOString(),
        categoryId: form.categoryId !== '' ? Number(form.categoryId) : null,
        accountId: form.accountId !== '' ? Number(form.accountId) : null,
        notes: form.notes.trim() || null, isActive: form.isActive,
      }
      if (editingId !== null) await window.api.updateIncome(editingId, payload)
      else await window.api.createIncome(payload)
      closeForm(); await load()
    } catch (e: any) { setError(e?.message ?? 'Something went wrong') }
    finally { setSaving(false) }
  }

  async function handleMarkReceived(item: RecurringIncome, actualAmount: number) {
    try {
      await window.api.markIncomeReceived(item.id, actualAmount)
      setReceivingItem(null)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to mark as received')
    }
  }

  async function handleToggle(item: RecurringIncome) {
    try {
      const updated = await window.api.updateIncome(item.id, { isActive: !item.isActive })
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update income')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await window.api.deleteIncome(deleteTarget.id)
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e: any) {
      setDeleteTarget(null)
      setError(e?.message ?? 'Failed to delete income')
    }
  }

  const active   = items.filter(i => i.isActive)
  const inactive = items.filter(i => !i.isActive)
  const totalMonthly = active.reduce((s, i) => s + monthlyEquivalent(parseFloat(i.amount), i.frequency), 0)
  const lateCount = active.filter(i => daysUntilDue(i.nextExpectedDate) < 0).length

  const inputCls = 'w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 bg-white dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Recurring Income</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {fmt(totalMonthly)}/month Â· {active.length} active
            {lateCount > 0 && <span className="text-amber-500 ml-2">Â· {lateCount} late</span>}
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm px-4 py-2 rounded-lg hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors">
          <Plus size={15} /> Add income
        </button>
      </div>

      {items.length === 0 && (
        <div className="text-center py-20 text-slate-400 dark:text-slate-500">
          <p className="text-sm">No recurring income yet. Add your salary or regular income sources.</p>
        </div>
      )}

      {/* Active */}
      {active.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {active.map(item => {
            const days = daysUntilDue(item.nextExpectedDate)
            const borderColor = days < 0 ? 'border-amber-200 dark:border-amber-800' : days <= 7 ? 'border-emerald-200 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-700'
            return (
              <div key={item.id} className={`bg-white dark:bg-slate-800 border ${borderColor} rounded-xl px-4 py-3.5 group flex items-center gap-4`}>
                {item.category && (
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: item.category.color ?? '#22c55e' }}>
                    <AccountIcon icon={item.category.icon} size={16} />
                  </div>
                )}
                {!item.category && (
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                    <DueBadge days={days} />
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-2">
                    <span>{FREQUENCY_LABELS[item.frequency]} Â· next {fmtDate(item.nextExpectedDate)}</span>
                    {item.account && <span className="text-slate-300 dark:text-slate-600">â†’ {item.account.name}</span>}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fmt(parseFloat(item.amount))}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{fmt(monthlyEquivalent(parseFloat(item.amount), item.frequency))}/mo</p>
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => setReceivingItem(item)}
                    className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                    title="Mark as received">
                    <CheckCircle size={15} />
                  </button>
                  <button onClick={() => handleToggle(item)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" title="Pause">
                    <PauseCircle size={15} />
                  </button>
                  <button onClick={() => openEdit(item)}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(item)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paused */}
      {inactive.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Paused</p>
          <div className="flex flex-col gap-2">
            {inactive.map(item => (
              <div key={item.id} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 group flex items-center gap-4 opacity-60">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{item.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{FREQUENCY_LABELS[item.frequency]} Â· {fmt(parseFloat(item.amount))}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleToggle(item)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Resume">
                    <PlayCircle size={15} />
                  </button>
                  <button onClick={() => openEdit(item)}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(item)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mark as received modal */}
      {receivingItem && (
        <ReceiveModal
          item={receivingItem}
          onClose={() => setReceivingItem(null)}
          onConfirm={(amount) => handleMarkReceived(receivingItem, amount)}
        />
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId !== null ? 'Edit income' : 'New recurring income'}
              </h2>
              <button onClick={closeForm} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. Monthly salary" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} required className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amount (â‚¬) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="0.01" placeholder="2800" value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Frequency</label>
                  <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value as Frequency })} className={inputCls}>
                    {FREQUENCIES.map(f => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Next expected date <span className="text-red-500">*</span></label>
                <input type="date" value={form.nextExpectedDate}
                  onChange={e => setForm({ ...form, nextExpectedDate: e.target.value })} required className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value === '' ? '' : Number(e.target.value) })} className={inputCls}>
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Credit account <span className="text-slate-400 font-normal text-xs">(creates a transaction when received)</span>
                </label>
                <select value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value === '' ? '' : Number(e.target.value) })} className={inputCls}>
                  <option value="">None</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} Â· {a.bank.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                <textarea rows={2} placeholder="Optional notesâ€¦" value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls + ' resize-none'} />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 mt-1">
                <button type="button" onClick={closeForm} className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm py-2 rounded-lg hover:bg-slate-700 dark:hover:bg-slate-200 disabled:opacity-50">
                  {saving ? 'Savingâ€¦' : editingId !== null ? 'Save' : 'Create'}
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
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Delete income?</h2>
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
