import { useEffect, useState } from 'react'
import { Plus, Trash2, X, ChevronDown, ChevronUp, CreditCard, HandCoins } from 'lucide-react'
import { useShortcutAction } from '../context/ShortcutContext'
import { fmtDate } from '../utils/formatDate'
import { calcPctPaid, calcPaymentSplit, calcNetDebt } from '../utils/debtCalcs'

const FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const

function fmt(n: number | string) {
  return Number(n).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

// ─── Form state ────────────────────────────────────────────────────────────────

type DebtForm = {
  name: string
  type: 'LOAN' | 'RECEIVABLE'
  counterparty: string
  principal: string
  interestRate: string
  frequency: string
  nextPaymentDate: string
  startDate: string
  endDate: string
  accountId: number | ''
  notes: string
}

const EMPTY_FORM: DebtForm = {
  name: '', type: 'LOAN', counterparty: '', principal: '', interestRate: '',
  frequency: '', nextPaymentDate: '', startDate: new Date().toISOString().slice(0, 10),
  endDate: '', accountId: '', notes: '',
}

// ─── Add / Edit debt modal ────────────────────────────────────────────────────

function DebtModal({
  initial, accounts, onClose, onSave,
}: {
  initial?: Debt | null
  accounts: Account[]
  onClose: () => void
  onSave: (debt: Debt) => void
}) {
  const [form, setForm] = useState<DebtForm>(initial ? {
    name: initial.name,
    type: initial.type,
    counterparty: initial.counterparty,
    principal: initial.principal,
    interestRate: initial.interestRate ?? '',
    frequency: initial.frequency ?? '',
    nextPaymentDate: initial.nextPaymentDate?.slice(0, 10) ?? '',
    startDate: initial.startDate.slice(0, 10),
    endDate: initial.endDate?.slice(0, 10) ?? '',
    accountId: initial.accountId ?? '',
    notes: initial.notes ?? '',
  } : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const f = (k: keyof DebtForm, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400'

  async function submit() {
    if (!form.name.trim() || !form.counterparty.trim() || !form.principal || !form.startDate) {
      setError('Name, counterparty, principal and start date are required.'); return
    }
    setSaving(true)
    try {
      let result: Debt
      const payload = {
        name: form.name.trim(),
        type: form.type,
        counterparty: form.counterparty.trim(),
        principal: parseFloat(form.principal),
        interestRate: form.interestRate ? parseFloat(form.interestRate) : null,
        frequency: form.frequency || null,
        nextPaymentDate: form.nextPaymentDate || null,
        startDate: form.startDate,
        endDate: form.endDate || null,
        accountId: form.accountId !== '' ? Number(form.accountId) : null,
        notes: form.notes || null,
      }
      if (initial) {
        result = await window.api.updateDebt(initial.id, payload)
      } else {
        result = await window.api.createDebt(payload)
      }
      onSave(result)
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {initial ? 'Edit debt' : 'Add debt'}
          </h2>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Type toggle */}
          <div className="flex gap-2">
            {(['LOAN', 'RECEIVABLE'] as const).map(t => (
              <button key={t} onClick={() => f('type', t)}
                className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  form.type === t
                    ? t === 'LOAN'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}>
                {t === 'LOAN' ? <><CreditCard size={13} /> I owe</> : <><HandCoins size={13} /> Owed to me</>}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Name</label>
              <input type="text" placeholder="e.g. Car loan, Mortgage" value={form.name} onChange={e => f('name', e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
                {form.type === 'LOAN' ? 'Lender' : 'Borrower'}
              </label>
              <input type="text" placeholder="Name of person or institution" value={form.counterparty} onChange={e => f('counterparty', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Principal (€)</label>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.principal} onChange={e => f('principal', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Interest rate (% / year)</label>
              <input type="number" min="0" step="0.01" placeholder="e.g. 3.5" value={form.interestRate} onChange={e => f('interestRate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Payment frequency</label>
              <select value={form.frequency} onChange={e => f('frequency', e.target.value)} className={inputCls}>
                <option value="">None</option>
                {FREQUENCIES.map(fr => <option key={fr} value={fr}>{fr.charAt(0) + fr.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Next payment date</label>
              <input type="date" value={form.nextPaymentDate} onChange={e => f('nextPaymentDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Start date</label>
              <input type="date" value={form.startDate} onChange={e => f('startDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Expected end date</label>
              <input type="date" value={form.endDate} onChange={e => f('endDate', e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Linked account (for payments)</label>
              <select value={form.accountId} onChange={e => f('accountId', e.target.value === '' ? '' : Number(e.target.value))} className={inputCls}>
                <option value="">None</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Notes</label>
              <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2} className={inputCls + ' resize-none'} />
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Saving…' : initial ? 'Save' : 'Add debt'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Record payment modal ─────────────────────────────────────────────────────

function PaymentModal({
  debt, onClose, onSave,
}: {
  debt: Debt
  onClose: () => void
  onSave: (updated: Debt) => void
}) {
  const outstanding = Number(debt.outstanding)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [principal, setPrincipal] = useState('')
  const [interest, setInterest] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Auto-split: when amount changes and there's an interest rate, suggest split.
  function handleAmountChange(val: string) {
    setAmount(val)
    const amt = parseFloat(val)
    if (!isNaN(amt) && debt.interestRate) {
      const { principal, interest } = calcPaymentSplit(amt, outstanding, Number(debt.interestRate), debt.frequency)
      setInterest(interest.toFixed(2))
      setPrincipal(principal.toFixed(2))
    } else if (!isNaN(amt)) {
      setPrincipal(val)
      setInterest('0')
    }
  }

  async function submit() {
    const amt = parseFloat(amount)
    const pri = parseFloat(principal)
    const int = parseFloat(interest)
    if (isNaN(amt) || isNaN(pri) || isNaN(int)) { setError('Enter valid amounts.'); return }
    if (Math.abs(amt - (pri + int)) > 0.01) { setError('Principal + interest must equal total amount.'); return }
    setSaving(true)
    try {
      const updated = await window.api.recordDebtPayment({
        debtId: debt.id, date, amount: amt, principal: pri, interest: int, notes: notes || null,
      })
      onSave(updated)
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Record payment</h2>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          Outstanding: <span className="font-semibold text-slate-700 dark:text-slate-300">{fmt(debt.outstanding)}</span>
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Total amount (€)</label>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => handleAmountChange(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Principal (€)</label>
              <input type="number" min="0" step="0.01" value={principal} onChange={e => setPrincipal(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Interest (€)</label>
              <input type="number" min="0" step="0.01" value={interest} onChange={e => setInterest(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Record'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Debt card ────────────────────────────────────────────────────────────────

function DebtCard({
  debt, accounts, onUpdate, onDelete,
}: {
  debt: Debt
  accounts: Account[]
  onUpdate: (d: Debt) => void
  onDelete: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showPayment, setShowPayment] = useState(false)

  const paid = calcPctPaid(Number(debt.outstanding), Number(debt.principal))
  const isLoan = debt.type === 'LOAN'
  const statusColor = debt.status === 'PAID'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : debt.status === 'WRITTEN_OFF'
    ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
    : isLoan ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'

  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const nextDue = debt.nextPaymentDate ? new Date(debt.nextPaymentDate) : null
  if (nextDue) nextDue.setUTCHours(0, 0, 0, 0)
  const daysUntil = nextDue ? Math.round((nextDue.getTime() - today.getTime()) / 86_400_000) : null

  async function handleDeletePayment(paymentId: number) {
    try {
      const updated = await window.api.deleteDebtPayment(paymentId)
      onUpdate(updated)
    } catch (e: any) {
      alert(e?.message ?? 'Failed to delete payment')
    }
  }

  async function markWrittenOff() {
    try {
      const updated = await window.api.updateDebt(debt.id, { status: 'WRITTEN_OFF' })
      onUpdate(updated)
    } catch (e: any) {
      alert(e?.message ?? 'Failed to update debt')
    }
  }

  return (
    <>
      {showEdit && <DebtModal initial={debt} accounts={accounts} onClose={() => setShowEdit(false)} onSave={onUpdate} />}
      {showPayment && <PaymentModal debt={debt} onClose={() => setShowPayment(false)} onSave={onUpdate} />}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-4 px-5 py-4">
          <div className={`w-1 self-stretch rounded-full shrink-0 ${isLoan ? 'bg-red-400' : 'bg-blue-400'}`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{debt.name}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor}`}>
                {debt.status === 'PAID' ? 'Paid' : debt.status === 'WRITTEN_OFF' ? 'Written off' : isLoan ? 'I owe' : 'Owed to me'}
              </span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">{debt.counterparty}</p>
          </div>

          <div className="text-right shrink-0">
            <p className={`text-base font-bold ${isLoan ? 'text-red-500' : 'text-blue-500'}`}>{fmt(debt.outstanding)}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">of {fmt(debt.principal)}</p>
          </div>

          <button onClick={() => setExpanded(e => !e)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Progress bar */}
        <div className="mx-5 mb-3">
          <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mb-1">
            <span>{paid}% paid</span>
            {debt.interestRate && <span>{Number(debt.interestRate).toFixed(2)}% p.a.</span>}
            {daysUntil !== null && (
              <span className={daysUntil < 0 ? 'text-red-500' : daysUntil <= 7 ? 'text-amber-500' : ''}>
                {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? 'Due today' : `Due in ${daysUntil}d`}
              </span>
            )}
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isLoan ? 'bg-red-400' : 'bg-blue-400'}`}
              style={{ width: `${paid}%` }}
            />
          </div>
        </div>

        {/* Expanded: payment history + actions */}
        {expanded && (
          <div className="border-t border-slate-100 dark:border-slate-700 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Payment history</p>
              <div className="flex gap-2">
                {debt.status === 'ACTIVE' && (
                  <>
                    <button onClick={() => setShowPayment(true)}
                      className="text-xs px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium">
                      Record payment
                    </button>
                    <button onClick={markWrittenOff}
                      className="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                      Write off
                    </button>
                  </>
                )}
                <button onClick={() => setShowEdit(true)}
                  className="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                  Edit
                </button>
                <button onClick={() => onDelete(debt.id)}
                  className="text-xs px-2 py-1.5 rounded-lg text-slate-400 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {debt.payments.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">No payments recorded yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left pb-1.5">Date</th>
                    <th className="text-right pb-1.5">Total</th>
                    <th className="text-right pb-1.5">Principal</th>
                    <th className="text-right pb-1.5">Interest</th>
                    <th className="pb-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {debt.payments.map(p => (
                    <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800 group">
                      <td className="py-1.5 text-slate-600 dark:text-slate-400">{fmtDate(p.date)}</td>
                      <td className="py-1.5 text-right font-medium text-slate-800 dark:text-slate-200">{fmt(p.amount)}</td>
                      <td className="py-1.5 text-right text-slate-600 dark:text-slate-400">{fmt(p.principal)}</td>
                      <td className="py-1.5 text-right text-slate-400">{fmt(p.interest)}</td>
                      <td className="py-1.5 text-right">
                        <button onClick={() => handleDeletePayment(p.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {debt.notes && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 italic">{debt.notes}</p>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState<'ALL' | 'LOAN' | 'RECEIVABLE'>('ALL')
  useShortcutAction('createNew', () => setShowAdd(true))
  useShortcutAction('closeModal', () => setShowAdd(false))
  const [loadError, setLoadError] = useState(false)

  async function load() {
    try {
      const [d, a] = await Promise.all([window.api.listDebts(), window.api.listAccounts()])
      setDebts(d)
      setAccounts(a)
    } catch {
      setLoadError(true)
    }
  }

  useEffect(() => { load() }, [])

  function updateDebt(updated: Debt) {
    setDebts(prev => prev.map(d => d.id === updated.id ? updated : d))
  }

  async function deleteDebt(id: number) {
    try {
      await window.api.deleteDebt(id)
      setDebts(prev => prev.filter(d => d.id !== id))
    } catch (e: any) {
      alert(e?.message ?? 'Failed to delete debt')
    }
  }

  const active = debts.filter(d => d.status === 'ACTIVE')
  const totalOwed = active.filter(d => d.type === 'LOAN').reduce((s, d) => s + Number(d.outstanding), 0)
  const totalOwedToMe = active.filter(d => d.type === 'RECEIVABLE').reduce((s, d) => s + Number(d.outstanding), 0)
  const netDebt = calcNetDebt(totalOwed, totalOwedToMe)

  const filtered = debts.filter(d => filter === 'ALL' || d.type === filter)

  if (loadError) {
    return <div className="text-sm text-red-500 pt-10 text-center">Failed to load debts. Please restart the app.</div>
  }

  return (
    <div className="mx-auto max-w-4xl">
      {showAdd && <DebtModal accounts={accounts} onClose={() => setShowAdd(false)} onSave={d => setDebts(prev => [...prev, d])} />}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Debts</h1>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-medium hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors">
          <Plus size={14} /> Add debt
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">I owe</p>
          <p className="text-lg font-semibold text-red-500">{fmt(totalOwed)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Owed to me</p>
          <p className="text-lg font-semibold text-blue-500">{fmt(totalOwedToMe)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Net debt</p>
          <p className={`text-lg font-semibold ${netDebt > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(Math.abs(netDebt))}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{netDebt > 0 ? 'net liability' : netDebt < 0 ? 'net asset' : 'balanced'}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-4 w-fit">
        {(['ALL', 'LOAN', 'RECEIVABLE'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              filter === f ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>
            {f === 'ALL' ? 'All' : f === 'LOAN' ? 'I owe' : 'Owed to me'}
          </button>
        ))}
      </div>

      {/* Debt list */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-sm">No debts found. Add one to get started.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(debt => (
            <DebtCard key={debt.id} debt={debt} accounts={accounts} onUpdate={updateDebt} onDelete={deleteDebt} />
          ))}
        </div>
      )}
    </div>
  )
}
