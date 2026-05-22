import { describe, expect, it } from 'vitest'
import { tryParseJson } from './json.js'

describe('tryParseJson', (): void => {
  it('parses valid JSON object', (): void => {
    const r = tryParseJson<{ a: number }>('{"a":1}')
    expect(r).toEqual({ ok: true, value: { a: 1 } })
  })

  it('parses literal null distinctly from parse error', (): void => {
    const r = tryParseJson('null')
    expect(r).toEqual({ ok: true, value: null })
  })

  it('parses literal numbers', (): void => {
    const r = tryParseJson('42')
    expect(r).toEqual({ ok: true, value: 42 })
  })

  it('returns ok:false on invalid JSON', (): void => {
    const r = tryParseJson('{not json')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBeInstanceOf(Error)
  })

  it('returns ok:false on empty input', (): void => {
    const r = tryParseJson('')
    expect(r.ok).toBe(false)
  })
})
