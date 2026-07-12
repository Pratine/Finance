import { useState, useMemo } from 'react'
import { Download } from 'lucide-react'

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

// Categories whose names suggest IRS deductibility in Portugal.
const DEDUCTIBLE_HINTS: Record<string, string> = {
  saude:      'Saúde (15% dedutível)',
  health:     'Saúde (15% dedutível)',
  educacao:   'Educação (30% dedutível)',
  education:  'Educação (30% dedutível)',
  habitacao:  'Habitação',
  housing:    'Habitação',
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

export default function TaxTab({ transactions, investments }: {
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

  // Income and expense totals. Includes internal transfers (no transfer marker
  // on Transaction) — treat this as an approximation for review purposes.
  const totalIncome = yearTxns
    .filter(t => t.type === 'CREDIT')
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const totalExpenses = yearTxns
    .filter(t => t.type === 'DEBIT')
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  async function exportCSV() {
    setExporting(true)
    try {
      const lines: string[] = []

      lines.push(`Finance Tax Summary - ${year}`)
      lines.push(`Exported,${new Date().toISOString().slice(0, 10)}`)
      lines.push('')

      lines.push('INCOME SUMMARY (may include internal transfers)')
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

      await window.api.exportSaveCsv(`tax_${year}.csv`, lines.join('\n'))
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
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Income summary — {year}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">May include internal account transfers</p>
        </div>
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
