import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Read localStorage synchronously in the initialiser so the correct theme
  // is applied before the first render — avoids a light→dark flash on startup.
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark' ? 'dark' : 'light'
  })

  // Apply the initial theme to the DOM on mount (state is set but classList is not yet updated).
  useEffect(() => {
    applyDOM(theme)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function applyDOM(t: Theme) {
    if (t === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }

  function apply(t: Theme) {
    setTheme(t)
    applyDOM(t)
    localStorage.setItem('theme', t)
  }

  function toggle() {
    apply(theme === 'light' ? 'dark' : 'light')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
