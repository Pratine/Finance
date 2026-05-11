import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'

// Resolve the DB file path the same way as the previous Prisma setup so existing
// installations continue to read/write the same file.
function resolveDbPath(): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), 'prisma', 'dev.db')
  }
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    // Portable demo: store the db next to the exe so it never conflicts with
    // an installed copy. On first run, seed from the bundled demo.db.
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
    const dbPath = path.join(portableDir, 'finance-demo.db')
    if (!fs.existsSync(dbPath)) {
      const bundled = path.join(process.resourcesPath, 'demo.db')
      if (fs.existsSync(bundled)) fs.copyFileSync(bundled, dbPath)
    }
    return dbPath
  }
  return path.join(app.getPath('userData'), 'finance.db')
}

// Lazy: opening the DB requires Electron's `app` to be available, but several
// modules import this file just for type/util re-exports (and for tests that
// never touch the DB). Defer the actual open until the first access.
let _db: Database.Database | null = null
let _dbPath: string | null = null

function open(): Database.Database {
  if (_db) return _db
  _dbPath = resolveDbPath()
  _db = new Database(_dbPath)
  // WAL gives much better concurrency for a single-writer/multi-reader workload
  // (we never block the renderer waiting on the DB), and foreign_keys must be
  // turned on explicitly — SQLite ships with them off for backwards compat.
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  return _db
}

// Proxy that opens the DB on first method access. Code can `import { db }` and
// call `db.prepare(...)` exactly as if it were a real Database instance.
export const db = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const real = open() as any
    const value = real[prop]
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export function getDbPath(): string {
  if (!_dbPath) open()
  return _dbPath!
}
