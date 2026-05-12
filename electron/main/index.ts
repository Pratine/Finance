import { app, BrowserWindow, ipcMain, Notification, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { autoUpdater } from 'electron-updater'
import { setupIpcHandlers } from '../ipc'
import { db } from '../db'
import { runMigrations as applyMigrations } from '../migrations'
import { startScheduler, stopScheduler } from '../services/priceScheduler'
import { loadAppSettings } from '../services/appSettings'

// Enforce a single running instance — quit immediately if another is already open.
// Must be called before app.whenReady().
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// Force Chromium to use Portuguese locale so <input type="date"> renders DD/MM/YYYY.
// Must be set before app.whenReady().
app.commandLine.appendSwitch('lang', 'pt-PT')

// Windows notification title comes from the AppUserModelId — set it explicitly
// so it shows "Finance" instead of "electron.app.Finance".
app.setAppUserModelId('Finance')

// Runs pending DB migrations at startup — safe to call repeatedly.
// Migrations are applied via better-sqlite3 directly (see ../migrations.ts);
// there is no Prisma CLI to spawn.
function runMigrations() {
  try {
    applyMigrations()
  } catch (e: any) {
    console.error('Migration error:', e)
    // Show a visible error in production — a silent failure here means the app
    // runs against the wrong schema, which can corrupt financial data.
    if (app.isPackaged) {
      dialog.showErrorBox(
        'Database migration failed',
        `Finance could not update its database schema.\n\n${e?.message ?? e}\n\nThe app may not function correctly. Please reinstall or contact support.`,
      )
    }
  }
}

// ── Auto-updater ───────────────────────────────────────────────────────────────
type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error'

let updateStatus: UpdateStatus = 'idle'
let updateInfo: { version?: string; percent?: number; error?: string } = {}

function sendUpdateStatus(win: BrowserWindow) {
  if (win.isDestroyed()) return
  win.webContents.send('updater:status', { status: updateStatus, ...updateInfo })
}

const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR

function setupAutoUpdater(win: BrowserWindow) {
  // Updater is disabled in the portable demo — it has no installer to update.
  if (isPortable) {
    ipcMain.handle('updater:check', () => ({ status: 'not-available' }))
    ipcMain.handle('updater:getStatus', () => ({ status: 'not-available' }))
    ipcMain.handle('updater:install', () => {})
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    updateStatus = 'checking'
    updateInfo = {}
    sendUpdateStatus(win)
  })
  autoUpdater.on('update-available', (info) => {
    updateStatus = 'available'
    updateInfo = { version: info.version }
    sendUpdateStatus(win)
  })
  autoUpdater.on('update-not-available', () => {
    updateStatus = 'not-available'
    updateInfo = {}
    sendUpdateStatus(win)
  })
  autoUpdater.on('download-progress', (progress) => {
    updateStatus = 'downloading'
    updateInfo = { percent: Math.round(progress.percent) }
    sendUpdateStatus(win)
  })
  autoUpdater.on('update-downloaded', (info) => {
    updateStatus = 'ready'
    updateInfo = { version: info.version }
    sendUpdateStatus(win)
  })
  autoUpdater.on('error', (err) => {
    updateStatus = 'error'
    updateInfo = { error: err.message }
    sendUpdateStatus(win)
  })

  ipcMain.handle('updater:check', async () => {
    try { await autoUpdater.checkForUpdates() } catch (e: any) {
      updateStatus = 'error'
      updateInfo = { error: e.message }
    }
    return { status: updateStatus, ...updateInfo }
  })

  ipcMain.handle('updater:getStatus', () => ({ status: updateStatus, ...updateInfo }))

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // Check silently on startup (only in production)
  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch((e) => console.error('Update check failed:', e)), 5000)
  }
}

// In dev, Vite serves the renderer on localhost. In prod, load the built file.
const DEV_URL = 'http://localhost:5173'
const isDev = !app.isPackaged

// ── Window state persistence ───────────────────────────────────────────────────
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json')

function loadWindowState(): { width: number; height: number; x?: number; y?: number; maximized?: boolean } {
  try {
    return JSON.parse(fs.readFileSync(windowStatePath, 'utf8'))
  } catch {
    return { width: 1280, height: 800 }
  }
}

function saveWindowState(win: BrowserWindow) {
  const maximized = win.isMaximized()
  const { width, height, x, y } = maximized ? loadWindowState() : win.getBounds()
  fs.writeFileSync(windowStatePath, JSON.stringify({ width, height, x, y, maximized }))
}

function createWindow() {
  const saved = loadWindowState()

  const win = new BrowserWindow({
    width:     saved.width,
    height:    saved.height,
    x:         saved.x,
    y:         saved.y,
    minWidth:  960,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (saved.maximized) win.maximize()

  // Persist window size/position so the next launch restores it.
  // move/resize fire on every pixel — debounce to avoid hammering the disk.
  let _persistTimer: ReturnType<typeof setTimeout> | null = null
  const persistState = () => {
    if (_persistTimer) clearTimeout(_persistTimer)
    _persistTimer = setTimeout(() => saveWindowState(win), 500)
  }
  win.on('resize', persistState)
  win.on('move',   persistState)
  win.on('close',  () => { if (_persistTimer) clearTimeout(_persistTimer); saveWindowState(win) })

  if (isDev) {
    win.loadURL(DEV_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  setupAutoUpdater(win)
}

function notify(title: string, body: string) {
  if (!Notification.isSupported()) return
  new Notification({ title, body }).show()
}

// Prepared statements used by checkNotifications. These reference columns
// that have always existed, so it's safe to prepare them once at startup
// (after migrations) and reuse on every timer tick. We lazy-init on first
// call because `db` is imported at module load — preparing statements at
// module scope would run before runMigrations() in app.whenReady().
let _stmtNotifBills: import('better-sqlite3').Statement | null = null
let _stmtNotifBudgets: import('better-sqlite3').Statement | null = null
let _stmtNotifMonthSpentByCat: import('better-sqlite3').Statement | null = null
let _stmtNotifIncome: import('better-sqlite3').Statement | null = null
let _stmtNotifGoals: import('better-sqlite3').Statement | null = null

function checkNotifications() {
  try {
    _stmtNotifBills ??= db.prepare(`SELECT name, nextDueDate FROM "RecurringBill" WHERE isActive = 1`)
    _stmtNotifBudgets ??= db.prepare(`
      SELECT b.id, b.categoryId, b.amount, c.name AS categoryName
      FROM "Budget" b
      JOIN "Category" c ON c.id = b.categoryId
    `)
    _stmtNotifMonthSpentByCat ??= db.prepare(`
      SELECT categoryId, SUM(ABS(amount)) AS spent
      FROM "Transaction"
      WHERE type = 'DEBIT' AND date >= ? AND date < ?
      GROUP BY categoryId
    `)
    _stmtNotifIncome ??= db.prepare(`SELECT name, nextExpectedDate FROM "RecurringIncome" WHERE isActive = 1`)
    _stmtNotifGoals ??= db.prepare(`SELECT name, targetAmount, currentAmount FROM "SavingsGoal"`)

    const now = new Date()
    const today = new Date(now); today.setUTCHours(0, 0, 0, 0)

    // ── Bills ──────────────────────────────────────────────────────────────────
    const bills = _stmtNotifBills.all() as Array<{ name: string; nextDueDate: string }>
    const overdue: string[] = []
    const dueSoon: string[] = []
    for (const bill of bills) {
      const due = new Date(bill.nextDueDate); due.setUTCHours(0, 0, 0, 0)
      const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
      if (days < 0) overdue.push(bill.name)
      else if (days <= 3) dueSoon.push(`${bill.name} (${days === 0 ? 'today' : `in ${days}d`})`)
    }
    if (overdue.length > 0) notify(`${overdue.length} overdue bill${overdue.length > 1 ? 's' : ''}`, overdue.join(', '))
    if (dueSoon.length > 0) notify(`Bill${dueSoon.length > 1 ? 's' : ''} due soon`, dueSoon.join(', '))

    // ── Budgets ────────────────────────────────────────────────────────────────
    const budgets = _stmtNotifBudgets.all() as Array<{ id: number; categoryId: number; amount: number; categoryName: string }>
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    const monthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
    const spentRows = _stmtNotifMonthSpentByCat.all(monthStart, monthEnd) as Array<{ categoryId: number | null; spent: number }>
    const spentByCat = new Map<number | null, number>()
    for (const r of spentRows) spentByCat.set(r.categoryId, Number(r.spent))
    const exceededBudgets: string[] = []
    const warningBudgets: string[] = []
    for (const budget of budgets) {
      const limit = Number(budget.amount)
      if (!limit) continue
      const spent = spentByCat.get(budget.categoryId) ?? 0
      const pct = (spent / limit) * 100
      if (pct >= 100) exceededBudgets.push(`${budget.categoryName} (${Math.round(pct)}%)`)
      else if (pct >= 80) warningBudgets.push(`${budget.categoryName} (${Math.round(pct)}%)`)
    }
    if (exceededBudgets.length > 0) notify(`${exceededBudgets.length} budget${exceededBudgets.length > 1 ? 's' : ''} exceeded`, exceededBudgets.join(', '))
    if (warningBudgets.length > 0) notify(`${warningBudgets.length} budget${warningBudgets.length > 1 ? 's' : ''} near limit`, warningBudgets.join(', '))

    // ── Recurring income (late) ────────────────────────────────────────────────
    const incomeItems = _stmtNotifIncome.all() as Array<{ name: string; nextExpectedDate: string }>
    const lateIncome: string[] = []
    for (const inc of incomeItems) {
      const due = new Date(inc.nextExpectedDate); due.setUTCHours(0, 0, 0, 0)
      const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
      if (days < 0) lateIncome.push(`${inc.name} (${Math.abs(days)}d late)`)
    }
    if (lateIncome.length > 0) notify('Expected income not yet received', lateIncome.join(', '))

    // ── Savings goals ──────────────────────────────────────────────────────────
    const goals = _stmtNotifGoals.all() as Array<{ name: string; targetAmount: number; currentAmount: number }>
    const reachedGoals: string[] = []
    for (const goal of goals) {
      const pct = Number(goal.targetAmount) > 0
        ? (Number(goal.currentAmount) / Number(goal.targetAmount)) * 100
        : 0
      if (pct >= 100) reachedGoals.push(goal.name)
    }
    if (reachedGoals.length > 0) notify(`${reachedGoals.length} savings goal${reachedGoals.length > 1 ? 's' : ''} reached!`, reachedGoals.join(', '))
  } catch {
    // DB not ready — ignore
  }
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})

app.whenReady().then(() => {
  runMigrations()
  try {
    setupIpcHandlers(ipcMain)
  } catch (e: any) {
    dialog.showErrorBox('Startup error', `Failed to initialise IPC handlers:\n\n${e?.message ?? e}`)
    app.quit()
    return
  }
  createWindow()

  const { priceRefreshInterval } = loadAppSettings()
  startScheduler(priceRefreshInterval)

  setTimeout(checkNotifications, 3000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopScheduler()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  // better-sqlite3 close is synchronous; no need to defer quit.
  try { db.close() } catch { /* already closed */ }
})
