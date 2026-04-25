import { describe, it, expect } from 'vitest'
import { extractFirstJSONObject, parseJudgeResponse } from '../src/llm-judge.js'

describe('extractFirstJSONObject', () => {
  it('returns null when no { is present', () => {
    expect(extractFirstJSONObject('hello world')).toBeNull()
  })

  it('extracts a flat JSON object', () => {
    expect(extractFirstJSONObject('{"a":1}')).toBe('{"a":1}')
  })

  it('extracts JSON surrounded by prose', () => {
    const txt = 'Here is my evaluation:\n\n```json\n{"verdict":"pass","score":0.9}\n```\n\nLet me know.'
    const block = extractFirstJSONObject(txt)
    expect(block).toBe('{"verdict":"pass","score":0.9}')
  })

  it('handles nested objects', () => {
    expect(extractFirstJSONObject('foo {"a":{"b":2}} bar')).toBe('{"a":{"b":2}}')
  })

  it('respects braces inside strings', () => {
    expect(extractFirstJSONObject('{"a":"}{"}')).toBe('{"a":"}{"}')
  })

  it('respects escaped quotes inside strings', () => {
    expect(extractFirstJSONObject('{"a":"hello \\"world\\""}')).toBe('{"a":"hello \\"world\\""}')
  })
})

describe('parseJudgeResponse', () => {
  it('parses well-formed JSON', () => {
    const result = parseJudgeResponse('{"verdict":"pass","score":0.85,"reasoning":"good"}')
    expect(result.verdict).toBe('pass')
    expect(result.score).toBe(0.85)
    expect(result.reasoning).toBe('good')
  })

  it('parses JSON wrapped in prose', () => {
    const result = parseJudgeResponse(
      'Here is my answer:\n\n```json\n{"verdict":"fail","score":0.2,"reasoning":"bad"}\n```\n\nDone.'
    )
    expect(result.verdict).toBe('fail')
    expect(result.score).toBe(0.2)
  })

  it('normalizes uppercase verdicts', () => {
    expect(parseJudgeResponse('{"verdict":"PASS","score":1}').verdict).toBe('pass')
    expect(parseJudgeResponse('{"verdict":"Pass","score":1}').verdict).toBe('pass')
    expect(parseJudgeResponse('{"verdict":"FAIL","score":0}').verdict).toBe('fail')
  })

  it('clamps overall score to [0,1]', () => {
    expect(parseJudgeResponse('{"verdict":"pass","score":5}').score).toBe(1)
    expect(parseJudgeResponse('{"verdict":"pass","score":-1}').score).toBe(0)
  })

  it('clamps per-dimension scores to [0,1]', () => {
    const r = parseJudgeResponse('{"verdict":"pass","score":0.8,"scores":{"accuracy":5,"clarity":-0.5}}')
    expect(r.scores['accuracy']).toBe(1)
    expect(r.scores['clarity']).toBe(0)
  })

  it('rejects non-numeric score values gracefully', () => {
    const r = parseJudgeResponse('{"verdict":"pass","score":"high"}')
    expect(r.score).toBe(0)
  })

  it('falls back to heuristic when JSON cannot be parsed', () => {
    const r = parseJudgeResponse('Some prose with "verdict": "pass" and "score": 0.7 in it')
    expect(r.verdict).toBe('pass')
    expect(r.score).toBe(0.7)
  })

  it('does not match ambiguous "verdict: pass-or-fail" as pass', () => {
    const r = parseJudgeResponse('verdict: pass-or-fail-undecided, the model was unclear')
    // The strict regex requires `"verdict": "pass"` shape — non-strict text should fall through.
    expect(r.verdict).toBe('fail')
  })

  it('preserves violations array', () => {
    const r = parseJudgeResponse(
      '{"verdict":"fail","score":0.1,"violations":[{"rule":"no profanity","severity":"high","reasoning":"used a slur"}]}'
    )
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.rule).toBe('no profanity')
    expect(r.violations[0]?.severity).toBe('high')
  })
})
