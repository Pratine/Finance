import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { PrismaClient } from '@prisma/client'

// In production, store the SQLite database in the user's app data folder so it
// persists between updates. In dev, use a path relative to the project root.
// app.getAppPath() is reliable in both modes; process.cwd() is not (it depends
// on the directory the process was launched from).
if (!process.env.DATABASE_URL) {
  let dbPath: string

  if (!app.isPackaged) {
    dbPath = path.join(app.getAppPath(), 'prisma', 'dev.db')
  } else if (process.env.PORTABLE_EXECUTABLE_DIR) {
    // Portable demo: store the db next to the exe so it never conflicts with
    // an installed copy. On first run, seed from the bundled demo.db.
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
    dbPath = path.join(portableDir, 'finance-demo.db')
    if (!fs.existsSync(dbPath)) {
      const bundled = path.join(process.resourcesPath, 'demo.db')
      if (fs.existsSync(bundled)) fs.copyFileSync(bundled, dbPath)
    }
  } else {
    dbPath = path.join(app.getPath('userData'), 'finance.db')
  }

  process.env.DATABASE_URL = `file:${dbPath}`
}

export const prisma = new PrismaClient({
  // 'query' is intentionally omitted: it logs full SQL including financial amounts.
  log: ['warn', 'error'],
})
