// Investment growth simulator.
// Models monthly contributions with separate price appreciation (ROI)
// and dividend yield. Dividends can be reinvested (DRIP) or taken as cash.

export type ContributionGrowthType = 'none' | 'percentage' | 'fixed'

export interface SimulationParams {
  monthlyContribution: number   // EUR added each month (starting amount)
  annualROI: number             // % annual price appreciation (capital gains)
  annualDividendYield: number   // % annual dividend yield
  years: number                 // time horizon
  reinvestDividends: boolean    // whether dividends are added back to portfolio
  contributionGrowthType: ContributionGrowthType
  contributionGrowthValue: number // % or EUR increase applied each year
}

export interface YearSnapshot {
  year: number
  portfolioValue: number      // value at year end (contributions + appreciation)
  totalInvested: number       // cumulative contributions
  monthlyContribution: number // monthly contribution during this year
  yearDividends: number       // dividends earned this year
  totalDividends: number      // cumulative dividends
}

export interface SimulationResult {
  totalInvested: number
  finalValue: number      // portfolio value at end
  totalGains: number      // price appreciation only (finalValue - totalInvested - reinvested dividends)
  totalDividends: number  // total dividends earned over the period
  grandTotal: number      // finalValue + cash dividends (if not reinvested)
  snapshots: YearSnapshot[]
}

export function simulate(params: SimulationParams): SimulationResult {
  const {
    monthlyContribution, annualROI, annualDividendYield, years, reinvestDividends,
    contributionGrowthType, contributionGrowthValue,
  } = params
  const months = years * 12
  const monthlyGrowth = Math.pow(1 + annualROI / 100, 1 / 12) - 1
  const monthlyDividend = annualDividendYield / 100 / 12

  let portfolio = 0
  let totalInvested = 0
  let totalDividends = 0
  let cashDividends = 0
  let currentMonthlyContribution = monthlyContribution

  const snapshots: YearSnapshot[] = []
  let yearDividends = 0

  for (let m = 1; m <= months; m++) {
    // Increase contribution at the start of each new year (except year 1)
    if (m > 1 && (m - 1) % 12 === 0) {
      if (contributionGrowthType === 'percentage' && contributionGrowthValue > 0) {
        currentMonthlyContribution *= (1 + contributionGrowthValue / 100)
      } else if (contributionGrowthType === 'fixed' && contributionGrowthValue > 0) {
        currentMonthlyContribution += contributionGrowthValue
      }
    }

    // 1. Add monthly contribution
    portfolio += currentMonthlyContribution
    totalInvested += currentMonthlyContribution

    // 2. Price appreciation
    portfolio *= (1 + monthlyGrowth)

    // 3. Dividends on current portfolio value
    const div = portfolio * monthlyDividend
    totalDividends += div
    yearDividends += div
    if (reinvestDividends) {
      portfolio += div
    } else {
      cashDividends += div
    }

    // Snapshot at each year end
    if (m % 12 === 0) {
      const year = m / 12
      snapshots.push({
        year,
        portfolioValue: portfolio,
        totalInvested,
        monthlyContribution: currentMonthlyContribution,
        yearDividends,
        totalDividends,
      })
      yearDividends = 0
    }
  }

  const totalGains = portfolio - totalInvested - (reinvestDividends ? totalDividends : 0)

  return {
    totalInvested,
    finalValue: portfolio,
    totalGains,
    totalDividends,
    grandTotal: reinvestDividends ? portfolio : portfolio + cashDividends,
    snapshots,
  }
}
