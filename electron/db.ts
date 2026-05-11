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

export const dbPath = resolveDbPath()

// Synchronous Database handle — better-sqlite3 has no async API.
export const db = new Database(dbPath)

// WAL gives much better concurrency for a single-writer/multi-reader workload
// (we never block the renderer waiting on the DB), and foreign_keys must be
// turned on explicitly — SQLite ships with them off for backwards compat.
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
