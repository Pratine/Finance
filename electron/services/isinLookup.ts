// Converts an ISIN to ticker symbols via the OpenFIGI API (free, no key needed).
// Returns one result per exchange the security is listed on, so the user
// can choose the exchange that matches their broker.
import https from 'https'

export interface ISINResult {
  ticker: string        // e.g. IWDA
  yahooTicker: string   // ticker + exchange suffix for Yahoo Finance, e.g. IWDA.AS
  exchange: string      // human-readable exchange name, e.g. "Amsterdam"
  exchCode: string      // raw exchange code from OpenFIGI
  name: string
  currency: string
}

// Maps OpenFIGI exchange codes to Yahoo Finance ticker suffixes and display names.
const EXCHANGE_MAP: Record<string, { suffix: string; label: string }> = {
  AMS:    { suffix: '.AS', label: 'Amsterdam (Euronext)' },
  XETRA:  { suffix: '.DE', label: 'Frankfurt (XETRA)' },
  LSE:    { suffix: '.L',  label: 'London (LSE)' },
  SIX:    { suffix: '.SW', label: 'Zurich (SIX)' },
  EPA:    { suffix: '.PA', label: 'Paris (Euronext)' },
  BME:    { suffix: '.MC', label: 'Madrid (BME)' },
  MIL:    { suffix: '.MI', label: 'Milan (Borsa Italiana)' },
  US:     { suffix: '',    label: 'United States' },
  NYQ:    { suffix: '',    label: 'New York (NYSE)' },
  NMS:    { suffix: '',    label: 'NASDAQ' },
}

const TIMEOUT_MS = 10_000

function post(url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Mozilla/5.0',
      },
    }, (res) => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    })
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${TIMEOUT_MS}ms`))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export async function lookupISIN(isin: string): Promise<ISINResult[]> {
  const clean = isin.trim().toUpperCase()
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(clean)) {
    throw new Error(`Invalid ISIN format: ${clean}`)
  }

  const raw = await post(
    'https://api.openfigi.com/v3/mapping',
    JSON.stringify([{ idType: 'ID_ISIN', idValue: clean }])
  )

  const json = JSON.parse(raw)
  const data = json?.[0]?.data
  if (!data || data.length === 0) {
    const warning = json?.[0]?.warning
    throw new Error(warning ?? `No results found for ISIN ${clean}`)
  }

  const results: ISINResult[] = []
  for (const item of data) {
    if (!item.ticker) continue
    const exchCode: string = item.exchCode ?? ''
    const map = EXCHANGE_MAP[exchCode]
    const suffix = map?.suffix ?? ''
    const label = map?.label ?? exchCode

    results.push({
      ticker: item.ticker,
      yahooTicker: `${item.ticker}${suffix}`,
      exchange: label,
      exchCode,
      name: item.name ?? item.ticker,
      // OpenFIGI v3/mapping returns `currency` when available; marketSector is
      // the asset class ("Equity", "Index") and must not be used here.
      currency: item.currency ?? '',
    })
  }

  if (results.length === 0) throw new Error(`No tradeable listings found for ${clean}`)
  return results
}
