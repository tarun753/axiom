import type { Reporter, Run, EvalResult, RunComparison } from '@axiom-ai/core'

// ─── ANSI helpers (no external deps) ─────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  gold:   '\x1b[33m',
  gray:   '\x1b[90m',
}

function colorVerdict(passed: boolean, error: boolean): string {
  if (error)  return `${c.yellow}⚠ ERROR${c.reset}`
  if (passed) return `${c.green}✓ PASS${c.reset}`
  return              `${c.red}✗ FAIL${c.reset}`
}

function scoreBar(score: number, width = 20): string {
  const filled = Math.round(score * width)
  const empty  = width - filled
  const color  = score >= 0.8 ? c.green : score >= 0.5 ? c.yellow : c.red
  return `${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset} ${(score * 100).toFixed(0)}%`
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(3)}¢`
  return `$${usd.toFixed(4)}`
}

function fmtDuration(ms: number): string {
  if (ms < 1000)  return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

// ─── Spinner (no ora dependency) ─────────────────────────────────────────────

class Spinner {
  private frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
  private idx = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private text = ''

  start(text: string): void {
    this.text = text
    if (process.stdout.isTTY) {
      this.timer = setInterval(() => {
        process.stdout.write(`\r${c.cyan}${this.frames[this.idx % this.frames.length]}${c.reset} ${this.text}`)
        this.idx++
      }, 80)
    }
  }

  stop(result: string): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    if (process.stdout.isTTY) process.stdout.write('\r\x1b[K')
    console.log(result)
  }
}

// ─── ConsoleReporter ──────────────────────────────────────────────────────────

export class ConsoleReporter implements Reporter {
  private spinner = new Spinner()
  private evalCount = 0

  onRunStart(run: Run): void {
    console.log()
    console.log(`${c.bold}${c.cyan} AXIOM${c.reset}  ${c.dim}run ${run.id.slice(0, 8)}${c.reset}`)
    if (run.gitBranch) {
      console.log(`${c.dim}  branch: ${run.gitBranch}${run.gitCommit ? `  commit: ${run.gitCommit}` : ''}${c.reset}`)
    }
    console.log(`${c.dim}  model: ${run.model}  evals: ${run.totalEvals}${c.reset}`)
    console.log()
    this.spinner.start(`Running evals…`)
  }

  onEvalResult(result: EvalResult): void {
    this.evalCount++
    const status  = colorVerdict(result.passed, Boolean(result.error))
    const name    = result.evalName.length > 48
      ? result.evalName.slice(0, 45) + '…'
      : result.evalName.padEnd(48)
    const bar     = scoreBar(result.score, 12)
    const cost    = `${c.dim}${fmtCost(result.costUsd)}${c.reset}`
    const latency = `${c.dim}${fmtDuration(result.latencyMs)}${c.reset}`

    this.spinner.stop(`  ${status}  ${name}  ${bar}  ${cost}  ${latency}`)

    // Show violations inline
    if (result.violations.length > 0) {
      for (const v of result.violations) {
        const sev = v.severity === 'critical' ? c.red
                  : v.severity === 'high'     ? c.yellow : c.dim
        console.log(`     ${sev}↳ [${v.severity}] ${v.rule}${c.reset}`)
      }
    }

    this.spinner.start(`Running evals… (${this.evalCount} done)`)
  }

  onRunComplete(run: Run, results: EvalResult[]): void {
    this.spinner.stop('')
    const line = '─'.repeat(72)
    console.log()
    console.log(`${c.dim}${line}${c.reset}`)
    console.log()

    const passColor = run.passRate >= 0.9 ? c.green : run.passRate >= 0.7 ? c.yellow : c.red
    console.log(`  ${c.bold}Results${c.reset}`)
    console.log(`  Pass rate   ${passColor}${c.bold}${(run.passRate * 100).toFixed(1)}%${c.reset}  (${run.passed}/${run.totalEvals} passed)`)
    console.log(`  Avg score   ${scoreBar(run.avgScore, 20)}`)
    console.log(`  Total cost  ${fmtCost(run.costUsd)}`)
    console.log(`  Duration    ${fmtDuration(run.durationMs)}`)
    if (run.errors > 0) console.log(`  ${c.yellow}Errors      ${run.errors}${c.reset}`)
    console.log()

    // Failed evals summary
    const failed = results.filter(r => !r.passed)
    if (failed.length > 0) {
      console.log(`  ${c.red}${c.bold}Failed Evals (${failed.length})${c.reset}`)
      for (const r of failed.slice(0, 10)) {
        console.log(`  ${c.red}✗${c.reset} ${r.evalName}`)
        if (r.judgeReasoning) {
          const lines = r.judgeReasoning.split('\n').slice(0, 2)
          for (const l of lines) console.log(`    ${c.dim}${l}${c.reset}`)
        }
      }
      if (failed.length > 10) {
        console.log(`  ${c.dim}… and ${failed.length - 10} more${c.reset}`)
      }
      console.log()
    }
  }

  onRegressions(comparison: RunComparison): void {
    const { regressions, improvements } = comparison

    if (regressions.length > 0) {
      console.log(`  ${c.yellow}${c.bold}Regressions detected (${regressions.length})${c.reset}`)
      for (const r of regressions) {
        const sevColor = r.severity === 'critical' ? c.red : r.severity === 'major' ? c.yellow : c.dim
        const delta    = (r.delta * 100).toFixed(1)
        console.log(
          `  ${sevColor}↓ ${r.evalName}${c.reset}  ` +
          `${c.dim}score: ${r.prevScore.toFixed(2)} → ${r.currScore.toFixed(2)} (${delta}%)${c.reset}  ` +
          `${sevColor}[${r.severity}]${c.reset}`
        )
      }
      console.log()
    }

    if (improvements.length > 0) {
      console.log(`  ${c.green}Improvements (${improvements.length})${c.reset}`)
      for (const imp of improvements.slice(0, 5)) {
        console.log(`  ${c.green}↑ ${imp.evalName}${c.reset}  ${c.dim}+${(imp.delta * 100).toFixed(1)}%${c.reset}`)
      }
      console.log()
    }

    const passSign = comparison.passRateDelta >= 0 ? '+' : ''
    console.log(
      `  ${c.dim}Δ pass rate: ${passSign}${(comparison.passRateDelta * 100).toFixed(1)}%  ` +
      `Δ cost: ${comparison.costDelta >= 0 ? '+' : ''}${fmtCost(comparison.costDelta)}${c.reset}`
    )
    console.log()
  }
}
