import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, X, Check, Sun, Moon, RefreshCw, Download, RotateCcw } from 'lucide-react'
import AccountIcon from '../components/AccountIcon'
import { useShortcuts } from '../context/ShortcutContext'
import { DEFAULT_SHORTCUTS, SHORTCUT_LABELS, formatKey, type ShortcutConfig } from '../utils/shortcuts'
import { useTheme } from '../context/ThemeContext'

// Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬ Available icons Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬

const ICONS = [
  'CreditCard', 'PiggyBank', 'Wallet', 'TrendingUp', 'Building2', 'Banknote',
  'Landmark', 'CircleDollarSign', 'Coins', 'Bitcoin', 'Home', 'Car',
  'ShoppingBag', 'Briefcase', 'Globe', 'Fuel', 'ShoppingCart', 'Pill',
  'UtensilsCrossed', 'Repeat', 'HeartPulse', 'Receipt', 'Plane',
  'MoreHorizontal', 'ArrowDownLeft', 'RotateCcw',
]

const COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#a855f7', '#0ea5e9',
  '#e30613', '#191c1f', '#64748b', '#94a3b8',
]

// Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬ Shared picker sub-components Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬

function ColourPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <p className=âtext-xs text-slate-500 dark:text-slate-400 mb-1.5â>Colour</p>
      <div className=âflex flex-wrap gap-1.5â>
        {COLORS.map(c => (
          <button key={c} onClick={() => onChange(c)}
            className=âw-6 h-6 rounded-full border-2 transition-allâ
            style={{ backgroundColor: c, borderColor: value === c ? '#0f172a' : 'transparent' }}
          />
        ))}
      </div>
    </div>
  )
}

function IconPicker({ value, onChange }: { value: string; onChange: (i: string) => void }) {
  return (
    <div>
      <p className=âtext-xs text-slate-500 dark:text-slate-400 mb-1.5â>Icon</p>
      <div className=âflex flex-wrap gap-1.5â>
        {ICONS.map(i => (
          <button key={i} onClick={() => onChange(i)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${
              value === i ? 'border-slate-900 bg-slate-100 dark:border-slate-100 dark:bg-slate-700' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
            }`}
          >
            <AccountIcon icon={i} size={14} className=âtext-slate-600 dark:text-slate-400â />
          </button>
        ))}
      </div>
    </div>
  )
}

// Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬ Shared row editor Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬

type BaseItem = { id: number; name: string; color: string | null; icon: string | null }

function ItemRow({
  item,
  onSave,
  onDelete,
}: {
  item: BaseItem
  onSave: (id: number, data: Omit<BaseItem, 'id'>) => Promise<void>
  onDelete: (id: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [color, setColor] = useState(item.color ?? '#64748b')
  const [icon, setIcon] = useState(item.icon ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(item.id, { name: name.trim(), color, icon: icon || null })
      setEditing(false)
    } catch (e: any) {
      setSaveError(e?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setName(item.name)
    setColor(item.color ?? '#64748b')
    setIcon(item.icon ?? '')
    setEditing(false)
    setSaveError(null)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 group">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: item.color ?? '#64748b' }}
        >
          <AccountIcon icon={item.icon} size={14} />
        </div>
        <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">{item.name}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col gap-3 bg-white dark:bg-slate-800">
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
        autoFocus
      />
      <ColourPicker value={color} onChange={setColor} />
      <IconPicker value={icon} onChange={setIcon} />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: color }}>
          <AccountIcon icon={icon || null} size={14} />
        </div>
        <span className="text-sm text-slate-700 dark:text-slate-300">{name || 'Preview'}</span>
      </div>
      {saveError && <p className="text-xs text-red-500">{saveError}</p>}
      <div className="flex gap-2">
        <button onClick={cancel} className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="flex-1 bg-slate-900 text-white text-xs py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-1">
          <Check size={12} /> Save
        </button>
      </div>
    </div>
  )
}

// Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬ Add-new row Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬

function AddRow({ onAdd }: { onAdd: (data: Omit<BaseItem, 'id'>) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#64748b')
  const [icon, setIcon] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onAdd({ name: name.trim(), color, icon: icon || null })
      setName('')
      setColor('#64748b')
      setIcon('')
      setOpen(false)
    } catch {
      // onAdd surfaces errors via the parent's error state
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors w-full"
      >
        <Plus size={14} /> Add new
      </button>
    )
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col gap-3 bg-white dark:bg-slate-800">
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
        autoFocus
      />
      <ColourPicker value={color} onChange={setColor} />
      <IconPicker value={icon} onChange={setIcon} />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: color }}>
          <AccountIcon icon={icon || null} size={14} />
        </div>
        <span className="text-sm text-slate-700 dark:text-slate-300">{name || 'Preview'}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">
          Cancel
        </button>
        <button onClick={save} disabled={saving || !name.trim()} className="flex-1 bg-slate-900 text-white text-xs py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-1">
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  )
}

// Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬ Category-specific add row (includes type selector) Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬

function CategoryAddRow({ onAdd }: { onAdd: (data: Omit<Category, 'id'>) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [color, setColor] = useState('#64748b')
  const [icon, setIcon] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onAdd({ name: name.trim(), type, color, icon: icon || null })
      setName(''); setColor('#64748b'); setIcon(''); setOpen(false)
    } catch {
      // onAdd surfaces errors via the parent's error state
    } finally {
      setSaving(false)
    }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors w-full">
      <Plus size={14} /> Add new
    </button>
  )

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col gap-3 bg-white dark:bg-slate-800">
      <div className="flex gap-2">
        <input type="text" placeholder="Name" value={name} onChange={e => setName(e.target.value)}
          className="flex-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100" autoFocus />
        <select value={type} onChange={e => setType(e.target.value as 'INCOME' | 'EXPENSE')}
          className="border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500">
          <option value="EXPENSE">Expense</option>
          <option value="INCOME">Income</option>
        </select>
      </div>
      <ColourPicker value={color} onChange={setColor} />
      <IconPicker value={icon} onChange={setIcon} />
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
        <button onClick={save} disabled={saving || !name.trim()} className="flex-1 bg-slate-900 text-white text-xs py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-1"><Plus size={12} />Add</button>
      </div>
    </div>
  )
}

// Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬ Export tab Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬

function ExportTab() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [exporting, setExporting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function handleExportTransactions() {
    setExporting(true)
    setMsg(null)
    try {
      const ext = format === 'csv' ? 'csv' : 'json'
      const filePath = await window.api.exportSavePath(
        `transactions.${ext}`,
        [{ name: format.toUpperCase(), extensions: [ext] }]
      )
      if (!filePath) return
      const opts: Parameters<typeof window.api.exportTransactions>[0] = { format, filePath }
      if (from) opts.from = from
      if (to) opts.to = to
      const { exported } = await window.api.exportTransactions(opts)
      setMsg(`✓ ${exported} transactions exported`)
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? 'Export failed'}`)
    } finally {
      setExporting(false)
    }
  }

  async function handleBackup() {
    setExporting(true)
    setMsg(null)
    try {
      const date = new Date().toISOString().slice(0, 10)
      const filePath = await window.api.exportSavePath(
        `finance-backup-${date}.json`,
        [{ name: 'JSON', extensions: ['json'] }]
      )
      if (!filePath) return
      const { exported } = await window.api.exportBackup(filePath)
      setMsg(`â Full backup saved (${exported} records)`)
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? 'Backup failed'}`)
    } finally {
      setExporting(false)
    }
  }

  const inputCls = 'w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400'

  return (
    <div className="flex flex-col gap-4">
      {/* Transaction export */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Export transactions</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Filter by date range, then download as CSV or JSON.</p>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Format</label>
            <div className="flex gap-2">
              {(['csv', 'json'] as const).map(f => (
                <button key={f} onClick={() => setFormat(f)}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${format === f ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-400'}`}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleExportTransactions} disabled={exporting}
            className="w-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm py-2 rounded-lg hover:bg-slate-700 dark:hover:bg-white disabled:opacity-50 transition-colors">
            {exporting ? 'ExportingÃ¢â¬Â¦' : 'Export transactions'}
          </button>
        </div>
      </div>

      {/* Full backup */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Full backup</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          Exports all accounts, transactions, savings, investments, budgets and settings to a single JSON file.
        </p>
        <button onClick={handleBackup} disabled={exporting}
          className="w-full border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors">
          {exporting ? 'Backing upÃ¢â¬Â¦' : 'Download full backup'}
        </button>
      </div>

      {/* Restore from backup */}
      <RestoreSection onDone={(m) => setMsg(m)} disabled={exporting} />

      {msg && (
        <p className={`text-sm px-4 py-2.5 rounded-xl border ${msg.startsWith('✓') ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
          {msg}
        </p>
      )}
    </div>
  )
}

function RestoreSection({ onDone, disabled }: { onDone: (msg: string) => void; disabled: boolean }) {
  const [confirm, setConfirm] = useState(false)
  const [restoring, setRestoring] = useState(false)

  async function handleRestore() {
    setRestoring(true)
    try {
      const filePath = await window.api.openJSONDialog()
      if (!filePath) { setConfirm(false); return }
      const { transactions } = await window.api.importBackup(filePath)
      onDone(`✓ Backup restored (${transactions} transactions). Restart the app to see all changes.`)
      setConfirm(false)
    } catch (e: any) {
      onDone(`Error: ${e?.message ?? 'Restore failed'}`)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Restore from backup</h2>
      <p className="text-xs text-red-500 dark:text-red-400 mb-4">
        Ã¢Å¡Â  This will permanently overwrite all current data with the contents of the backup file.
      </p>
      {!confirm ? (
        <button onClick={() => setConfirm(true)} disabled={disabled}
          className="w-full border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors">
          Restore from backupÃ¢â¬Â¦
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-600 dark:text-slate-400">Are you sure? All current data will be replaced.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirm(false)}
              className="flex-1 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">
              Cancel
            </button>
            <button onClick={handleRestore} disabled={restoring}
              className="flex-1 bg-red-600 text-white text-sm py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50">
              {restoring ? 'RestoringÃ¢â¬Â¦' : 'Yes, restore'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬ Shortcuts tab Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬

function ShortcutsTab() {
  const { config, setConfig } = useShortcuts()
  const [capturing, setCapturing] = useState<keyof ShortcutConfig | null>(null)
  const [local, setLocal] = useState<ShortcutConfig>(config)

  const actions = Object.keys(DEFAULT_SHORTCUTS) as (keyof ShortcutConfig)[]

  function startCapture(action: keyof ShortcutConfig) {
    setCapturing(action)
  }

  function onKeyDown(e: React.KeyboardEvent, action: keyof ShortcutConfig) {
    e.preventDefault()
    e.stopPropagation()
    const key = e.key
    // Ignore modifier-only presses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return
    const updated = { ...local, [action]: key }
    setLocal(updated)
    setConfig(updated)
    setCapturing(null)
  }

  function reset() {
    setLocal(DEFAULT_SHORTCUTS)
    setConfig(DEFAULT_SHORTCUTS)
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Keyboard shortcuts</h2>
        <button onClick={reset} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Reset to defaults</button>
      </div>
      <div className="flex flex-col gap-2">
        {actions.map(action => (
          <div key={action} className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800 last:border-0">
            <span className="text-sm text-slate-700 dark:text-slate-300">{SHORTCUT_LABELS[action]}</span>
            {capturing === action ? (
              <div
                className="px-3 py-1 bg-slate-900 text-white text-xs rounded-lg cursor-pointer animate-pulse"
                tabIndex={0}
                autoFocus
                onKeyDown={e => onKeyDown(e, action)}
                onBlur={() => setCapturing(null)}
              >
                Press a keyÃ¢â¬Â¦
              </div>
            ) : (
              <button
                onClick={() => startCapture(action)}
                className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 font-mono transition-colors"
              >
                {formatKey(local[action])}
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">Click a shortcut key to reassign it. Shortcuts don't fire when typing in inputs.</p>
    </div>
  )
}

// Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬ Section card Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{title}</h2>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

// Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬ Investments tab Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬

const REFRESH_OPTIONS: { value: RefreshInterval; label: string; description: string }[] = [
  { value: 'never',   label: 'Never',          description: 'Only refresh manually' },
  { value: 'startup', label: 'On startup only', description: 'Once each time the app opens' },
  { value: '1h',      label: 'Every hour',      description: 'Background refresh every 60 minutes' },
  { value: '4h',      label: 'Every 4 hours',   description: 'Recommended Ã¢â¬â balances freshness and API usage' },
  { value: '8h',      label: 'Every 8 hours',   description: 'Morning / midday / evening refresh' },
  { value: '24h',     label: 'Every 24 hours',  description: 'Once a day Ã¢â¬â lightest API usage' },
]

function InvestmentsTab() {
  const [interval, setInterval_] = useState<RefreshInterval>('4h')
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      window.api.loadAppSettings(),
      window.api.getLastPriceRefresh(),
    ]).then(([settings, last]) => {
      setInterval_(settings.priceRefreshInterval)
      setLastRefresh(last)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  async function save(value: RefreshInterval) {
    setSaving(true)
    setMsg(null)
    try {
      await window.api.saveAppSettings({ priceRefreshInterval: value })
      setInterval_(value)
      setMsg('Saved.')
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? 'Failed to save'}`)
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 3000)
    }
  }

  async function refreshNow() {
    setRefreshing(true)
    setMsg(null)
    try {
      const { updated, errors } = await window.api.refreshAllPrices()
      const ts = await window.api.getLastPriceRefresh()
      setLastRefresh(ts)
      setMsg(`${updated} price${updated !== 1 ? 's' : ''} updated${errors.length ? ` · ${errors.length} failed` : ''}`)
    } catch (e: any) {
      setMsg(e?.message ?? 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  if (!loaded) return null

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Price refresh schedule</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
        Prices are fetched from Yahoo Finance. Changes take effect immediately.
        {lastRefresh && (
          <> Last refresh: <span className="text-slate-600 dark:text-slate-300">{new Date(lastRefresh).toLocaleString()}</span></>
        )}
        {!lastRefresh && <> No automatic refresh has run yet.</>}
      </p>

      <div className="flex flex-col gap-2 mb-5">
        {REFRESH_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => save(opt.value)}
            disabled={saving}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
              interval === opt.value
                ? 'border-slate-900 dark:border-slate-400 bg-slate-50 dark:bg-slate-700'
                : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
            }`}
          >
            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
              interval === opt.value ? 'border-slate-900 dark:border-slate-300' : 'border-slate-300 dark:border-slate-500'
            }`}>
              {interval === opt.value && <div className="w-2 h-2 rounded-full bg-slate-900 dark:bg-slate-300" />}
            </div>
            <div>
              <p className={`text-sm font-medium ${interval === opt.value ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}>
                {opt.label}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{opt.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={refreshNow}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium disabled:opacity-50 hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors"
        >
          {refreshing ? 'RefreshingÃ¢â¬Â¦' : 'Refresh now'}
        </button>
        {msg && <p className="text-xs text-slate-500 dark:text-slate-400">{msg}</p>}
      </div>
    </div>
  )
}

// Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬ Main page Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬

function AppTab() {
  const [status, setStatus] = useState<UpdaterStatus>({ status: 'idle' })
  const [checking, setChecking] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    window.api.getUpdateStatus().then(setStatus)
    unsubRef.current = window.api.onUpdateStatus(setStatus)
    return () => { unsubRef.current?.() }
  }, [])

  async function check() {
    setChecking(true)
    try { await window.api.checkForUpdates() } finally { setChecking(false) }
  }

  const statusText: Record<string, string> = {
    idle: 'Not checked yet',
    checking: 'Checking for updatesâ¦',
    available: `Update available: v${status.version}`,
    'not-available': 'You are on the latest version',
    downloading: `Downloadingâ¦ ${status.percent ?? 0}%`,
    ready: `v${status.version} ready to install`,
    error: `Update error: ${status.error ?? 'unknown'}`,
  }

  const statusColor: Record<string, string> = {
    idle: 'text-slate-400 dark:text-slate-500',
    checking: 'text-slate-500 dark:text-slate-400',
    available: 'text-amber-600 dark:text-amber-400',
    'not-available': 'text-emerald-600 dark:text-emerald-400',
    downloading: 'text-blue-600 dark:text-blue-400',
    ready: 'text-emerald-600 dark:text-emerald-400',
    error: 'text-red-500',
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col gap-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">About</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Finance &mdash; personal finance desktop app</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Version {__APP_VERSION__}</p>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-700 pt-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Updates</h2>
        <p className={`text-xs mb-4 ${statusColor[status.status] ?? 'text-slate-400'}`}>
          {statusText[status.status] ?? status.status}
        </p>

        {status.status === 'downloading' && (
          <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 mb-4">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${status.percent ?? 0}%` }} />
          </div>
        )}

        <div className="flex gap-2">
          {status.status !== 'ready' && (
            <button
              onClick={check}
              disabled={checking || status.status === 'checking' || status.status === 'downloading'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={13} className={(checking || status.status === 'checking') ? 'animate-spin' : ''} />
              Check for updates
            </button>
          )}
          {status.status === 'available' && (
            <button
              onClick={() => window.api.checkForUpdates()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
            >
              <Download size={13} /> Download
            </button>
          )}
          {status.status === 'ready' && (
            <button
              onClick={() => window.api.installUpdate()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <RotateCcw size={13} /> Restart and install
            </button>
          )}
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
          Updates are downloaded automatically when available and installed on next restart.
          Requires the app to be published to GitHub Releases.
        </p>
      </div>
    </div>
  )
}

type Tab = 'accountTypes' | 'banks' | 'categories' | 'investmentTypes' | 'brokers' | 'rules' | 'investments' | 'shortcuts' | 'export' | 'app'

export default function SettingsPage() {
  const { theme, toggle: toggleTheme } = useTheme()
  const [tab, setTab] = useState<Tab>('accountTypes')
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [investmentTypes, setInvestmentTypes] = useState<InvestmentType[]>([])
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [newPattern, setNewPattern] = useState('')
  const [newRuleCategoryId, setNewRuleCategoryId] = useState<number | ''>('')
  const [applyMsg, setApplyMsg] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string; type: Tab } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [at, b, c, it, br, r] = await Promise.all([
      window.api.listAccountTypes(),
      window.api.listBanks(),
      window.api.listCategories(),
      window.api.listInvestmentTypes(),
      window.api.listBrokers(),
      window.api.listRules(),
    ])
    setAccountTypes(at)
    setBanks(b)
    setCategories(c)
    setInvestmentTypes(it)
    setBrokers(br)
    setRules(r)
  }

  useEffect(() => { load() }, [])

  // Ã¢ââ¬Ã¢ââ¬ Account types Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬
  async function saveAccountType(id: number, data: Omit<BaseItem, 'id'>) {
    await window.api.updateAccountType(id, data)
    await load()
  }
  async function deleteAccountType(id: number) {
    const item = accountTypes.find(t => t.id === id)!
    setDeleteConfirm({ id, name: item.name, type: 'accountTypes' })
  }
  async function addAccountType(data: Omit<BaseItem, 'id'>) {
    await window.api.createAccountType(data)
    await load()
  }

  // Ã¢ââ¬Ã¢ââ¬ Banks Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬
  async function saveBank(id: number, data: Omit<BaseItem, 'id'>) {
    await window.api.updateBank(id, data)
    await load()
  }
  async function deleteBank(id: number) {
    const item = banks.find(b => b.id === id)!
    setDeleteConfirm({ id, name: item.name, type: 'banks' })
  }
  async function addBank(data: Omit<BaseItem, 'id'>) {
    await window.api.createBank(data)
    await load()
  }

  // Ã¢ââ¬Ã¢ââ¬ Categories Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬
  async function saveCategory(id: number, data: Omit<BaseItem, 'id'>) {
    await window.api.updateCategory(id, data)
    await load()
  }
  async function deleteCategory(id: number) {
    const item = categories.find(c => c.id === id)!
    setDeleteConfirm({ id, name: item.name, type: 'categories' })
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    setError(null)
    try {
      if (deleteConfirm.type === 'accountTypes') await window.api.deleteAccountType(deleteConfirm.id)
      else if (deleteConfirm.type === 'banks') await window.api.deleteBank(deleteConfirm.id)
      else if (deleteConfirm.type === 'investmentTypes') await window.api.deleteInvestmentType(deleteConfirm.id)
      else if (deleteConfirm.type === 'brokers') await window.api.deleteBroker(deleteConfirm.id)
      else await window.api.deleteCategory(deleteConfirm.id)
      setDeleteConfirm(null)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Cannot delete Ã¢â¬â item may still be in use')
      setDeleteConfirm(null)
    }
  }

  // Ã¢ââ¬Ã¢ââ¬ Brokers Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬
  async function saveBroker(id: number, data: Omit<BaseItem, 'id'>) {
    await window.api.updateBroker(id, data); await load()
  }
  async function deleteBroker(id: number) {
    const item = brokers.find(b => b.id === id)!
    setDeleteConfirm({ id, name: item.name, type: 'brokers' })
  }
  async function addBroker(data: Omit<BaseItem, 'id'>) {
    await window.api.createBroker(data); await load()
  }

  // Ã¢ââ¬Ã¢ââ¬ Investment types Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬Ã¢ââ¬
  async function saveInvestmentType(id: number, data: Omit<BaseItem, 'id'>) {
    await window.api.updateInvestmentType(id, data)
    await load()
  }
  async function deleteInvestmentType(id: number) {
    const item = investmentTypes.find(t => t.id === id)!
    setDeleteConfirm({ id, name: item.name, type: 'investmentTypes' })
  }
  async function addInvestmentType(data: Omit<BaseItem, 'id'>) {
    await window.api.createInvestmentType(data)
    await load()
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'accountTypes', label: 'Account types' },
    { key: 'banks', label: 'Banks' },
    { key: 'categories', label: 'Categories' },
    { key: 'investmentTypes', label: 'Investment types' },
    { key: 'brokers', label: 'Brokers' },
    { key: 'rules', label: 'Auto-categorize' },
    { key: 'investments', label: 'Investments' },
    { key: 'shortcuts', label: 'Shortcuts' },
    { key: 'export', label: 'Export' },
    { key: 'app', label: 'App' },
  ]

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          title="Toggle dark mode"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-sm py-1.5 rounded-lg transition-colors ${
              tab === t.key ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {tab === 'accountTypes' && (
        <Section title="Account types">
          {accountTypes.map(t => (
            <ItemRow key={t.id} item={t} onSave={saveAccountType} onDelete={deleteAccountType} />
          ))}
          <AddRow onAdd={addAccountType} />
        </Section>
      )}

      {tab === 'banks' && (
        <Section title="Banks">
          {banks.map(b => (
            <ItemRow key={b.id} item={b} onSave={saveBank} onDelete={deleteBank} />
          ))}
          <AddRow onAdd={addBank} />
        </Section>
      )}

      {tab === 'categories' && (
        <Section title="Categories">
          <div className="mb-2">
            <p className="text-xs text-slate-400 dark:text-slate-500 px-3 mb-1">Income</p>
            {categories.filter(c => c.type === 'INCOME').map(c => (
              <ItemRow key={c.id} item={c} onSave={saveCategory} onDelete={deleteCategory} />
            ))}
          </div>
          <div className="mb-2">
            <p className="text-xs text-slate-400 dark:text-slate-500 px-3 mb-1">Expense</p>
            {categories.filter(c => c.type === 'EXPENSE').map(c => (
              <ItemRow key={c.id} item={c} onSave={saveCategory} onDelete={deleteCategory} />
            ))}
          </div>
          <CategoryAddRow onAdd={async (data) => { await window.api.createCategory(data); await load() }} />
        </Section>
      )}

      {tab === 'investmentTypes' && (
        <Section title="Investment types">
          {investmentTypes.map(t => (
            <ItemRow key={t.id} item={t} onSave={saveInvestmentType} onDelete={deleteInvestmentType} />
          ))}
          <AddRow onAdd={addInvestmentType} />
        </Section>
      )}

      {tab === 'brokers' && (
        <Section title="Brokers">
          {brokers.map(b => (
            <ItemRow key={b.id} item={b} onSave={saveBroker} onDelete={deleteBroker} />
          ))}
          <AddRow onAdd={addBroker} />
        </Section>
      )}

      {tab === 'rules' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Auto-categorization rules</h2>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            When a transaction description contains the pattern, it is automatically assigned the category on import.
          </p>

          {/* Add rule form */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Pattern (e.g. pingo doce)"
              value={newPattern}
              onChange={e => setNewPattern(e.target.value)}
              className="flex-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
            />
            <select
              value={newRuleCategoryId}
              onChange={e => setNewRuleCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
            >
              <option value="">CategoryÃ¢â¬Â¦</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button
              onClick={async () => {
                if (!newPattern.trim() || newRuleCategoryId === '') return
                await window.api.createRule(newPattern.trim(), Number(newRuleCategoryId))
                setNewPattern('')
                setNewRuleCategoryId('')
                await load()
              }}
              disabled={!newPattern.trim() || newRuleCategoryId === ''}
              className="px-3 py-1.5 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-700 disabled:opacity-40"
            >
              Add
            </button>
          </div>

          {/* Rules list */}
          {rules.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center">No rules yet.</p>
          ) : (
            <div className="flex flex-col gap-1 mb-4">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 group">
                  <span className="flex-1 text-sm font-mono text-slate-700 dark:text-slate-300">"{rule.pattern}"</span>
                  <span className="text-xs px-2 py-0.5 rounded-full text-white shrink-0"
                    style={{ backgroundColor: rule.category.color ?? '#64748b' }}>
                    {rule.category.name}
                  </span>
                  <button
                    onClick={async () => { await window.api.deleteRule(rule.id); await load() }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Bulk apply */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Apply to existing transactions</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Categorise all currently uncategorised transactions using these rules.</p>
            </div>
            <button
              onClick={async () => {
                const { updated } = await window.api.applyRulesToAll()
                setApplyMsg(`${updated} transaction${updated !== 1 ? 's' : ''} categorised`)
                setTimeout(() => setApplyMsg(null), 3000)
              }}
              className="ml-4 shrink-0 px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Apply now
            </button>
          </div>
          {applyMsg && <p className="text-xs text-emerald-600 mt-2">{applyMsg}</p>}
        </div>
      )}

      {tab === 'shortcuts' && <ShortcutsTab />}
      {tab === 'export' && <ExportTab />}
      {tab === 'investments' && <InvestmentsTab />}
      {tab === 'app' && <AppTab />}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Delete?</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              <span className="font-medium text-slate-700 dark:text-slate-300">{deleteConfirm.name}</span> will be permanently deleted.
              Any accounts or transactions using it will be affected.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">
                Cancel
              </button>
              <button onClick={confirmDelete} className="flex-1 bg-red-600 text-white text-sm py-2 rounded-lg hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
