import { describe, it, expect } from 'vitest'
import { EnsembleJudge } from '../src/ensemble.js'
import type { Judge, JudgeContext, JudgeResult } from '@axiom-ai/core'

class FakeJudge implements Judge {
  readonly name: string
  constructor(name: string, private result: JudgeResult) {
    this.name = name
  }
  judge(_i: string, _o: string, _c: JudgeContext): Promise<JudgeResult> {
    return Promise.resolve(this.result)
  }
}

const ctx = {} as JudgeContext

const r = (verdict: 'pass' | 'fail', score: number, scores: Record<string, number> = {}): JudgeResult =>
  ({ verdict, score, scores, reasoning: '', violations: [] })

describe('EnsembleJudge — majority strategy', () => {
  it('passes when majority of judges pass', async () => {
    const ensemble = new EnsembleJudge([
      new FakeJudge('a', r('pass', 0.9)),
      new FakeJudge('b', r('pass', 0.8)),
      new FakeJudge('c', r('fail', 0.3)),
    ])
    const result = await ensemble.judge('', '', ctx)
    expect(result.verdict).toBe('pass')
  })

  it('fails when majority of judges fail', async () => {
    const ensemble = new EnsembleJudge([
      new FakeJudge('a', r('fail', 0.3)),
      new FakeJudge('b', r('fail', 0.2)),
      new FakeJudge('c', r('pass', 0.9)),
    ])
    const result = await ensemble.judge('', '', ctx)
    expect(result.verdict).toBe('fail')
  })

  it('averages overall score across judges', async () => {
    const ensemble = new EnsembleJudge([
      new FakeJudge('a', r('pass', 0.9)),
      new FakeJudge('b', r('pass', 0.7)),
    ])
    const result = await ensemble.judge('', '', ctx)
    expect(result.score).toBeCloseTo(0.8, 5)
  })
})

describe('EnsembleJudge — dimension-score averaging (Bug 16 regression)', () => {
  it('correctly averages dimension scores across judges (not biased toward last)', async () => {
    // All three judges return accuracy=0.9 — true average is 0.9, not 0.7875.
    const ensemble = new EnsembleJudge([
      new FakeJudge('a', r('pass', 0.9, { accuracy: 0.9 })),
      new FakeJudge('b', r('pass', 0.9, { accuracy: 0.9 })),
      new FakeJudge('c', r('pass', 0.9, { accuracy: 0.9 })),
    ])
    const result = await ensemble.judge('', '', ctx)
    expect(result.scores['accuracy']).toBeCloseTo(0.9, 5)
  })

  it('handles judges that report different dimensions', async () => {
    const ensemble = new EnsembleJudge([
      new FakeJudge('a', r('pass', 1, { accuracy: 1.0, clarity: 0.6 })),
      new FakeJudge('b', r('pass', 1, { accuracy: 0.8 })),
    ])
    const result = await ensemble.judge('', '', ctx)
    expect(result.scores['accuracy']).toBeCloseTo(0.9, 5)
    expect(result.scores['clarity']).toBeCloseTo(0.6, 5)
  })
})

describe('EnsembleJudge — weighted strategy', () => {
  it('respects per-judge weights', async () => {
    const ensemble = new EnsembleJudge(
      [
        new FakeJudge('a', r('pass', 1.0)),
        new FakeJudge('b', r('fail', 0.0)),
      ],
      { strategy: 'weighted', weights: [0.9, 0.1] },
    )
    const result = await ensemble.judge('', '', ctx)
    expect(result.score).toBeCloseTo(0.9, 5)
    expect(result.verdict).toBe('pass')
  })

  it('throws if weights do not sum to 1', () => {
    expect(() => new EnsembleJudge(
      [new FakeJudge('a', r('pass', 1)), new FakeJudge('b', r('pass', 1))],
      { strategy: 'weighted', weights: [0.3, 0.4] },
    )).toThrow(/sum to 1/)
  })
})
