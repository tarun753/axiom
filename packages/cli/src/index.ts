#!/usr/bin/env node
import { program } from 'commander'
import { runCommand }     from './commands/run.js'
import { compareCommand } from './commands/compare.js'
import { initCommand }    from './commands/init.js'
import { uiCommand }      from './commands/ui.js'

const version = '0.1.0'

program
  .name('axiom')
  .description('Behavioral testing infrastructure for AI applications')
  .version(version)

program
  .command('run [pattern]')
  .description('Run evals matching a glob pattern (default: evals/**/*.eval.ts)')
  .option('-m, --model <model>',  'Override default model')
  .option('--ci',                 'CI mode: exit 1 on failure or regression')
  .option('--only <tag>',         'Run only evals with this tag')
  .option('--json',               'Also write axiom-report.json')
  .option('--html',               'Also write axiom-report.html')
  .option('-w, --watch',          'Watch eval files and re-run on change')
  .action(async (pattern: string | undefined, opts: Record<string, unknown>) => {
    await runCommand({ pattern, ...opts as object })
  })

program
  .command('ui')
  .description('Open the local Axiom dashboard')
  .option('-p, --port <port>', 'Port to listen on', '3847')
  .option('-h, --host <host>', 'Host to bind to', 'localhost')
  .option('--no-open',         'Do not auto-open the browser')
  .action(async (opts: Record<string, unknown>) => {
    await uiCommand(opts as object)
  })

program
  .command('compare [base] [head]')
  .description('Compare two runs (default: last two)')
  .action(async (base?: string, head?: string) => {
    await compareCommand(base, head)
  })

program
  .command('init')
  .description('Scaffold axiom.config.ts and evals/ directory')
  .action(async () => {
    await initCommand()
  })

program
  .command('show <runId>')
  .description('Show details of a specific run')
  .action(async (runId: string) => {
    const { loadConfig, createStorage } = await import('@axiom-ai/core')
    const config  = await loadConfig()
    const storage = createStorage(config.storagePath)
    const run     = await storage.getRun(runId)

    if (!run) {
      console.error(`Run not found: ${runId}`)
      storage.close()
      process.exit(1)
    }

    const results = await storage.getEvalResults(runId)
    storage.close()

    console.log(JSON.stringify({ run, results }, null, 2))
  })

program
  .command('ls')
  .description('List recent runs')
  .option('-n, --limit <n>', 'Number of runs to show', '10')
  .action(async (opts: { limit: string }) => {
    const { loadConfig, createStorage } = await import('@axiom-ai/core')
    const config  = await loadConfig()
    const storage = createStorage(config.storagePath)
    const runs    = await storage.listRuns({ limit: parseInt(opts.limit, 10) })
    storage.close()

    const c = { dim: '\x1b[2m', reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', bold: '\x1b[1m' }

    console.log()
    console.log(`${c.bold}  ID        DATE                  MODEL                PASS%   COST${c.reset}`)
    console.log(`  ${'─'.repeat(72)}`)
    for (const r of runs) {
      const passColor = r.passRate >= 0.9 ? c.green : r.passRate >= 0.7 ? '' : c.red
      const date = new Date(r.createdAt).toLocaleString().padEnd(20)
      const model = r.model.padEnd(20)
      const pass  = `${passColor}${(r.passRate * 100).toFixed(0)}%${c.reset}`.padEnd(8)
      console.log(`  ${r.id.slice(0,8)}  ${date}  ${model}  ${pass}  $${r.costUsd.toFixed(5)}`)
    }
    console.log()
  })

program.parse()
