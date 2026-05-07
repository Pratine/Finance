import { useEffect, useState, useMemo } from 'react'
import { ArrowDownLeft, ArrowUpRight, TrendingUp, PiggyBank, Wallet, ArrowLeftRight, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Info, XCircle, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import AccountIcon from '../components/AccountIcon'
import { calcMonthlyStats, calcNetWorth, calcSavingsTotal } from '../utils/dashboardStats'
import { fmtDate } from '../utils/formatDate'
import { calcPnL, fmtPct } from '../utils/investmentCalcs'
import { calcBudgetStatus, calcSpendingByCategory } from '../utils/budgetStats'
import { useShortcutAction } from '../context/ShortcutContext'
import { calcAlerts, type AppAlert } from '../utils/alerts'
import { buildForecast } from '../utils/cashFlowForecast'

// â”€â”€â”€ Alerts panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SEVERITY_STYLES: Record<AppAlert['severity'], { bg: string; border: string; icon: React.ReactNode; text: string }> = {
  error:   { bg: 'bg-red-50 dark:bg-red-900/20',     border: 'border-red-200 dark:border-red-800',     icon: <XCircle size={14} className="text-red-500 shrink-0" />,        text: 'text-red-800 dark:text-red-300' },
  warning: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', icon: <AlertTriangle size={14} className="text-amber-500 shrink-0" />, text: 'text-amber-800 dark:text-amber-300' },
  success: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', icon: <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />, text: 'text-emerald-800 dark:text-emerald-300' },
  info:    { bg: 'bg-blue-50 dark:bg-blue-900/20',   border: 'border-blue-200 dark:border-blue-800',   icon: <Info size={14} className="text-blue-500 shrink-0" />,           text: 'text-blue-800 dark:text-blue-300' },
}

function AlertsPanel({ alerts }: { alerts: AppAlert[] }) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = alerts.filter(a => !dismissed.has(a.id))
  if (visible.length === 0) return null

  return (
    <div className="flex flex-col gap-2 mb-6">
      {visible.map(alert => {
        const s = SEVERITY_STYLES[alert.severity]
        return (
          <div key={alert.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${s.bg} ${s.border}`}>
            <div className="mt-0.5">{s.icon}</div>
            <button
              className="flex-1 text-left"
              onClick={() => alert.route && navigate(alert.route)}
            >
              <p className={`text-sm font-medium ${s.text}`}>{alert.title}</p>
              <p className={`text-xs mt-0.5 opacity-80 ${s.text}`}>{alert.body}</p>
            </button>
            <button onClick={() => setDismissed(prev => new Set([...prev, alert.id]))}
              className="mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0">
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

function progressPct(current: number, target: number) {
  if (!target) return 0
  return Math.round((current / target) * 100)
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// â”€â”€â”€ Stat card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatCard({ label, value, sub, positive, icon }: {
  label: string
  value: string
  sub?: string
  positive?: boolean
  icon: React.ReactNode
}) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
        <div className="text-slate-400 dark:text-slate-500">{icon}</div>
      </div>
      <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && (
        <p className={`text-xs mt-1 ${positive === true ? 'text-emerald-600' : positive === false ? 'text-red-500' : 'text-slate-400'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}

// â”€â”€â”€ Cash flow forecast card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import type { ForecastMonth } from '../utils/cashFlowForecast'

function CashFlowForecast({ forecast, fmt }: { forecast: ForecastMonth[]; fmt: (n: number) => string }) {
  const [expanded, setExpanded] = useState(false)
  const tooltipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #334155', backgroundColor: '#1e293b', color: '#f1f5f9' }
  const minBal = Math.min(...forecast.map(f => f.projectedBalance))
  const domain: [number, number] = [Math.min(0, minBal * 1.05), Math.max(...forecast.map(f => f.projectedBalance)) * 1.05]

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">6-month cash flow forecast</p>
        <button onClick={() => setExpanded(e => !e)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Based on recurring bills and average income</p>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={forecast}>
          <defs>
            <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid,#f1f5f9)" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => `â‚¬${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={48} domain={domain} />
          <Tooltip contentStyle={tooltipStyle}
            formatter={(v: number, name: string) => [fmt(v), name === 'projectedBalance' ? 'Projected balance' : name]} />
          <Area type="monotone" dataKey="projectedBalance" stroke="#3b82f6" strokeWidth={2} fill="url(#fcGrad)" dot={{ r: 3 }} />
        </AreaChart>
      </ResponsiveContainer>

      {expanded && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
                <th className="text-left py-2">Month</th>
                <th className="text-right py-2">Income</th>
                <th className="text-right py-2">Bills</th>
                <th className="text-right py-2">Savings</th>
                <th className="text-right py-2 font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {forecast.map(f => (
                <tr key={f.date} className="border-b border-slate-50 dark:border-slate-800">
                  <td className="py-2 text-slate-600 dark:text-slate-400 font-medium">{f.label}</td>
                  <td className="py-2 text-right text-emerald-600">{fmt(f.expectedIncome)}</td>
                  <td className="py-2 text-right text-red-500">{fmt(f.expectedExpenses)}</td>
                  <td className="py-2 text-right text-blue-500">{fmt(f.expectedSavings)}</td>
                  <td className={`py-2 text-right font-semibold ${f.projectedBalance >= 0 ? 'text-slate-800 dark:text-slate-200' : 'text-red-500'}`}>
                    {fmt(f.projectedBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Income is the average of your last 3 months. Bills are projected from active recurring bills.
          </p>
        </div>
      )}
    </div>
  )
}

// â”€â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function DashboardPage() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [savings, setSavings] = useState<SavingsGoal[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [recurringIncome, setRecurringIncome] = useState<RecurringIncome[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      window.api.listAccounts(),
      window.api.listTransactions(),
      window.api.listSavings(),
      window.api.listInvestments(),
      window.api.listBudgets(),
      window.api.listCategories(),
      window.api.listBills(),
      window.api.listIncome(),
    ]).then(([accs, txns, goals, invs, bdg, cats, bls, inc]) => {
      setAccounts(accs)
      setTransactions(txns)
      setSavings(goals)
      setInvestments(invs)
      setBudgets(bdg)
      setCategories(cats)
      setBills(bls)
      setRecurringIncome(inc)
      setLoading(false)
    })
  }, [])

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())   // 0-indexed
  const [year, setYear] = useState(now.getFullYear())

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const isCurrentMonth = month === now.getMonth() && year === now.getFullYear()

  useShortcutAction('prevMonth', prevMonth)
  useShortcutAction('nextMonth', () => { if (!isCurrentMonth) nextMonth() })

  const monthlyStats = calcMonthlyStats(transactions, month, year)
  const netWorth = calcNetWorth(accounts, investments)
  const savingsTotals = calcSavingsTotal(savings)
  const portfolioPnL = calcPnL(
    investments.reduce((s, i) => s + parseFloat(i.amountIn), 0),
    investments.reduce((s, i) => s + parseFloat(i.currentValue), 0),
  )

  const recentTxns = transactions.slice(0, 8)

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + parseFloat(a.balance), 0), [accounts])
  const forecast = useMemo(
    () => buildForecast(totalBalance, bills, transactions, savings, 6, recurringIncome),
    [totalBalance, bills, transactions, savings, recurringIncome]
  )

  const alerts = useMemo(
    () => calcAlerts({ bills, budgets, transactions, savings, month, year }),
    [bills, budgets, transactions, savings, month, year]
  )

  if (loading) {
    return <div className="text-sm text-slate-400 pt-10 text-center">Loadingâ€¦</div>
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
          <button onClick={prevMonth} className="p-0.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200 w-32 text-center">
            {MONTHS[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="p-0.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <AlertsPanel alerts={alerts} />

      {/* Top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Net worth"
          value={fmt(netWorth)}
          icon={<Wallet size={16} />}
        />
        <StatCard
          label={`${MONTHS[month]} income`}
          value={fmt(monthlyStats.totalIn)}
          positive={true}
          icon={<ArrowDownLeft size={16} />}
        />
        <StatCard
          label={`${MONTHS[month]} expenses`}
          value={fmt(monthlyStats.totalOut)}
          positive={false}
          icon={<ArrowUpRight size={16} />}
        />
        <StatCard
          label="Net this month"
          value={fmt(monthlyStats.net)}
          positive={monthlyStats.net >= 0}
          sub={monthlyStats.net >= 0 ? 'Surplus' : 'Deficit'}
          icon={<ArrowLeftRight size={16} />}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

        {/* Accounts */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Accounts</p>
            <button onClick={() => navigate('/accounts')} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">View all</button>
          </div>
          <div className="flex flex-col gap-2">
            {accounts.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No accounts yet.</p>}
            {accounts.map(acc => (
              <div key={acc.id} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0" style={{ backgroundColor: acc.type.color ?? '#64748b' }}>
                  <AccountIcon icon={acc.type.icon} size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{acc.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{acc.type.name}</p>
                </div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 shrink-0">{fmt(parseFloat(acc.balance))}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Savings goals */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Savings</p>
            <button onClick={() => navigate('/savings')} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">View all</button>
          </div>
          {savings.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No savings goals yet.</p>}
          <div className="flex flex-col gap-3">
            {savings.slice(0, 4).map(goal => {
              const current = parseFloat(goal.currentAmount)
              const target = parseFloat(goal.targetAmount)
              const pct = progressPct(current, target)
              const reached = pct >= 100
              const over = pct > 100
              return (
                <div key={goal.id}>
                  <div className="flex justify-between mb-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{goal.name}</p>
                    <p className={`text-xs shrink-0 ml-2 ${over ? 'text-amber-500 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>{pct}%</p>
                  </div>
                  {(() => {
                    const interestEarned = parseFloat(goal.totalInterestEarned ?? '0')
                    const totalPct = Math.min(pct, 100)
                    const interestPct = target > 0 ? Math.min((interestEarned / target) * 100, totalPct) : 0
                    const basePct = totalPct - interestPct
                    const barColor = over ? 'bg-amber-400' : reached ? 'bg-emerald-400' : 'bg-slate-300'
                    return (
                      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                        <div className={`h-full ${barColor}`} style={{ width: `${basePct}%` }} />
                        {interestPct > 0 && (
                          <div className="h-full bg-emerald-700" style={{ width: `${interestPct}%` }} />
                        )}
                      </div>
                    )
                  })()}
                  <div className="flex justify-between mt-0.5">
                    <p className="text-xs text-slate-400 dark:text-slate-500">{fmt(current)}</p>
                    {target > 0 && <p className="text-xs text-slate-400 dark:text-slate-500">{fmt(target)}</p>}
                  </div>
                </div>
              )
            })}
            {savingsTotals.target > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2 mt-1 flex justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">Total saved</p>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {fmt(savingsTotals.current)} <span className="text-slate-400 dark:text-slate-500 font-normal">of {fmt(savingsTotals.target)}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Investments */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Investments</p>
            <button onClick={() => navigate('/investments')} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">View all</button>
          </div>
          {investments.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No investments yet.</p>}
          {investments.length > 0 && (
            <>
              <div className="mb-3">
                <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {fmt(investments.reduce((s, i) => s + parseFloat(i.currentValue), 0))}
                </p>
                <p className={`text-xs mt-0.5 font-medium ${portfolioPnL.absolute >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {portfolioPnL.absolute >= 0 ? '+' : ''}{fmt(portfolioPnL.absolute)} ({fmtPct(portfolioPnL.percentage)})
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {investments.slice(0, 4).map(inv => {
                  const pnl = calcPnL(inv.amountIn, inv.currentValue)
                  return (
                    <div key={inv.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: inv.type.color ?? '#64748b' }} />
                        <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{inv.name}</p>
                      </div>
                      <p className={`text-xs font-medium shrink-0 ml-2 ${pnl.absolute >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {fmtPct(pnl.percentage)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Budgets */}
      {budgets.length > 0 && (() => {
        const spending = calcSpendingByCategory(transactions, month, year)
        const totalBudgeted = budgets.reduce((s, b) => s + parseFloat(b.amount), 0)
        const totalSpent = budgets.reduce((s, b) => s + (spending.get(b.categoryId) ?? 0), 0)
        const overCount = budgets.filter(b => (spending.get(b.categoryId) ?? 0) > parseFloat(b.amount)).length

        return (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Budgets</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {fmt(totalSpent)} of {fmt(totalBudgeted)}
                  {overCount > 0 && <span className="text-red-500 ml-1">Â· {overCount} over budget</span>}
                </p>
              </div>
              <button onClick={() => navigate('/budgets')} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">View all</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {budgets.slice(0, 6).map(budget => {
                const spent = spending.get(budget.categoryId) ?? 0
                const status = calcBudgetStatus(budget.amount, spent)
                const barPct = Math.min(status.pct, 100)
                const barColor = status.over ? 'bg-red-500' : status.pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'

                return (
                  <div key={budget.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: budget.category.color ?? '#64748b' }} />
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{budget.category.name}</p>
                      </div>
                      <p className={`text-xs shrink-0 ml-2 ${status.over ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>
                        {fmt(spent)} / {fmt(parseFloat(budget.amount))}
                      </p>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Spending by category pie chart */}
      {(() => {
        const spending = calcSpendingByCategory(transactions, month, year)
        const chartData = categories
          .filter(c => c.type === 'EXPENSE')
          .map(c => ({ name: c.name, value: spending.get(c.id) ?? 0, color: c.color ?? '#64748b' }))
          .filter(d => d.value > 0)
          .sort((a, b) => b.value - a.value)

        if (chartData.length === 0) return null

        const total = chartData.reduce((s, d) => s + d.value, 0)

        return (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Spending by category</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{MONTHS[month]} {year}</p>
            </div>
            <div className="flex gap-6 items-center">
              <div className="shrink-0" style={{ width: 200, height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [fmt(value), '']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                {chartData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">{d.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{fmt(d.value)}</span>
                    <span className="text-xs text-slate-300 dark:text-slate-600 shrink-0 w-10 text-right">
                      {Math.round((d.value / total) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Cash flow forecast */}
      {forecast.length > 0 && <CashFlowForecast forecast={forecast} fmt={fmt} />}

      {/* Recent transactions */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent transactions</p>
          <button onClick={() => navigate('/transactions')} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">View all</button>
        </div>
        {recentTxns.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No transactions yet.</p>}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {recentTxns.map(t => (
            <div key={t.id} className="flex items-center gap-3 py-2.5">
              <div className={`w-1.5 h-8 rounded-full shrink-0 ${t.type === 'CREDIT' ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{t.description}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{fmtDate(t.date)}</p>
              </div>
              {t.category && (
                <span className="text-xs px-2 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: t.category.color ?? '#64748b' }}>
                  {t.category.name}
                </span>
              )}
              <p className={`text-xs font-semibold shrink-0 ${t.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-500'}`}>
                {t.type === 'CREDIT' ? '+' : 'âˆ’'}{fmt(Math.abs(parseFloat(t.amount)))}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
