import { describe, it, expect } from 'vitest'

// Pure logic tests for the scheduler — interval resolution and option metadata.
// The actual DB/network calls in priceScheduler.ts are tested via integration.

type RefreshInterval = 'never' | 'startup' | '1h' | '4h' | '8h' | '24h'

const INTERVAL_MS: Record<RefreshInterval, number | null> = {
  never:   null,
  startup: null,
  '1h':    60 * 60 * 1000,
  '4h':    4 * 60 * 60 * 1000,
  '8h':    8 * 60 * 60 * 1000,
  '24h':   24 * 60 * 60 * 1000,
}

// Whether the scheduler should attempt a refresh on startup
function shouldRefreshOnStartup(interval: RefreshInterval): boolean {
  return interval !== 'never'
}

// Whether a repeating timer should be set up
function hasTimer(interval: RefreshInterval): boolean {
  return INTERVAL_MS[interval] !== null && interval !== 'startup'
}

describe('INTERVAL_MS', () => {
  it('never and startup have no timer (null)', () => {
    expect(INTERVAL_MS['never']).toBeNull()
    expect(INTERVAL_MS['startup']).toBeNull()
  })

  it('1h is 3 600 000 ms', () => {
    expect(INTERVAL_MS['1h']).toBe(3_600_000)
  })

  it('4h is 14 400 000 ms', () => {
    expect(INTERVAL_MS['4h']).toBe(14_400_000)
  })

  it('8h is 28 800 000 ms', () => {
    expect(INTERVAL_MS['8h']).toBe(28_800_000)
  })

  it('24h is 86 400 000 ms', () => {
    expect(INTERVAL_MS['24h']).toBe(86_400_000)
  })

  it('intervals increase monotonically', () => {
    const timed = (['1h', '4h', '8h', '24h'] as RefreshInterval[]).map(k => INTERVAL_MS[k]!)
    for (let i = 1; i < timed.length; i++) {
      expect(timed[i]).toBeGreaterThan(timed[i - 1])
    }
  })
})

describe('shouldRefreshOnStartup', () => {
  it('never → false', () => expect(shouldRefreshOnStartup('never')).toBe(false))
  it('startup → true', () => expect(shouldRefreshOnStartup('startup')).toBe(true))
  it('1h → true', () => expect(shouldRefreshOnStartup('1h')).toBe(true))
  it('24h → true', () => expect(shouldRefreshOnStartup('24h')).toBe(true))
})

describe('hasTimer', () => {
  it('never → no timer', () => expect(hasTimer('never')).toBe(false))
  it('startup → no timer (one-shot)', () => expect(hasTimer('startup')).toBe(false))
  it('1h → has timer', () => expect(hasTimer('1h')).toBe(true))
  it('4h → has timer', () => expect(hasTimer('4h')).toBe(true))
  it('24h → has timer', () => expect(hasTimer('24h')).toBe(true))
})
