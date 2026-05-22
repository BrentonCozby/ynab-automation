import { OllamaError } from '@ynab-automation/common/errors'
import { withRetry } from '@ynab-automation/common/retry'
import {
  OLLAMA_FIRST_CALL_TIMEOUT_MS,
  OLLAMA_NUM_PREDICT,
  OLLAMA_TIMEOUT_MS,
} from '../constants.js'
import { chatResponseSchema } from './schemas.js'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type ChatResult = {
  content: string
  latencyMs: number
  promptTokens?: number
}

type OllamaClientInit = { baseUrl: string; model: string }

export type OllamaClient = {
  chatJson: (messages: ChatMessage[]) => Promise<ChatResult>
}

export function createOllamaClient({ baseUrl, model }: OllamaClientInit): OllamaClient {
  // Stays true until the first SUCCESSFUL call returns — failed calls don't reset it
  // because the model still hasn't been confirmed warm yet.
  let firstCall = true

  async function chatJson(messages: ChatMessage[]): Promise<ChatResult> {
    return withRetry(async () => {
      const timeoutMs = firstCall ? OLLAMA_FIRST_CALL_TIMEOUT_MS : OLLAMA_TIMEOUT_MS
      const start = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            format: 'json',
            options: { num_predict: OLLAMA_NUM_PREDICT },
          }),
          signal: controller.signal,
        })
        if (!res.ok) {
          const body = await res.text()
          throw new OllamaError({
            message: `Ollama /api/chat → ${res.status}: ${body}`,
            status: res.status,
            body,
            retryable: res.status >= 500 || res.status === 429,
          })
        }
        const json = chatResponseSchema.parse(await res.json())
        firstCall = false

        return {
          content: json.message.content,
          latencyMs: Date.now() - start,
          ...(json.prompt_eval_count !== undefined && { promptTokens: json.prompt_eval_count }),
        }
      } catch (err) {
        if (err instanceof OllamaError) throw err
        if (err instanceof Error && err.name === 'AbortError') {
          throw new OllamaError({
            message: `Ollama call timed out after ${timeoutMs}ms`,
            retryable: true,
            cause: err,
          })
        }
        throw new OllamaError({
          message: `Ollama call failed: ${err instanceof Error ? err.message : String(err)}`,
          retryable: true,
          cause: err,
        })
      } finally {
        clearTimeout(timer)
      }
    })
  }

  return { chatJson }
}
