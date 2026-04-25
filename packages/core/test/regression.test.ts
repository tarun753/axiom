import { describe, it, expect } from 'vitest'
import { detectRegressions, buildComparison } from '../src/regression.js'
import type { EvalResult, Run, Verdict } from '../src/types.js'

function mkResult(overrides: Partial<EvalResult>): EvalResult {
  return {
    id:             overrides.id ?? 'r-' + Math.random().toString(36).slice(2),
    runId:          'run-1',
    evalName:       'test-eval',
    caseId:         'case-1',
    input:          '',
    output:         '',
    verdict:        'pass',
    passed:         true,
    score:          1,
    scores:         {},
    violations:     [],
    judgeReasoning: '',
    latencyMs:      0,
    tokensInput:    0,
    tokensOutput:   0,
    costUsd:        0,
    tags:           [],
    createdAt:      new Date(),
    ...overrides,
  }
}

function mkRun(overrides: Partial<Run> = {}): Run {
  return {
    id:           'run-1',
    status:       'completed',
    createdAt:    new Date(),
    model:        'claude-sonnet-4-6',
    totalEvals:   1,
    passed:       1,
    failed:       0,
    errors:       0,
    skipped:      0,
    durationMs:   1000,
    costUsd:      0.001,
    passRate:     1,
    avgScore:     1,
    ...overrides,
  }
}

describe('detectRegressions', () => {
  it('returns empty when previous results are empty (first run)', () => {
    const curr = [mkResult({ score: 0.8 })]
    const { regressions, improvements } = detectRegressions([], curr)
    expect(regressions).toHaveLength(0)
    expect(improvements).toHaveLength(0)
  })

  it('flags a verdict flip (pass → fail) as critical even if score is unchanged', () => {
    const prev = [mkResult({ caseId: 'c1', verdict: 'pass', passed: true,  score: 0.7 })]
    const curr = [mkResult({ caseId: 'c1', verdict: 'fail', passed: false, score: 0.7 })]
    const { regressions } = detectRegressions(prev, curr)
    expect(regressions).toHaveLength(1)
    expect(regressions[0]?.severity).toBe('critical')
  })

  it('flags a verdict flip as critical even when score went UP (invariant violation)', () => {
    const prev = [mkResult({ caseId: 'c1', verdict: 'pass', passed: true,  score: 0.51 })]
    const curr = [mkResult({ caseId: 'c1', verdict: 'fail', passed: false, score: 0.95 })]
    const { regressions } = detectRegressions(prev, curr)
    expect(regressions[0]?.severity).toBe('critical')
  })

  it('classifies score drops by magnitude', () => {
    const prev = [
      mkResult({ caseId: 'minor',  score: 0.90 }),
      mkResult({ caseId: 'major',  score: 0.90 }),
      mkResult({ caseId: 'crit',   score: 0.95 }),
    ]
    const curr = [
      mkResult({ caseId: 'minor',  score: 0.83 }),  // -0.07 → minor
      mkResult({ caseId: 'major',  score: 0.78 }),  // -0.12 → major
      mkResult({ caseId: 'crit',   score: 0.50 }),  // -0.45 → critical
    ]
    const { regressions } = detectRegressions(prev, curr)
    expect(regressions).toHaveLength(3)
    const byCase = Object.fromEntries(regressions.map(r => [r.caseId, r.severity]))
    expect(byCase['minor']).toBe('minor')
    expect(byCase['major']).toBe('major')
    expect(byCase['crit']).toBe('critical')
  })

  it('skips cases that exist only in the current run (no prev to compare)', () => {
    const prev: EvalResult[] = []
    const curr = [mkResult({ caseId: 'new', score: 0.3, passed: false, verdict: 'fail' })]
    const { regressions } = detectRegressions(prev, curr)
    expect(regressions).toHaveLength(0)
  })

  it('records improvements when score rises by ≥0.05', () => {
    const prev = [mkResult({ caseId: 'c1', score: 0.6 })]
    const curr = [mkResult({ caseId: 'c1', score: 0.9 })]
    const { regressions, improvements } = detectRegressions(prev, curr)
    expect(regressions).toHaveLength(0)
    expect(improvements).toHaveLength(1)
    expect(improvements[0]?.delta).toBeCloseTo(0.3, 5)
  })

  it('sorts regressions: critical first, then by delta magnitude', () => {
    const prev = [
      mkResult({ caseId: 'c-minor',  score: 0.9 }),
      mkResult({ caseId: 'c-crit',   score: 0.9 }),
      mkResult({ caseId: 'c-major',  score: 0.9 }),
    ]
    const curr = [
      mkResult({ caseId: 'c-minor',  score: 0.85 }),
      mkResult({ caseId: 'c-crit',   score: 0.50 }),
      mkResult({ caseId: 'c-major',  score: 0.75 }),
    ]
    const { regressions } = detectRegressions(prev, curr)
    expect(regressions[0]?.severity).toBe('critical')
    expect(regressions.at(-1)?.severity).toBe('minor')
  })
})

describe('buildComparison', () => {
  it('counts new-case-pass as a newPass (case in curr, no prev)', () => {
    const baseRun = mkRun({ id: 'base' })
    const headRun = mkRun({ id: 'head' })
    const prev: EvalResult[] = []
    const curr = [mkResult({ caseId: 'new', passed: true, verdict: 'pass' as Verdict })]
    const cmp = buildComparison(baseRun, headRun, prev, curr)
    expect(cmp.newPasses).toBe(1)
    expect(cmp.newFailures).toBe(0)
  })

  it('counts a new-case-fail as a newFailure', () => {
    const baseRun = mkRun({ id: 'base' })
    const headRun = mkRun({ id: 'head' })
    const curr = [mkResult({ caseId: 'new', passed: false, verdict: 'fail' as Verdict })]
    const cmp = buildComparison(baseRun, headRun, [], curr)
    expect(cmp.newFailures).toBe(1)
    expect(cmp.newPasses).toBe(0)
  })

  it('marks runs with critical regressions as significant', () => {
    const baseRun = mkRun({ id: 'base' })
    const headRun = mkRun({ id: 'head', totalEvals: 1 })
    const prev = [mkResult({ caseId: 'c1', score: 0.95 })]
    const curr = [mkResult({ caseId: 'c1', score: 0.30, passed: false, verdict: 'fail' })]
    const cmp = buildComparison(baseRun, headRun, prev, curr)
    expect(cmp.significantChange).toBe(true)
  })

  it('does not mark a single small dip as significant', () => {
    const baseRun = mkRun({ id: 'base' })
    const headRun = mkRun({ id: 'head', totalEvals: 50 })
    const prev = Array.from({ length: 50 }, (_, i) =>
      mkResult({ caseId: `c${i}`, score: 0.9 })
    )
    const curr = prev.map((r, i) =>
      mkResult({ caseId: `c${i}`, score: i === 0 ? 0.82 : 0.9 })
    )
    const cmp = buildComparison(baseRun, headRun, prev, curr)
    expect(cmp.significantChange).toBe(false)
  })
})
