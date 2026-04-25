import type { Judge, JudgeContext, JudgeResult } from '@axiom-ai/core'

function passResult(reasoning: string, scores?: Record<string, number>): JudgeResult {
  return { verdict: 'pass', score: 1, scores: scores ?? {}, reasoning, violations: [] }
}

function failResult(reasoning: string, scores?: Record<string, number>): JudgeResult {
  return { verdict: 'fail', score: 0, scores: scores ?? {}, reasoning, violations: [] }
}

// ─── ContainsJudge ────────────────────────────────────────────────────────────

export class ContainsJudge implements Judge {
  readonly name = 'contains'
  constructor(private readonly texts: string | string[]) {}

  judge(_input: string, output: string, _ctx: JudgeContext): Promise<JudgeResult> {
    const targets = Array.isArray(this.texts) ? this.texts : [this.texts]
    const found   = targets.filter(t => output.toLowerCase().includes(t.toLowerCase()))
    const all     = found.length === targets.length
    return Promise.resolve(
      all
        ? passResult(`Output contains all required text(s): ${targets.join(', ')}`)
        : failResult(`Missing text(s): ${targets.filter(t => !found.includes(t)).join(', ')}`)
    )
  }
}

// ─── RegexJudge ───────────────────────────────────────────────────────────────

export class RegexJudge implements Judge {
  readonly name = 'regex'
  constructor(private readonly pattern: RegExp) {}

  judge(_input: string, output: string, _ctx: JudgeContext): Promise<JudgeResult> {
    const matched = this.pattern.test(output)
    return Promise.resolve(
      matched
        ? passResult(`Output matches pattern: ${this.pattern.toString()}`)
        : failResult(`Output does not match pattern: ${this.pattern.toString()}`)
    )
  }
}

// ─── JSONSchemaJudge ──────────────────────────────────────────────────────────

export class JSONSchemaJudge implements Judge {
  readonly name = 'json-schema'
  constructor(private readonly schema: Record<string, unknown>) {}

  judge(_input: string, output: string, _ctx: JudgeContext): Promise<JudgeResult> {
    let parsed: unknown
    try {
      parsed = JSON.parse(output)
    } catch {
      return Promise.resolve(failResult('Output is not valid JSON'))
    }

    const errors = this.validate(parsed, this.schema, '$')
    return Promise.resolve(
      errors.length === 0
        ? passResult('Output matches JSON schema')
        : failResult(`Schema validation failed: ${errors.join('; ')}`)
    )
  }

  private validate(
    value:  unknown,
    schema: Record<string, unknown>,
    path:   string,
  ): string[] {
    const errors: string[] = []
    const type = schema['type']

    if (type === 'object') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`${path}: expected object`)
        return errors
      }
      const required = (schema['required'] ?? []) as string[]
      const props    = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>
      const obj      = value as Record<string, unknown>

      for (const key of required) {
        if (!(key in obj)) errors.push(`${path}.${key}: required field missing`)
      }
      for (const [k, s] of Object.entries(props)) {
        if (k in obj) errors.push(...this.validate(obj[k], s, `${path}.${k}`))
      }
    } else if (type === 'array') {
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array`)
      } else if (schema['items']) {
        value.forEach((item, i) =>
          errors.push(...this.validate(item, schema['items'] as Record<string, unknown>, `${path}[${i}]`))
        )
      }
    } else if (type === 'string'  && typeof value !== 'string')  errors.push(`${path}: expected string`)
    else if   (type === 'number'  && typeof value !== 'number')  errors.push(`${path}: expected number`)
    else if   (type === 'boolean' && typeof value !== 'boolean') errors.push(`${path}: expected boolean`)

    const enumVals = schema['enum'] as unknown[] | undefined
    if (enumVals && !enumVals.includes(value)) {
      errors.push(`${path}: must be one of ${JSON.stringify(enumVals)}`)
    }

    return errors
  }
}

// ─── WordCountJudge ───────────────────────────────────────────────────────────

export class WordCountJudge implements Judge {
  readonly name = 'word-count'
  constructor(private readonly bounds: { min?: number; max?: number }) {}

  judge(_input: string, output: string, _ctx: JudgeContext): Promise<JudgeResult> {
    const count = output.split(/\s+/).filter(Boolean).length
    const { min, max } = this.bounds
    const tooShort = min !== undefined && count < min
    const tooLong  = max !== undefined && count > max

    if (tooShort) return Promise.resolve(failResult(`Word count ${count} < min ${min}`))
    if (tooLong)  return Promise.resolve(failResult(`Word count ${count} > max ${max}`))
    // Avoid 0/0 → NaN when max is undefined and count is 0.
    const denom = max ?? count
    const wordCount = denom === 0 ? 0 : Math.min(1, count / denom)
    return Promise.resolve(passResult(
      `Word count ${count} within bounds ${JSON.stringify(this.bounds)}`,
      { wordCount }
    ))
  }
}

// ─── CodeSyntaxJudge ─────────────────────────────────────────────────────────

export class CodeSyntaxJudge implements Judge {
  readonly name = 'code-syntax'
  constructor(private readonly language: 'javascript' | 'typescript' | 'python' | 'json') {}

  judge(_input: string, output: string, _ctx: JudgeContext): Promise<JudgeResult> {
    // Extract code from markdown if present
    const codeMatch = /```(?:\w+)?\s*([\s\S]+?)\s*```/.exec(output)
    const code = codeMatch?.[1] ?? output

    if (this.language === 'json') {
      try {
        JSON.parse(code)
        return Promise.resolve(passResult('Valid JSON syntax'))
      } catch (e) {
        return Promise.resolve(failResult(`Invalid JSON: ${(e as Error).message}`))
      }
    }

    // For JS/TS: check basic syntax patterns
    if (this.language === 'javascript' || this.language === 'typescript') {
      const balanced = this.checkBraces(code)
      if (!balanced.ok) {
        return Promise.resolve(failResult(`Unbalanced brackets: ${balanced.reason}`))
      }
    }

    return Promise.resolve(passResult(`Code appears syntactically valid (${this.language})`))
  }

  private checkBraces(code: string): { ok: boolean; reason?: string } {
    const stack: string[] = []
    const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
    const closers = new Set(Object.values(pairs))
    let inString = false
    let stringChar = ''

    for (let i = 0; i < code.length; i++) {
      const ch = code[i] ?? ''
      if (inString) {
        if (ch === stringChar) {
          // Count consecutive backslashes immediately before this quote.
          // Quote is escaped only if that count is odd (`\"` escapes, `\\"` does not).
          let backslashes = 0
          for (let j = i - 1; j >= 0 && code[j] === '\\'; j--) backslashes++
          if (backslashes % 2 === 0) inString = false
        }
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true; stringChar = ch; continue
      }
      if (pairs[ch]) { stack.push(pairs[ch] ?? ''); continue }
      if (closers.has(ch)) {
        if (stack[stack.length - 1] !== ch) {
          return { ok: false, reason: `Unexpected "${ch}" at position ${i}` }
        }
        stack.pop()
      }
    }

    return stack.length === 0
      ? { ok: true }
      : { ok: false, reason: `Unclosed: ${stack.join('')}` }
  }
}
