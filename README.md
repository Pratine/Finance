# Finance

A personal finance desktop app built with Electron. Tracks accounts, transactions, budgets, bills, savings, investments, and debts — all stored locally in a SQLite database with no cloud dependency.

![Platform](https://img.shields.io/badge/platform-Windows-blue) ![Version](https://img.shields.io/badge/version-0.5.0-green)

---

## Features

- **Dashboard** — Net worth snapshot, spending summary, upcoming bills, recent transactions, and portfolio value at a glance
- **Accounts** — Track multiple bank accounts with running balance and correction history
- **Transactions** — Full ledger with categories, tags, splits, and virtual list for large datasets
- **Import** — Import bank statements from Millennium BCP or Revolut CSV exports; import investment lots from Trading 212 CSV exports; duplicates are automatically skipped
- **Budgets** — Monthly spending limits per category with progress tracking and bill reserves
- **Recurring Bills & Income** — Scheduled payments and income with overdue alerts
- **Savings Goals** — Track savings targets with interest accrual and contribution history
- **Investments** — Portfolio tracking with lot-level cost basis, CAGR, unrealised P&L, and price history charts; prices fetched automatically from Yahoo Finance with ISIN-based exchange resolution via OpenFIGI
- **Debts** — Loans and receivables with amortisation, payment history, and interest split per payment
- **Reports** — Spending by category, cash flow, net worth history, and budget history over configurable date ranges
- **Auto-updater** — Checks for new releases on startup and installs on quit
- **Notifications** — System alerts for overdue bills, budget overruns, late income, and reached savings goals
- **Dark mode** — Full light/dark theme support

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Electron 31 |
| UI | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Database | SQLite via better-sqlite3 |
| Charts | Recharts |
| Icons | Lucide React |
| Tests | Vitest |
| Build | Electron Builder |

---

## Getting started

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
npx prisma migrate dev
```

### Run in development

```bash
npm run dev
```

### Run tests

```bash
npm test
```

### Build installer

```bash
npm run dist
```

Output is placed in `release/`.

---

## Data

All data is stored locally in a SQLite database in the app's user data directory. No data is sent to any server.

Exchange rates and investment prices are fetched from public APIs on a configurable schedule.

---

## Releases

Releases are published on [GitHub Releases](https://github.com/Pratine/Finance/releases) in two flavours:

| Download | Description |
|---|---|
| `Finance Setup x.x.x.exe` | Standard installer — installs the app and starts with a blank database |
| `Finance-Demo-x.x.x-portable.exe` | No installation required — run it directly and it launches with sample data pre-loaded |

The portable demo is a good way to explore the app before committing to setting up your own data. It stores its data in your user profile so your demo session persists between runs.

The installed version checks for updates automatically 5 seconds after launch and installs them on quit.
