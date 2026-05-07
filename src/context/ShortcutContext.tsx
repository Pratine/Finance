// Global keyboard shortcut system.
// Pages register action handlers via useShortcutAction().
// The context listens for keydown globally and dispatches to registered handlers.
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { DEFAULT_SHORTCUTS, type ShortcutConfig } from '../utils/shortcuts'

type ActionName = keyof ShortcutConfig
type Handler = () => void

interface ShortcutContextValue {
  config: ShortcutConfig
  setConfig: (c: ShortcutConfig) => void
  register: (action: ActionName, handler: Handler) => () => void
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null)

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<ShortcutConfig>(DEFAULT_SHORTCUTS)
  const handlers = useRef<Map<ActionName, Handler>>(new Map())

  // Load persisted shortcuts on mount
  useEffect(() => {
    window.api.loadShortcuts().then((saved) => {
      if (saved) setConfigState({ ...DEFAULT_SHORTCUTS, ...saved })
    })
  }, [])

  const setConfig = useCallback(async (c: ShortcutConfig) => {
    setConfigState(c)
    await window.api.saveShortcuts(c)
  }, [])

  const register = useCallback((action: ActionName, handler: Handler) => {
    handlers.current.set(action, handler)
    return () => { handlers.current.delete(action) }
  }, [])

  // Global keydown listener
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't fire when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // Only allow Escape from inputs
        if (e.key !== 'Escape') return
      }

      for (const [action, handler] of handlers.current) {
        if (e.key === config[action]) {
          e.preventDefault()
          handler()
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [config])

  return (
    <ShortcutContext.Provider value={{ config, setConfig, register }}>
      {children}
    </ShortcutContext.Provider>
  )
}

export function useShortcuts() {
  const ctx = useContext(ShortcutContext)
  if (!ctx) throw new Error('useShortcuts must be used inside ShortcutProvider')
  return ctx
}

// Registers a handler for an action while the calling component is mounted.
export function useShortcutAction(action: ActionName, handler: Handler) {
  const { register } = useShortcuts()
  useEffect(() => register(action, handler), [action, handler, register])
}
