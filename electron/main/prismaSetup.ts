import { app } from 'electron'
import path from 'path'

// Tell Prisma exactly where its native query engine is so it skips its own
// discovery logic — which uses fs.existsSync() and breaks inside an asar archive.
// Must run before db.ts is imported (i.e. before PrismaClient is instantiated).
if (app.isPackaged) {
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '.prisma',
    'client',
    'query_engine-windows.dll.node',
  )
}
