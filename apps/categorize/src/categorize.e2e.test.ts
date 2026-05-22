import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AuditEntry } from '@ynab-automation/common/logger'
import { YNAB_API_BASE_URL } from '@ynab-automation/ynab/constants'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runCategorize } from './categorize.js'
import type { Config } from './config.js'

const BUDGET_ID = '11111111-1111-1111-1111-111111111111'
const ACCOUNT_ID = 'acct-A'
const OLLAMA_URL = 'http://localhost:11434'

const server = setupServer()

beforeAll((): void => server.listen({ onUnhandledRequest: 'error' }))
afterEach((): void => server.resetHandlers())
afterAll((): void => server.close())

let auditDir: string

beforeEach((): void => {
  auditDir = mkdtempSync(join(tmpdir(), 'cat-e2e-'))
})

afterEach((): void => {
  rmSync(auditDir, { recursive: true, force: true })
})

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    ynabToken: 'test-token',
    budgetId: BUDGET_ID,
    allowedAccountIds: new Set([ACCOUNT_ID]),
    lookbackDays: 5,
    ollamaUrl: OLLAMA_URL,
    ollamaModel: 'qwen2.5:14b',
    auditDir,
    excludedCategoryGroups: new Set(),
    categoryRoutingHints: [],
    ...overrides,
  }
}

const categoriesResponse = {
  data: {
    category_groups: [
      {
        id: 'gFood',
        name: 'Food',
        hidden: false,
        deleted: false,
        categories: [
          {
            id: 'cGroceries',
            name: 'Groceries',
            hidden: false,
            deleted: false,
            category_group_id: 'gFood',
            category_group_name: 'Food',
          },
        ],
      },
      {
        id: 'gInternal',
        name: 'Internal Master Category',
        hidden: false,
        deleted: false,
        categories: [
          {
            id: 'cUncategorized',
            name: 'Uncategorized',
            hidden: false,
            deleted: false,
            category_group_id: 'gInternal',
            category_group_name: 'Internal Master Category',
          },
        ],
      },
    ],
  },
}

function makeTxn(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'txn-1',
    account_id: ACCOUNT_ID,
    date: '2026-05-20',
    payee_name: 'Amazon',
    memo: 'organic eggs',
    amount: -15000,
    transfer_account_id: null,
    transfer_transaction_id: null,
    flag_name: null,
    flag_color: null,
    category_id: null,
    ...overrides,
  }
}

function readAuditLines(): AuditEntry[] {
  const files = readdirSync(auditDir)
  const lines: AuditEntry[] = []
  for (const f of files) {
    const content = readFileSync(join(auditDir, f), 'utf8')
    for (const line of content.split('\n')) {
      if (line.trim()) lines.push(JSON.parse(line) as AuditEntry)
    }
  }

  return lines
}

describe('runCategorize (e2e)', (): void => {
  it('happy path: categorizes, PATCHes, writes ok audit entry', async (): Promise<void> => {
    type PatchBody = { transactions?: unknown[] }
    let patchedBody: PatchBody | null = null
    server.use(
      http.get(`${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/categories`, () =>
        HttpResponse.json(categoriesResponse),
      ),
      http.get(
        `${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/accounts/${ACCOUNT_ID}/transactions`,
        () => HttpResponse.json({ data: { transactions: [makeTxn()] } }),
      ),
      http.post(`${OLLAMA_URL}/api/chat`, () =>
        HttpResponse.json({
          message: { role: 'assistant', content: '{"category_id":"cGroceries"}' },
          prompt_eval_count: 100,
        }),
      ),
      http.patch(`${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/transactions`, async ({ request }) => {
        patchedBody = (await request.json()) as PatchBody

        return new HttpResponse(null, { status: 204 })
      }),
    )

    const result = await runCategorize({
      config: makeConfig(),
      opts: { dryRun: false, verbose: false },
    })

    expect(result).toEqual({ succeeded: 1, failed: 0, skipped: 0 })
    // Cast: TS narrows `patchedBody` to its initializer type because msw assigns it inside a
    // callback that control-flow analysis can't see.
    expect((patchedBody as PatchBody | null)?.transactions).toHaveLength(1)

    const audit = readAuditLines()
    expect(audit).toHaveLength(1)
    expect(audit[0]?.status).toBe('ok')
    expect(audit[0]?.chosen_category_id).toBe('cGroceries')
  })

  it('falls back to Uncategorized when LLM picks an unknown id', async (): Promise<void> => {
    server.use(
      http.get(`${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/categories`, () =>
        HttpResponse.json(categoriesResponse),
      ),
      http.get(
        `${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/accounts/${ACCOUNT_ID}/transactions`,
        () => HttpResponse.json({ data: { transactions: [makeTxn()] } }),
      ),
      http.post(`${OLLAMA_URL}/api/chat`, () =>
        HttpResponse.json({
          message: { role: 'assistant', content: '{"category_id":"made-up-id"}' },
        }),
      ),
      http.patch(
        `${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/transactions`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    )

    const result = await runCategorize({
      config: makeConfig(),
      opts: { dryRun: false, verbose: false },
    })

    expect(result.succeeded).toBe(1)
    const audit = readAuditLines()
    expect(audit[0]?.status).toBe('fallback')
    expect(audit[0]?.chosen_category_id).toBe('cUncategorized')
  })

  it('dry-run does not PATCH but still emits audit', async (): Promise<void> => {
    let patchCalled = false
    server.use(
      http.get(`${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/categories`, () =>
        HttpResponse.json(categoriesResponse),
      ),
      http.get(
        `${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/accounts/${ACCOUNT_ID}/transactions`,
        () => HttpResponse.json({ data: { transactions: [makeTxn()] } }),
      ),
      http.post(`${OLLAMA_URL}/api/chat`, () =>
        HttpResponse.json({
          message: { role: 'assistant', content: '{"category_id":"cGroceries"}' },
        }),
      ),
      http.patch(`${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/transactions`, () => {
        patchCalled = true

        return new HttpResponse(null, { status: 204 })
      }),
    )

    const result = await runCategorize({
      config: makeConfig(),
      opts: { dryRun: true, verbose: false },
    })

    expect(patchCalled).toBe(false)
    expect(result.skipped).toBe(1)
    expect(readAuditLines()).toHaveLength(1)
  })

  it('PATCH failure marks audit as patch_error', async (): Promise<void> => {
    server.use(
      http.get(`${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/categories`, () =>
        HttpResponse.json(categoriesResponse),
      ),
      http.get(
        `${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/accounts/${ACCOUNT_ID}/transactions`,
        () => HttpResponse.json({ data: { transactions: [makeTxn()] } }),
      ),
      http.post(`${OLLAMA_URL}/api/chat`, () =>
        HttpResponse.json({
          message: { role: 'assistant', content: '{"category_id":"cGroceries"}' },
        }),
      ),
      http.patch(`${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/transactions`, () =>
        HttpResponse.text('budget locked', { status: 400 }),
      ),
    )

    const result = await runCategorize({
      config: makeConfig(),
      opts: { dryRun: false, verbose: false },
    })

    expect(result.succeeded).toBe(0)
    expect(result.failed).toBe(1)

    const audit = readAuditLines()
    expect(audit[0]?.status).toBe('patch_error')
    expect(audit[0]?.error).toContain('400')
  })

  it('skips already-flagged transactions', async (): Promise<void> => {
    let chatCalled = false
    server.use(
      http.get(`${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/categories`, () =>
        HttpResponse.json(categoriesResponse),
      ),
      http.get(
        `${YNAB_API_BASE_URL}/budgets/${BUDGET_ID}/accounts/${ACCOUNT_ID}/transactions`,
        () =>
          HttpResponse.json({
            data: {
              transactions: [makeTxn({ flag_name: 'auto-categorized', flag_color: 'yellow' })],
            },
          }),
      ),
      http.post(`${OLLAMA_URL}/api/chat`, () => {
        chatCalled = true

        return HttpResponse.json({ message: { role: 'assistant', content: '{}' } })
      }),
    )

    const result = await runCategorize({
      config: makeConfig(),
      opts: { dryRun: false, verbose: false },
    })

    expect(chatCalled).toBe(false)
    expect(result).toEqual({ succeeded: 0, failed: 0, skipped: 0 })
    expect(readAuditLines()).toHaveLength(0)
  })
})
