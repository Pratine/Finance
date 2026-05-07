import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, AreaChart, Area,
} from 'recharts'
import { calcMonthlyBreakdown, calcCumulativeBalance, calcCategoryBreakdown, calcCategoryTrends, type CategoryTrendPoint } from '../utils/reportingStats'
import { buildNetWorthHistory } from '../utils/netWorthHistory'

const RANGE_OPTIONS = [
  { label: '3 months',  value: 3  },
  { label: '6 months',  value: 6  },
  { label: '12 months', value: 12 },
  { label: '2 years',   value: 24 },
]

// Returns { from, to, months } from a preset value or custom dates.
function resolveRange(
  mode: 'preset' | 'custom',
  preset: number,
  customFrom: string,
  customTo: string,
): { from: Date; to: Date; months: number } {
  if (mode === 'custom' && customFrom && customTo) {
    const from = new Date(customFrom)
    const to   = new Date(customTo)
    to.setHours(23, 59, 59, 999)
    const months = Math.max(1, Math.ceil(
      (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    ))
    return { from, to, months }
  }
  const to   = new Date()
  const from = new Date(to.getFullYear(), to.getMonth() - preset + 1, 1)
  return { from, to, months: preset }
}

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 1000) return `â‚¬${(n / 1000).toFixed(1)}k`
  return `â‚¬${Math.round(n)}`
}

// â”€â”€â”€ Spending trends chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Monthly expense per category Â· click legend to hide</p>

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

export default function ReportsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [priceHistory, setPriceHistory] = useState<Array<{ date: string; value: number }>>([])
  const [rangeMode, setRangeMode] = useState<'preset' | 'custom'>('preset')
  const [preset, setPreset] = useState(6)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    Promise.all([
      window.api.listTransactions(),
      window.api.getInvestmentPriceHistory(),
    ]).then(([txns, hist]) => {
      setTransactions(txns)
      setPriceHistory(hist)
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
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Reports</h1>
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

          {rangeMode === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400" />
              <span className="text-slate-400 text-xs">â†’</span>
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
              <YAxis tickFormatter={v => `â‚¬${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
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
                    <span className="text-slate-500 dark:text-slate-400 shrink-0 ml-2">{fmt(c.total)} Â· {c.pct.toFixed(0)}%</span>
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
