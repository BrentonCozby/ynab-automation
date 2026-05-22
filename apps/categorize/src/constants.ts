export const PAYEE_FILTER = 'Amazon'

/** Flag we set on every categorized row — and the marker we use to skip rows we've already touched. */
export const FLAG_NAME = 'auto-categorized'
export const FLAG_COLOR = 'yellow'

export const PATCH_BATCH_SIZE = 10

export const OLLAMA_NUM_PREDICT = 512
// First call after idle pays the model-load cost on top of inference, so its timeout is longer.
export const OLLAMA_FIRST_CALL_TIMEOUT_MS = 60_000
export const OLLAMA_TIMEOUT_MS = 30_000
