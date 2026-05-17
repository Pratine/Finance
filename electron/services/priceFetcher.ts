// Fetches the current market price for a ticker symbol from Yahoo Finance.
// Uses the unofficial chart API — no API key required.
// Throws if the ticker is not found, the network request fails, or times out.
import https from 'https'
import { lookupISIN } from './isinLookup'

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
      res.on('end', () => {
        if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
          reject(new Error(`HTTP_${res.statusCode}`))
        } else {
          resolve(data)
        }
      })
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
  let raw: string
  try {
    raw = await get(url)
  } catch (e: any) {
    if (e?.message?.startsWith('HTTP_')) {
      const code = e.message.slice(5)
      if (code === '404') throw new Error(`${symbol}: ticker not found — check the exchange suffix (e.g. SXR8.DE)`)
      throw new Error(`${symbol}: HTTP ${code}`)
    }
    throw new Error(`${symbol}: ${e?.message ?? 'network error'}`)
  }
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

export interface PriceResultWithResolved extends PriceResult {
  resolvedTicker: string   // may differ from the input if ISIN fallback was used
}

// Preferred exchanges for EUR-denominated portfolios — tried first during ISIN fallback.
const EUR_EXCHANGE_PRIORITY = ['AMS', 'XETRA', 'EPA', 'MIL', 'BME', 'SIX']

// OpenFIGI rate-limits unauthenticated callers to ~25 req/minute (one every
// ~2.4s). The price scheduler may invoke fetchPriceWithISINFallback for many
// investments in parallel; serialise the OpenFIGI calls with a minimal delay
// chain so we don't burst past the limit and start getting 429s. Until we
// implement batch lookups this is the lowest-risk guard.
let _isinLookupChain: Promise<unknown> = Promise.resolve()
const ISIN_LOOKUP_MIN_GAP_MS = 200
function rateLimitedISINLookup(isin: string): Promise<Awaited<ReturnType<typeof lookupISIN>>> {
  const next = _isinLookupChain
    .catch(() => undefined)
    .then(async () => {
      const result = await lookupISIN(isin)
      await new Promise(r => setTimeout(r, ISIN_LOOKUP_MIN_GAP_MS))
      return result
    })
  _isinLookupChain = next
  return next
}

// Try to fetch a price using the known ticker. If that 404s and we have an ISIN,
// query OpenFIGI for all exchange listings and try each Yahoo ticker until one works.
// Returns the resolved ticker so the caller can persist it back to the DB.
export async function fetchPriceWithISINFallback(
  ticker: string | null,
  isin: string | null,
): Promise<PriceResultWithResolved> {
  // 1. Try the stored ticker first (fast path)
  if (ticker) {
    try {
      const result = await fetchPrice(ticker)
      return { ...result, resolvedTicker: ticker }
    } catch (e: any) {
      // Only fall back to ISIN on "ticker not found" — propagate network/timeout errors
      if (!isin || !e?.message?.includes('ticker not found')) throw e
    }
  }

  if (!isin) {
    throw new Error(`${ticker ?? '(no ticker)'}: ticker not found and no ISIN available for fallback`)
  }

  // 2. Use OpenFIGI to discover Yahoo-compatible tickers for this ISIN
  let listings: Awaited<ReturnType<typeof lookupISIN>>
  try {
    listings = await rateLimitedISINLookup(isin)
  } catch {
    throw new Error(`${ticker ?? isin}: ticker not found on Yahoo Finance and ISIN lookup failed`)
  }

  // Prefer EUR-denominated exchanges so we don't need currency conversion
  const sorted = [...listings].sort((a, b) => {
    const ai = EUR_EXCHANGE_PRIORITY.indexOf(a.exchCode)
    const bi = EUR_EXCHANGE_PRIORITY.indexOf(b.exchCode)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  for (const listing of sorted) {
    try {
      const result = await fetchPrice(listing.yahooTicker)
      return { ...result, resolvedTicker: listing.yahooTicker }
    } catch {
      // try next listing
    }
  }

  throw new Error(`${isin}: could not find a working price feed (tried ${sorted.map(l => l.yahooTicker).join(', ')})`)
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
