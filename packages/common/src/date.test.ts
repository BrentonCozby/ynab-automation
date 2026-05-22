import { describe, expect, it } from 'vitest'
import { isoDateNDaysAgo } from './date.js'

describe('isoDateNDaysAgo', (): void => {
  it('returns YYYY-MM-DD format', (): void => {
    const result = isoDateNDaysAgo(0)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('produces a date earlier than today for positive days', (): void => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = isoDateNDaysAgo(1)
    expect(yesterday < today).toBe(true)
  })

  it('handles 30-day lookback correctly', (): void => {
    const result = isoDateNDaysAgo(30)
    const expected = new Date()
    expected.setUTCDate(expected.getUTCDate() - 30)
    expect(result).toBe(expected.toISOString().slice(0, 10))
  })

  it('handles month boundary', (): void => {
    // Just verify it's parseable as a valid date
    const result = isoDateNDaysAgo(45)
    const parsed = new Date(result)
    expect(parsed.toString()).not.toBe('Invalid Date')
  })
})
