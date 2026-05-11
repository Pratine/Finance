// Thin index for the IPC layer. Each domain has its own module under ./ipc/*
// that exposes a register*Handlers(ipcMain) function — we just wire them all
// up here so main/index.ts has a single entry point.
import type { IpcMain } from 'electron'
import { registerAccountsHandlers }     from './ipc/accounts'
import { registerTransactionsHandlers } from './ipc/transactions'
import { registerInvestmentsHandlers }  from './ipc/investments'
import { registerSavingsHandlers }      from './ipc/savings'
import { registerDebtsHandlers }        from './ipc/debts'
import { registerRecurringHandlers }    from './ipc/recurring'
import { registerBudgetsHandlers }      from './ipc/budgets'
import { registerIoHandlers }           from './ipc/io'
import { registerSettingsHandlers }     from './ipc/settings'

export function setupIpcHandlers(ipcMain: IpcMain) {
  registerAccountsHandlers(ipcMain)
  registerTransactionsHandlers(ipcMain)
  registerInvestmentsHandlers(ipcMain)
  registerSavingsHandlers(ipcMain)
  registerDebtsHandlers(ipcMain)
  registerRecurringHandlers(ipcMain)
  registerBudgetsHandlers(ipcMain)
  registerIoHandlers(ipcMain)
  registerSettingsHandlers(ipcMain)
}
