import { app } from 'electron'
import path from 'path'
import { PrismaClient } from '@prisma/client'

// In production, store the SQLite database in the user's app data folder so it
// persists between updates. In dev, use a path relative to the project root.
// app.getAppPath() is reliable in both modes; process.cwd() is not (it depends
// on the directory the process was launched from).
if (!process.env.DATABASE_URL) {
  const userData = app.getPath('userData')
  const dbPath = app.isPackaged
    ? path.join(userData, 'finance.db')
    : path.join(app.getAppPath(), 'prisma', 'dev.db')

  // Portable / demo build: seed the database from the bundled demo.db on first launch.
  if (app.isPackaged && process.env.PORTABLE_EXECUTABLE_DIR && !fs.existsSync(dbPath)) {
    const bundled = path.join(process.resourcesPath, 'demo.db')
    if (fs.existsSync(bundled)) {
      fs.mkdirSync(userData, { recursive: true })
      fs.copyFileSync(bundled, dbPath)
    }
  }

  process.env.DATABASE_URL = `file:${dbPath}`
}

export const prisma = new PrismaClient({
  // 'query' is intentionally omitted: it logs full SQL including financial amounts.
  log: ['warn', 'error'],
})
