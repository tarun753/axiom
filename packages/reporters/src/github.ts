import type { Reporter, Run, EvalResult, RunComparison } from '@axiom-ai/core'

interface GitHubReporterOptions {
  token:       string
  owner:       string
  repo:        string
  prNumber:    number
  commentTag?: string     // used to find/update existing comment
}

function badge(label: string, value: string, color: string): string {
  return `![${label}](https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(value)}-${color})`
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals)
}

function severityEmoji(s: string): string {
  return s === 'critical' ? '🔴' : s === 'major' ? '🟡' : '🟢'
}

export class GitHubReporter implements Reporter {
  private readonly tag: string
  private run?: Run
  private results: EvalResult[] = []
  private comparison?: RunComparison | null

  constructor(private readonly opts: GitHubReporterOptions) {
    this.tag = opts.commentTag ?? 'axiom-eval-report'
  }

  onRunStart(_run: Run): void {}

  onEvalResult(result: EvalResult): void {
    this.results.push(result)
  }

  onRunComplete(run: Run, results: EvalResult[]): void {
    this.run     = run
    this.results = results
  }

  onRegressions(comparison: RunComparison): void {
    this.comparison = comparison
  }

  async flush(): Promise<void> {
    if (!this.run) return
    if (!this.opts.token) {
      console.warn('[axiom][github] No token provided — skipping PR comment')
      return
    }
    let body = this.buildComment()
    // GitHub caps issue comment bodies at 65,536 chars. Leave headroom for the truncation marker.
    const MAX = 60_000
    if (body.length > MAX) {
      body = body.slice(0, MAX) + '\n\n*…(truncated; full report in CI artifacts)*'
    }
    await this.postOrUpdateComment(body)
  }

  private buildComment(): string {
    const run     = this.run!
    const comp    = this.comparison
    const passColor = run.passRate >= 0.9 ? 'brightgreen' : run.passRate >= 0.7 ? 'yellow' : 'red'

    const lines: string[] = [
      `<!-- ${this.tag} -->`,
      '## 🧪 Axiom Evaluation Report',
      '',
      `${badge('Pass Rate', `${fmt(run.passRate * 100)}%`, passColor)} ` +
      `${badge('Score', fmt(run.avgScore, 2), 'blue')} ` +
      `${badge('Cost', `$${run.costUsd.toFixed(4)}`, 'lightgrey')} ` +
      `${badge('Model', run.model, 'informational')}`,
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| ✅ Passed  | ${run.passed} / ${run.totalEvals} |`,
      `| ❌ Failed  | ${run.failed} |`,
      `| ⚡ Errors  | ${run.errors} |`,
      `| ⏱ Duration | ${(run.durationMs / 1000).toFixed(1)}s |`,
      `| 💰 Cost    | $${run.costUsd.toFixed(5)} |`,
      '',
    ]

    if (comp) {
      const dPass = comp.passRateDelta * 100
      const dCost = comp.costDelta
      lines.push('### Changes vs Previous Run')
      lines.push('')
      lines.push(
        `| | Δ Pass Rate | Δ Avg Score | Δ Cost |`,
        `|---|---|---|---|`,
        `| | ${dPass >= 0 ? '▲' : '▼'} ${Math.abs(dPass).toFixed(1)}% | ${comp.avgScoreDelta >= 0 ? '+' : ''}${fmt(comp.avgScoreDelta, 3)} | ${dCost >= 0 ? '+' : ''}$${dCost.toFixed(5)} |`,
      )
      lines.push('')

      if (comp.regressions.length > 0) {
        lines.push(`### ⚠️ Regressions (${comp.regressions.length})`)
        lines.push('')
        lines.push('<details><summary>Click to expand</summary>', '')
        lines.push('| Severity | Eval | Score Change |')
        lines.push('|----------|------|-------------|')
        for (const r of comp.regressions) {
          lines.push(
            `| ${severityEmoji(r.severity)} ${r.severity} | ${r.evalName} | ${fmt(r.prevScore, 2)} → ${fmt(r.currScore, 2)} (${((r.currScore - r.prevScore) * 100).toFixed(1)}%) |`
          )
        }
        lines.push('', '</details>', '')
      }

      if (comp.improvements.length > 0) {
        lines.push(`### ✅ Improvements (${comp.improvements.length})`)
        lines.push('')
        lines.push('<details><summary>Click to expand</summary>', '')
        for (const imp of comp.improvements) {
          lines.push(`- **${imp.evalName}**: +${((imp.delta) * 100).toFixed(1)}%`)
        }
        lines.push('', '</details>', '')
      }
    }

    // Failed evals detail
    const failed = this.results.filter(r => !r.passed).slice(0, 5)
    if (failed.length > 0) {
      lines.push('### ❌ Failed Evals')
      lines.push('<details><summary>Click to expand</summary>', '')
      for (const r of failed) {
        lines.push(`**${r.evalName}**`)
        lines.push(`> ${r.judgeReasoning.slice(0, 300)}`)
        lines.push('')
      }
      lines.push('</details>', '')
    }

    lines.push(`---`)
    lines.push(`*Run \`${run.id.slice(0, 8)}\` · ${new Date(run.createdAt).toISOString()}*`)

    return lines.join('\n')
  }

  private async postOrUpdateComment(body: string): Promise<void> {
    const base = `https://api.github.com/repos/${this.opts.owner}/${this.opts.repo}`
    const headers = {
      Authorization: `token ${this.opts.token}`,
      Accept:        'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent':  'axiom-ai',
    }

    // Find existing comment
    const listRes  = await fetch(`${base}/issues/${this.opts.prNumber}/comments?per_page=100`, { headers })
    if (!listRes.ok) {
      console.error(`[axiom][github] Failed to list comments: ${listRes.status} ${listRes.statusText}`)
      return
    }
    const listJson = await listRes.json()
    if (!Array.isArray(listJson)) {
      console.error('[axiom][github] Unexpected response shape from comments API:', listJson)
      return
    }
    const comments = listJson as Array<{ id: number; body: string }>
    const existing = comments.find(c => c.body?.includes(`<!-- ${this.tag} -->`))

    const payload = JSON.stringify({ body })

    const writeRes = existing
      ? await fetch(`${base}/issues/comments/${existing.id}`, { method: 'PATCH', headers, body: payload })
      : await fetch(`${base}/issues/${this.opts.prNumber}/comments`, { method: 'POST', headers, body: payload })

    if (!writeRes.ok) {
      console.error(`[axiom][github] Failed to ${existing ? 'update' : 'post'} comment: ${writeRes.status} ${writeRes.statusText}`)
    }
  }
}
