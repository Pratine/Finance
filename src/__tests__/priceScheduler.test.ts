import { describe, it, expect } from 'vitest'
import { INTERVAL_MS } from '../../electron/services/priceScheduler'

// 'startup' fires once on startup but has no repeating timer (ms === null).
// These tests verify the production INTERVAL_MS values, not a local copy.

describe('INTERVAL_MS', () => {
  it('never and startup have no timer (null)', () => {
    expect(INTERVAL_MS['never']).toBeNull()
    expect(INTERVAL_MS['startup']).toBeNull()
  })

  it('timed intervals increase monotonically', () => {
    const timed = (['1h', '4h', '8h', '24h'] as const).map(k => INTERVAL_MS[k]!)
    for (let i = 1; i < timed.length; i++) {
      expect(timed[i]).toBeGreaterThan(timed[i - 1])
    }
  })

  it('all timed intervals are positive', () => {
    const timed = (['1h', '4h', '8h', '24h'] as const).map(k => INTERVAL_MS[k]!)
    for (const ms of timed) {
      expect(ms).toBeGreaterThan(0)
    }
  })
})
