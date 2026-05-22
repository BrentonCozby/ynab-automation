import { describe, expect, it } from 'vitest'
import { chunks } from './chunks.js'

describe('chunks', (): void => {
  it('splits array into equal-sized batches', (): void => {
    const result = [...chunks({ arr: [1, 2, 3, 4, 5, 6], size: 2 })]
    expect(result).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ])
  })

  it('last batch may be smaller', (): void => {
    const result = [...chunks({ arr: [1, 2, 3, 4, 5], size: 2 })]
    expect(result).toEqual([[1, 2], [3, 4], [5]])
  })

  it('yields nothing for empty array', (): void => {
    expect([...chunks({ arr: [] as number[], size: 3 })]).toEqual([])
  })

  it('handles size larger than array', (): void => {
    expect([...chunks({ arr: [1, 2], size: 10 })]).toEqual([[1, 2]])
  })
})
