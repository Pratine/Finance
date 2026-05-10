import { app, BrowserWindow, ipcMain, Notification, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { autoUpdater } from 'electron-updater'
import { setupIpcHandlers } from '../ipc'
import { prisma } from '../db'
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

// Runs pending Prisma migrations at startup — safe to call repeatedly.
// Uses ELECTRON_RUN_AS_NODE=1 so the Electron binary behaves as plain Node.js
// when spawned as a child, avoiding the infinite re-launch loop that would
// occur if we called process.execPath without that flag.
function runMigrations() {
  try {
    const base = app.getAppPath()
    const prismaCli = path.join(base, 'node_modules', 'prisma', 'build', 'index.js')
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      cwd: base,
      stdio: 'pipe',
    })
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

function setupAutoUpdater(win: BrowserWindow) {
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
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
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

  // Persist window size/position so the next launch restores it
  const persistState = () => saveWindowState(win)
  win.on('resize', persistState)
  win.on('move',   persistState)
  win.on('close',  persistState)

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

async function checkNotifications() {
  try {
    const now = new Date()
    const today = new Date(now); today.setHours(0, 0, 0, 0)

    // ── Bills ──────────────────────────────────────────────────────────────────
    const bills = await prisma.recurringBill.findMany({ where: { isActive: true } })
    const overdue: string[] = []
    const dueSoon: string[] = []
    for (const bill of bills) {
      const due = new Date(bill.nextDueDate); due.setHours(0, 0, 0, 0)
      const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
      if (days < 0) overdue.push(bill.name)
      else if (days <= 3) dueSoon.push(`${bill.name} (${days === 0 ? 'today' : `in ${days}d`})`)
    }
    if (overdue.length > 0) notify(`${overdue.length} overdue bill${overdue.length > 1 ? 's' : ''}`, overdue.join(', '))
    if (dueSoon.length > 0) notify(`Bill${dueSoon.length > 1 ? 's' : ''} due soon`, dueSoon.join(', '))

    // ── Budgets ────────────────────────────────────────────────────────────────
    const budgets = await prisma.budget.findMany({ include: { category: true } })
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const monthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    const monthTxns  = await prisma.transaction.findMany({
      where: { type: 'DEBIT', date: { gte: monthStart, lt: monthEnd } },
    })
    for (const budget of budgets) {
      const limit = Number(budget.amount)
      if (!limit) continue
      const spent = monthTxns
        .filter(t => t.categoryId === budget.categoryId)
        .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
      const pct = (spent / limit) * 100
      if (pct >= 100) {
        notify(`${budget.category.name} budget exceeded`, `Spent ${spent.toFixed(2)} € of ${limit.toFixed(2)} € (${Math.round(pct)}%)`)
      } else if (pct >= 80) {
        notify(`${budget.category.name} budget at ${Math.round(pct)}%`, `${spent.toFixed(2)} € of ${limit.toFixed(2)} € spent`)
      }
    }

    // ── Recurring income (late) ────────────────────────────────────────────────
    const incomeItems = await prisma.recurringIncome.findMany({ where: { isActive: true } })
    const lateIncome: string[] = []
    for (const inc of incomeItems) {
      const due = new Date(inc.nextExpectedDate); due.setHours(0, 0, 0, 0)
      const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
      if (days < 0) lateIncome.push(`${inc.name} (${Math.abs(days)}d late)`)
    }
    if (lateIncome.length > 0) notify('Expected income not yet received', lateIncome.join(', '))

    // ── Savings goals ──────────────────────────────────────────────────────────
    const goals = await prisma.savingsGoal.findMany()
    for (const goal of goals) {
      const pct = Number(goal.targetAmount) > 0
        ? (Number(goal.currentAmount) / Number(goal.targetAmount)) * 100
        : 0
      if (pct >= 100) {
        notify(`🎉 ${goal.name} goal reached!`, `You saved ${Number(goal.currentAmount).toFixed(2)} €`)
      }
    }
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
  setupIpcHandlers(ipcMain)
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
