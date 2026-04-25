import type {
  EvalResult, Run, Regression, Improvement, RunComparison, Verdict,
} from './types.js'

// ─── Thresholds ───────────────────────────────────────────────────────────────

function regressionSeverity(delta: number): Regression['severity'] {
  const abs = Math.abs(delta)
  if (abs >= 0.25) return 'critical'
  if (abs >= 0.10) return 'major'
  return 'minor'
}

// ─── Core detection ──────────────────────────────────────────────────────────

export function detectRegressions(
  prevResults: EvalResult[],
  currResults: EvalResult[],
): { regressions: Regression[]; improvements: Improvement[] } {
  // Build lookup: evalName|caseId → result
  const prevMap = new Map<string, EvalResult>()
  for (const r of prevResults) {
    prevMap.set(`${r.evalName}|${r.caseId}`, r)
  }

  const regressions: Regression[] = []
  const improvements: Improvement[] = []

  for (const curr of currResults) {
    const key  = `${curr.evalName}|${curr.caseId}`
    const prev = prevMap.get(key)
    if (!prev) continue

    const delta = curr.score - prev.score
    const verdictFlip = prev.passed && !curr.passed

    if (verdictFlip || delta <= -0.05) {
      regressions.push({
        evalName:    curr.evalName,
        caseId:      curr.caseId,
        prevScore:   prev.score,
        currScore:   curr.score,
        delta,
        severity:    verdictFlip ? 'critical' : regressionSeverity(delta),
        prevVerdict: prev.verdict as Verdict,
        currVerdict: curr.verdict as Verdict,
      })
    } else if (delta >= 0.05) {
      improvements.push({
        evalName:  curr.evalName,
        caseId:    curr.caseId,
        prevScore: prev.score,
        currScore: curr.score,
        delta,
      })
    }
  }

  // Sort regressions: critical first, then by delta magnitude
  regressions.sort((a, b) => {
    const order = { critical: 0, major: 1, minor: 2 }
    const sev = order[a.severity] - order[b.severity]
    return sev !== 0 ? sev : a.delta - b.delta
  })

  return { regressions, improvements }
}

// ─── Statistical significance ─────────────────────────────────────────────────

function computeSignificance(regressions: Regression[], total: number): boolean {
  if (total === 0) return false
  const criticalOrMajor = regressions.filter(
    r => r.severity === 'critical' || r.severity === 'major'
  ).length
  // Significant if: >5% of all evals regressed, OR any critical regression
  return (
    criticalOrMajor / total > 0.05 ||
    regressions.some(r => r.severity === 'critical')
  )
}

// ─── Public comparison builder ────────────────────────────────────────────────

export function buildComparison(
  baseRun: Run,
  headRun: Run,
  prevResults: EvalResult[],
  currResults: EvalResult[],
): RunComparison {
  const { regressions, improvements } = detectRegressions(prevResults, currResults)

  // Build a lookup once instead of O(n²)
  const prevLookup = new Map<string, EvalResult>()
  for (const p of prevResults) prevLookup.set(`${p.evalName}|${p.caseId}`, p)

  const newFailures = currResults.filter(r => {
    const prev = prevLookup.get(`${r.evalName}|${r.caseId}`)
    return !r.passed && (!prev || prev.passed)
  }).length

  const newPasses = currResults.filter(r => {
    const prev = prevLookup.get(`${r.evalName}|${r.caseId}`)
    // Treats both "flipped fail→pass" AND "brand-new case that passes" as new passes
    return r.passed && (!prev || !prev.passed)
  }).length

  return {
    baseRun,
    headRun,
    regressions,
    improvements,
    newFailures,
    newPasses,
    passRateDelta:  headRun.passRate  - baseRun.passRate,
    avgScoreDelta:  headRun.avgScore  - baseRun.avgScore,
    costDelta:      headRun.costUsd   - baseRun.costUsd,
    durationDelta:  headRun.durationMs - baseRun.durationMs,
    significantChange: computeSignificance(regressions, headRun.totalEvals),
  }
}
