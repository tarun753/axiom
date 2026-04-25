import type { Judge, JudgeContext, JudgeResult, InvariantViolation } from '@axiom-ai/core'

type Strategy = 'majority' | 'weighted'

interface EnsembleOptions {
  strategy?: Strategy
  weights?: number[]     // per-judge weights for 'weighted' strategy
}

export class EnsembleJudge implements Judge {
  readonly name = 'ensemble'
  private readonly strategy: Strategy
  private readonly weights: number[]

  constructor(
    private readonly judges: Judge[],
    opts: EnsembleOptions = {},
  ) {
    this.strategy = opts.strategy ?? 'majority'
    this.weights  = opts.weights ?? judges.map(() => 1 / judges.length)

    if (
      this.strategy === 'weighted' &&
      Math.abs(this.weights.reduce((s, w) => s + w, 0) - 1) > 0.001
    ) {
      throw new Error('EnsembleJudge weights must sum to 1')
    }
  }

  async judge(input: string, output: string, ctx: JudgeContext): Promise<JudgeResult> {
    const results = await Promise.all(
      this.judges.map(j => j.judge(input, output, ctx))
    )

    const passes    = results.filter(r => r.verdict === 'pass').length
    const total     = results.length
    const allViolations: InvariantViolation[] = results.flatMap(r => r.violations)

    let score: number
    let verdict: JudgeResult['verdict']

    if (this.strategy === 'weighted') {
      score   = results.reduce((s, r, i) => s + r.score * (this.weights[i] ?? 0), 0)
      verdict = score >= 0.5 ? 'pass' : 'fail'
    } else {
      // majority
      score   = results.reduce((s, r) => s + r.score, 0) / total
      verdict = passes > total / 2 ? 'pass' : 'fail'
    }

    const reasoning = results
      .map((r, i) => `[${this.judges[i]?.name ?? i}] ${r.verdict.toUpperCase()} (${r.score.toFixed(2)}): ${r.reasoning}`)
      .join('\n')

    const sums: Record<string, number> = {}
    const counts: Record<string, number> = {}
    for (const r of results) {
      for (const [k, v] of Object.entries(r.scores)) {
        sums[k]   = (sums[k]   ?? 0) + v
        counts[k] = (counts[k] ?? 0) + 1
      }
    }
    const mergedScores: Record<string, number> = {}
    for (const k of Object.keys(sums)) {
      mergedScores[k] = (sums[k] ?? 0) / (counts[k] ?? 1)
    }

    return {
      verdict,
      score:     Math.max(0, Math.min(1, score)),
      scores:    mergedScores,
      reasoning: `Ensemble [${this.strategy}] — ${passes}/${total} passed\n${reasoning}`,
      violations: allViolations,
    }
  }
}
