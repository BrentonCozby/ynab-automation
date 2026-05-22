export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: Error }

export function tryParseJson<T = unknown>(s: string): ParseResult<T> {
  try {
    return { ok: true, value: JSON.parse(s) as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
  }
}
