import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import pino, { type Logger as PinoLogger } from 'pino'

export type AuditEntry = {
  timestamp: string
  transaction_id: string
  payee_name: string | null
  memo: string | null
  amount_dollars: number
  chosen_category_id: string | null
  chosen_category_name: string | null
  prompt_tokens?: number
  latency_ms?: number
  status: 'ok' | 'fallback' | 'error' | 'patch_error'
  error?: string
}

type LogParams = { msg: string; extra?: Record<string, unknown> }
type LoggerInit = { verbose: boolean; name: string; auditDir?: string }

export type Logger = {
  info: (params: LogParams) => void
  warn: (params: LogParams) => void
  error: (params: LogParams) => void
  debug: (params: LogParams) => void
  audit: (entry: AuditEntry) => void
}

// `name` is the audit-log filename prefix — `${name}-YYYY-MM-DD.jsonl`. Each app passes
// its own name so the categorize and enrich-memos audit streams don't share a file.
export function createLogger({
  verbose,
  name,
  auditDir = join(process.cwd(), 'audit'),
}: LoggerInit): Logger {
  const auditPath = join(auditDir, `${name}-${todayLocalIso()}.jsonl`)
  mkdirSync(dirname(auditPath), { recursive: true })

  const pinoLogger: PinoLogger = pino({
    level: verbose ? 'debug' : 'info',
    // Use pretty output when attached to a TTY; raw JSON otherwise (better for log aggregation).
    ...(process.stdout.isTTY && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    }),
  })

  function info({ msg, extra }: LogParams): void {
    if (extra) pinoLogger.info(extra, msg)
    else pinoLogger.info(msg)
  }

  function warn({ msg, extra }: LogParams): void {
    if (extra) pinoLogger.warn(extra, msg)
    else pinoLogger.warn(msg)
  }

  function error({ msg, extra }: LogParams): void {
    if (extra) pinoLogger.error(extra, msg)
    else pinoLogger.error(msg)
  }

  function debug({ msg, extra }: LogParams): void {
    if (extra) pinoLogger.debug(extra, msg)
    else pinoLogger.debug(msg)
  }

  function audit(entry: AuditEntry): void {
    appendFileSync(auditPath, `${JSON.stringify(entry)}\n`)
  }

  return { info, warn, error, debug, audit }
}

// Local-date YYYY-MM-DD so the audit file rollover matches the user's wall clock.
function todayLocalIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${y}-${m}-${day}`
}
