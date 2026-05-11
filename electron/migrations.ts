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

  // If the DB already has user tables but _migrations is empty, this is an existing
  // install that predates the migration tracker (Prisma→better-sqlite3 upgrade path).
  // Only bootstrap when ALL known migrations are absent — a partial _migrations table
  // means the runner has already started tracking and we should apply normally.
  if (appliedSet.size === 0 && all.length > 0) {
    const userTables = db
      .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'`)
      .get() as { n: number }
    if (userTables.n > 0) {
      const insert = db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)')
      const tx = db.transaction((names: string[]) => names.forEach(n => insert.run(n)))
      tx(all)
      all.forEach(n => appliedSet.add(n))
      return
    }
  }

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
    } catch (e) {
      console.error(`Migration ${name} failed:`, e)
      throw e
    }
  }
}
