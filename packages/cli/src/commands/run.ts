import { watch }     from 'node:fs'
import { resolve, dirname }   from 'node:path'
import { glob }       from 'glob'
import { loadConfig, createStorage, loadEvalFiles, executeRun } from '@axiom-ai/core'
import { ConsoleReporter, JSONReporter, HTMLReporter } from '@axiom-ai/reporters'
import type { Reporter, AxiomConfig } from '@axiom-ai/core'

interface RunFlags {
  pattern?:  string
  model?:    string
  ci?:       boolean
  only?:     string
  json?:     boolean
  html?:     boolean
  watch?:    boolean
}

function buildReporters(flags: RunFlags, config: AxiomConfig): Reporter[] {
  const reporters: Reporter[] = [new ConsoleReporter()]
  if (flags.json || config.reporters.includes('json')) reporters.push(new JSONReporter())
  if (flags.html || config.reporters.includes('html')) reporters.push(new HTMLReporter())
  return reporters
}

async function runOnce(flags: RunFlags, config: AxiomConfig): Promise<{ failed: boolean }> {
  const storage   = createStorage(config.storagePath)
  const reporters = buildReporters(flags, config)

  const pattern = flags.pattern ?? 'evals/**/*.eval.ts'
  const defs    = await loadEvalFiles(pattern)

  if (defs.length === 0) {
    console.error(`No eval files found matching: ${pattern}`)
    storage.close()
    return { failed: true }
  }

  const filtered = flags.only
    ? defs.filter(d => d.options.tags?.includes(flags.only!))
    : defs

  const { run, comparison } = await executeRun(filtered, config, storage, reporters)
  storage.close()

  if (flags.ci) {
    const threshold = config.thresholds?.minPassRate ?? 0.8
    if (run.passRate < threshold) {
      console.error(`Pass rate ${(run.passRate * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(0)}%`)
      return { failed: true }
    }
    if (comparison?.significantChange) {
      console.error('Significant regressions detected — failing CI')
      return { failed: true }
    }
  }

  return { failed: false }
}

export async function runCommand(flags: RunFlags = {}): Promise<void> {
  const config = await loadConfig()
  if (flags.model) config.models.default = flags.model

  if (!flags.watch) {
    const result = await runOnce(flags, config)
    process.exit(result.failed ? 1 : 0)
  }

  // ── Watch mode ──────────────────────────────────────────────────────────────
  console.log('\n  \x1b[1mAxiom (watch mode)\x1b[0m')
  console.log('  \x1b[2mre-runs evals on file change · Ctrl-C to exit\x1b[0m\n')

  const pattern = flags.pattern ?? 'evals/**/*.eval.ts'
  const files   = await glob(pattern, { cwd: process.cwd(), absolute: true })

  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false

  const trigger = () => {
    if (timer) clearTimeout(timer)
    // Debounce — editors fire multiple events per save (write, rename, etc.).
    timer = setTimeout(async () => {
      if (running) return
      running = true
      console.log('\n\x1b[2m─── re-running evals ───\x1b[0m\n')
      try {
        await runOnce(flags, config)
      } catch (e) {
        console.error('Run failed:', e)
      } finally {
        running = false
      }
    }, 200)
  }

  // Watch each unique parent directory recursively (fs.watch doesn't accept globs).
  const dirs = new Set<string>()
  for (const f of files) dirs.add(dirname(f))

  for (const dir of dirs) {
    try {
      watch(resolve(dir), { recursive: true }, (_event, filename) => {
        if (filename && /\.(ts|tsx|mts|js|mjs)$/.test(filename)) trigger()
      })
    } catch (e) {
      console.warn(`[axiom] could not watch ${dir}:`, (e as Error).message)
    }
  }

  // Initial run
  await runOnce(flags, config).catch(e => console.error('Initial run failed:', e))

  // Keep alive
  process.stdin.resume()
}
