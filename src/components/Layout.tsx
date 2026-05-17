import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import Sidebar from './Sidebar'
import { useShortcutAction } from '../context/ShortcutContext'

// Maps digit keys to routes — matches the kbd hints shown in the sidebar.
const PAGE_SHORTCUTS: Record<string, string> = {
  '1': '/', '2': '/reports', '3': '/budgets', '4': '/bills',
  '5': '/income', '6': '/debts', '7': '/investments', '8': '/savings',
  '9': '/accounts', '0': '/transactions',
}

export default function Layout() {
  const navigate = useNavigate()
  useShortcutAction('goImport', () => navigate('/import'))

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const route = PAGE_SHORTCUTS[e.key]
      if (route) { e.preventDefault(); navigate(route) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 text-slate-900 dark:text-slate-100">
        <Outlet />
      </main>
    </div>
  )
}
