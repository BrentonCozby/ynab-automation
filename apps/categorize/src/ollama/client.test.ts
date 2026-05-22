import { OllamaError } from '@ynab-automation/common/errors'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createOllamaClient } from './client.js'

const BASE_URL = 'http://localhost:11434'

const server = setupServer()

beforeAll((): void => server.listen({ onUnhandledRequest: 'error' }))
afterEach((): void => server.resetHandlers())
afterAll((): void => server.close())

function makeClient(): ReturnType<typeof createOllamaClient> {
  return createOllamaClient({ baseUrl: BASE_URL, model: 'qwen2.5:14b' })
}

describe('createOllamaClient.chatJson', (): void => {
  it('sends model + messages and returns parsed result', async (): Promise<void> => {
    type ChatBody = { model?: string; messages?: unknown[] }
    let receivedBody: ChatBody | null = null
    server.use(
      http.post(`${BASE_URL}/api/chat`, async ({ request }) => {
        receivedBody = (await request.json()) as ChatBody

        return HttpResponse.json({
          message: { role: 'assistant', content: '{"category_id":"c1"}' },
          prompt_eval_count: 42,
        })
      }),
    )

    const result = await makeClient().chatJson([{ role: 'user', content: 'pick a category' }])
    expect(result.content).toBe('{"category_id":"c1"}')
    expect(result.promptTokens).toBe(42)
    // Cast: TS narrows the variable to its initializer type because msw assigns inside a callback.
    const body = receivedBody as ChatBody | null
    expect(body?.model).toBe('qwen2.5:14b')
    expect(body?.messages).toHaveLength(1)
  })

  it('omits promptTokens when prompt_eval_count is absent', async (): Promise<void> => {
    server.use(
      http.post(`${BASE_URL}/api/chat`, () =>
        HttpResponse.json({ message: { role: 'assistant', content: '{}' } }),
      ),
    )

    const result = await makeClient().chatJson([{ role: 'user', content: 'hi' }])
    expect(result.promptTokens).toBeUndefined()
  })

  it('throws OllamaError on non-2xx', async (): Promise<void> => {
    server.use(
      http.post(`${BASE_URL}/api/chat`, () =>
        HttpResponse.text('model not loaded', { status: 503 }),
      ),
    )

    await expect(makeClient().chatJson([{ role: 'user', content: 'x' }])).rejects.toThrow(
      OllamaError,
    )
  })

  it('retries on 5xx and eventually succeeds', async (): Promise<void> => {
    let calls = 0
    server.use(
      http.post(`${BASE_URL}/api/chat`, () => {
        calls++
        if (calls < 2) return HttpResponse.text('overloaded', { status: 503 })

        return HttpResponse.json({ message: { role: 'assistant', content: '{}' } })
      }),
    )

    const result = await makeClient().chatJson([{ role: 'user', content: 'x' }])
    expect(result.content).toBe('{}')
    expect(calls).toBe(2)
  })

  it('throws on shape mismatch (zod validation)', async (): Promise<void> => {
    server.use(http.post(`${BASE_URL}/api/chat`, () => HttpResponse.json({ not: 'right' })))

    await expect(makeClient().chatJson([{ role: 'user', content: 'x' }])).rejects.toThrow()
  })

  it('does not retry on 4xx (client error)', async (): Promise<void> => {
    let calls = 0
    server.use(
      http.post(`${BASE_URL}/api/chat`, () => {
        calls++

        return HttpResponse.text('bad request', { status: 400 })
      }),
    )

    await expect(makeClient().chatJson([{ role: 'user', content: 'x' }])).rejects.toThrow(
      OllamaError,
    )
    expect(calls).toBe(1)
  })
})
