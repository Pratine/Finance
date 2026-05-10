import { useEffect, useState } from 'react'
import { useShortcutAction } from '../context/ShortcutContext'
import { Plus, Wallet, X, Pencil, Trash2, SlidersHorizontal, GripVertical } from 'lucide-react'
import AccountIcon from '../components/AccountIcon'

const INITIAL_BALANCE_TYPES = ['savings', 'investment']

type FormState = {
  name: string
  bankId: number | ''
  accountNumber: string
  typeId: number | ''
  initialBalance: string
}

const EMPTY_FORM: FormState = { name: '', bankId: '', accountNumber: '', typeId: '', initialBalance: '' }

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [balanceTarget, setBalanceTarget] = useState<Account | null>(null)
  const [newBalance, setNewBalance] = useState('')
  const [correctionNote, setCorrectionNote] = useState('')
  const [corrections, setCorrections] = useState<BalanceCorrection[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountOrder, setAccountOrder] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('accountOrder') ?? '[]') } catch { return [] }
  })
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  async function load() {
    try {
      const [accs, types, bnks] = await Promise.all([
        window.api.listAccounts(),
        window.api.listAccountTypes(),
        window.api.listBanks(),
      ])
      setAccounts(accs)
      setAccountTypes(types)
      setBanks(bnks)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load accounts')
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }
  useShortcutAction('createNew', openCreate)

  function openEdit(acc: Account) {
    setEditingId(acc.id)
    setForm({
      name: acc.name,
      bankId: acc.bankId ?? '',
      accountNumber: acc.accountNumber ?? '',
      typeId: acc.typeId,
      initialBalance: '',
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
    if (!form.name.trim() || form.typeId === '' || form.bankId === '') return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        bankId: Number(form.bankId),
        accountNumber: form.accountNumber.trim() || null,
        typeId: Number(form.typeId),
      }
      if (editingId !== null) {
        await window.api.updateAccount(editingId, payload)
      } else {
        const balance = parseFloat(form.initialBalance) || 0
        await window.api.createAccount({ ...payload, balance: String(balance), currency: 'EUR' })
      }
      closeForm()
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleBalanceCorrection() {
    if (!balanceTarget || newBalance === '') return
    const parsed = parseFloat(newBalance)
    if (isNaN(parsed)) { setError('Please enter a valid number for the balance.'); return }
    try {
      await window.api.updateAccount(balanceTarget.id, {
        balance: String(parsed),
        _note: correctionNote.trim() || undefined,
      })
      setBalanceTarget(null)
      setNewBalance('')
      setCorrectionNote('')
      setShowHistory(false)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update balance')
    }
  }

  async function openBalanceModal(acc: Account) {
    setBalanceTarget(acc)
    setNewBalance(acc.balance)
    setCorrectionNote('')
    setShowHistory(false)
    try {
      const history = await window.api.listCorrections(acc.id)
      setCorrections(history)
    } catch {
      setCorrections([])
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await window.api.deleteAccount(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch (e: any) {
      setDeleteTarget(null)
      setError(e?.message ?? 'Failed to delete account')
    }
  }

  function handleDragStart(e: React.DragEvent, id: number) {
    e.dataTransfer.setData('accountId', String(id))
  }

  function handleDrop(e: React.DragEvent, targetId: number) {
    e.preventDefault()
    const draggedId = Number(e.dataTransfer.getData('accountId'))
    if (draggedId === targetId) return
    const ids = sortedAccounts.map(a => a.id)
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(targetId)
    if (from === -1 || to === -1) return
    ids.splice(from, 1)
    ids.splice(to, 0, draggedId)
    setAccountOrder(ids)
    localStorage.setItem('accountOrder', JSON.stringify(ids))
    setDragOverId(null)
  }

  const sortedAccounts = [...accounts].sort((a, b) => {
    const ia = accountOrder.indexOf(a.id)
    const ib = accountOrder.indexOf(b.id)
    if (ia === -1 && ib === -1) return 0
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })

  const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.balance || '0'), 0)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Accounts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Total balance:{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {totalBalance.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}
            </span>
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
        >
          <Plus size={15} /> Add account
        </button>
      </div>

      {accounts.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <Wallet size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No accounts yet. Add one to get started.</p>
        </div>
      )}

      <div className="grid gap-3">
        {sortedAccounts.map((acc) => (
          <div
            key={acc.id}
            draggable
            onDragStart={e => handleDragStart(e, acc.id)}
            onDragOver={e => { e.preventDefault(); setDragOverId(acc.id) }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={e => handleDrop(e, acc.id)}
            className={`flex items-center gap-4 bg-white dark:bg-slate-800 border rounded-xl px-5 py-4 group transition-colors ${
              dragOverId === acc.id
                ? 'border-slate-400 dark:border-slate-400 bg-slate-50 dark:bg-slate-700'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="opacity-0 group-hover:opacity-100 text-slate-300 dark:text-slate-600 cursor-grab shrink-0 transition-opacity">
              <GripVertical size={16} />
            </div>
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: acc.type.color ?? '#64748b' }}
            >
              <AccountIcon icon={acc.type.icon} size={17} />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{acc.name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                {acc.bank && (
                  <AccountIcon icon={acc.bank.icon} size={11} className="shrink-0" />
                )}
                {acc.bank ? acc.bank.name : acc.type.name}
                {acc.accountNumber ? ` Â· ${acc.accountNumber}` : ''}
              </p>
            </div>

            <div className="text-right mr-2">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {parseFloat(acc.balance || '0').toLocaleString('pt-PT', {
                  style: 'currency',
                  currency: 'EUR',
                })}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{acc.currency}</p>
            </div>

            {/* Action buttons â€” visible on hover */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => openBalanceModal(acc)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                title="Correct balance"
              >
                <SlidersHorizontal size={15} />
              </button>
              <button
                onClick={() => openEdit(acc)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Edit"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => setDeleteTarget(acc)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Delete"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId !== null ? 'Edit account' : 'New account'}
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
                  placeholder="e.g. Millennium BCP Main"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.typeId}
                  onChange={(e) => setForm({ ...form, typeId: Number(e.target.value) })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 bg-white dark:bg-slate-800 dark:text-slate-100"
                  required
                >
                  <option value="">Select typeâ€¦</option>
                  {accountTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Bank</label>
                <select
                  value={form.bankId}
                  onChange={(e) => setForm({ ...form, bankId: Number(e.target.value) })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 bg-white dark:bg-slate-800 dark:text-slate-100"
                  required
                >
                  <option value="">Select bankâ€¦</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Account number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 45471228642"
                  value={form.accountNumber}
                  onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Initial balance â€” only for savings / investment accounts */}
              {editingId === null && form.typeId !== '' && (() => {
                const typeName = accountTypes.find(t => t.id === Number(form.typeId))?.name ?? ''
                return INITIAL_BALANCE_TYPES.some(t => typeName.toLowerCase().includes(t))
              })() && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Initial balance (â‚¬)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.initialBalance}
                  onChange={(e) => setForm({ ...form, initialBalance: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              )}

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

      {/* Balance correction modal */}
      {balanceTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Correct balance</h2>
              <button onClick={() => setBalanceTarget(null)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Set the current balance for <span className="font-medium text-slate-700 dark:text-slate-300">{balanceTarget.name}</span>.
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <input
                type="number" step="0.01" value={newBalance}
                onChange={e => setNewBalance(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleBalanceCorrection() }}
              />
              <input
                type="text" placeholder="Reason (optional)"
                value={correctionNote}
                onChange={e => setCorrectionNote(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex gap-3 mb-4">
              <button onClick={() => setBalanceTarget(null)}
                className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">
                Cancel
              </button>
              <button onClick={handleBalanceCorrection}
                className="flex-1 bg-slate-900 text-white text-sm py-2 rounded-lg hover:bg-slate-700">
                Save
              </button>
            </div>

            {/* Correction history */}
            {corrections.length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                <button onClick={() => setShowHistory(h => !h)}
                  className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-2">
                  {showHistory ? 'â–²' : 'â–¼'} History ({corrections.length})
                </button>
                {showHistory && (
                  <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                    {corrections.map(c => (
                      <div key={c.id} className="text-xs flex items-start justify-between gap-2 text-slate-500 dark:text-slate-400">
                        <span className="shrink-0">{new Date(c.createdAt).toLocaleDateString('pt-PT')}</span>
                        <span className="flex-1 truncate text-slate-400 dark:text-slate-500 italic">{c.note ?? 'â€”'}</span>
                        <span className="shrink-0 font-mono">
                          {parseFloat(c.oldBalance).toFixed(2)} → <span className="text-slate-700 dark:text-slate-300">{parseFloat(c.newBalance).toFixed(2)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Delete account?</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              <span className="font-medium text-slate-700 dark:text-slate-300">{deleteTarget.name}</span> and all its
              transactions will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
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
