// Fetches the current market price for a ticker symbol from Yahoo Finance.
// Uses the unofficial chart API — no API key required.
// Throws if the ticker is not found, the network request fails, or times out.
import https from 'https'

const TIMEOUT_MS = 10_000

export interface PriceResult {
  ticker: string
  price: number
  currency: string
  name: string
}

function get(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    })
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${TIMEOUT_MS}ms: ${url}`))
    })
    req.on('error', reject)
  })
}

export async function fetchPrice(ticker: string): Promise<PriceResult> {
  const symbol = ticker.trim().toUpperCase()
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const raw = await get(url)
  const json = JSON.parse(raw)

  const result = json?.chart?.result?.[0]
  if (!result) {
    const error = json?.chart?.error?.description ?? 'Ticker not found'
    throw new Error(`${symbol}: ${error}`)
  }

  const meta = result.meta
  const price: number = meta.regularMarketPrice ?? meta.previousClose
  if (!price) throw new Error(`${symbol}: no price available`)

  return {
    ticker: symbol,
    price,
    currency: meta.currency ?? 'EUR',
    name: meta.longName ?? meta.shortName ?? symbol,
  }
}

// Fetches X→EUR exchange rate using Yahoo Finance (e.g. USDEUR=X).
// Throws on failure — callers must handle and decide whether to use a cached
// rate or surface the error. Silently returning 1 would show wrong portfolio
// values with no indication that conversion failed.
export async function fetchExchangeRate(fromCurrency: string): Promise<number> {
  if (fromCurrency.toUpperCase() === 'EUR') return 1
  const result = await fetchPrice(`${fromCurrency.toUpperCase()}EUR=X`)
  return result.price
}
