import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, AreaChart, Area,
} from 'recharts'
import { Download } from 'lucide-react'
import { calcMonthlyBreakdown, calcCumulativeBalance, calcCategoryBreakdown, calcCategoryTrends, type CategoryTrendPoint } from '../utils/reportingStats'
import { buildNetWorthHistory } from '../utils/netWorthHistory'
import { resolveRange } from '../utils/reportRange'

const RANGE_OPTIONS = [
  { label: '3 months',  value: 3  },
  { label: '6 months',  value: 6  },
  { label: '12 months', value: 12 },
  { label: '2 years',   value: 24 },
]


function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 1000) return `€${(n / 1000).toFixed(1)}k`
  return `€${Math.round(n)}`
}

// ─── Spending trends chart ────────────────────────────────────────────────────

function SpendingTrendsChart({
  series,
  categories,
  fmt,
  fmtShort,
}: {
  series: CategoryTrendPoint[]
  categories: Array<{ name: string; color: string }>
  fmt: (n: number) => string
  fmtShort: (n: number) => string
}) {
  const [mode, setMode] = useState<'line' | 'bar'>('line')
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const toggle = useCallback((name: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const visible = categories.filter(c => !hidden.has(c.name))
  const tooltipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f1f5f9' }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Spending trends by category</p>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
          {(['line', 'bar'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${mode === m ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              {m === 'line' ? 'Line' : 'Bar'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Monthly expense per category · click legend to hide</p>

      <ResponsiveContainer width="100%" height={240}>
        {mode === 'line' ? (
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #f1f5f9)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip contentStyle={tooltipStyle}
              formatter={(v: number, name: string) => [fmt(v), name]} />
            {visible.map(c => (
              <Line key={c.name} type="monotone" dataKey={c.name}
                stroke={c.color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={series} barCategoryGap="25%">
            <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip contentStyle={tooltipStyle}
              formatter={(v: number, name: string) => [fmt(v), name]} />
            {visible.map(c => (
              <Bar key={c.name} dataKey={c.name} stackId="a"
                fill={c.color} radius={visible[visible.length - 1].name === c.name ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>

      {/* Legend with toggle */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
        {categories.map(c => (
          <button key={c.name} onClick={() => toggle(c.name)}
            className={`flex items-center gap-1.5 text-xs transition-opacity ${hidden.has(c.name) ? 'opacity-30' : 'opacity-100'}`}>
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
            <span className="text-slate-600 dark:text-slate-400">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Tax tab ──────────────────────────────────────────────────────────────────

// Categories whose names suggest IRS deductibility in Portugal.
const DEDUCTIBLE_HINTS: Record<string, string> = {
  saúde: 'Saúde (15% dedutível)',
  saude: 'Saúde (15% dedutível)',
  health: 'Saúde (15% dedutível)',
  educação: 'Educação (30% dedutível)',
  educacao: 'Educação (30% dedutível)',
  education: 'Educação (30% dedutível)',
  habitação: 'Habitação',
  habitacao: 'Habitação',
  housing: 'Habitação',
  restauração: 'Restauração (15% dedutível)',
  restauracao: 'Restauração (15% dedutível)',
  restaurant: 'Restauração (15% dedutível)',
  alojamento: 'Alojamento (15% dedutível)',
}

function deductibleHint(name: string): string | null {
  const key = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const [k, v] of Object.entries(DEDUCTIBLE_HINTS)) {
    if (key.includes(k)) return v
  }
  return null
}

function csvEscape(s: string | number | null | undefined): string {
  const str = String(s ?? '')
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str
}

function TaxTab({ transactions, investments }: {
  transactions: Transaction[]
  investments: Investment[]
}) {
  const currentYear = new Date().getFullYear()
  const years = useMemo(() => {
    const ys = new Set<number>()
    for (const t of transactions) ys.add(new Date(t.date).getFullYear())
    for (const inv of investments) for (const l of inv.lots) ys.add(new Date(l.date).getFullYear())
    const arr = Array.from(ys).sort((a, b) => b - a)
    if (!arr.includes(currentYear)) arr.unshift(currentYear)
    return arr
  }, [transactions, investments])

  const [year, setYear] = useState(currentYear)
  const [exporting, setExporting] = useState(false)

  const yearTxns = useMemo(
    () => transactions.filter(t => new Date(t.date).getFullYear() === year),
    [transactions, year]
  )

  // Capital gains: SELL lots in the selected year with realizedGain
  const capitalGains = useMemo(() => {
    const rows: Array<{ asset: string; date: string; cost: number; proceeds: number; gain: number }> = []
    for (const inv of investments) {
      for (const lot of inv.lots) {
        if (lot.type !== 'SELL') continue
        if (new Date(lot.date).getFullYear() !== year) continue
        const proceeds = Math.abs(Number(lot.totalCost))
        const gain = Number(lot.realizedGain ?? 0)
        const cost = proceeds - gain
        rows.push({ asset: inv.name, date: lot.date.slice(0, 10), cost, proceeds, gain })
      }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date))
  }, [investments, year])

  const totalGains = capitalGains.filter(r => r.gain > 0).reduce((s, r) => s + r.gain, 0)
  const totalLosses = capitalGains.filter(r => r.gain < 0).reduce((s, r) => s + r.gain, 0)
  const netGain = totalGains + totalLosses

  // Dividend income: CREDIT transactions whose category name includes 'dividend'
  const dividends = useMemo(() =>
    yearTxns.filter(t =>
      t.type === 'CREDIT' &&
      t.category?.name?.toLowerCase().includes('dividend')
    ).sort((a, b) => a.date.localeCompare(b.date))
  , [yearTxns])

  const totalDividends = dividends.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  // Expenses by category (for deductions review)
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; total: number; hint: string | null }>()
    for (const t of yearTxns) {
      if (t.type !== 'DEBIT' || !t.category || t.category.type !== 'EXPENSE') continue
      const key = t.category.name
      const existing = map.get(key) ?? { name: key, color: t.category.color, total: 0, hint: deductibleHint(key) }
      existing.total += Math.abs(Number(t.amount))
      map.set(key, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [yearTxns])

  // Income summary
  const totalIncome = yearTxns.filter(t => t.type === 'CREDIT').reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const totalExpenses = yearTxns.filter(t => t.type === 'DEBIT').reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  async function exportCSV() {
    const filePath = await window.api.exportSavePath(
      `tax_${year}.csv`,
      [{ name: 'CSV', extensions: ['csv'] }],
    )
    if (!filePath) return
    setExporting(true)
    try {
      const lines: string[] = []

      lines.push(`Finance Tax Summary - ${year}`)
      lines.push(`Exported,${new Date().toISOString().slice(0, 10)}`)
      lines.push('')

      lines.push('INCOME SUMMARY')
      lines.push(`Total Income,${totalIncome.toFixed(2)}`)
      lines.push(`Total Expenses,${totalExpenses.toFixed(2)}`)
      lines.push(`Net,${(totalIncome - totalExpenses).toFixed(2)}`)
      lines.push('')

      lines.push('CAPITAL GAINS (Categoria G)')
      lines.push('Asset,Date,Cost Basis,Proceeds,Gain/Loss')
      for (const r of capitalGains) {
        lines.push([csvEscape(r.asset), r.date, r.cost.toFixed(2), r.proceeds.toFixed(2), r.gain.toFixed(2)].join(','))
      }
      lines.push(`,,,,Net gain: ${netGain.toFixed(2)}`)
      lines.push('')

      lines.push('DIVIDEND INCOME (Categoria E)')
      lines.push('Date,Description,Category,Amount')
      for (const t of dividends) {
        lines.push([t.date.slice(0, 10), csvEscape(t.description), csvEscape(t.category?.name ?? ''), Math.abs(Number(t.amount)).toFixed(2)].join(','))
      }
      lines.push(`Total dividends: ${totalDividends.toFixed(2)}`)
      lines.push('')

      lines.push('EXPENSES BY CATEGORY')
      lines.push('Category,Total,IRS Note')
      for (const c of expensesByCategory) {
        lines.push([csvEscape(c.name), c.total.toFixed(2), csvEscape(c.hint ?? '')].join(','))
      }

      await window.api.exportWriteFile(filePath, lines.join('\n'))
    } finally {
      setExporting(false)
    }
  }

  const sectionCls = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4'
  const thCls = 'text-left pb-2 text-xs text-slate-400 dark:text-slate-500 font-medium'
  const tdCls = 'py-1.5 text-xs text-slate-600 dark:text-slate-400'

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">Tax year</span>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button
          onClick={exportCSV}
          disabled={exporting}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-medium hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {/* Income summary */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Income summary — {year}</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Total income</p>
            <p className="text-base font-semibold text-emerald-600">{fmt(totalIncome)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Total expenses</p>
            <p className="text-base font-semibold text-red-500">{fmt(totalExpenses)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Net</p>
            <p className={`text-base font-semibold ${totalIncome - totalExpenses >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {fmt(totalIncome - totalExpenses)}
            </p>
          </div>
        </div>
      </div>

      {/* Capital gains */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Capital gains — Categoria G</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Realized gains from investment sell lots</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 dark:text-slate-500">Net gain</p>
            <p className={`text-base font-semibold ${netGain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(netGain)}</p>
          </div>
        </div>
        {capitalGains.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No investment sells recorded in {year}.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className={thCls}>Asset</th>
                    <th className={`${thCls} text-right`}>Sell date</th>
                    <th className={`${thCls} text-right`}>Cost basis</th>
                    <th className={`${thCls} text-right`}>Proceeds</th>
                    <th className={`${thCls} text-right`}>Gain / Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {capitalGains.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-800">
                      <td className={tdCls}>{r.asset}</td>
                      <td className={`${tdCls} text-right`}>{r.date}</td>
                      <td className={`${tdCls} text-right`}>{fmt(r.cost)}</td>
                      <td className={`${tdCls} text-right`}>{fmt(r.proceeds)}</td>
                      <td className={`${tdCls} text-right font-medium ${r.gain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {r.gain >= 0 ? '+' : ''}{fmt(r.gain)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-6 mt-3 text-xs">
              <span className="text-emerald-600">Gains: {fmt(totalGains)}</span>
              <span className="text-red-500">Losses: {fmt(Math.abs(totalLosses))}</span>
              <span className={`font-semibold ${netGain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>Net: {fmt(netGain)}</span>
            </div>
          </>
        )}
      </div>

      {/* Dividends */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Dividend income — Categoria E</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Transactions categorised as "Dividend"</p>
          </div>
          <p className="text-base font-semibold text-emerald-600">{fmt(totalDividends)}</p>
        </div>
        {dividends.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No dividend transactions in {year}. Tag transactions with a "Dividend" category to see them here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  <th className={thCls}>Date</th>
                  <th className={thCls}>Description</th>
                  <th className={`${thCls} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map(t => (
                  <tr key={t.id} className="border-b border-slate-50 dark:border-slate-800">
                    <td className={tdCls}>{t.date.slice(0, 10)}</td>
                    <td className={tdCls}>{t.description}</td>
                    <td className={`${tdCls} text-right font-medium text-emerald-600`}>{fmt(Math.abs(Number(t.amount)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expenses by category */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Expenses by category</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Review for potential IRS deductions (Portugal)</p>
        {expensesByCategory.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No categorised expenses in {year}.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <th className={thCls}>Category</th>
                <th className={`${thCls} text-right`}>Total</th>
                <th className={thCls}>IRS note</th>
              </tr>
            </thead>
            <tbody>
              {expensesByCategory.map(c => (
                <tr key={c.name} className="border-b border-slate-50 dark:border-slate-800">
                  <td className={tdCls}>
                    <span className="flex items-center gap-1.5">
                      {c.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />}
                      {c.name}
                    </span>
                  </td>
                  <td className={`${tdCls} text-right font-medium`}>{fmt(c.total)}</td>
                  <td className={tdCls}>
                    {c.hint && <span className="text-emerald-600 dark:text-emerald-400">{c.hint}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [tab, setTab] = useState<'overview' | 'tax'>('overview')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [priceHistory, setPriceHistory] = useState<Array<{ date: string; value: number }>>([])
  const [rangeMode, setRangeMode] = useState<'preset' | 'custom'>('preset')
  const [preset, setPreset] = useState(6)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    Promise.all([
      window.api.listTransactions(),
      window.api.getInvestmentPriceHistory(),
      window.api.listInvestments(),
    ]).then(([txns, hist, invs]) => {
      setTransactions(txns)
      setPriceHistory(hist)
      setInvestments(invs)
    }).catch(() => {
      // data stays empty — charts render with no data rather than hanging
    })
  }, [])

  const { from, to, months } = useMemo(
    () => resolveRange(rangeMode, preset, customFrom, customTo),
    [rangeMode, preset, customFrom, customTo]
  )

  // Filter transactions to the effective range before passing to utilities
  const rangedTxns = useMemo(
    () => transactions.filter(t => { const d = new Date(t.date); return d >= from && d <= to }),
    [transactions, from, to]
  )

  const netWorthHistory = useMemo(() => buildNetWorthHistory(transactions, priceHistory), [transactions, priceHistory])
  const breakdown       = useMemo(() => calcMonthlyBreakdown(rangedTxns, months), [rangedTxns, months])
  const cumulative      = useMemo(() => calcCumulativeBalance(breakdown), [breakdown])
  const categoryBreakdown = useMemo(() => calcCategoryBreakdown(rangedTxns, months), [rangedTxns, months])
  const categoryTrends    = useMemo(() => calcCategoryTrends(rangedTxns, months), [rangedTxns, months])

  const totalIncome   = breakdown.reduce((s, b) => s + b.income, 0)
  const totalExpenses = breakdown.reduce((s, b) => s + b.expenses, 0)
  const totalNet      = totalIncome - totalExpenses
  const avgMonthly    = totalExpenses / Math.max(1, months)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Reports</h1>
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {(['overview', 'tax'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors capitalize ${
                  tab === t
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100 font-medium'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}>
                {t === 'tax' ? 'Tax' : 'Overview'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {RANGE_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => { setRangeMode('preset'); setPreset(o.value) }}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  rangeMode === 'preset' && preset === o.value
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100 font-medium'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {o.label}
              </button>
            ))}
            <button
              onClick={() => {
                setRangeMode('custom')
                if (!customFrom) setCustomFrom(new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().slice(0, 10))
                if (!customTo)   setCustomTo(new Date().toISOString().slice(0, 10))
              }}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                rangeMode === 'custom'
                  ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100 font-medium'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Custom
            </button>
          </div>

          {tab === 'overview' && rangeMode === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400" />
              <span className="text-slate-400 text-xs">→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total income',    value: fmt(totalIncome),   color: 'text-emerald-600' },
          { label: 'Total expenses',  value: fmt(totalExpenses), color: 'text-red-500' },
          { label: 'Net',             value: fmt(totalNet),      color: totalNet >= 0 ? 'text-emerald-600' : 'text-red-500' },
          { label: `Avg monthly spend`, value: fmt(avgMonthly), color: 'text-slate-700 dark:text-slate-300' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{label}</p>
            <p className={`text-lg font-semibold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Net worth over time */}
      {netWorthHistory.length >= 2 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Net worth over time</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            Account balances (from transactions) + investment portfolio value
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={netWorthHistory}>
              <defs>
                <linearGradient id="accountsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="investGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={d => { const p = d.split('-'); return `${p[2]}/${p[1]}` }}
                interval="preserveStartEnd" />
              <YAxis tickFormatter={v => `€${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f1f5f9' }}
                labelFormatter={d => { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }}
                formatter={(v: number, name: string) => [
                  v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }),
                  name === 'accounts' ? 'Accounts' : name === 'investments' ? 'Investments' : 'Total',
                ]}
              />
              <Area type="monotone" dataKey="accounts" stroke="#3b82f6" strokeWidth={1.5} fill="url(#accountsGrad)" dot={false} stackId="a" />
              <Area type="monotone" dataKey="investments" stroke="#10b981" strokeWidth={1.5} fill="url(#investGrad)" dot={false} stackId="a" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 justify-end">
            <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <span className="w-3 h-0.5 bg-blue-500 inline-block" /> Accounts
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Investments
            </span>
          </div>
        </div>
      )}

      {/* Income vs Expenses bar chart */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Income vs Expenses</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={breakdown} barCategoryGap="30%">
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              formatter={(v: number, name: string) => [fmt(v), name === 'income' ? 'Income' : 'Expenses']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f1f5f9' }}
            />
            <Legend formatter={v => v === 'income' ? 'Income' : 'Expenses'} iconType="circle" iconSize={8} />
            <Bar dataKey="income"   fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" fill="#f87171" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cumulative net balance line chart */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Cumulative net balance</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Running total of income minus expenses over the period</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={cumulative}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #f1f5f9)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              formatter={(v: number) => [fmt(v), 'Cumulative net']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f1f5f9' }}
            />
            <Line
              type="monotone" dataKey="cumulative" stroke="#94a3b8" strokeWidth={2}
              dot={false} activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Spending trends by category */}
      {categoryTrends.categories.length > 0 && (
        <SpendingTrendsChart series={categoryTrends.series} categories={categoryTrends.categories} fmt={fmt} fmtShort={fmtShort} />
      )}

      {/* Month-by-month table + category breakdown side by side */}
      <div className="grid grid-cols-2 gap-4">
        {/* Monthly table */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Month by month</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <th className="text-left pb-2">Month</th>
                <th className="text-right pb-2">Income</th>
                <th className="text-right pb-2">Expenses</th>
                <th className="text-right pb-2">Net</th>
              </tr>
            </thead>
            <tbody>
              {[...breakdown].reverse().map(b => (
                <tr key={`${b.year}-${b.month}`} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700">
                  <td className="py-1.5 text-slate-600 dark:text-slate-400 font-medium">{b.label}</td>
                  <td className="py-1.5 text-right text-emerald-600">{fmt(b.income)}</td>
                  <td className="py-1.5 text-right text-red-400">{fmt(b.expenses)}</td>
                  <td className={`py-1.5 text-right font-medium ${b.net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {b.net >= 0 ? '+' : ''}{fmt(b.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Category breakdown */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Spending by category</p>
          {categoryBreakdown.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">No categorised expenses in this period.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {categoryBreakdown.slice(0, 10).map(c => (
                <div key={c.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="text-slate-700 dark:text-slate-300 truncate">{c.name}</span>
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 shrink-0 ml-2">{fmt(c.total)} · {c.pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
