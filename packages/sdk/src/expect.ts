import { createHash } from 'node:crypto'
import type { EvalResponse, JudgeResult, Spec } from '@axiom-ai/core'
import type { EvalContextImpl } from './context.js'

// ─── Types ────────────────────────────────────────────────────────────────────

type AssertionFn = () => Promise<AssertionResult>

interface AssertionResult {
  name:      string
  passed:    boolean
  score:     number
  reasoning: string
  negated:   boolean
}

export class AssertionError extends Error {
  constructor(readonly results: AssertionResult[]) {
    const failed = results.filter(r => !r.passed)
    const lines  = failed.map(r =>
      `  ✗ ${r.negated ? 'not.' : ''}${r.name}\n    ${r.reasoning}`
    )
    super(`${failed.length} assertion(s) failed:\n${lines.join('\n')}`)
    this.name = 'AssertionError'
  }
}

// ─── Assertion builder ────────────────────────────────────────────────────────

export class Assertion {
  private readonly queue: AssertionFn[] = []
  private _negated = false

  constructor(
    protected readonly response: EvalResponse,
    protected readonly ctx: EvalContextImpl,
    protected readonly input: string,
    private readonly caseId: string,
  ) {}

  // ── Negation ──────────────────────────────────────────────────────────────

  get not(): this {
    this._negated = !this._negated
    return this
  }

  // ── Deterministic ─────────────────────────────────────────────────────────

  toContain(text: string | string[]): this {
    const negated = this._negated
    this._negated = false
    const texts = Array.isArray(text) ? text : [text]
    this.queue.push(async () => {
      const content = this.response.content.toLowerCase()
      const found   = texts.some(t => content.includes(t.toLowerCase()))
      const passed  = negated ? !found : found
      return {
        name:      `toContain(${texts.join(' | ')})`,
        passed,
        score:     passed ? 1 : 0,
        reasoning: passed
          ? `Output ${negated ? 'does not contain' : 'contains'} expected text`
          : `Output ${negated ? 'contains' : 'does not contain'}: ${texts.join(', ')}`,
        negated,
      }
    })
    return this
  }

  toMatch(pattern: RegExp): this {
    const negated = this._negated
    this._negated = false
    this.queue.push(async () => {
      const found  = pattern.test(this.response.content)
      const passed = negated ? !found : found
      return {
        name:      `toMatch(${pattern.toString()})`,
        passed,
        score:     passed ? 1 : 0,
        reasoning: passed ? 'Pattern match result as expected' : `Pattern ${negated ? 'matched' : 'did not match'}`,
        negated,
      }
    })
    return this
  }

  toHaveWordCount(bounds: { min?: number; max?: number }): this {
    const negated = this._negated
    this._negated = false
    this.queue.push(async () => {
      const count  = this.response.content.split(/\s+/).filter(Boolean).length
      const ok     = (bounds.min === undefined || count >= bounds.min)
                  && (bounds.max === undefined || count <= bounds.max)
      const passed = negated ? !ok : ok
      return {
        name:      `toHaveWordCount(${JSON.stringify(bounds)})`,
        passed,
        score:     passed ? 1 : 0,
        reasoning: `Word count: ${count}. Bounds: ${JSON.stringify(bounds)}`,
        negated,
      }
    })
    return this
  }

  toBeValidJSON(): this {
    const negated = this._negated
    this._negated = false
    this.queue.push(async () => {
      let valid = false
      try {
        JSON.parse(this.response.content)
        valid = true
      } catch {}
      const passed = negated ? !valid : valid
      return {
        name:      'toBeValidJSON()',
        passed,
        score:     passed ? 1 : 0,
        reasoning: valid ? 'Output is valid JSON' : 'Output is not valid JSON',
        negated,
      }
    })
    return this
  }

  // ── LLM-as-judge ─────────────────────────────────────────────────────────

  toPass(rule: string): this {
    const negated = this._negated
    this._negated = false
    this.queue.push(async () => {
      const result = await this.ctx.judge(this.input, this.response.content, {
        criteria: rule,
      })
      const passed = negated ? result.verdict !== 'pass' : result.verdict === 'pass'
      return {
        name:      `toPass("${rule.slice(0, 60)}${rule.length > 60 ? '…' : ''}")`,
        passed,
        score:     negated ? 1 - result.score : result.score,
        reasoning: result.reasoning,
        negated,
      }
    })
    return this
  }

  toAcknowledgeEmotion(): this {
    return this.toPass('acknowledges the user\'s emotional state before attempting to solve the problem')
  }

  toBeHelpful(): this {
    return this.toPass('directly addresses and helps solve the user\'s problem')
  }

  toBeProfessional(): this {
    return this.toPass('maintains a professional, courteous tone throughout')
  }

  toNotMakePromises(): this {
    const negated = this._negated
    this._negated = negated ? false : true   // toNotMakePromises = not.toPass(...)
    return this.toPass('makes specific promises or guarantees about outcomes, delivery, or timelines')
  }

  toScore(rubric: Record<string, { min?: number; max?: number }>): this {
    const negated = this._negated
    this._negated = false
    this.queue.push(async () => {
      const result = await this.ctx.judge(this.input, this.response.content, {
        rubric: Object.fromEntries(
          Object.entries(rubric).map(([k]) => [k, `Score the response on ${k} from 0 to 1`])
        ),
      })

      const failures: string[] = []
      for (const [dim, bounds] of Object.entries(rubric)) {
        const score = result.scores[dim] ?? 0
        if (bounds.min !== undefined && score < bounds.min) {
          failures.push(`${dim}: ${score.toFixed(2)} < min ${bounds.min}`)
        }
        if (bounds.max !== undefined && score > bounds.max) {
          failures.push(`${dim}: ${score.toFixed(2)} > max ${bounds.max}`)
        }
      }

      const passed = negated ? failures.length > 0 : failures.length === 0
      return {
        name:      `toScore(${JSON.stringify(rubric)})`,
        passed,
        score:     result.score,
        reasoning: failures.length ? `Dimension failures: ${failures.join(', ')}` : result.reasoning,
        negated,
      }
    })
    return this
  }

  toSatisfySpec(s: Spec): this {
    const negated = this._negated
    this._negated = false
    this.queue.push(async () => {
      const result = await this.ctx.judge(this.input, this.response.content, { spec: s })
      const critViolations = result.violations.filter(v => v.severity === 'critical')
      const rawPassed = result.verdict === 'pass' && critViolations.length === 0
      return {
        name:      `toSatisfySpec("${s.name}")`,
        passed:    negated ? !rawPassed : rawPassed,
        score:     result.score,
        reasoning: result.reasoning + (result.violations.length
          ? `\nViolations: ${result.violations.map(v => v.rule).join('; ')}`
          : ''),
        negated,
      }
    })
    return this
  }

  // ── Evaluate all ─────────────────────────────────────────────────────────

  async evaluate(): Promise<void> {
    const results = await Promise.all(this.queue.map(fn => fn()))
    const passed  = results.every(r => r.passed)
    const score   = results.reduce((s, r) => s + r.score, 0) / Math.max(results.length, 1)
    const failing = results.filter(r => !r.passed)

    this.ctx.recordResult({
      caseId:    this.caseId,
      input:     this.input,
      output:    this.response.content,
      latencyMs: this.response.latencyMs,
      tokensIn:  this.response.tokensInput,
      tokensOut: this.response.tokensOutput,
      costUsd:   this.response.costUsd,
      passed,
      score,
      scores:    Object.fromEntries(results.map(r => [r.name, r.score])),
      violations: [],
      reasoning: results.map(r => `${r.passed ? '✓' : '✗'} ${r.name}: ${r.reasoning}`).join('\n'),
      tags:      [],
    })

    if (failing.length > 0) {
      throw new AssertionError(results)
    }
  }
}

// ─── Public factory ───────────────────────────────────────────────────────────

export function expect(
  response: EvalResponse,
  ctx: EvalContextImpl,
  input: string,
  caseId?: string,
): Assertion {
  const id = caseId ?? createHash('sha256').update(input).digest('hex').slice(0, 12)
  return new Assertion(response, ctx, input, id)
}
