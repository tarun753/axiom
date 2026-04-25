import { writeFileSync } from 'node:fs'
import type { Reporter, Run, EvalResult, RunComparison } from '@axiom-ai/core'

interface HTMLReporterOptions {
  outputPath?: string
}

function escape(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtCost(u: number): string {
  return u < 0.01 ? `${(u * 100).toFixed(2)}¢` : `$${u.toFixed(4)}`
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export class HTMLReporter implements Reporter {
  private results: EvalResult[] = []
  private comparison?: RunComparison | null
  private readonly outputPath: string

  constructor(opts: HTMLReporterOptions = {}) {
    this.outputPath = opts.outputPath ?? 'axiom-report.html'
  }

  onRunStart(_run: Run): void {}
  onEvalResult(result: EvalResult): void { this.results.push(result) }
  onRegressions(comparison: RunComparison): void { this.comparison = comparison }

  onRunComplete(run: Run, results: EvalResult[]): void {
    this.results = results
    const html = this.render(run)
    writeFileSync(this.outputPath, html)
    console.log(`[axiom] HTML report → ${this.outputPath}`)
  }

  private render(run: Run): string {
    // Group results by eval name
    const groups = new Map<string, EvalResult[]>()
    for (const r of this.results) {
      if (!groups.has(r.evalName)) groups.set(r.evalName, [])
      groups.get(r.evalName)!.push(r)
    }

    const passColor = run.passRate >= 0.9 ? '#34d399' : run.passRate >= 0.7 ? '#fbbf24' : '#f87171'

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Axiom — Run ${escape(run.id.slice(0, 8))}</title>
<style>
  :root {
    --void: #0b0a08;
    --paper: #f0ebe1;
    --gold: #c09a58;
    --fog: #1e1c19;
    --fog2: #252320;
    --mist: #4a4540;
    --green: #34d399;
    --yellow: #fbbf24;
    --red: #f87171;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--void);
    color: var(--paper);
    font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    padding: 4rem 2rem;
  }
  .container { max-width: 1200px; margin: 0 auto; }
  .eyebrow { font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--gold); margin-bottom: 0.75rem; }
  h1 { font-family: Georgia, serif; font-size: 2.5rem; font-weight: normal; letter-spacing: -0.02em; }
  h1 .dim { color: var(--mist); font-weight: 300; }
  .meta { color: var(--mist); margin-top: 0.5rem; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--fog2); border-radius: 8px; overflow: hidden; margin: 2.5rem 0; }
  .stat { background: var(--fog); padding: 1.25rem; }
  .stat .label { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--mist); margin-bottom: 0.5rem; }
  .stat .value { font-family: Georgia, serif; font-size: 1.5rem; }
  section { margin: 2.5rem 0; }
  section h2 { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--mist); margin-bottom: 1rem; font-weight: normal; }
  .panel { border: 1px solid var(--fog2); border-radius: 8px; overflow: hidden; }
  details { border-bottom: 1px solid var(--fog2); }
  details:last-child { border-bottom: none; }
  details > summary { padding: 1rem 1.25rem; cursor: pointer; display: flex; align-items: center; gap: 1rem; list-style: none; transition: background 0.15s; }
  details > summary:hover { background: var(--fog); }
  details > summary::-webkit-details-marker { display: none; }
  .badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; }
  .b-pass { background: rgba(52, 211, 153, 0.1); color: var(--green); border: 1px solid rgba(52, 211, 153, 0.3); }
  .b-fail { background: rgba(248, 113, 113, 0.1); color: var(--red); border: 1px solid rgba(248, 113, 113, 0.3); }
  .b-error { background: rgba(251, 191, 36, 0.1); color: var(--yellow); border: 1px solid rgba(251, 191, 36, 0.3); }
  .case { padding: 1rem 1.25rem; border-top: 1px solid var(--fog2); background: rgba(0,0,0,0.2); }
  .case-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; font-size: 12px; color: var(--mist); }
  .case-header .id { font-family: ui-monospace, monospace; flex: 1; }
  .case .io { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.5rem; }
  .case .io > div p:first-child { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--mist); margin-bottom: 0.25rem; }
  .case pre { background: var(--fog2); padding: 0.75rem; border-radius: 4px; font: 11px/1.5 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 200px; overflow-y: auto; }
  .reasoning { margin-top: 0.75rem; color: rgba(240, 235, 225, 0.6); font-size: 11px; line-height: 1.6; white-space: pre-wrap; }
  .regr { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--fog2); }
  .regr:last-child { border-bottom: none; }
  .regr .name { flex: 1; }
  .regr .delta { font-family: ui-monospace, monospace; font-size: 12px; }
  .sev-critical { color: var(--red); }
  .sev-major    { color: var(--yellow); }
  .sev-minor    { color: var(--mist); }
  .bar { display: inline-block; width: 60px; height: 4px; background: var(--fog2); border-radius: 2px; overflow: hidden; vertical-align: middle; }
  .bar > div { height: 100%; background: var(--gold); }
  footer { color: var(--mist); font-size: 11px; margin-top: 4rem; text-align: center; letter-spacing: 0.1em; }
  footer a { color: var(--gold); text-decoration: none; }
</style>
</head>
<body>
<div class="container">

  <p class="eyebrow">Evaluation Report</p>
  <h1 style="color: ${passColor}">${(run.passRate * 100).toFixed(1)}%<span class="dim"> · ${run.totalEvals} evals</span></h1>
  <p class="meta">${escape(new Date(run.createdAt).toLocaleString())} · ${escape(run.model)} · ${run.gitBranch ? escape(run.gitBranch) + ' · ' : ''}${fmtCost(run.costUsd)}</p>

  <div class="grid">
    <div class="stat"><p class="label">Passed</p><p class="value">${run.passed}</p></div>
    <div class="stat"><p class="label">Failed</p><p class="value">${run.failed}</p></div>
    <div class="stat"><p class="label">Errors</p><p class="value">${run.errors}</p></div>
    <div class="stat"><p class="label">Duration</p><p class="value">${fmtMs(run.durationMs)}</p></div>
  </div>

  ${this.renderRegressions()}

  <section>
    <h2>Eval Results</h2>
    <div class="panel">
      ${[...groups.entries()].map(([name, results]) => this.renderEvalGroup(name, results)).join('')}
    </div>
  </section>

  <footer>
    Generated by <a href="https://github.com/axiom-ai/axiom">Axiom</a> · run ${escape(run.id.slice(0, 8))}
  </footer>
</div>
</body>
</html>`
  }

  private renderRegressions(): string {
    if (!this.comparison || this.comparison.regressions.length === 0) return ''
    const list = this.comparison.regressions.map(r => `
      <div class="regr">
        <span class="badge sev-${escape(r.severity)}">${escape(r.severity)}</span>
        <span class="name">${escape(r.evalName)}</span>
        <span class="delta">${r.prevScore.toFixed(2)} → ${r.currScore.toFixed(2)}</span>
        <span class="delta sev-critical">${(r.delta * 100).toFixed(1)}%</span>
      </div>
    `).join('')
    return `
      <section>
        <h2 style="color: var(--gold)">Regressions vs Previous Run</h2>
        <div class="panel">${list}</div>
      </section>
    `
  }

  private renderEvalGroup(name: string, results: EvalResult[]): string {
    const allPassed = results.every(r => r.passed)
    const avgScore  = results.reduce((s, r) => s + r.score, 0) / results.length
    const cases = results.map(r => `
      <div class="case">
        <div class="case-header">
          <span class="badge ${r.error ? 'b-error' : r.passed ? 'b-pass' : 'b-fail'}">${escape(r.verdict)}</span>
          <span class="id">${escape(r.caseId)}</span>
          <span>${r.score.toFixed(3)}</span>
          <span>${fmtMs(r.latencyMs)}</span>
          <span>${fmtCost(r.costUsd)}</span>
        </div>
        <div class="io">
          <div><p>Input</p><pre>${escape(r.input)}</pre></div>
          <div><p>Output</p><pre>${escape(r.output)}</pre></div>
        </div>
        ${r.judgeReasoning ? `<p class="reasoning">${escape(r.judgeReasoning)}</p>` : ''}
        ${r.error ? `<p class="reasoning" style="color: var(--red)">Error: ${escape(r.error)}</p>` : ''}
      </div>
    `).join('')

    return `
      <details>
        <summary>
          <span class="badge ${allPassed ? 'b-pass' : 'b-fail'}">${allPassed ? 'pass' : 'fail'}</span>
          <span style="flex: 1">${escape(name)}</span>
          <span class="bar"><div style="width: ${(avgScore * 100).toFixed(0)}%"></div></span>
          <span style="font-size: 12px; color: var(--mist); font-family: ui-monospace, monospace">${results.length} case${results.length !== 1 ? 's' : ''}</span>
        </summary>
        ${cases}
      </details>
    `
  }
}
