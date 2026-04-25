// ─── Primitives ───────────────────────────────────────────────────────────────

export type Severity   = 'critical' | 'high' | 'medium' | 'low'
export type Verdict    = 'pass' | 'fail' | 'skip' | 'error'
export type ModelRole  = 'user' | 'assistant' | 'system'
export type RunStatus  = 'running' | 'completed' | 'failed' | 'cancelled'

// ─── Spec ─────────────────────────────────────────────────────────────────────

export interface SpecInvariant {
  rule: string
  severity: Severity
  description?: string
}

export interface SpecQuality {
  name: string
  description: string
  weight: number       // 0–1, all weights must sum to 1
  min?: number         // fail if score below this
}

export interface Spec {
  id: string
  name: string
  version: string
  invariants: SpecInvariant[]
  qualities: SpecQuality[]
  createdAt: Date
}

// ─── Dataset ──────────────────────────────────────────────────────────────────

export interface EvalCase {
  id: string
  input: string
  expected?: string
  goldenOutput?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface ConversationCase {
  id: string
  history: Message[]
  finalInput: string
  tags?: string[]
}

export interface Dataset {
  id: string
  name: string
  version: string
  cases: EvalCase[]
  tags?: string[]
  createdAt: Date
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface Message {
  role: ModelRole
  content: string
}

// ─── Judge ────────────────────────────────────────────────────────────────────

export interface JudgeContext {
  spec?: Spec
  expectedOutput?: string
  systemPrompt?: string
  criteria?: string
  rubric?: Record<string, string>
  metadata?: Record<string, unknown>
}

export interface JudgeResult {
  verdict: Verdict
  score: number                           // 0–1 aggregate
  scores: Record<string, number>          // per-dimension
  reasoning: string
  violations: InvariantViolation[]
  judgeModel?: string
  judgeLatencyMs?: number
}

export interface InvariantViolation {
  rule: string
  severity: Severity
  reasoning: string
  evidence?: string
}

export interface Judge {
  readonly name: string
  judge(
    input: string,
    output: string,
    ctx: JudgeContext
  ): Promise<JudgeResult>
}

// ─── Eval Result ──────────────────────────────────────────────────────────────

export interface EvalResult {
  id: string
  runId: string
  evalName: string
  caseId: string
  input: string
  output: string
  verdict: Verdict
  passed: boolean
  score: number
  scores: Record<string, number>
  violations: InvariantViolation[]
  judgeReasoning: string
  latencyMs: number
  tokensInput: number
  tokensOutput: number
  costUsd: number
  tags: string[]
  error?: string
  createdAt: Date
}

// ─── Run ──────────────────────────────────────────────────────────────────────

export interface Run {
  id: string
  status: RunStatus
  createdAt: Date
  completedAt?: Date
  gitCommit?: string
  gitBranch?: string
  model: string
  totalEvals: number
  passed: number
  failed: number
  errors: number
  skipped: number
  durationMs: number
  costUsd: number
  passRate: number
  avgScore: number
  metadata?: Record<string, unknown>
}

// ─── Regression ───────────────────────────────────────────────────────────────

export interface Regression {
  evalName: string
  caseId: string
  prevScore: number
  currScore: number
  delta: number
  severity: 'minor' | 'major' | 'critical'
  prevVerdict: Verdict
  currVerdict: Verdict
}

export interface Improvement {
  evalName: string
  caseId: string
  prevScore: number
  currScore: number
  delta: number
}

export interface RunComparison {
  baseRun: Run
  headRun: Run
  regressions: Regression[]
  improvements: Improvement[]
  newFailures: number
  newPasses: number
  passRateDelta: number
  avgScoreDelta: number
  costDelta: number
  durationDelta: number
  significantChange: boolean          // statistical significance
}

// ─── Eval Definition ──────────────────────────────────────────────────────────

export interface EvalOptions {
  timeout?: number                    // ms, default 30_000
  retries?: number                    // default 0
  concurrency?: number                // default 5
  tags?: string[]
  spec?: Spec
  skip?: boolean
  only?: boolean
}

export interface EvalDefinition {
  name: string
  fn: (ctx: EvalContext) => Promise<void>
  options: Required<EvalOptions>
  filePath: string
}

// ─── Eval Context ─────────────────────────────────────────────────────────────

export interface RunOptions {
  model?: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface EvalResponse {
  content: string
  tokensInput: number
  tokensOutput: number
  latencyMs: number
  costUsd: number
  model: string
  finishReason: string
}

export interface EvalContext {
  run(input: string, opts?: RunOptions): Promise<EvalResponse>
  conversation(systemPrompt?: string): ConversationContext
  judge(input: string, output: string, ctx?: Partial<JudgeContext>): Promise<JudgeResult>
  readonly currentSpec: Spec | undefined
  readonly runId: string
}

export interface ConversationContext {
  send(message: string, opts?: RunOptions): Promise<EvalResponse>
  readonly lastResponse: EvalResponse
  readonly turns: number
  readonly history: Message[]
  reset(): void
}

// ─── Reporters ────────────────────────────────────────────────────────────────

export interface Reporter {
  onRunStart(run: Run): void | Promise<void>
  onEvalResult(result: EvalResult): void | Promise<void>
  onRunComplete(run: Run, results: EvalResult[]): void | Promise<void>
  onRegressions?(comparison: RunComparison): void | Promise<void>
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ModelConfig {
  default: string
  judge?: string
  fast?: string
}

export interface ThresholdConfig {
  minPassRate?: number               // fail CI if below (0–1)
  maxRegressionDelta?: number        // fail CI if regression exceeds this
  failOnCriticalViolation?: boolean  // default true
  failOnMajorViolation?: boolean     // default false
}

export interface AxiomConfig {
  models: ModelConfig
  storagePath: string
  reporters: Array<'console' | 'json' | 'html' | 'github' | 'slack'>
  thresholds: ThresholdConfig
  concurrency: number
  timeout: number
  apiKeys?: {
    anthropic?: string
    openai?: string
    google?: string
  }
  slackWebhookUrl?: string
  githubToken?: string
}

// ─── Storage Interface ────────────────────────────────────────────────────────

export interface Storage {
  saveRun(run: Run): Promise<void>
  updateRun(id: string, patch: Partial<Run>): Promise<void>
  getRun(id: string): Promise<Run | null>
  listRuns(opts?: { limit?: number; offset?: number }): Promise<Run[]>
  saveEvalResult(result: EvalResult): Promise<void>
  getEvalResults(runId: string): Promise<EvalResult[]>
  getLastRun(): Promise<Run | null>
  getEvalResultsByName(evalName: string, limit?: number): Promise<EvalResult[]>
  close(): void
}
