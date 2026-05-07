import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type DBStatus = 'checking' | 'ok' | 'error'

interface DBContextValue {
  status: DBStatus
  retry: () => void
}

const DBContext = createContext<DBContextValue | null>(null)

export function DBProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DBStatus>('checking')

  async function check() {
    setStatus('checking')
    try {
      await window.api.pingDB()
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => { check() }, [])

  return (
    <DBContext.Provider value={{ status, retry: check }}>
      {children}
    </DBContext.Provider>
  )
}

export function useDB() {
  const ctx = useContext(DBContext)
  if (!ctx) throw new Error('useDB must be inside DBProvider')
  return ctx
}
