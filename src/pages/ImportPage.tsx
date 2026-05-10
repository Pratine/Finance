import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Upload, FileText, CheckCircle, AlertCircle, ChevronDown, History, Trash2 } from 'lucide-react'
import { fmtDateLong } from '../utils/formatDate'

type Status = 'idle' | 'importing' | 'done' | 'error'
type Format = 'millennium' | 'revolut'

const FORMATS: { value: Format; label: string; hint: string }[] = [
  { value: 'millennium', label: 'Millennium BCP', hint: 'UTF-16 CSV export from millenniumbcp.pt' },
  { value: 'revolut',    label: 'Revolut',        hint: 'CSV export from the Revolut app' },
]

interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

const FORMAT_LABELS: Record<string, string> = { millennium: 'Millennium BCP', revolut: 'Revolut' }

export default function ImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<number | ''>('')
  const [format, setFormat] = useState<Format>('millennium')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [history, setHistory] = useState<ImportHistory[]>([])

  async function loadHistory() {
    try {
      setHistory(await window.api.listImportHistory())
    } catch {
      // Non-fatal — history just won't show
    }
  }

  useEffect(() => {
    window.api.listAccounts().then((data) => {
      setAccounts(data)
      if (data.length === 1) setAccountId(data[0].id)
    }).catch(() => {
      // accounts stays empty — the "No accounts found" UI handles this
    })
    loadHistory()
  }, [])

  async function pickFile() {
    const path = await window.api.openCSVDialog()
    if (path) { setFilePath(path); setResult(null); setErrorMsg(null) }
  }

  async function runImport() {
    if (!filePath || accountId === '') return
    setStatus('importing')
    setResult(null)
    setErrorMsg(null)
    try {
      const res = format === 'revolut'
        ? await window.api.importRevolut(filePath, Number(accountId))
        : await window.api.importCSV(filePath, Number(accountId))
      setResult(res)
      setStatus('done')
      loadHistory()
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Import failed')
      setStatus('error')
    }
  }

  const fileName = filePath ? filePath.split(/[/\\]/).pop() : null
  const canImport = filePath !== null && accountId !== '' && status !== 'importing'
  const selectedFormat = FORMATS.find(f => f.value === format)!

  async function handleDeleteHistory(id: number) {
    await window.api.deleteImportHistory(id)
    loadHistory()
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Import statement</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Duplicates are automatically skipped.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 flex flex-col gap-5">

        {/* Format selector */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Bank format</label>
          <div className="flex gap-2">
            {FORMATS.map(f => (
              <button
                key={f.value}
                onClick={() => { setFormat(f.value); setFilePath(null); setResult(null) }}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${
                  format === f.value
                    ? 'bg-slate-900 text-white border-slate-900 font-medium'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">{selectedFormat.hint}</p>
        </div>

        {/* Account selector */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Import into account
          </label>
          {accounts.length === 0 ? (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              No accounts found.{' '}
              <Link to="/accounts" className="underline">Create one first.</Link>
            </p>
          ) : (
            <div className="relative">
              <select
                value={accountId}
                onChange={(e) => setAccountId(Number(e.target.value))}
                className="w-full appearance-none border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 bg-white dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Select accountâ€¦</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.bank ? ` Â· ${a.bank.name}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
            </div>
          )}
        </div>

        {/* File picker */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CSV file</label>
          <button
            onClick={pickFile}
            className="w-full border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl py-8 flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
          >
            {fileName ? (
              <>
                <FileText size={28} className="text-slate-500 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{fileName}</span>
                <span className="text-xs">Click to change file</span>
              </>
            ) : (
              <>
                <Upload size={28} />
                <span className="text-sm font-medium">Click to select CSV file</span>
                <span className="text-xs">{selectedFormat.label} statement export</span>
              </>
            )}
          </button>
        </div>

        {/* Import button */}
        <button
          onClick={runImport}
          disabled={!canImport}
          className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'importing' ? 'Importingâ€¦' : 'Import transactions'}
        </button>

        {/* Result */}
        {status === 'done' && result && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-emerald-700 font-medium mb-2">
              <CheckCircle size={16} /> Import complete
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-emerald-800">
              <div className="bg-white rounded-lg px-3 py-2 border border-emerald-200">
                <p className="text-2xl font-semibold">{result.imported}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Imported</p>
              </div>
              <div className="bg-white rounded-lg px-3 py-2 border border-emerald-200">
                <p className="text-2xl font-semibold text-slate-500">{result.skipped}</p>
                <p className="text-xs text-slate-400 mt-0.5">Skipped (duplicates)</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-amber-700 mb-1">{result.errors.length} row(s) had errors:</p>
                <ul className="text-xs text-amber-600 space-y-0.5">
                  {result.errors.map((e, i) => <li key={i} className="truncate">Â· {e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {status === 'error' && errorMsg && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {errorMsg}
          </div>
        )}
      </div>

      {/* Import history */}
      {history.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <History size={14} className="text-slate-400 dark:text-slate-500" />
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Import history</h2>
            <span className="text-xs text-slate-400 dark:text-slate-500">({history.length})</span>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
            {history.map(h => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                {/* Icon */}
                <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                  <FileText size={13} className="text-slate-500 dark:text-slate-400" />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-200 truncate font-medium">{h.filename}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {FORMAT_LABELS[h.format] ?? h.format}
                    {h.account && <> Â· {h.account.name}</>}
                    {' Â· '}{fmtDateLong(h.importedAt)}
                  </p>
                </div>

                {/* Counters */}
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <CheckCircle size={11} />{h.imported}
                  </span>
                  {h.skipped > 0 && (
                    <span className="text-slate-400 dark:text-slate-500">{h.skipped} skipped</span>
                  )}
                  {h.errors > 0 && (
                    <span className="text-amber-500">{h.errors} err</span>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDeleteHistory(h.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 transition-all"
                  title="Remove from history"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
