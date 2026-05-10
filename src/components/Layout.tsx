import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useShortcutAction } from '../context/ShortcutContext'

export default function Layout() {
  const navigate = useNavigate()
  useShortcutAction('goImport', () => navigate('/import'))

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 text-slate-900 dark:text-slate-100">
        <Outlet />
      </main>
    </div>
  )
}
