import { useDB } from '../context/DBContext'
import { Database, RefreshCw, AlertTriangle } from 'lucide-react'

export default function DBGate({ children }: { children: React.ReactNode }) {
  const { status, retry } = useDB()

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Database size={40} className="mx-auto mb-4 text-slate-300 dark:text-slate-600 animate-pulse" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Connecting to database…</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <AlertTriangle size={28} className="text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Database not reachable
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Finance couldn't open its local database. This can happen if the database file is
            locked by another process, the app data folder is not writable, or a migration
            failed on startup. Try restarting the app.
          </p>
          <button
            onClick={retry}
            className="flex items-center gap-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-slate-700 dark:hover:bg-white transition-colors mx-auto"
          >
            <RefreshCw size={14} />
            Try again
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
