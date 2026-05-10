import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  // Optional custom fallback; defaults to the built-in error card
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-8">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <AlertTriangle size={22} className="text-red-500" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
          Something went wrong
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1 max-w-sm">
          {error.message || 'An unexpected error occurred on this page.'}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-6 max-w-sm font-mono break-all">
          {error.stack?.split('\n')[1]?.trim()}
        </p>
        <button
          onClick={this.reset}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors"
        >
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    )
  }
}
