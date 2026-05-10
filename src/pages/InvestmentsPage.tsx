import { useEffect, useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useShortcutAction } from '../context/ShortcutContext'
import { Plus, TrendingUp, X, Pencil, Trash2, FlaskConical, ChevronDown, ChevronUp, RefreshCw, BarChart2, ArrowUpDown } from 'lucide-react'
import { fmtDate } from '../utils/formatDate'
import AccountIcon from '../components/AccountIcon'
import { calcPnL, calcCAGR, daysHeld, fmt, fmtPct, fmtCAGR, calcAvgCostBasis, calcLotGain } from '../utils/investmentCalcs'
import { simulate } from '../utils/investmentSimulator'

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ISINResult = { ticker: string; yahooTicker: string; exchange: string; name: string }

type FormState = {
  name: string
  typeId: number | ''
  amountIn: string
  currentValue: string
  isin: string
  ticker: string
  shares: string
  brokerId: number | ''
  notes: string
}

const EMPTY_FORM: FormState = {
  name: '', typeId: '', amountIn: '', currentValue: '', isin: '', ticker: '', shares: '', brokerId: '', notes: '',
}

// â”€â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>([])
  const [types, setTypes] = useState<InvestmentType[]>([])
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [priceHistory, setPriceHistory] = useState<Array<{ date: string; value: number }>>([])
  const [exchangeRates, setExchangeRates] = useState<Array<{ fromCurrency: string; rate: string }>>([])
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const [isinResults, setIsinResults] = useState<ISINResult[] | null>(null)
  const [isinLooking, setIsinLooking] = useState(false)
  const [isinError, setIsinError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Investment | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedSparklineId, setExpandedSparklineId] = useState<number | null>(null)
  const [expandedLotsId, setExpandedLotsId] = useState<number | null>(null)

  // Full load — used on mount and after refreshAllPrices (which changes history).
  async function load() {
    try {
      const [inv, t, b, hist, rates] = await Promise.all([
        window.api.listInvestments(),
        window.api.listInvestmentTypes(),
        window.api.listBrokers(),
        window.api.getInvestmentPriceHistory(),
        window.api.listExchangeRates(),
      ])
      setInvestments(inv)
      setTypes(t)
      setBrokers(b)
      setPriceHistory(hist)
      setExchangeRates(rates)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load investments')
    }
  }

  // Lightweight reload — only investments change after create/update/delete.
  async function reloadInvestments() {
    try {
      setInvestments(await window.api.listInvestments())
    } catch (e: any) {
      setError(e?.message ?? 'Failed to reload investments')
    }
  }

  useEffect(() => { load() }, [])

  async function handleISINLookup() {
    if (!form.isin.trim()) return
    setIsinLooking(true)
    setIsinResults(null)
    setIsinError(null)
    try {
      const results = await window.api.lookupISIN(form.isin.trim())
      setIsinResults(results)
    } catch (e: any) {
      setIsinError(e?.message ?? 'Lookup failed')
    } finally {
      setIsinLooking(false)
    }
  }

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setIsinResults(null)
    setIsinError(null)
    setShowForm(true)
  }
  useShortcutAction('createNew', openCreate)

  async function handleRefreshAll() {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const { updated, errors } = await window.api.refreshAllPrices()
      setRefreshMsg(`${updated} price${updated !== 1 ? 's' : ''} updated${errors.length ? ` · ${errors.length} failed` : ''}`)
      await load()
    } catch (e: any) {
      setRefreshMsg(e?.message ?? 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  function openEdit(inv: Investment) {
    setEditingId(inv.id)
    setIsinResults(null)
    setIsinError(null)
    setForm({
      name: inv.name,
      typeId: inv.typeId,
      amountIn: inv.amountIn,
      currentValue: inv.currentValue,
      isin: inv.isin ?? '',
      ticker: inv.ticker ?? '',
      shares: inv.shares ?? '',
      brokerId: inv.brokerId ?? '',
      notes: inv.notes ?? '',
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
    if (!form.name.trim() || form.typeId === '' || !form.amountIn || !form.currentValue) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        typeId: Number(form.typeId),
        amountIn: parseFloat(form.amountIn),
        currentValue: parseFloat(form.currentValue),
        isin: form.isin.trim().toUpperCase() || null,
        ticker: form.ticker.trim().toUpperCase() || null,
        shares: form.shares ? parseFloat(form.shares) : null,
        brokerId: form.brokerId !== '' ? Number(form.brokerId) : null,
        notes: form.notes.trim() || null,
        currency: 'EUR',
      }
      if (editingId !== null) {
        await window.api.updateInvestment(editingId, payload)
      } else {
        await window.api.createInvestment(payload)
      }
      closeForm()
      await reloadInvestments()
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await window.api.deleteInvestment(deleteTarget.id)
      setDeleteTarget(null)
      await reloadInvestments()
    } catch (e: any) {
      setDeleteTarget(null)
      setError(e?.message ?? 'Failed to delete investment')
    }
  }

  // â”€â”€ Portfolio summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const totalIn = investments.reduce((s, i) => s + parseFloat(i.amountIn), 0)
  const totalCurrent = investments.reduce((s, i) => s + parseFloat(i.currentValue), 0)
  const portfolioPnL = calcPnL(totalIn, totalCurrent)

  const hasHistory = priceHistory.length >= 2

  const [typeFilter, setTypeFilter] = useState<number | null>(null)
  const [typeOrder, setTypeOrder] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('investmentTypeOrder') ?? '[]') } catch { return [] }
  })
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  // Sort type groups: stored order first, then any new types appended at end
  const sortedTypes = useMemo(() => {
    const withInvestments = types.filter(t => investments.some(i => i.typeId === t.id))
    const ordered = [...typeOrder.filter(id => withInvestments.some(t => t.id === id))
      .map(id => withInvestments.find(t => t.id === id)!)]
    const remaining = withInvestments.filter(t => !typeOrder.includes(t.id))
    return [...ordered, ...remaining]
  }, [types, investments, typeOrder])

  function saveOrder(order: number[]) {
    setTypeOrder(order)
    localStorage.setItem('investmentTypeOrder', JSON.stringify(order))
  }

  function handleDragStart(e: React.DragEvent, id: number) {
    e.dataTransfer.setData('text/plain', String(id))
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(e: React.DragEvent, targetId: number) {
    e.preventDefault()
    const draggedId = Number(e.dataTransfer.getData('text/plain'))
    if (draggedId === targetId) return
    const ids = sortedTypes.map(t => t.id)
    const from = ids.indexOf(draggedId)
    const to   = ids.indexOf(targetId)
    if (from === -1 || to === -1) return
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, draggedId)
    saveOrder(next)
    setDragOverId(null)
  }

  // Group by type, respecting custom order and active filter
  const byType = sortedTypes
    .map(t => ({ type: t, items: investments.filter(i => i.typeId === t.id) }))
    .filter(g => g.items.length > 0 && (typeFilter === null || g.type.id === typeFilter))

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Investments</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {investments.length} position{investments.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {investments.some(i => i.ticker) && (
            <button
              onClick={handleRefreshAll}
              disabled={refreshing}
              className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              title="Refresh prices from Yahoo Finance"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh prices
            </button>
          )}
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Plus size={15} /> Add investment
          </button>
        </div>
      </div>

      {refreshMsg && (
        <div className="mb-4 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 flex justify-between">
          {refreshMsg}
          <button onClick={() => setRefreshMsg(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 ml-4">âœ•</button>
        </div>
      )}

      {/* Portfolio summary card */}
      {investments.length > 0 && (
        <div className="bg-slate-900 text-white rounded-2xl p-5 mb-6 grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Total invested</p>
            <p className="text-xl font-semibold">{fmt(totalIn)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Current value</p>
            <p className="text-xl font-semibold">{fmt(totalCurrent)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Gain / Loss</p>
            <p className={`text-xl font-semibold ${portfolioPnL.absolute >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmt(portfolioPnL.absolute)}
            </p>
            <p className={`text-xs mt-0.5 ${portfolioPnL.absolute >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {fmtPct(portfolioPnL.percentage)}
            </p>
          </div>
        </div>
      )}

      {/* Type filter pills — drag to reorder when All is selected */}
      {(sortedTypes.length > 1 || typeFilter !== null) && (
        <div className="flex gap-1.5 mb-4 flex-wrap items-center">
          <button
            onClick={() => setTypeFilter(null)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${typeFilter === null ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            All
          </button>
          {sortedTypes.map(t => {
            const active  = typeFilter === t.id
            const isOver  = dragOverId === t.id
            return (
              <button
                key={t.id}
                draggable={typeFilter === null}
                onClick={() => setTypeFilter(active ? null : t.id)}
                onDragStart={e => handleDragStart(e, t.id)}
                onDragOver={e => { e.preventDefault(); setDragOverId(t.id) }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={e => handleDrop(e, t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-all select-none
                  ${active ? 'text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}
                  ${typeFilter === null ? 'cursor-grab active:cursor-grabbing' : ''}
                  ${isOver && !active ? 'ring-2 ring-slate-400 dark:ring-slate-500 scale-105' : ''}
                `}
                style={active ? { backgroundColor: t.color ?? '#64748b' } : undefined}
                title={typeFilter === null ? 'Drag to reorder' : undefined}
              >
                {typeFilter === null && <span className="text-slate-400 dark:text-slate-500 mr-0.5 text-xs">â ¿</span>}
                <AccountIcon icon={t.icon} size={11} />
                {t.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Portfolio value history chart */}
      {hasHistory && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Portfolio value over time</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            {(() => {
              const first = priceHistory[0]?.date
              const last  = priceHistory[priceHistory.length - 1]?.date
              if (!first || !last) return 'Updated each time you refresh prices'
              const fmt = (d: string) => { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }
              return first === last
                ? `${fmt(first)} — refresh prices to build history`
                : `${fmt(first)} → ${fmt(last)}`
            })()}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={priceHistory}>
              <defs>
                <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={d => { const p = d.split('-'); return `${p[2]}/${p[1]}` }} />
              <YAxis tickFormatter={v => `€${(v/1000).toFixed(1)}k`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
              <Tooltip
                formatter={(v: number) => [v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }), 'Portfolio value']}
                labelFormatter={d => { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f1f5f9' }}
              />
              <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#portfolioGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Empty state */}
      {investments.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No investments yet. Add one to start tracking.</p>
        </div>
      )}

      {/* Grouped list */}
      <div className="flex flex-col gap-6">
        {byType.map(({ type, items }) => {
          const groupIn = items.reduce((s, i) => s + parseFloat(i.amountIn), 0)
          const groupCurrent = items.reduce((s, i) => s + parseFloat(i.currentValue), 0)
          const groupPnL = calcPnL(groupIn, groupCurrent)

          return (
            <div key={type.id}>
              {/* Group header */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: type.color ?? '#64748b' }}
                >
                  <AccountIcon icon={type.icon} size={13} />
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{type.name}</p>
                <span className={`ml-auto text-xs font-medium ${groupPnL.absolute >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {fmtPct(groupPnL.percentage)}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((inv) => {
                  const pnl = calcPnL(inv.amountIn, inv.currentValue)
                  return (
                    <div key={inv.id} className="group">
                    <div className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{inv.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          {inv.broker && (
                            <span className="flex items-center gap-1">
                              <AccountIcon icon={inv.broker.icon} size={10} />
                              {inv.broker.name}
                            </span>
                          )}
                          {inv.isin && (
                            <span className="font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded text-xs">{inv.isin}</span>
                          )}
                          {inv.ticker && (
                            <span className="font-mono bg-slate-900 text-white px-1.5 py-0.5 rounded text-xs">{inv.ticker}</span>
                          )}
                          {inv.shares && (
                            <span>{parseFloat(inv.shares)} shares</span>
                          )}
                          {inv.priceUpdatedAt && (
                            <span className="text-slate-300 dark:text-slate-600">· updated {fmtDate(inv.priceUpdatedAt)}</span>
                          )}
                          {inv.currency && inv.currency !== 'EUR' && (() => {
                            const r = exchangeRates.find(e => e.fromCurrency === inv.currency)
                            return r ? (
                              <span className="text-slate-300 dark:text-slate-600">
                                · 1 {r.fromCurrency} = €{parseFloat(r.rate).toFixed(4)}
                              </span>
                            ) : null
                          })()}
                        </p>
                      </div>

                      {/* Amounts */}
                      <div className="text-right text-xs text-slate-400 dark:text-slate-500 shrink-0">
                        <p>In: {fmt(parseFloat(inv.amountIn))}</p>
                      </div>

                      <div className="text-right shrink-0 min-w-[80px]">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {fmt(parseFloat(inv.currentValue))}
                        </p>
                        <p className={`text-xs mt-0.5 font-medium ${pnl.absolute >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {pnl.absolute >= 0 ? '+' : ''}{fmt(pnl.absolute)} ({fmtPct(pnl.percentage)})
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => setExpandedLotsId(expandedLotsId === inv.id ? null : inv.id)}
                          className={`p-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1 ${expandedLotsId === inv.id ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-400 dark:text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                          title="Purchase history"
                        >
                          <Plus size={12} />
                          {inv.lots?.length ?? 0}
                        </button>
                        <button
                          onClick={() => setExpandedSparklineId(expandedSparklineId === inv.id ? null : inv.id)}
                          className={`p-1.5 rounded-lg transition-colors ${expandedSparklineId === inv.id ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-400 dark:text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                          title="Price history"
                        >
                          <BarChart2 size={14} />
                        </button>
                        <button
                          onClick={() => openEdit(inv)}
                          className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(inv)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {expandedSparklineId === inv.id && <InvestmentSparkline investmentId={inv.id} />}
                    {expandedLotsId === inv.id && <LotPanel investment={inv} onRefresh={load} />}
                    </div>
                  )
                })}
              </div>
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
                {editingId !== null ? 'Edit investment' : 'New investment'}
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
                  placeholder="e.g. S&P 500 ETF"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
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
                  onChange={e => setForm({ ...form, typeId: Number(e.target.value) })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
                  required
                >
                  <option value="">Select type…</option>
                  {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Invested (€) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="1000"
                    value={form.amountIn}
                    onChange={e => setForm({ ...form, amountIn: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Current value (€) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="1200"
                    value={form.currentValue}
                    onChange={e => setForm({ ...form, currentValue: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              {/* ISIN lookup */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ISIN</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. IE00B4L5Y983"
                    value={form.isin}
                    onChange={e => setForm({ ...form, isin: e.target.value, ticker: '', isinResults: undefined as any })}
                    className="flex-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100 uppercase"
                    maxLength={12}
                  />
                  <button
                    type="button"
                    onClick={handleISINLookup}
                    disabled={isinLooking || !form.isin.trim()}
                    className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 shrink-0"
                  >
                    {isinLooking ? 'Looking up…' : 'Look up'}
                  </button>
                </div>
                {isinError && <p className="text-xs text-red-500 mt-1">{isinError}</p>}

                {/* Exchange picker */}
                {isinResults && isinResults.length > 0 && (
                  <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <p className="text-xs text-slate-500 dark:text-slate-400 px-3 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                      Select exchange for Yahoo Finance price feed:
                    </p>
                    {isinResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, ticker: r.yahooTicker, name: f.name || r.name }))
                          setIsinResults(null)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-50 dark:border-slate-800 last:border-0 flex items-center justify-between"
                      >
                        <span className="text-slate-700 dark:text-slate-300">{r.exchange}</span>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{r.yahooTicker}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ticker symbol</label>
                  <input
                    type="text"
                    placeholder="e.g. IWDA.AS"
                    value={form.ticker}
                    onChange={e => setForm({ ...form, ticker: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Shares / units</label>
                  <input
                    type="number"
                    min="0"
                    step="0.000001"
                    placeholder="10.5"
                    value={form.shares}
                    onChange={e => setForm({ ...form, shares: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">
                Enter ISIN to look up the ticker automatically, or type it manually.
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Broker</label>
                <select
                  value={form.brokerId}
                  onChange={e => setForm({ ...form, brokerId: e.target.value === '' ? '' : Number(e.target.value) })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
                >
                  <option value="">None</option>
                  {brokers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes…"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
                />
              </div>

              {/* Live P&L preview */}
              {form.amountIn && form.currentValue && (
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">P&L preview</span>
                  {(() => {
                    const pnl = calcPnL(form.amountIn, form.currentValue)
                    return (
                      <span className={`font-medium ${pnl.absolute >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {pnl.absolute >= 0 ? '+' : ''}{fmt(pnl.absolute)} ({fmtPct(pnl.percentage)})
                      </span>
                    )
                  })()}
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 mt-1">
                <button type="button" onClick={closeForm} className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-slate-900 text-white text-sm py-2 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50">
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
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Delete investment?</h2>
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

      <PerformancePanel investments={investments} />
      <SimulatorPanel />
    </div>
  )
}

// â”€â”€â”€ Add purchase modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AddLotModal({
  investment,
  onClose,
  onSave,
}: {
  investment: Investment
  onClose: () => void
  onSave: () => void
}) {
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [shares, setShares] = useState('')
  const [price, setPrice]   = useState(investment.lastPriceFetched ?? '')
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const totalCost = parseFloat(shares) > 0 && parseFloat(String(price)) > 0
    ? parseFloat(shares) * parseFloat(String(price))
    : null

  async function submit() {
    if (!shares || !price || !date) { setError('Date, shares and price are required.'); return }
    setSaving(true)
    try {
      await window.api.createLot({
        investmentId: investment.id,
        date,
        shares: parseFloat(shares),
        pricePerShare: parseFloat(String(price)),
        notes: notes.trim() || null,
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
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add purchase</h2>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">{investment.name}</p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Purchase date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Shares / units</label>
              <input type="number" min="0" step="0.000001" placeholder="0.000000" value={shares}
                onChange={e => setShares(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Price per share (€)</label>
              <input type="number" min="0" step="0.0001" placeholder="0.00" value={String(price)}
                onChange={e => setPrice(e.target.value)} className={inputCls} />
            </div>
          </div>
          {totalCost !== null && (
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2 flex justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Total cost</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{fmt(totalCost)}</span>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Notes (optional)</label>
            <input type="text" placeholder="e.g. Monthly DCA" value={notes}
              onChange={e => setNotes(e.target.value)} className={inputCls} />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Add purchase'}
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Sell modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SellLotModal({
  investment,
  onClose,
  onSave,
}: {
  investment: Investment
  onClose: () => void
  onSave: () => void
}) {
  const heldShares = parseFloat(investment.shares ?? '0')
  const avgCost    = calcAvgCostBasis(investment.lots?.filter(l => l.type === 'BUY') ?? [])
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [shares, setShares] = useState('')
  const [price, setPrice]   = useState(investment.lastPriceFetched ?? '')
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const shareNum = parseFloat(shares) || 0
  const priceNum = parseFloat(String(price)) || 0
  const proceeds  = shareNum > 0 && priceNum > 0 ? shareNum * priceNum : null
  const costBasis = shareNum > 0 && avgCost ? shareNum * avgCost : null
  const realizedGain = proceeds !== null && costBasis !== null ? proceeds - costBasis : null

  async function submit() {
    if (!shares || !price || !date) { setError('Date, shares and price are required.'); return }
    if (shareNum > heldShares) { setError(`Cannot sell more than ${heldShares.toFixed(6)} held shares.`); return }
    setSaving(true)
    try {
      await window.api.createSellLot({ investmentId: investment.id, date, shares: shareNum, pricePerShare: priceNum, notes: notes.trim() || null })
      onSave(); onClose()
    } catch (e: any) { setError(e.message ?? 'Failed to save') }
    finally { setSaving(false) }
  }

  const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Record sale</h2>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{investment.name}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          Holding {heldShares.toFixed(6).replace(/\.?0+$/, '')} shares
          {avgCost !== null && <> · avg cost {fmt(avgCost)}/share</>}
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Sale date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Shares to sell</label>
              <input type="number" min="0" step="0.000001" placeholder="0.000000" value={shares}
                onChange={e => setShares(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Sale price/share (€)</label>
              <input type="number" min="0" step="0.0001" placeholder="0.00" value={String(price)}
                onChange={e => setPrice(e.target.value)} className={inputCls} />
            </div>
          </div>
          {proceeds !== null && (
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2.5 flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Proceeds</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{fmt(proceeds)}</span>
              </div>
              {costBasis !== null && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Cost basis</span>
                  <span className="text-slate-600 dark:text-slate-400">{fmt(costBasis)}</span>
                </div>
              )}
              {realizedGain !== null && (
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 mt-0.5">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Realized gain</span>
                  <span className={`font-semibold ${realizedGain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {realizedGain >= 0 ? '+' : ''}{fmt(realizedGain)}
                  </span>
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Notes (optional)</label>
            <input type="text" placeholder="e.g. Rebalancing" value={notes}
              onChange={e => setNotes(e.target.value)} className={inputCls} />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Record sale'}
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€ Lot history panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function LotPanel({
  investment,
  onRefresh,
}: {
  investment: Investment
  onRefresh: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [showSell, setShowSell] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const lots = investment.lots ?? []
  const buys  = lots.filter(l => l.type === 'BUY')
  const sells = lots.filter(l => l.type === 'SELL')
  const totalRealizedGain = sells.reduce((s, l) => s + parseFloat(l.realizedGain ?? '0'), 0)

  const currentPricePerShare = investment.lastPriceFetched
    ? parseFloat(String(investment.lastPriceFetched))
    : investment.shares && parseFloat(investment.shares) > 0
      ? parseFloat(investment.currentValue) / parseFloat(investment.shares)
      : null

  const avgCost = calcAvgCostBasis(buys)
  const heldShares = parseFloat(investment.shares ?? '0')

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await window.api.deleteLot(id)
      onRefresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {showAdd  && <AddLotModal investment={investment} onClose={() => setShowAdd(false)} onSave={onRefresh} />}
      {showSell && <SellLotModal investment={investment} onClose={() => setShowSell(false)} onSave={onRefresh} />}

      <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500 flex-wrap">
            {avgCost !== null && <span>Avg cost <span className="text-slate-600 dark:text-slate-300 font-medium">{fmt(avgCost)}/share</span></span>}
            {heldShares > 0 && <span>{heldShares.toFixed(6).replace(/\.?0+$/, '')} held</span>}
            {sells.length > 0 && (
              <span className={totalRealizedGain >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                {totalRealizedGain >= 0 ? '+' : ''}{fmt(totalRealizedGain)} realized
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            {heldShares > 0 && (
              <button onClick={() => setShowSell(true)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                Sell
              </button>
            )}
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors">
              <Plus size={11} /> Buy
            </button>
          </div>
        </div>

        {lots.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            No purchases recorded. Add your first purchase to start tracking cost basis.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
                <th className="text-left pb-1.5 w-8" />
                <th className="text-left pb-1.5">Date</th>
                <th className="text-right pb-1.5">Shares</th>
                <th className="text-right pb-1.5">Price/share</th>
                <th className="text-right pb-1.5">Amount</th>
                <th className="text-right pb-1.5">Gain / Realized</th>
                <th className="pb-1.5" />
              </tr>
            </thead>
            <tbody>
              {lots.map(lot => {
                const isBuy  = lot.type === 'BUY'
                const lotGain = isBuy && currentPricePerShare !== null
                  ? calcLotGain(lot, currentPricePerShare)
                  : null
                const realized = !isBuy && lot.realizedGain !== null
                  ? parseFloat(lot.realizedGain)
                  : null
                return (
                  <tr key={lot.id} className="border-b border-slate-50 dark:border-slate-800 group hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="py-1.5">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${isBuy ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {isBuy ? 'B' : 'S'}
                      </span>
                    </td>
                    <td className="py-1.5 text-slate-600 dark:text-slate-400">
                      {new Date(lot.date).toLocaleDateString('pt-PT')}
                      {lot.notes && <span className="ml-2 text-slate-400 dark:text-slate-500 italic truncate max-w-[80px] inline-block align-bottom" title={lot.notes}>· {lot.notes}</span>}
                    </td>
                    <td className="py-1.5 text-right text-slate-700 dark:text-slate-300 font-mono">
                      {parseFloat(lot.shares).toFixed(6).replace(/\.?0+$/, '')}
                    </td>
                    <td className="py-1.5 text-right text-slate-600 dark:text-slate-400">{fmt(parseFloat(lot.pricePerShare))}</td>
                    <td className="py-1.5 text-right text-slate-700 dark:text-slate-300 font-medium">
                      {isBuy ? '' : '+'}{fmt(parseFloat(lot.totalCost))}
                    </td>
                    <td className="py-1.5 text-right">
                      {lotGain !== null && (
                        <span className={`font-medium ${lotGain.absolute >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {lotGain.absolute >= 0 ? '+' : ''}{fmt(lotGain.absolute)}
                          <span className="text-xs opacity-70 ml-1">({fmtPct(lotGain.percentage)})</span>
                        </span>
                      )}
                      {realized !== null && (
                        <span className={`font-medium ${realized >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {realized >= 0 ? '+' : ''}{fmt(realized)}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => handleDelete(lot.id)} disabled={deletingId === lot.id}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 dark:text-slate-600 hover:text-red-400 transition-opacity disabled:opacity-50">
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {lots.length > 1 && (
              <tfoot>
                <tr className="border-t border-slate-200 dark:border-slate-700 font-medium">
                  <td className="pt-1.5 text-slate-500 dark:text-slate-400">Total</td>
                  <td className="pt-1.5 text-right text-slate-700 dark:text-slate-300 font-mono">
                    {lots.reduce((s, l) => s + parseFloat(l.shares), 0).toFixed(6).replace(/\.?0+$/, '')}
                  </td>
                  <td className="pt-1.5 text-right text-slate-400 dark:text-slate-500 text-xs">
                    {avgCost !== null ? `avg ${fmt(avgCost)}` : ''}
                  </td>
                  <td className="pt-1.5 text-right text-slate-700 dark:text-slate-300">
                    {fmt(lots.reduce((s, l) => s + parseFloat(l.totalCost), 0))}
                  </td>
                  {currentPricePerShare !== null && <>
                    <td className="pt-1.5 text-right text-slate-700 dark:text-slate-300">{fmt(parseFloat(investment.currentValue))}</td>
                    <td className={`pt-1.5 text-right font-medium ${parseFloat(investment.currentValue) >= lots.reduce((s,l) => s+parseFloat(l.totalCost),0) ? 'text-emerald-600' : 'text-red-500'}`}>
                      {(() => {
                        const totalCost = lots.reduce((s, l) => s + parseFloat(l.totalCost), 0)
                        const gain = parseFloat(investment.currentValue) - totalCost
                        return `${gain >= 0 ? '+' : ''}${fmt(gain)}`
                      })()}
                    </td>
                  </>}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </>
  )
}

// â”€â”€â”€ Per-investment sparkline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function InvestmentSparkline({ investmentId }: { investmentId: number }) {
  const [data, setData] = useState<Array<{ date: string; value: number }> | null>(null)

  useEffect(() => {
    window.api.getInvestmentPriceHistoryById(investmentId).then(setData)
  }, [investmentId])

  if (data === null) return <p className="text-xs text-slate-400 py-3 text-center">Loading…</p>
  if (data.length < 2) return (
    <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center">
      Price history will appear after prices have been refreshed at least twice.
    </p>
  )

  const min = Math.min(...data.map(d => d.value))
  const max = Math.max(...data.map(d => d.value))
  const isPositive = data[data.length - 1].value >= data[0].value

  return (
    <div className="px-4 pb-3">
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sg-${investmentId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0.25} />
              <stop offset="95%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false}
            tickFormatter={d => { const p = d.split('-'); return `${p[2]}/${p[1]}` }}
            interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={44}
            tickFormatter={v => `€${(v/1000).toFixed(1)}k`}
            domain={[Math.floor(min * 0.97), Math.ceil(max * 1.03)]} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f1f5f9' }}
            formatter={(v: number) => [v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }), 'Value']}
            labelFormatter={d => { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }}
          />
          <Area type="monotone" dataKey="value"
            stroke={isPositive ? '#10b981' : '#ef4444'} strokeWidth={1.5}
            fill={`url(#sg-${investmentId})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// â”€â”€â”€ Performance panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SortKey = 'pct' | 'absolute' | 'cagr' | 'days' | 'value'

function PerformancePanel({ investments }: { investments: Investment[] }) {
  const [open, setOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('pct')
  const [asc, setAsc] = useState(false)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc(v => !v)
    else { setSortKey(key); setAsc(false) }
  }

  const rows = useMemo(() => {
    return investments.map(inv => {
      const pnl = calcPnL(inv.amountIn, inv.currentValue)
      const firstLotDate = inv.lots?.[0]?.date ?? inv.createdAt
      const cagr = calcCAGR(inv.amountIn, inv.currentValue, firstLotDate)
      const days = daysHeld(firstLotDate)
      return { inv, pnl, cagr, days }
    }).sort((a, b) => {
      let va = 0, vb = 0
      if (sortKey === 'pct')      { va = a.pnl.percentage; vb = b.pnl.percentage }
      if (sortKey === 'absolute') { va = a.pnl.absolute;   vb = b.pnl.absolute }
      if (sortKey === 'cagr')     { va = a.cagr ?? -Infinity; vb = b.cagr ?? -Infinity }
      if (sortKey === 'days')     { va = a.days; vb = b.days }
      if (sortKey === 'value')    { va = parseFloat(a.inv.currentValue); vb = parseFloat(b.inv.currentValue) }
      return asc ? va - vb : vb - va
    })
  }, [investments, sortKey, asc])

  if (investments.length === 0) return null

  const best  = [...rows].sort((a, b) => b.pnl.percentage - a.pnl.percentage)[0]
  const worst = [...rows].sort((a, b) => a.pnl.percentage - b.pnl.percentage)[0]

  function SortBtn({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col
    return (
      <button onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 text-right justify-end hover:text-slate-700 dark:hover:text-slate-300 transition-colors ${active ? 'text-slate-700 dark:text-slate-300 font-semibold' : 'text-slate-400 dark:text-slate-500'}`}>
        {label}
        <ArrowUpDown size={10} className={active ? 'opacity-100' : 'opacity-40'} />
      </button>
    )
  }

  return (
    <div className="mt-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <BarChart2 size={16} className="text-slate-400 dark:text-slate-500" />
          Performance breakdown
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          {/* Best / worst badges */}
          <div className="flex gap-3 px-5 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
            <div className="flex-1 text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Best performer</p>
              <p className="text-sm font-semibold text-emerald-600">{best.inv.name}</p>
              <p className="text-xs text-emerald-500">{fmtPct(best.pnl.percentage)}</p>
            </div>
            {rows.length > 1 && (
              <div className="flex-1 text-center border-l border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Worst performer</p>
                <p className="text-sm font-semibold text-red-500">{worst.inv.name}</p>
                <p className="text-xs text-red-400">{fmtPct(worst.pnl.percentage)}</p>
              </div>
            )}
          </div>

          {/* Sortable table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 px-5">
                  <th className="text-left py-2.5 pl-5 text-slate-400 dark:text-slate-500 font-normal">#</th>
                  <th className="text-left py-2.5 text-slate-400 dark:text-slate-500 font-normal">Name</th>
                  <th className="py-2.5 pr-4 text-slate-400 dark:text-slate-500 font-normal text-right">Invested</th>
                  <th className="py-2.5 pr-4 font-normal"><SortBtn col="value" label="Value" /></th>
                  <th className="py-2.5 pr-4 font-normal"><SortBtn col="absolute" label="Gain €" /></th>
                  <th className="py-2.5 pr-4 font-normal"><SortBtn col="pct" label="Gain %" /></th>
                  <th className="py-2.5 pr-4 font-normal"><SortBtn col="cagr" label="CAGR" /></th>
                  <th className="py-2.5 pr-5 font-normal"><SortBtn col="days" label="Days held" /></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ inv, pnl, cagr, days }, i) => (
                  <tr key={inv.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="py-2 pl-5 text-slate-300 dark:text-slate-600">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-200 max-w-[140px] truncate">{inv.name}</td>
                    <td className="py-2 pr-4 text-right text-slate-400 dark:text-slate-500">{fmt(parseFloat(inv.amountIn))}</td>
                    <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300 font-medium">{fmt(parseFloat(inv.currentValue))}</td>
                    <td className={`py-2 pr-4 text-right font-medium ${pnl.absolute >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {pnl.absolute >= 0 ? '+' : ''}{fmt(pnl.absolute)}
                    </td>
                    <td className={`py-2 pr-4 text-right font-medium ${pnl.percentage >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {fmtPct(pnl.percentage)}
                    </td>
                    <td className={`py-2 pr-4 text-right ${cagr === null ? 'text-slate-300 dark:text-slate-600' : cagr >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {fmtCAGR(cagr)}
                    </td>
                    <td className="py-2 pr-5 text-right text-slate-500 dark:text-slate-400">{days}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// â”€â”€â”€ Simulator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SimulatorPanel() {
  const [open, setOpen] = useState(false)
  const [monthly, setMonthly] = useState('200')
  const [roi, setRoi] = useState('7')
  const [dividends, setDividends] = useState('2')
  const [years, setYears] = useState('20')
  const [reinvest, setReinvest] = useState(true)
  const [growthType, setGrowthType] = useState<'none' | 'percentage' | 'fixed'>('none')
  const [growthValue, setGrowthValue] = useState('5')
  const [showTable, setShowTable] = useState(false)

  const result = useMemo(() => {
    const m = parseFloat(monthly) || 0
    const r = parseFloat(roi) || 0
    const d = parseFloat(dividends) || 0
    const y = parseInt(years) || 1
    if (!m && !r && !d) return null
    return simulate({
      monthlyContribution: m, annualROI: r, annualDividendYield: d,
      years: y, reinvestDividends: reinvest,
      contributionGrowthType: growthType,
      contributionGrowthValue: parseFloat(growthValue) || 0,
    })
  }, [monthly, roi, dividends, years, reinvest, growthType, growthValue])

  return (
    <div className="mt-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <FlaskConical size={16} className="text-slate-400 dark:text-slate-500" />
          Investment Simulator
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400 dark:text-slate-500" /> : <ChevronDown size={16} className="text-slate-400 dark:text-slate-500" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-800">
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-3 mt-4 mb-5">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Monthly investment (€)</label>
              <input type="number" min="0" step="10" value={monthly}
                onChange={e => setMonthly(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Annual ROI (%)</label>
              <input type="number" min="0" step="0.5" value={roi}
                onChange={e => setRoi(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Dividend yield (%)</label>
              <input type="number" min="0" step="0.5" value={dividends}
                onChange={e => setDividends(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Years in market</label>
              <input type="number" min="1" max="50" step="1" value={years}
                onChange={e => setYears(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 dark:bg-slate-800 dark:text-slate-100" />
            </div>
          </div>

          {/* Contribution growth */}
          <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-3 mb-1 flex flex-col gap-3">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Annual contribution increase</p>
            <div className="flex gap-2">
              {(['none', 'percentage', 'fixed'] as const).map(t => (
                <button key={t} type="button" onClick={() => setGrowthType(t)}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${growthType === t ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'}`}>
                  {t === 'none' ? 'None' : t === 'percentage' ? 'Percentage' : 'Fixed (€)'}
                </button>
              ))}
            </div>
            {growthType !== 'none' && (
              <div className="flex items-center gap-2">
                <input type="number" min="0" step={growthType === 'percentage' ? '0.5' : '10'}
                  value={growthValue} onChange={e => setGrowthValue(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                  {growthType === 'percentage' ? '% per year' : '€ per year'}
                </span>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-5 cursor-pointer select-none">
            <input type="checkbox" checked={reinvest} onChange={e => setReinvest(e.target.checked)}
              className="rounded border-slate-300" />
            Reinvest dividends (DRIP)
          </label>

          {/* Results */}
          {result && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Total invested', value: fmt(result.totalInvested), color: 'text-slate-900 dark:text-slate-100' },
                  { label: 'Final portfolio value', value: fmt(result.finalValue), color: 'text-slate-900 dark:text-slate-100 font-semibold' },
                  { label: 'Capital gains', value: fmt(result.totalGains), color: 'text-emerald-600' },
                  { label: 'Total dividends', value: fmt(result.totalDividends), color: 'text-emerald-600' },
                  { label: 'Grand total', value: fmt(result.grandTotal), color: 'text-emerald-700 font-semibold' },
                  { label: 'Multiple on invested', value: `${(result.grandTotal / result.totalInvested).toFixed(2)}×`, color: 'text-slate-700 dark:text-slate-300' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-900 rounded-xl px-4 py-3">
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
                    <p className={`text-sm ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Year-by-year table toggle */}
              <button onClick={() => setShowTable(v => !v)}
                className="text-xs text-slate-400 hover:text-slate-700 mb-3 flex items-center gap-1">
                {showTable ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showTable ? 'Hide' : 'Show'} year-by-year breakdown
              </button>

              {showTable && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                        <th className="text-left py-1.5 pr-3">Year</th>
                        <th className="text-right py-1.5 pr-3">Monthly</th>
                        <th className="text-right py-1.5 pr-3">Invested</th>
                        <th className="text-right py-1.5 pr-3">Portfolio</th>
                        <th className="text-right py-1.5 pr-3">Dividends/yr</th>
                        <th className="text-right py-1.5">Total dividends</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.snapshots.map(s => (
                        <tr key={s.year} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700">
                          <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-400">{s.year}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-500 dark:text-slate-400">{fmt(s.monthlyContribution)}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-500 dark:text-slate-400">{fmt(s.totalInvested)}</td>
                          <td className="py-1.5 pr-3 text-right font-medium text-slate-800 dark:text-slate-200">{fmt(s.portfolioValue)}</td>
                          <td className="py-1.5 pr-3 text-right text-emerald-600">{fmt(s.yearDividends)}</td>
                          <td className="py-1.5 text-right text-emerald-600">{fmt(s.totalDividends)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
