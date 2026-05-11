/**
 * Build script for the portable demo release.
 *
 * Steps:
 *   1. Run tests
 *   2. Seed a fresh demo database using better-sqlite3 + seed.js
 *   3. Copy the seeded db to resources/demo.db (bundled into the portable exe)
 *   4. Rebuild better-sqlite3 for Electron's ABI
 *   5. Build the app (Vite + TypeScript)
 *   6. Run electron-builder with the portable target
 *   7. Clean up resources/demo.db
 */

const { execSync } = require('child_process')
const { build } = require('electron-builder')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const demoDB = path.join(root, 'resources', 'demo.db')
const sourceDB = path.join(root, 'prisma', 'prisma', 'dev.db')

function run(cmd) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: root })
}

async function main() {
  try {
    run('npx vitest run')

    // Rebuild better-sqlite3 BEFORE seeding so the seed uses the same binary
    // that will be packaged. If the ABI changes between runs, an old binary
    // would be used for seeding and a new one for the app — mismatched output.
    run('npx electron-rebuild -f -w better-sqlite3')

    // Seed via Electron's Node runtime — better-sqlite3 is built for Electron's ABI,
    // not the system Node, so we must use the Electron binary as the runner.
    const electronBin = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
    process.env.ELECTRON_RUN_AS_NODE = '1'
    run(`"${electronBin}" prisma/seed.js`)
    delete process.env.ELECTRON_RUN_AS_NODE

    // Bundle the seeded db
    fs.mkdirSync(path.join(root, 'resources'), { recursive: true })
    fs.copyFileSync(sourceDB, demoDB)
    console.log('\n> Copied seeded demo.db to resources/')

    // Build app
    run('npx vite build')
    run('npx tsc -p tsconfig.electron.json')

    // Build portable with demo.db as extra resource
    await build({
      targets: require('electron-builder').Platform.WINDOWS.createTarget(['portable']),
      config: {
        extraResources: [{ from: 'resources/demo.db', to: 'demo.db' }],
        portable: { artifactName: 'Finance-Demo-${version}-portable.exe' },
      },
    })

    console.log('\n✓ Demo portable build complete — see release/')
  } finally {
    if (fs.existsSync(demoDB)) {
      fs.unlinkSync(demoDB)
      console.log('> Cleaned up resources/demo.db')
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
