import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, ArrowRight } from 'lucide-react'
import { matchesSearch } from '../utils/transactionFilters'
import { fmtDate } from '../utils/formatDate'

function fmt(amount: string) {
  return Math.abs(parseFloat(amount)).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

// Highlight the matching part of a string
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 dark:bg-amber-700 text-inherit rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loaded, setLoaded] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Load data once on open
  useEffect(() => {
    Promise.all([window.api.listTransactions(), window.api.listAccounts()])
      .then(([txns, accs]) => { setTransactions(txns); setAccounts(accs); setLoaded(true) })
      .catch(() => setLoaded(true)) // show empty state rather than hanging on "Loading…"
    inputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const accountMap = useMemo(
    () => new Map(accounts.map(a => [a.id, a])),
    [accounts]
  )

  const results = query.trim().length < 1 ? [] : transactions
    .filter(t => matchesSearch(t, query))
    .slice(0, 12)

  // Reset active index when results change
  useEffect(() => { setActiveIdx(0) }, [query])

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = results[activeIdx]
      if (target) {
        navigate(`/transactions?q=${encodeURIComponent(query.trim() || target.description)}`)
        onClose()
      } else if (query.trim()) {
        navigate(`/transactions?q=${encodeURIComponent(query.trim())}`)
        onClose()
      }
    }
  }, [results, activeIdx, query, navigate, onClose])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/50"
      onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-700">
          <Search size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search transactions by description or amount…"
            className="flex-1 text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:inline text-xs bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto">
          {!loaded && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">Loading…</p>
          )}

          {loaded && query.trim().length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
              Type to search across {transactions.length.toLocaleString()} transactions
            </p>
          )}

          {loaded && query.trim().length > 0 && results.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">No transactions match "{query}"</p>
          )}

          {results.map((t, i) => {
            const account = accountMap.get(t.accountId)
            const isDebit = t.type === 'DEBIT'
            const isActive = i === activeIdx
            return (
              <button
                key={t.id}
                onClick={() => { navigate(`/transactions?q=${encodeURIComponent(query.trim() || t.description)}`); onClose() }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isActive ? 'bg-slate-50 dark:bg-slate-700' : 'hover:bg-slate-50 dark:hover:bg-slate-700'} border-b border-slate-50 dark:border-slate-800 last:border-0`}
              >
                {/* Type dot */}
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDebit ? 'bg-red-400' : 'bg-emerald-400'}`} />

                {/* Description + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-200 truncate">
                    <Highlight text={t.description} query={query} />
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                    {fmtDate(t.date)}
                    {account && <> · {account.name}</>}
                    {t.category && <> · <span style={{ color: t.category.color ?? '#94a3b8' }}>{t.category.name}</span></>}
                  </p>
                </div>

                {/* Amount */}
                <p className={`text-sm font-semibold shrink-0 tabular-nums ${isDebit ? 'text-red-500' : 'text-emerald-600'}`}>
                  {isDebit ? '−' : '+'}{fmt(t.amount)}
                </p>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {results.length < 12
                ? `${results.length} result${results.length !== 1 ? 's' : ''}`
                : `Showing first 12 · there may be more`}
            </p>
            <button onClick={showAll}
              className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-medium">
              See all in Transactions <ArrowRight size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
