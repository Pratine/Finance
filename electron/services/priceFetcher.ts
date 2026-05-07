// Fetches the current market price for a ticker symbol from Yahoo Finance.
// Uses the unofficial chart API — no API key required.
// Throws if the ticker is not found or the network request fails.
import https from 'https'

export interface PriceResult {
  ticker: string
  price: number
  currency: string
  name: string
}

function get(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
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
    currency: (meta.currency ?? 'EUR') as string,
    name: (meta.longName ?? meta.shortName ?? symbol) as string,
  }
}

// Fetches X→EUR exchange rate using Yahoo Finance (e.g. USDEUR=X).
// Returns 1 if the currency is already EUR or if the fetch fails.
export async function fetchExchangeRate(fromCurrency: string): Promise<number> {
  if (fromCurrency.toUpperCase() === 'EUR') return 1
  try {
    const result = await fetchPrice(`${fromCurrency.toUpperCase()}EUR=X`)
    return result.price
  } catch {
    return 1 // fallback: no conversion
  }
}
