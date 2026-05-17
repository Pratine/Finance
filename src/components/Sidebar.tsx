import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Upload,
  PiggyBank,
  TrendingUp,
  Receipt,
  Settings,
  CalendarClock,
  BarChart3,
  Landmark,
  Search,
  BadgeDollarSign,
} from 'lucide-react'
import SearchModal from './SearchModal'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, kbd: '1' },
  { to: '/reports', label: 'Reports', icon: BarChart3, kbd: '2' },
  { to: '/budgets', label: 'Budgets', icon: Receipt, kbd: '3' },
  { to: '/bills', label: 'Recurring Bills', icon: CalendarClock, kbd: '4' },
  { to: '/income', label: 'Recurring Income', icon: BadgeDollarSign, kbd: '5' },
  { to: '/debts', label: 'Debts', icon: Landmark, kbd: '6' },
  { to: '/investments', label: 'Investments', icon: TrendingUp, kbd: '7' },
  { to: '/savings', label: 'Savings', icon: PiggyBank, kbd: '8' },
  { to: '/accounts', label: 'Accounts', icon: Wallet, kbd: '9' },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight, kbd: '0' },
  { to: '/import', label: 'Import', icon: Upload, kbd: 'I' },
  { to: '/settings', label: 'Settings', icon: Settings, kbd: null },
]

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const SEARCH_KBD = isMac ? '⌘K' : 'Ctrl+K'

export default function Sidebar() {
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}

      <aside className="flex flex-col w-[220px] min-h-screen bg-slate-900 text-slate-300 shrink-0">
        <div className="px-6 py-5 border-b border-slate-700">
          <span className="text-white font-semibold text-lg tracking-tight">Finance</span>
        </div>

        {/* Search button */}
        <div className="px-3 pt-3">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Search size={15} />
            <span className="flex-1 text-left">Search</span>
            <kbd className="text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{SEARCH_KBD}</kbd>
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 p-3 flex-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-slate-700 text-white font-medium'
                    : 'hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-6 py-4 border-t border-slate-700 text-xs text-slate-500">
          EUR · Local
        </div>
        <div className="px-6 py-4 border-t border-slate-700 text-xs text-slate-500">
          By Pratine
        </div>
      </aside>
    </>
  )
}