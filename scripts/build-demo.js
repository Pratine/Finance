/**
 * Build script for the portable demo release.
 *
 * Steps:
 *   1. Run tests
 *   2. Generate Prisma client
 *   3. Reset + seed a fresh demo database
 *   4. Copy the seeded db to resources/demo.db (bundled into the portable exe)
 *   5. Build the app (Vite + TypeScript)
 *   6. Run electron-builder with the portable target
 *   7. Clean up resources/demo.db
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const demoDB = path.join(root, 'resources', 'demo.db')
const sourceDB = path.join(root, 'prisma', 'prisma', 'dev.db')

function run(cmd) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: root })
}

try {
  run('npx vitest run')
  run('npx prisma generate')

  // Reset + seed a fresh demo database
  run('npx prisma migrate reset --force --skip-seed')
  run('npx prisma migrate deploy')
  run('node prisma/seed.js')

  // Bundle the seeded db
  fs.mkdirSync(path.join(root, 'resources'), { recursive: true })
  fs.copyFileSync(sourceDB, demoDB)
  console.log('\n> Copied seeded demo.db to resources/')

  // Build app
  run('vite build')
  run('tsc -p tsconfig.electron.json')

  // Build portable only
  run('electron-builder --win portable --config.extraResources[0].from=resources/demo.db --config.extraResources[0].to=demo.db')

  console.log('\n✓ Demo portable build complete — see release/')
} finally {
  // Always clean up so the regular build is not affected
  if (fs.existsSync(demoDB)) {
    fs.unlinkSync(demoDB)
    console.log('> Cleaned up resources/demo.db')
  }
}
