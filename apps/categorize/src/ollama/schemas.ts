import { z } from 'zod'

export const chatResponseSchema = z.object({
  message: z.object({
    role: z.string(),
    content: z.string(),
  }),
  total_duration: z.number().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
})

// What we expect the LLM itself to return inside `message.content` (a JSON string).
export const llmCategorizationSchema = z.object({
  category_id: z.string().optional(),
  category_name: z.string().optional(),
})

export type LlmCategorization = z.infer<typeof llmCategorizationSchema>
