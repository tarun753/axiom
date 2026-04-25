import { describe, it, expect } from 'vitest'
import {
  ContainsJudge, RegexJudge, JSONSchemaJudge, WordCountJudge, CodeSyntaxJudge,
} from '../src/deterministic.js'

const ctx = {} as Parameters<ContainsJudge['judge']>[2]

describe('ContainsJudge', () => {
  it('passes when output contains the target text (case-insensitive)', async () => {
    const r = await new ContainsJudge('Hello').judge('', 'hello world', ctx)
    expect(r.verdict).toBe('pass')
  })

  it('fails when any required text is missing', async () => {
    const r = await new ContainsJudge(['hello', 'goodbye']).judge('', 'hello world', ctx)
    expect(r.verdict).toBe('fail')
  })
})

describe('RegexJudge', () => {
  it('passes on regex match', async () => {
    const r = await new RegexJudge(/\d{3}-\d{4}/).judge('', 'phone: 555-1234', ctx)
    expect(r.verdict).toBe('pass')
  })

  it('fails on no match', async () => {
    const r = await new RegexJudge(/^[A-Z]+$/).judge('', 'lowercase', ctx)
    expect(r.verdict).toBe('fail')
  })
})

describe('JSONSchemaJudge', () => {
  it('fails on invalid JSON', async () => {
    const r = await new JSONSchemaJudge({ type: 'object' }).judge('', 'not json', ctx)
    expect(r.verdict).toBe('fail')
    expect(r.reasoning).toMatch(/not valid JSON/)
  })

  it('validates required fields', async () => {
    const judge = new JSONSchemaJudge({
      type: 'object',
      required: ['name', 'age'],
      properties: { name: { type: 'string' }, age: { type: 'number' } },
    })
    expect((await judge.judge('', '{"name":"Alice","age":30}', ctx)).verdict).toBe('pass')
    expect((await judge.judge('', '{"name":"Alice"}', ctx)).verdict).toBe('fail')
  })

  it('validates type constraints on present fields', async () => {
    const judge = new JSONSchemaJudge({
      type: 'object',
      properties: { count: { type: 'number' } },
    })
    expect((await judge.judge('', '{"count":42}', ctx)).verdict).toBe('pass')
    expect((await judge.judge('', '{"count":"42"}', ctx)).verdict).toBe('fail')
  })

  it('validates array item types', async () => {
    const judge = new JSONSchemaJudge({
      type: 'array',
      items: { type: 'string' },
    })
    expect((await judge.judge('', '["a","b"]', ctx)).verdict).toBe('pass')
    expect((await judge.judge('', '["a",1]', ctx)).verdict).toBe('fail')
  })

  it('validates enum values', async () => {
    const judge = new JSONSchemaJudge({ enum: ['red', 'green', 'blue'] })
    expect((await judge.judge('', '"red"', ctx)).verdict).toBe('pass')
    expect((await judge.judge('', '"yellow"', ctx)).verdict).toBe('fail')
  })
})

describe('WordCountJudge', () => {
  it('passes when within bounds', async () => {
    const r = await new WordCountJudge({ min: 1, max: 5 }).judge('', 'one two three', ctx)
    expect(r.verdict).toBe('pass')
  })

  it('fails when too short', async () => {
    const r = await new WordCountJudge({ min: 10 }).judge('', 'short', ctx)
    expect(r.verdict).toBe('fail')
  })

  it('fails when too long', async () => {
    const r = await new WordCountJudge({ max: 2 }).judge('', 'one two three', ctx)
    expect(r.verdict).toBe('fail')
  })

  it('returns a finite score (no NaN) when count and max are both 0/undefined', async () => {
    const r = await new WordCountJudge({}).judge('', '', ctx)
    expect(r.verdict).toBe('pass')
    expect(Number.isFinite(r.scores['wordCount'] ?? 0)).toBe(true)
  })
})

describe('CodeSyntaxJudge', () => {
  it('validates JSON', async () => {
    expect((await new CodeSyntaxJudge('json').judge('', '{"a":1}', ctx)).verdict).toBe('pass')
    expect((await new CodeSyntaxJudge('json').judge('', '{a:1}', ctx)).verdict).toBe('fail')
  })

  it('detects balanced braces in JS', async () => {
    const r = await new CodeSyntaxJudge('javascript').judge(
      '', 'function f() { return [1, 2, { a: 1 }] }', ctx
    )
    expect(r.verdict).toBe('pass')
  })

  it('detects unbalanced braces in JS', async () => {
    const r = await new CodeSyntaxJudge('javascript').judge(
      '', 'function f() { return [1, 2', ctx
    )
    expect(r.verdict).toBe('fail')
  })

  it('handles strings containing braces', async () => {
    const r = await new CodeSyntaxJudge('javascript').judge(
      '', 'const s = "}{{("; const t = 1', ctx
    )
    expect(r.verdict).toBe('pass')
  })

  it('correctly handles consecutive backslashes before quote (\\\\")', async () => {
    // The string "path\\" ends in two backslashes + closing quote.
    // The closing quote is NOT escaped (even number of backslashes).
    const code = 'const path = "C:\\\\foo\\\\"; const x = 1'
    const r = await new CodeSyntaxJudge('javascript').judge('', code, ctx)
    expect(r.verdict).toBe('pass')
  })

  it('extracts code from markdown fences', async () => {
    const r = await new CodeSyntaxJudge('json').judge(
      '', 'Here is the answer:\n```json\n{"ok":true}\n```',
      ctx
    )
    expect(r.verdict).toBe('pass')
  })
})
