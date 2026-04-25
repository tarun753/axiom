import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve }         from 'node:path'
import type { Reporter, Run, EvalResult, RunComparison } from '@axiom-ai/core'

export class JSONReporter implements Reporter {
  private results: EvalResult[] = []
  private comparison?: RunComparison

  constructor(private readonly outputPath = 'axiom-report.json') {}

  onRunStart(_run: Run): void {}

  onEvalResult(result: EvalResult): void {
    this.results.push(result)
  }

  onRunComplete(run: Run, results: EvalResult[]): void {
    this.results = results
    const path   = resolve(this.outputPath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ run, results, comparison: this.comparison ?? null }, null, 2))
  }

  onRegressions(comparison: RunComparison): void {
    this.comparison = comparison
  }
}
