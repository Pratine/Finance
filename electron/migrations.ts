// Lightweight replacement for `prisma migrate deploy`.
// Reads SQL files from prisma/migrations/<timestamp>_<name>/migration.sql,
// applies any not yet recorded in the _migrations table, and tracks them.
//
// The on-disk file format (Prisma's own migration directory layout) is kept
// unchanged so historical migrations don't need to be re-authored.
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { db } from './db'

function migrationsDir(): string {
  // In dev: <repo>/prisma/migrations
  // In prod: included via electron-builder "files" → app.getAppPath() resolves
  // to the asar-unpacked app folder, where the prisma/ folder is bundled.
  return path.join(app.getAppPath(), 'prisma', 'migrations')
}

export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const dir = migrationsDir()
  if (!fs.existsSync(dir)) {
    console.warn(`Migrations directory does not exist: ${dir}`)
    return
  }

  const all = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort() // timestamp-prefixed names sort chronologically

  const appliedSet = new Set<string>(
    db.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name),
  )

  for (const name of all) {
    if (appliedSet.has(name)) continue
    const sqlFile = path.join(dir, name, 'migration.sql')
    if (!fs.existsSync(sqlFile)) {
      console.warn(`Migration ${name} has no migration.sql — skipping`)
      continue
    }
    const sql = fs.readFileSync(sqlFile, 'utf8')
    const apply = db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name)
    })
    try {
      apply()
    } catch (e: any) {
      // "already exists" means Prisma already created this table — mark applied and move on.
      // Any other error (e.g. bad SQL, missing column reference) is a real failure.
      if (e?.message?.includes('already exists')) {
        db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(name)
      } else {
        console.error(`Migration ${name} failed:`, e)
        throw e
      }
    }
  }
}
