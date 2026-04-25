import type { Judge, JudgeContext, JudgeResult, InvariantViolation, LLMClient as ILLMClient } from '@axiom-ai/core'

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildJudgePrompt(
  input:   string,
  output:  string,
  ctx:     JudgeContext,
): string {
  const parts: string[] = [
    'You are an expert AI evaluator. Your job is to evaluate the quality of an AI assistant\'s response.',
    '',
    '## Input (what the user sent)',
    '```',
    input,
    '```',
    '',
    '## Output (what the AI responded)',
    '```',
    output,
    '```',
    '',
  ]

  if (ctx.systemPrompt) {
    parts.push('## System Prompt', '```', ctx.systemPrompt, '```', '')
  }

  if (ctx.criteria) {
    parts.push(
      '## Evaluation Criteria',
      `Evaluate whether the output satisfies this criterion: "${ctx.criteria}"`,
      ''
    )
  }

  if (ctx.spec) {
    parts.push('## Behavioral Specification')

    if (ctx.spec.invariants.length > 0) {
      parts.push(
        '### Invariants (must ALL be satisfied)',
        ...ctx.spec.invariants.map(
          (inv, i) => `${i + 1}. [${inv.severity.toUpperCase()}] ${inv.rule}`
        ),
        ''
      )
    }

    if (ctx.spec.qualities.length > 0) {
      parts.push(
        '### Quality Dimensions (score each 0–1)',
        ...ctx.spec.qualities.map(
          q => `- **${q.name}** (weight ${q.weight}): ${q.description}${q.min !== undefined ? ` [min: ${q.min}]` : ''}`
        ),
        ''
      )
    }
  }

  if (ctx.rubric && Object.keys(ctx.rubric).length > 0) {
    parts.push(
      '## Scoring Rubric',
      ...Object.entries(ctx.rubric).map(([dim, guide]) => `- **${dim}**: ${guide}`),
      ''
    )
  }

  if (ctx.expectedOutput) {
    parts.push(
      '## Expected Output (reference)',
      '```',
      ctx.expectedOutput,
      '```',
      ''
    )
  }

  parts.push(
    '## Your Response',
    'Respond ONLY with valid JSON matching this exact schema:',
    '```json',
    JSON.stringify({
      verdict:    'pass | fail',
      score:      '0.0–1.0 overall quality score',
      scores:     { dimension_name: 'per-dimension 0.0–1.0 score' },
      reasoning:  '2–4 sentences explaining your verdict',
      violations: [{ rule: 'violated invariant rule', severity: 'critical|high|medium|low', reasoning: 'why', evidence: 'quote from output' }],
    }, null, 2),
    '```',
    '',
    'Rules:',
    '- violations array is EMPTY if no invariants are violated',
    '- score is weighted average of quality dimensions if spec provided, otherwise holistic 0–1',
    '- verdict is "fail" if ANY critical invariant is violated OR score < 0.5',
    '- Be precise and consistent. Temperature is 0.',
  )

  return parts.join('\n')
}

// ─── Response parser ──────────────────────────────────────────────────────────

// Walks the string from the first '{' to its matching '}' respecting strings/escapes.
// Robust against prose surrounding fenced JSON, multiple JSON blocks, etc.
/** @internal exported for unit tests */
export function extractFirstJSONObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let stringChar = ''
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') { i++; continue }
      if (ch === stringChar) inString = false
      continue
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function clamp01(n: unknown): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

/** @internal exported for unit tests */
export function parseJudgeResponse(text: string): JudgeResult {
  const block = extractFirstJSONObject(text)

  if (block) {
    try {
      const parsed = JSON.parse(block) as {
        verdict:    unknown
        score:      unknown
        scores?:    Record<string, unknown>
        reasoning?: string
        violations?: Array<{ rule: string; severity: string; reasoning: string; evidence?: string }>
      }

      const verdictStr = String(parsed.verdict ?? '').toLowerCase().trim()
      const clampedScores: Record<string, number> = {}
      for (const [k, v] of Object.entries(parsed.scores ?? {})) {
        clampedScores[k] = clamp01(v)
      }

      return {
        verdict:    verdictStr === 'pass' ? 'pass' : 'fail',
        score:      clamp01(parsed.score),
        scores:     clampedScores,
        reasoning:  parsed.reasoning ?? '',
        violations: (parsed.violations ?? []).map(v => ({
          rule:      v.rule,
          severity:  v.severity as InvariantViolation['severity'],
          reasoning: v.reasoning,
          evidence:  v.evidence,
        })),
      }
    } catch { /* fall through to heuristic */ }
  }

  // Graceful fallback: extract verdict and score heuristically.
  // Strict regex on the verdict literal — must match `"verdict": "pass"` shape
  // (allow either quote style) so we don't misread "verdict: pass-or-fail".
  const isPass = /["']verdict["']\s*:\s*["']pass["']/i.test(text)
  const scoreMatch = /["']score["']\s*:\s*([\d.]+)/.exec(text)
  return {
    verdict:    isPass ? 'pass' : 'fail',
    score:      scoreMatch ? clamp01(parseFloat(scoreMatch[1] ?? '0')) : 0.5,
    scores:     {},
    reasoning:  'Failed to parse judge response — raw: ' + text.slice(0, 200),
    violations: [],
  }
}

// ─── LLMJudge ─────────────────────────────────────────────────────────────────

interface LLMJudgeOptions {
  client:        ILLMClient
  model?:        string
  calibration?:  Array<{ input: string; output: string; verdict: string; reasoning: string }>
}

export class LLMJudge implements Judge {
  readonly name = 'llm-judge'
  private readonly calibrationExamples: LLMJudgeOptions['calibration']

  constructor(private readonly opts: LLMJudgeOptions) {
    this.calibrationExamples = opts.calibration
  }

  async judge(input: string, output: string, ctx: JudgeContext): Promise<JudgeResult> {
    const prompt = buildJudgePrompt(input, output, ctx)

    // Build messages with optional few-shot calibration
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    if (this.calibrationExamples?.length) {
      for (const ex of this.calibrationExamples) {
        messages.push({
          role:    'user',
          content: buildJudgePrompt(ex.input, ex.output, ctx),
        })
        messages.push({
          role:    'assistant',
          content: JSON.stringify({ verdict: ex.verdict, score: ex.verdict === 'pass' ? 0.9 : 0.2, scores: {}, reasoning: ex.reasoning, violations: [] }),
        })
      }
    }

    messages.push({ role: 'user', content: prompt })

    const response = await this.opts.client.judge(messages, {
      model:     this.opts.model,
      maxTokens: 1024,
    })

    const result = parseJudgeResponse(response.content)
    return {
      ...result,
      judgeModel:     response.model,
      judgeLatencyMs: response.latencyMs,
    }
  }
}
