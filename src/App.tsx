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
                  <Route index element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
                  <Route path="accounts" element={<ErrorBoundary><AccountsPage /></ErrorBoundary>} />
                  <Route path="import" element={<ErrorBoundary><ImportPage /></ErrorBoundary>} />
                  <Route path="transactions" element={<ErrorBoundary><TransactionsPage /></ErrorBoundary>} />
                  <Route path="budgets" element={<ErrorBoundary><BudgetsPage /></ErrorBoundary>} />
                  <Route path="savings" element={<ErrorBoundary><SavingsPage /></ErrorBoundary>} />
                  <Route path="investments" element={<ErrorBoundary><InvestmentsPage /></ErrorBoundary>} />
                  <Route path="reports" element={<ErrorBoundary><ReportsPage /></ErrorBoundary>} />
                  <Route path="bills" element={<ErrorBoundary><RecurringBillsPage /></ErrorBoundary>} />
                  <Route path="income" element={<ErrorBoundary><RecurringIncomePage /></ErrorBoundary>} />
                  <Route path="debts" element={<ErrorBoundary><DebtsPage /></ErrorBoundary>} />
                  <Route path="settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
                </Route>
              </Routes>
            </HashRouter>
          </ShortcutProvider>
        </DBGate>
      </DBProvider>
    </ThemeProvider>
  )
}
