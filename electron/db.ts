// Single shared PrismaClient instance for the main process.
// Query logging is enabled in development to make SQL visible in the terminal.
import { PrismaClient } from '@prisma/client'

// In packaged builds the .env file is not present, so Prisma's built-in dotenv
// loader finds nothing. Set a fallback so the app can connect to the local
// Docker Postgres without any manual configuration by the user.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://finance_user:finance_pass@localhost:5432/finance_db'
}

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
})
