import { describe, expect, it, vi } from 'vitest'
import { AppError } from './errors.js'
import { withRetry } from './retry.js'

describe('withRetry', (): void => {
  it('returns the result on first success', async (): Promise<void> => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on a retryable AppError until success', async (): Promise<void> => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      if (calls < 3) throw new AppError({ message: 'transient', retryable: true })

      return 'ok'
    })
    const result = await withRetry(fn, { attempts: 5, baseDelayMs: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-retryable AppErrors', async (): Promise<void> => {
    const fn = vi.fn(async () => {
      throw new AppError({ message: 'permanent', retryable: false })
    })
    await expect(withRetry(fn, { attempts: 5, baseDelayMs: 1 })).rejects.toThrow('permanent')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws after exhausting attempts', async (): Promise<void> => {
    const fn = vi.fn(async () => {
      throw new AppError({ message: 'still bad', retryable: true })
    })
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow('still bad')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('respects custom isRetryable', async (): Promise<void> => {
    const fn = vi.fn(async () => {
      throw new Error('whatever')
    })
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 1, isRetryable: () => false }),
    ).rejects.toThrow('whatever')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
