import { app } from 'electron'
import path from 'path'
import { PrismaClient } from '@prisma/client'

// In production, store the SQLite database in the user's app data folder so it
// persists between updates. In dev, use a local file next to the schema.
if (!process.env.DATABASE_URL) {
  const dbPath = app.isPackaged
    ? path.join(app.getPath('userData'), 'finance.db')
    : path.join(process.cwd(), 'prisma', 'dev.db')
  process.env.DATABASE_URL = `file:${dbPath}`
}

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
})
