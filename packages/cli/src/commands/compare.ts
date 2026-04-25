import { loadConfig, createStorage, buildComparison } from '@axiom-ai/core'

export async function compareCommand(base?: string, head?: string): Promise<void> {
  const config  = await loadConfig()
  const storage = createStorage(config.storagePath)

  const runs = await storage.listRuns({ limit: 10 })
  if (runs.length < 2) {
    console.error('Need at least 2 completed runs to compare. Run `axiom run` first.')
    process.exit(1)
  }

  const baseRun = base
    ? runs.find(r => r.id.startsWith(base)) ?? runs[1]!
    : runs[1]!
  const headRun = head
    ? runs.find(r => r.id.startsWith(head)) ?? runs[0]!
    : runs[0]!

  const prevResults = await storage.getEvalResults(baseRun.id)
  const currResults = await storage.getEvalResults(headRun.id)
  storage.close()

  const comparison = buildComparison(baseRun, headRun, prevResults, currResults)

  // Pretty print
  const c = {
    bold:   '\x1b[1m', reset: '\x1b[0m',
    green:  '\x1b[32m', red: '\x1b[31m',
    yellow: '\x1b[33m', dim: '\x1b[2m', cyan: '\x1b[36m',
  }

  console.log()
  console.log(`${c.bold}${c.cyan} AXIOM COMPARE${c.reset}`)
  console.log()
  console.log(`  Base: ${baseRun.id.slice(0, 8)}  ${new Date(baseRun.createdAt).toLocaleString()}  ${baseRun.model}`)
  console.log(`  Head: ${headRun.id.slice(0, 8)}  ${new Date(headRun.createdAt).toLocaleString()}  ${headRun.model}`)
  console.log()

  const passSign  = comparison.passRateDelta >= 0 ? '+' : ''
  const scoreSign = comparison.avgScoreDelta  >= 0 ? '+' : ''
  const costSign  = comparison.costDelta      >= 0 ? '+' : ''

  const passColor = comparison.passRateDelta >= 0 ? c.green : c.red
  const scoreColor = comparison.avgScoreDelta >= 0 ? c.green : c.red

  console.log(`  Pass rate  ${passColor}${passSign}${(comparison.passRateDelta * 100).toFixed(1)}%${c.reset}`)
  console.log(`  Avg score  ${scoreColor}${scoreSign}${comparison.avgScoreDelta.toFixed(3)}${c.reset}`)
  console.log(`  Cost       ${costSign}$${comparison.costDelta.toFixed(5)}`)
  console.log()

  if (comparison.regressions.length > 0) {
    console.log(`  ${c.red}${c.bold}Regressions (${comparison.regressions.length})${c.reset}`)
    for (const r of comparison.regressions) {
      const sevColor = r.severity === 'critical' ? c.red : r.severity === 'major' ? c.yellow : c.dim
      console.log(
        `  ${sevColor}[${r.severity.toUpperCase()}]${c.reset} ${r.evalName}  ` +
        `${c.dim}${r.prevScore.toFixed(2)} → ${r.currScore.toFixed(2)} (${((r.delta) * 100).toFixed(1)}%)${c.reset}`
      )
    }
    console.log()
  }

  if (comparison.improvements.length > 0) {
    console.log(`  ${c.green}Improvements (${comparison.improvements.length})${c.reset}`)
    for (const imp of comparison.improvements) {
      console.log(`  ${c.green}↑${c.reset} ${imp.evalName}  ${c.dim}+${(imp.delta * 100).toFixed(1)}%${c.reset}`)
    }
    console.log()
  }

  if (comparison.significantChange) {
    console.log(`  ${c.red}${c.bold}⚠  Significant regression detected${c.reset}`)
    process.exit(1)
  }
}
