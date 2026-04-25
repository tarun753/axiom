import type { Message, EvalResponse, ModelConfig } from './types.js'

// ─── Cost table (per 1M tokens) ──────────────────────────────────────────────

const COST_TABLE: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7':              { input: 15.00,  output: 75.00  },
  'claude-sonnet-4-6':            { input: 3.00,   output: 15.00  },
  'claude-haiku-4-5-20251001':    { input: 0.80,   output: 4.00   },
  'gpt-4o':                       { input: 5.00,   output: 15.00  },
  'gpt-4o-mini':                  { input: 0.15,   output: 0.60   },
  'gpt-4-turbo':                  { input: 10.00,  output: 30.00  },
  'gemini-1.5-pro':               { input: 3.50,   output: 10.50  },
  'gemini-1.5-flash':             { input: 0.075,  output: 0.30   },
}

function calcCost(model: string, tokensIn: number, tokensOut: number): number {
  const rates = COST_TABLE[model] ?? { input: 0, output: 0 }
  return (tokensIn * rates.input + tokensOut * rates.output) / 1_000_000
}

// ─── Exponential backoff ──────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const isRetryable =
        err instanceof Error &&
        (err.message.includes('500') ||
         err.message.includes('529') ||
         err.message.includes('rate_limit') ||
         err.message.includes('overloaded') ||
         err.message.includes('timeout'))
      if (!isRetryable || attempt === retries) throw err
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 200
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastError
}

// ─── Provider adapters ────────────────────────────────────────────────────────

interface CompletionParams {
  model: string
  messages: Message[]
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  apiKey: string
}

async function callAnthropic(p: CompletionParams): Promise<EvalResponse> {
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: p.apiKey })
  const start = Date.now()

  // Anthropic takes `system` at the top level; in-message system roles are not allowed.
  // Strip them out and concatenate into the system prompt to preserve their content.
  const inlineSystem = p.messages.filter(m => m.role === 'system').map(m => m.content)
  const convo        = p.messages.filter(m => m.role !== 'system')
  const system       = [p.systemPrompt, ...inlineSystem].filter(Boolean).join('\n\n') || undefined

  const res = await withRetry(() =>
    client.messages.create({
      model: p.model,
      max_tokens: p.maxTokens ?? 2048,
      temperature: p.temperature ?? 0,
      system,
      messages: convo.map(m => ({
        role:    m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })
  )

  const content = res.content[0]?.type === 'text' ? res.content[0].text : ''
  const tokensIn  = res.usage.input_tokens
  const tokensOut = res.usage.output_tokens

  return {
    content,
    tokensInput:  tokensIn,
    tokensOutput: tokensOut,
    latencyMs:    Date.now() - start,
    costUsd:      calcCost(p.model, tokensIn, tokensOut),
    model:        p.model,
    finishReason: res.stop_reason ?? 'end_turn',
  }
}

async function callOpenAI(p: CompletionParams): Promise<EvalResponse> {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey: p.apiKey })
  const start = Date.now()

  const messages: Array<{ role: string; content: string }> = []
  if (p.systemPrompt) messages.push({ role: 'system', content: p.systemPrompt })
  messages.push(...p.messages.map(m => ({ role: m.role, content: m.content })))

  const res = await withRetry(() =>
    client.chat.completions.create({
      model:       p.model,
      max_tokens:  p.maxTokens ?? 2048,
      temperature: p.temperature ?? 0,
      messages:    messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
    })
  )

  const choice    = res.choices[0]
  const content   = choice?.message.content ?? ''
  const tokensIn  = res.usage?.prompt_tokens    ?? 0
  const tokensOut = res.usage?.completion_tokens ?? 0

  return {
    content,
    tokensInput:  tokensIn,
    tokensOutput: tokensOut,
    latencyMs:    Date.now() - start,
    costUsd:      calcCost(p.model, tokensIn, tokensOut),
    model:        p.model,
    finishReason: choice?.finish_reason ?? 'stop',
  }
}

// ─── LLMClient ────────────────────────────────────────────────────────────────

export interface LLMClientConfig {
  models: ModelConfig
  apiKeys?: { anthropic?: string; openai?: string; google?: string }
}

export class LLMClient {
  constructor(private readonly cfg: LLMClientConfig) {}

  async complete(
    messages: Message[],
    opts?: {
      model?: string
      systemPrompt?: string
      temperature?: number
      maxTokens?: number
    }
  ): Promise<EvalResponse> {
    const model = opts?.model ?? this.cfg.models.default
    return this.dispatch({ model, messages, ...opts })
  }

  async judge(
    messages: Message[],
    opts?: { model?: string; maxTokens?: number }
  ): Promise<EvalResponse> {
    const model = opts?.model ?? this.cfg.models.judge ?? this.cfg.models.default
    return this.dispatch({ model, messages, temperature: 0, maxTokens: opts?.maxTokens ?? 1024 })
  }

  private dispatch(params: {
    model: string
    messages: Message[]
    systemPrompt?: string
    temperature?: number
    maxTokens?: number
  }): Promise<EvalResponse> {
    const { model } = params
    const isAnthropic = model.startsWith('claude-')
    const isOpenAI    = model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')

    if (isAnthropic) {
      const key = this.cfg.apiKeys?.anthropic ?? process.env['ANTHROPIC_API_KEY'] ?? ''
      if (!key) throw new Error('ANTHROPIC_API_KEY not set')
      return callAnthropic({ ...params, apiKey: key })
    }

    if (isOpenAI) {
      const key = this.cfg.apiKeys?.openai ?? process.env['OPENAI_API_KEY'] ?? ''
      if (!key) throw new Error('OPENAI_API_KEY not set')
      return callOpenAI({ ...params, apiKey: key })
    }

    throw new Error(`Unknown model provider for model: ${model}`)
  }
}
