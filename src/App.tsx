import { HashRouter, Routes, Route } from 'react-router-dom'
import { ShortcutProvider } from './context/ShortcutContext'
import { ThemeProvider } from './context/ThemeContext'
import { DBProvider } from './context/DBContext'
import DBGate from './components/DBGate'
import Layout from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import DashboardPage from './pages/DashboardPage'
import AccountsPage from './pages/AccountsPage'
import ImportPage from './pages/ImportPage'
import SavingsPage from './pages/SavingsPage'
import TransactionsPage from './pages/TransactionsPage'
import SettingsPage from './pages/SettingsPage'
import InvestmentsPage from './pages/InvestmentsPage'
import BudgetsPage from './pages/BudgetsPage'
import RecurringBillsPage from './pages/RecurringBillsPage'
import ReportsPage from './pages/ReportsPage'
import DebtsPage from './pages/DebtsPage'
import RecurringIncomePage from './pages/RecurringIncomePage'

function Guarded({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>
}

// HashRouter is required in Electron because the app is served from a local file (file://).
// BrowserHistory pushes real URL paths that the OS file system cannot resolve.
export default function App() {
  return (
    <ThemeProvider>
    <DBProvider>
    <DBGate>
    <ShortcutProvider>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Guarded><DashboardPage /></Guarded>} />
          <Route path="accounts" element={<Guarded><AccountsPage /></Guarded>} />
          <Route path="import" element={<Guarded><ImportPage /></Guarded>} />
          <Route path="transactions" element={<Guarded><TransactionsPage /></Guarded>} />
          <Route path="budgets" element={<Guarded><BudgetsPage /></Guarded>} />
          <Route path="savings" element={<Guarded><SavingsPage /></Guarded>} />
          <Route path="investments" element={<Guarded><InvestmentsPage /></Guarded>} />
          <Route path="reports" element={<Guarded><ReportsPage /></Guarded>} />
          <Route path="bills" element={<Guarded><RecurringBillsPage /></Guarded>} />
          <Route path="income" element={<Guarded><RecurringIncomePage /></Guarded>} />
          <Route path="debts" element={<Guarded><DebtsPage /></Guarded>} />
          <Route path="settings" element={<Guarded><SettingsPage /></Guarded>} />
        </Route>
      </Routes>
    </HashRouter>
    </ShortcutProvider>
    </DBGate>
    </DBProvider>
    </ThemeProvider>
  )
}
