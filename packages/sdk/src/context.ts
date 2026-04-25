import { randomUUID } from 'node:crypto'
import type {
  AxiomConfig, EvalContext, EvalResponse, EvalResult, RunOptions,
  ConversationContext, JudgeContext, JudgeResult, Spec, Message,
} from '@axiom-ai/core'
import { LLMClient } from '@axiom-ai/core'

// ─── Conversation ─────────────────────────────────────────────────────────────

class ConversationContextImpl implements ConversationContext {
  private _history: Message[] = []
  private _lastResponse!: EvalResponse
  private _turns = 0

  constructor(
    private readonly client: LLMClient,
    private readonly systemPrompt: string | undefined,
    private readonly defaultModel: string,
  ) {}

  async send(input: string, opts?: RunOptions): Promise<EvalResponse> {
    const next: Message[] = [...this._history, { role: 'user', content: input }]

    const response = await this.client.complete(next, {
      model:        opts?.model ?? this.defaultModel,
      systemPrompt: opts?.systemPrompt ?? this.systemPrompt,
      temperature:  opts?.temperature,
      maxTokens:    opts?.maxTokens,
    })

    // Commit both turns atomically only after the call succeeds
    this._history = [...next, { role: 'assistant', content: response.content }]
    this._lastResponse = response
    this._turns++
    return response
  }

  get lastResponse(): EvalResponse { return this._lastResponse }
  get turns(): number { return this._turns }
  get history(): Message[] { return [...this._history] }

  reset(): void {
    this._history = []
    this._turns   = 0
  }
}

// ─── EvalContext ──────────────────────────────────────────────────────────────

export class EvalContextImpl implements EvalContext {
  private readonly client: LLMClient
  private readonly _results: Array<{
    caseId:    string
    input:     string
    output:    string
    latencyMs: number
    tokensIn:  number
    tokensOut: number
    costUsd:   number
    passed:    boolean
    score:     number
    scores:    Record<string, number>
    violations: EvalResult['violations']
    reasoning: string
    error?:    string
    tags:      string[]
  }> = []

  constructor(
    private readonly config: AxiomConfig,
    readonly runId: string,
    readonly currentSpec: Spec | undefined,
  ) {
    this.client = new LLMClient({
      models:  config.models,
      apiKeys: config.apiKeys,
    })
  }

  async run(input: string, opts?: RunOptions): Promise<EvalResponse> {
    const response = await this.client.complete(
      [{ role: 'user', content: input }],
      {
        model:        opts?.model,
        systemPrompt: opts?.systemPrompt,
        temperature:  opts?.temperature,
        maxTokens:    opts?.maxTokens,
      }
    )
    return response
  }

  conversation(systemPrompt?: string): ConversationContext {
    return new ConversationContextImpl(
      this.client,
      systemPrompt,
      this.config.models.default,
    )
  }

  async judge(
    input: string,
    output: string,
    ctx?: Partial<JudgeContext>,
  ): Promise<JudgeResult> {
    const { LLMJudge } = await import('@axiom-ai/judges')
    const judge = new LLMJudge({ client: this.client })
    return judge.judge(input, output, { spec: this.currentSpec, ...ctx })
  }

  // Called by expect() to record assertion results
  recordResult(entry: (typeof this._results)[number]): void {
    this._results.push(entry)
  }

  // Called by runner between retry attempts to discard prior partial results
  resetResults(): void {
    this._results.length = 0
  }

  // Called by runner after eval fn completes
  flushResults(evalName: string, error?: string): EvalResult[] {
    if (this._results.length === 0 && error) {
      return [{
        id:             randomUUID(),
        runId:          this.runId,
        evalName,
        caseId:         'error',
        input:          '',
        output:         '',
        verdict:        'error',
        passed:         false,
        score:          0,
        scores:         {},
        violations:     [],
        judgeReasoning: '',
        latencyMs:      0,
        tokensInput:    0,
        tokensOutput:   0,
        costUsd:        0,
        tags:           [],
        error,
        createdAt:      new Date(),
      }]
    }

    return this._results.map(r => ({
      id:             randomUUID(),
      runId:          this.runId,
      evalName,
      caseId:         r.caseId,
      input:          r.input,
      output:         r.output,
      verdict:        (r.error ? 'error' : r.passed ? 'pass' : 'fail') as EvalResult['verdict'],
      passed:         r.passed,
      score:          r.score,
      scores:         r.scores,
      violations:     r.violations,
      judgeReasoning: r.reasoning,
      latencyMs:      r.latencyMs,
      tokensInput:    r.tokensIn,
      tokensOutput:   r.tokensOut,
      costUsd:        r.costUsd,
      tags:           r.tags,
      error:          r.error,
      createdAt:      new Date(),
    }))
  }
}
