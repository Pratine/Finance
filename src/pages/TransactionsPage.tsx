import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, ChevronDown, X, Tag, Plus, ArrowLeftRight, Trash2, Hash, Pencil, Scissors } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { fmtDate, fmtDateLong } from '../utils/formatDate'
import AccountIcon from '../components/AccountIcon'
import { applyFilters } from '../utils/transactionFilters'
import { buildVItems, type VItem } from '../utils/transactionGroups'

const PAGE_SIZE = 200

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmt(amount: string) {
  return parseFloat(amount).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

// Flat virtual list item types
type VItem =
  | { kind: 'header'; date: string; creditSum: number; debitSum: number }
  | { kind: 'row'; tx: Transaction; isFirst: boolean; isLast: boolean }

function buildVItems(txns: Transaction[]): VItem[] {
  const items: VItem[] = []
  const map = new Map<string, Transaction[]>()
  for (const t of txns) {
    const key = t.date.slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  for (const [date, group] of map.entries()) {
    const creditSum = group.filter(t => t.type === 'CREDIT').reduce((s, t) => s + parseFloat(t.amount), 0)
    const debitSum  = group.filter(t => t.type === 'DEBIT').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0)
    items.push({ kind: 'header', date, creditSum, debitSum })
    group.forEach((tx, i) => items.push({ kind: 'row', tx, isFirst: i === 0, isLast: i === group.length - 1 }))
  }
  return items
}

// Row heights used by the virtualizer
const HEADER_H = 32   // px
const ROW_H    = 56   // px

// â”€â”€â”€ Category pill with inline dropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CategoryPill({
  transaction,
  categories,
  onAssign,
}: {
  transaction: Transaction
  categories: Category[]
  onAssign: (txId: number, catId: number | null) => void
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const cat = transaction.category
  const open = pos !== null

  function toggle() {
    if (open) { setPos(null); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    // Flip upward if too close to the bottom of the viewport
    const menuH = 260
    const top = r.bottom + 4 + menuH > window.innerHeight
      ? r.top - menuH - 4
      : r.bottom + 4
    setPos({ top, left: r.right - 192 })
  }

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) setPos(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
          cat
            ? 'border-transparent text-white font-medium'
            : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-600 dark:hover:text-slate-400'
        }`}
        style={cat ? { backgroundColor: cat.color ?? '#64748b' } : undefined}
      >
        {cat ? (
          <><AccountIcon icon={cat.icon} size={10} />{cat.name}</>
        ) : (
          <><Tag size={10} />Categorise</>
        )}
        <ChevronDown size={9} />
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 w-48 max-h-64 overflow-y-auto"
        >
          {cat && (
            <button
              onClick={() => { onAssign(transaction.id, null); setPos(null) }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <X size={11} /> Remove category
            </button>
          )}
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => { onAssign(transaction.id, c.id); setPos(null) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color ?? '#64748b' }} />
              {c.name}
              <span className="ml-auto text-slate-300 dark:text-slate-600">{c.type === 'INCOME' ? 'â†‘' : 'â†“'}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// â”€â”€â”€ Tag pill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TAG_COLORS = ['#64748b','#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899']

function TagPill({
  transaction,
  allTags,
  onUpdate,
}: {
  transaction: Transaction
  allTags: Tag[]
  onUpdate: (updated: Transaction) => void
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLORS[0])
  const [creating, setCreating] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const txTags = transaction.tags ?? []
  const open = pos !== null

  function toggle() {
    if (open) { setPos(null); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const menuH = 280
    const top = r.bottom + 4 + menuH > window.innerHeight ? r.top - menuH - 4 : r.bottom + 4
    setPos({ top, left: r.left })
  }

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (!btnRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node))
        setPos(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])

  async function toggleTag(tag: Tag) {
    const has = txTags.some(tt => tt.tag.id === tag.id)
    const updated = has
      ? await window.api.removeTagFromTransaction(transaction.id, tag.id)
      : await window.api.addTagToTransaction(transaction.id, tag.id)
    onUpdate(updated)
  }

  async function createAndAdd() {
    const name = newName.trim().toLowerCase()
    if (!name) return
    setCreating(true)
    try {
      const tag = await window.api.createTag({ name, color: newColor })
      const updated = await window.api.addTagToTransaction(transaction.id, tag.id)
      onUpdate(updated)
      setNewName('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      {/* Existing tag pills */}
      {txTags.map(({ tag }) => (
        <span key={tag.id}
          className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium text-white"
          style={{ backgroundColor: tag.color ?? '#64748b' }}>
          {tag.name}
        </span>
      ))}

      {/* Add tag button */}
      <button ref={btnRef} onClick={toggle}
        className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border border-dashed border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-slate-400 dark:hover:border-slate-400 hover:text-slate-600 dark:hover:text-slate-400 transition-colors opacity-0 group-hover:opacity-100">
        <Hash size={9} />
      </button>

      {open && pos && (
        <div ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-2 w-52 max-h-72 overflow-y-auto">

          {/* New tag input */}
          <div className="px-2 pb-2 border-b border-slate-100 dark:border-slate-700">
            <div className="flex gap-1.5 mb-1.5">
              <input ref={inputRef} type="text" placeholder="New tagâ€¦" value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createAndAdd() }}
                className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400" />
              <button onClick={createAndAdd} disabled={!newName.trim() || creating}
                className="text-xs px-2 py-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded disabled:opacity-40">
                Add
              </button>
            </div>
            <div className="flex gap-1 flex-wrap">
              {TAG_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${newColor === c ? 'border-slate-600 dark:border-slate-300 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {/* Existing tags */}
          {allTags.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-2">No tags yet â€” create one above.</p>
          )}
          {allTags.map(tag => {
            const active = txTags.some(tt => tt.tag.id === tag.id)
            return (
              <button key={tag.id} onClick={() => toggleTag(tag)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color ?? '#64748b' }} />
                <span className={`flex-1 text-left ${active ? 'font-medium text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>{tag.name}</span>
                {active && <span className="text-emerald-500 text-xs">âœ“</span>}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// â”€â”€â”€ Edit transaction modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function EditTransactionModal({
  transaction,
  categories,
  onClose,
  onSave,
}: {
  transaction: Transaction
  categories: Category[]
  onClose: () => void
  onSave: (updated: Transaction) => void
}) {
  const [date, setDate] = useState(transaction.date.slice(0, 10))
  const [description, setDescription] = useState(transaction.description)
  const [amount, setAmount] = useState(String(Math.abs(parseFloat(transaction.amount))))
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>(transaction.type)
  const [notes, setNotes] = useState(transaction.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400'

  async function submit() {
    if (!description.trim() || !amount || !date) { setError('All fields are required.'); return }
    setSaving(true)
    try {
      const updated = await window.api.updateTransaction(transaction.id, {
        date, description: description.trim(),
        amount: parseFloat(amount), type, notes: notes || undefined,
      })
      onSave(updated)
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Edit transaction</h2>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {(['DEBIT', 'CREDIT'] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${type === t ? (t === 'DEBIT' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400') : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                {t === 'DEBIT' ? 'Expense' : 'Income'}
              </button>
            ))}
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          <input type="text" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} className={inputCls} />
          <input type="number" min="0" step="0.01" placeholder="Amount (â‚¬)" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} />
          <textarea rows={2} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} className={inputCls + ' resize-none'} />
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Savingâ€¦' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Add transaction modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AddForm = {
  accountId: number | ''
  date: string
  description: string
  amount: string
  type: 'CREDIT' | 'DEBIT'
  categoryId: number | ''
}

const EMPTY_ADD: AddForm = {
  accountId: '', date: new Date().toISOString().slice(0, 10),
  description: '', amount: '', type: 'DEBIT', categoryId: '',
}

function AddTransactionModal({
  accounts, categories, onClose, onSave,
}: {
  accounts: Account[]
  categories: Category[]
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = useState<AddForm>(EMPTY_ADD)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const f = (k: keyof AddForm, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  async function submit() {
    if (!form.accountId || !form.description.trim() || !form.amount) {
      setError('Account, description and amount are required.'); return
    }
    setSaving(true)
    try {
      await window.api.createTransaction({
        accountId: Number(form.accountId),
        date: form.date,
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        type: form.type,
        categoryId: form.categoryId !== '' ? Number(form.categoryId) : null,
      })
      onSave()
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add transaction</h2>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {(['DEBIT', 'CREDIT'] as const).map(t => (
              <button key={t} onClick={() => f('type', t)}
                className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${form.type === t ? (t === 'DEBIT' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400') : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                {t === 'DEBIT' ? 'Expense' : 'Income'}
              </button>
            ))}
          </div>

          <select value={form.accountId} onChange={e => f('accountId', e.target.value === '' ? '' : Number(e.target.value))} className={inputCls}>
            <option value="">Select accountâ€¦</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          <input type="date" value={form.date} onChange={e => f('date', e.target.value)} className={inputCls} />

          <input type="text" placeholder="Description" value={form.description} onChange={e => f('description', e.target.value)} className={inputCls} />

          <input type="number" min="0" step="0.01" placeholder="Amount (â‚¬)" value={form.amount} onChange={e => f('amount', e.target.value)} className={inputCls} />

          <select value={form.categoryId} onChange={e => f('categoryId', e.target.value === '' ? '' : Number(e.target.value))} className={inputCls}>
            <option value="">No category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Savingâ€¦' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Transfer modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type TransferForm = {
  fromAccountId: number | ''
  toAccountId: number | ''
  amount: string
  date: string
  description: string
}

const EMPTY_TRANSFER: TransferForm = {
  fromAccountId: '', toAccountId: '',
  amount: '', date: new Date().toISOString().slice(0, 10),
  description: 'Transfer',
}

function TransferModal({
  accounts, onClose, onSave,
}: {
  accounts: Account[]
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = useState<TransferForm>(EMPTY_TRANSFER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const f = (k: keyof TransferForm, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  async function submit() {
    if (!form.fromAccountId || !form.toAccountId || !form.amount) {
      setError('Both accounts and an amount are required.'); return
    }
    if (form.fromAccountId === form.toAccountId) {
      setError('Source and destination must be different accounts.'); return
    }
    setSaving(true)
    try {
      await window.api.transferBetweenAccounts({
        fromAccountId: Number(form.fromAccountId),
        toAccountId: Number(form.toAccountId),
        amount: parseFloat(form.amount),
        date: form.date,
        description: form.description.trim() || 'Transfer',
      })
      onSave()
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Transfer between accounts</h2>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">From</label>
            <select value={form.fromAccountId} onChange={e => f('fromAccountId', e.target.value === '' ? '' : Number(e.target.value))} className={inputCls}>
              <option value="">Select accountâ€¦</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">To</label>
            <select value={form.toAccountId} onChange={e => f('toAccountId', e.target.value === '' ? '' : Number(e.target.value))} className={inputCls}>
              <option value="">Select accountâ€¦</option>
              {accounts.filter(a => a.id !== Number(form.fromAccountId)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <input type="number" min="0" step="0.01" placeholder="Amount (â‚¬)" value={form.amount} onChange={e => f('amount', e.target.value)} className={inputCls} />
          <input type="date" value={form.date} onChange={e => f('date', e.target.value)} className={inputCls} />
          <input type="text" placeholder="Description" value={form.description} onChange={e => f('description', e.target.value)} className={inputCls} />
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Savingâ€¦' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// ─── Split transaction modal ───────────────────────────────────────────────────

type SplitRow = { categoryId: number | null; amount: string; notes: string }

function SplitModal({
  transaction,
  categories,
  onClose,
  onSave,
}: {
  transaction: Transaction
  categories: Category[]
  onClose: () => void
  onSave: (updated: Transaction) => void
}) {
  const total = Math.abs(parseFloat(transaction.amount))
  const [rows, setRows] = useState<SplitRow[]>(() => {
    if (transaction.splits && transaction.splits.length > 0) {
      return transaction.splits.map(s => ({
        categoryId: s.categoryId,
        amount: Math.abs(parseFloat(s.amount)).toFixed(2),
        notes: s.notes ?? '',
      }))
    }
    return [
      { categoryId: transaction.categoryId, amount: total.toFixed(2), notes: '' },
      { categoryId: null, amount: '', notes: '' },
    ]
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const allocated = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const remaining = total - allocated

  function updateRow(i: number, patch: Partial<SplitRow>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  function addRow() {
    setRows(prev => [...prev, { categoryId: null, amount: remaining > 0 ? remaining.toFixed(2) : '', notes: '' }])
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function submit() {
    const valid = rows.filter(r => parseFloat(r.amount) > 0)
    if (valid.length < 2) { setError('Add at least 2 splits.'); return }
    const sum = valid.reduce((s, r) => s + parseFloat(r.amount), 0)
    if (Math.abs(sum - total) > 0.01) { setError(`Splits total ${sum.toFixed(2)} but transaction is ${total.toFixed(2)}.`); return }
    setSaving(true)
    try {
      const updated = await window.api.setTransactionSplits(transaction.id, valid.map(r => ({
        categoryId: r.categoryId,
        amount: parseFloat(r.amount),
        notes: r.notes || null,
      })))
      onSave(updated)
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function clearSplits() {
    setSaving(true)
    try {
      const updated = await window.api.setTransactionSplits(transaction.id, [])
      onSave(updated)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Split transaction</h2>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          {transaction.description} &middot; <span className="font-medium">{total.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}</span>
        </p>

        <div className="flex flex-col gap-2 mb-3">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select
                value={row.categoryId ?? ''}
                onChange={e => updateRow(i, { categoryId: e.target.value === '' ? null : Number(e.target.value) })}
                className={inputCls + ' flex-1 min-w-0'}
              >
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={row.amount}
                onChange={e => updateRow(i, { amount: e.target.value })}
                className={inputCls + ' w-28'}
              />
              <input
                type="text" placeholder="Notes"
                value={row.notes}
                onChange={e => updateRow(i, { notes: e.target.value })}
                className={inputCls + ' w-32'}
              />
              <button onClick={() => removeRow(i)} disabled={rows.length <= 2}
                className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-red-400 disabled:opacity-30 transition-colors">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <button onClick={addRow} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
            <Plus size={12} /> Add row
          </button>
          <p className={`text-xs font-medium tabular-nums ${Math.abs(remaining) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {remaining >= 0 ? `${remaining.toFixed(2)} unallocated` : `${Math.abs(remaining).toFixed(2)} over`}
          </p>
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <div className="flex justify-between gap-2">
          {transaction.splits && transaction.splits.length > 0 && (
            <button onClick={clearSplits} disabled={saving}
              className="px-3 py-2 text-xs text-slate-400 hover:text-red-500 transition-colors">
              Clear splits
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save splits'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [splittingTx, setSplittingTx] = useState<Transaction | null>(null)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState<number | ''>('')
  const [bulkApplying, setBulkApplying] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()

  // filters â€” initialise search from ?q= param set by global search
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<number | '' | 'uncategorised'>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [tagFilter, setTagFilter] = useState<number | ''>('')

  async function load() {
    const [paged, accs, cats, tgs] = await Promise.all([
      window.api.listTransactionsPaged({ take: PAGE_SIZE, skip: 0 }),
      window.api.listAccounts(),
      window.api.listCategories(),
      window.api.listTags(),
    ])
    setTransactions(paged.transactions)
    setTotal(paged.total)
    setAccounts(accs)
    setCategories(cats)
    setTags(tgs)
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const paged = await window.api.listTransactionsPaged({ take: PAGE_SIZE, skip: transactions.length })
      setTransactions(prev => [...prev, ...paged.transactions])
      setTotal(paged.total)
    } finally {
      setLoadingMore(false)
    }
  }

  function updateTransaction(updated: Transaction) {
    setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t))
    window.api.listTags().then(setTags)
  }

  useEffect(() => {
    load()
    // Clean the ?q= param from the URL after consuming it
    if (searchParams.get('q')) setSearchParams({}, { replace: true })
  }, [])

  async function handleAssign(txId: number, catId: number | null) {
    if (catId === null) {
      // remove: update with null â€” reuse categorise or add a separate handler
      await window.api.categoriseTransaction(txId, catId as unknown as number)
    } else {
      await window.api.categoriseTransaction(txId, catId)
    }
    await load()
  }

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await window.api.deleteTransaction(id)
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  function toggleSelectAll() {
    const visibleIds = filtered.map(t => t.id)
    const allSelected = visibleIds.every(id => selected.has(id))
    setSelected(allSelected ? new Set() : new Set(visibleIds))
  }

  async function applyBulkCategory() {
    if (selected.size === 0) return
    setBulkApplying(true)
    try {
      const catId = bulkCategoryId !== '' ? Number(bulkCategoryId) : null
      await window.api.bulkCategoriseTransactions([...selected], catId)
      setTransactions(prev => prev.map(t =>
        selected.has(t.id)
          ? { ...t, categoryId: catId, category: categories.find(c => c.id === catId) ?? null }
          : t
      ))
      setSelected(new Set())
      setBulkCategoryId('')
    } finally {
      setBulkApplying(false)
    }
  }

  const filtered = useMemo(
    () => applyFilters(transactions, { search, accountId, typeFilter, categoryFilter, tagFilter, from, to, minAmount, maxAmount }),
    [transactions, accountId, typeFilter, categoryFilter, tagFilter, from, to, search, minAmount, maxAmount]
  )

  const allVisibleSelected = filtered.length > 0 && filtered.every(t => selected.has(t.id))

  const vItems = useMemo(() => buildVItems(filtered), [filtered])

  const totalIn  = filtered.filter(t => t.type === 'CREDIT').reduce((s, t) => s + parseFloat(t.amount), 0)
  const totalOut = filtered.filter(t => t.type === 'DEBIT').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0)

  const listRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: vItems.length,
    getScrollElement: () => listRef.current,
    estimateSize: i => vItems[i].kind === 'header' ? HEADER_H : ROW_H,
    overscan: 10,
  })
  const hasFilters = search || accountId !== '' || typeFilter !== 'ALL' || categoryFilter !== '' || tagFilter !== '' || from || to || minAmount || maxAmount


  return (
    <div className="mx-auto max-w-4xl">
      {showAdd && <AddTransactionModal accounts={accounts} categories={categories} onClose={() => setShowAdd(false)} onSave={load} />}
      {showTransfer && <TransferModal accounts={accounts} onClose={() => setShowTransfer(false)} onSave={load} />}
      {editingTx && <EditTransactionModal transaction={editingTx} categories={categories} onClose={() => setEditingTx(null)} onSave={updated => { updateTransaction(updated); setEditingTx(null) }} />}
      {splittingTx && <SplitModal transaction={splittingTx} categories={categories} onClose={() => setSplittingTx(null)} onSave={updated => { updateTransaction(updated); setSplittingTx(null) }} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Transactions</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {filtered.length} of {total} transaction{total !== 1 ? 's' : ''} Â·{' '}
            <span className="text-emerald-600">+{fmt(String(totalIn))}</span>
            {' '}<span className="text-red-500">âˆ’{fmt(String(totalOut))}</span>
            {' '}<span className="text-slate-600 dark:text-slate-400">net {fmt(String(totalIn - totalOut))}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTransfer(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <ArrowLeftRight size={14} /> Transfer
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-medium hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-slate-900 dark:bg-slate-700 text-white rounded-xl px-4 py-2.5 mb-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium shrink-0">{selected.size} selected</span>
          <select
            value={bulkCategoryId}
            onChange={e => setBulkCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
            className="flex-1 min-w-40 border border-slate-600 rounded-lg px-2.5 py-1.5 text-sm bg-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value="">No category (clear)</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={applyBulkCategory} disabled={bulkApplying}
            className="px-3 py-1.5 text-sm bg-white text-slate-900 rounded-lg font-medium disabled:opacity-50 hover:bg-slate-100 transition-colors shrink-0">
            {bulkApplying ? 'Applyingâ€¦' : 'Apply'}
          </button>
          <button onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors shrink-0">
            Clear
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-2 items-center">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          onChange={toggleSelectAll}
          title="Select all visible"
          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 accent-slate-700 cursor-pointer shrink-0"
        />
        <div className="relative flex-1 min-w-40">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search descriptionâ€¦"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
        >
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
        >
          <option value="ALL">All types</option>
          <option value="CREDIT">Credit</option>
          <option value="DEBIT">Debit</option>
        </select>

        <select
          value={categoryFilter}
          onChange={e => {
            const v = e.target.value
            setCategoryFilter(v === '' ? '' : v === 'uncategorised' ? 'uncategorised' : Number(v))
          }}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
        >
          <option value="">All categories</option>
          <option value="uncategorised">Uncategorised</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {tags.length > 0 && (
          <select
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value === '' ? '' : Number(e.target.value))}
            className="border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
          >
            <option value="">All tags</option>
            {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        <input
          type="date"
          value={from}
          onChange={e => setFrom(e.target.value)}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
        />
        <span className="text-slate-400 dark:text-slate-500 text-sm">â†’</span>
        <input
          type="date"
          value={to}
          onChange={e => setTo(e.target.value)}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
        />

        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Min â‚¬"
          value={minAmount}
          onChange={e => setMinAmount(e.target.value)}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
        />
        <span className="text-slate-400 dark:text-slate-500 text-sm">â€“</span>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Max â‚¬"
          value={maxAmount}
          onChange={e => setMaxAmount(e.target.value)}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
        />

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setAccountId(''); setTypeFilter('ALL'); setCategoryFilter(''); setTagFilter(''); setFrom(''); setTo(''); setMinAmount(''); setMaxAmount('') }}
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 flex items-center gap-1"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Transaction list â€” virtualised */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-sm">No transactions found.</p>
        </div>
      ) : (
        <div
          ref={listRef}
          className="overflow-y-auto"
          style={{ height: 'calc(100vh - 260px)' }}
        >
          {/* Total height spacer so the scrollbar reflects the full content */}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vrow => {
              const item = vItems[vrow.index]
              return (
                <div
                  key={vrow.key}
                  data-index={vrow.index}
                  ref={virtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vrow.start}px)` }}
                >
                  {item.kind === 'header' ? (
                    <div className="flex items-center justify-between px-1 pt-4 pb-1.5">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{fmtDateLong(item.date)}</p>
                      <p className="text-xs text-slate-400 flex gap-2">
                        {item.creditSum > 0 && <span className="text-emerald-500">+{fmt(String(item.creditSum))}</span>}
                        {item.debitSum  > 0 && <span className="text-red-400">âˆ’{fmt(String(item.debitSum))}</span>}
                      </p>
                    </div>
                  ) : (
                    <div className={`bg-white dark:bg-slate-800 border-x border-slate-200 dark:border-slate-700
                      ${item.isFirst  ? 'border-t rounded-t-xl' : 'border-t border-slate-100 dark:border-slate-800'}
                      ${item.isLast   ? 'border-b rounded-b-xl' : ''}`}>
                      <div className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <input
                          type="checkbox"
                          checked={selected.has(item.tx.id)}
                          onChange={() => toggleSelect(item.tx.id)}
                          onClick={e => e.stopPropagation()}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 accent-slate-700 shrink-0 opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity cursor-pointer"
                        />
                        <div className={`w-1.5 h-8 rounded-full shrink-0 ${item.tx.type === 'CREDIT' ? 'bg-emerald-400' : 'bg-red-400'}`} />

                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{item.tx.description}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate flex items-center gap-2">
                            {accounts.length > 1 && (
                              <span>{accounts.find(a => a.id === item.tx.accountId)?.name}</span>
                            )}
                            {item.tx.notes && (
                              <span className="italic text-slate-400 dark:text-slate-500 truncate" title={item.tx.notes}>
                                {accounts.length > 1 && 'Â· '}{item.tx.notes}
                              </span>
                            )}
                          </p>
                        </div>

                        {item.tx.splits && item.tx.splits.length > 0 ? (
                          <button
                            onClick={() => setSplittingTx(item.tx)}
                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-violet-300 dark:border-violet-600 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                          >
                            <Scissors size={10} />
                            Split ({item.tx.splits.length})
                          </button>
                        ) : (
                          <CategoryPill transaction={item.tx} categories={categories} onAssign={handleAssign} />
                        )}

                        <div className="flex items-center gap-1 flex-wrap">
                          <TagPill transaction={item.tx} allTags={tags} onUpdate={updateTransaction} />
                        </div>

                        <p className={`text-sm font-semibold tabular-nums shrink-0 ${item.tx.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-500'}`}>
                          {item.tx.type === 'CREDIT' ? '+' : 'âˆ’'}{fmt(String(Math.abs(parseFloat(item.tx.amount))))}
                        </p>

                        <button
                          onClick={() => setSplittingTx(item.tx)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 dark:text-slate-600 hover:text-violet-500 dark:hover:text-violet-400 transition-all"
                          title="Split transaction"
                        >
                          <Scissors size={13} />
                        </button>
                        <button
                          onClick={() => setEditingTx(item.tx)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 transition-all"
                          title="Edit transaction"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.tx.id)}
                          disabled={deletingId === item.tx.id}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 transition-all disabled:opacity-50"
                          title="Delete transaction"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Load more */}
      {transactions.length < total && (
        <div className="mt-3 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loadingâ€¦' : `Load more (${total - transactions.length} remaining)`}
          </button>
        </div>
      )}
    </div>
  )
}
