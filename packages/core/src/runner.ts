import { randomUUID }  from 'node:crypto'
import { execSync }    from 'node:child_process'
import { mkdirSync, realpathSync } from 'node:fs'
import { dirname }     from 'node:path'
import { glob }        from 'glob'
import pLimit          from 'p-limit'
import type {
  AxiomConfig, EvalDefinition, EvalResult, Run,
  Reporter, Storage, RunComparison,
} from './types.js'
import { buildComparison } from './regression.js'

// ─── Git helpers ──────────────────────────────────────────────────────────────

function gitMeta(): { commit?: string; branch?: string } {
  try {
    const commit = execSync('git rev-parse --short HEAD', { stdio: 'pipe' })
      .toString().trim()
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' })
      .toString().trim()
    return { commit, branch }
  } catch {
    return {}
  }
}

// ─── Timeout wrapper ──────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Eval "${label}" timed out after ${ms}ms`)),
      ms
    )
  })
  // Clear the timer so it doesn't keep the event loop alive after the race resolves.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// ─── Eval file loading ────────────────────────────────────────────────────────

export async function loadEvalFiles(
  pattern: string,
  cwd = process.cwd()
): Promise<EvalDefinition[]> {
  const files = await glob(pattern, { cwd, absolute: true })

  // Dedupe via realpath so symlinked-or-aliased paths resolve to the same module
  // and don't cause the same eval() side effect to fire twice.
  const canonical = new Set<string>()
  for (const f of files) {
    try { canonical.add(realpathSync(f)) }
    catch { canonical.add(f) }
  }

  // Reset the registry before importing files
  const { resetRegistry, getRegisteredEvals } = await import('@axiom-ai/sdk')
  resetRegistry()

  for (const file of canonical) {
    // Dynamic import causes the eval() calls in the file to fire,
    // registering definitions in the module-level registry
    await import(file)
  }

  const defs = getRegisteredEvals()
  return defs
}

// ─── Single eval execution ────────────────────────────────────────────────────

async function executeEval(
  def: EvalDefinition,
  config: AxiomConfig,
  runId: string,
  reporters: Reporter[],
): Promise<EvalResult[]> {
  const { EvalContextImpl } = await import('@axiom-ai/sdk')
  const ctx = new EvalContextImpl(config, runId, def.options.spec)

  let errorMsg: string | undefined

  try {
    await withTimeout(
      (async () => {
        let attempt = 0
        while (attempt <= def.options.retries) {
          try {
            await def.fn(ctx)
            break
          } catch (err) {
            if (attempt === def.options.retries) throw err
            attempt++
            // Discard partial results from the failed attempt so retries
            // don't accumulate duplicate caseIds in flushResults.
            ctx.resetResults()
            await new Promise(r => setTimeout(r, 200 * 2 ** attempt))
          }
        }
      })(),
      def.options.timeout,
      def.name
    )
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err)
  }

  const results = ctx.flushResults(def.name, errorMsg)

  // Isolate reporter failures — a single broken reporter must not abort the run
  // or strand sibling evals running under p-limit.
  for (const result of results) {
    for (const reporter of reporters) {
      try {
        await reporter.onEvalResult(result)
      } catch (e) {
        console.error(`[axiom] Reporter "${reporter.constructor.name}" threw on onEvalResult:`, e)
      }
    }
  }

  return results
}

// ─── Full run orchestration ───────────────────────────────────────────────────

export interface RunOutput {
  run: Run
  results: EvalResult[]
  comparison: RunComparison | null
}

export async function executeRun(
  defs: EvalDefinition[],
  config: AxiomConfig,
  storage: Storage,
  reporters: Reporter[],
): Promise<RunOutput> {
  const runId    = randomUUID()
  const { commit, branch } = gitMeta()
  const startedAt = Date.now()

  // Filter only/skip — the user's intent of `.skip()` is "don't run this case",
  // distinct from "filtered out because some other case is `.only()`".
  // Only `.skip()`-marked evals count as `skipped` in run reporting.
  const onlyDefs   = defs.filter(d => d.options.only)
  const activeDefs = onlyDefs.length > 0
    ? onlyDefs.filter(d => !d.options.skip)
    : defs.filter(d => !d.options.skip)
  const skippedCount = defs.filter(d => d.options.skip).length

  const run: Run = {
    id:          runId,
    status:      'running',
    createdAt:   new Date(),
    gitCommit:   commit,
    gitBranch:   branch,
    model:       config.models.default,
    totalEvals:  activeDefs.length,
    passed:      0,
    failed:      0,
    errors:      0,
    skipped:     skippedCount,
    durationMs:  0,
    costUsd:     0,
    passRate:    0,
    avgScore:    0,
  }

  // Ensure storage dir exists
  mkdirSync(dirname(config.storagePath), { recursive: true })
  await storage.saveRun(run)

  for (const reporter of reporters) await reporter.onRunStart(run)

  const limit = pLimit(config.concurrency)
  const allResults: EvalResult[] = []

  await Promise.all(
    activeDefs.map(def =>
      limit(async () => {
        const results = await executeEval(def, config, runId, reporters)
        allResults.push(...results)
      })
    )
  )

  // Aggregate
  const passed  = allResults.filter(r => r.passed).length
  const failed  = allResults.filter(r => !r.passed && !r.error).length
  const errors  = allResults.filter(r => Boolean(r.error)).length
  const totalScore = allResults.reduce((s, r) => s + r.score, 0)
  const totalCost  = allResults.reduce((s, r) => s + r.costUsd, 0)

  const completedRun: Run = {
    ...run,
    status:      'completed',
    completedAt: new Date(),
    passed,
    failed,
    errors,
    durationMs:  Date.now() - startedAt,
    costUsd:     totalCost,
    passRate:    allResults.length > 0 ? passed / allResults.length : 0,
    avgScore:    allResults.length > 0 ? totalScore / allResults.length : 0,
  }

  await storage.updateRun(runId, completedRun)
  for (const r of allResults) await storage.saveEvalResult(r)

  // Regression detection
  let comparison: RunComparison | null = null
  const lastRun = await storage.getLastRun()

  if (lastRun && lastRun.id !== runId) {
    const prevResults = await storage.getEvalResults(lastRun.id)
    comparison = buildComparison(lastRun, completedRun, prevResults, allResults)

    for (const reporter of reporters) {
      if (reporter.onRegressions) await reporter.onRegressions(comparison)
    }
  }

  for (const reporter of reporters) {
    await reporter.onRunComplete(completedRun, allResults)
  }

  return { run: completedRun, results: allResults, comparison }
}
