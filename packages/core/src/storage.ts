import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  Storage, Run, EvalResult, RunStatus,
  Verdict, Severity, InvariantViolation,
} from './types.js'

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runs (
  id           TEXT PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'running',
  created_at   TEXT NOT NULL,
  completed_at TEXT,
  git_commit   TEXT,
  git_branch   TEXT,
  model        TEXT NOT NULL,
  total_evals  INTEGER NOT NULL DEFAULT 0,
  passed       INTEGER NOT NULL DEFAULT 0,
  failed       INTEGER NOT NULL DEFAULT 0,
  errors       INTEGER NOT NULL DEFAULT 0,
  skipped      INTEGER NOT NULL DEFAULT 0,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  cost_usd     REAL    NOT NULL DEFAULT 0,
  pass_rate    REAL    NOT NULL DEFAULT 0,
  avg_score    REAL    NOT NULL DEFAULT 0,
  metadata     TEXT
);

CREATE TABLE IF NOT EXISTS eval_results (
  id               TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  eval_name        TEXT NOT NULL,
  case_id          TEXT NOT NULL,
  input            TEXT NOT NULL,
  output           TEXT NOT NULL,
  verdict          TEXT NOT NULL,
  passed           INTEGER NOT NULL,
  score            REAL    NOT NULL,
  scores           TEXT    NOT NULL DEFAULT '{}',
  violations       TEXT    NOT NULL DEFAULT '[]',
  judge_reasoning  TEXT    NOT NULL DEFAULT '',
  latency_ms       INTEGER NOT NULL DEFAULT 0,
  tokens_input     INTEGER NOT NULL DEFAULT 0,
  tokens_output    INTEGER NOT NULL DEFAULT 0,
  cost_usd         REAL    NOT NULL DEFAULT 0,
  tags             TEXT    NOT NULL DEFAULT '[]',
  error            TEXT,
  created_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eval_results_run_id    ON eval_results(run_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_eval_name ON eval_results(eval_name);
CREATE INDEX IF NOT EXISTS idx_eval_results_verdict   ON eval_results(verdict);
CREATE INDEX IF NOT EXISTS idx_runs_created_at        ON runs(created_at DESC);
`

// ─── Row Mappers ─────────────────────────────────────────────────────────────

function rowToRun(row: Record<string, unknown>): Run {
  return {
    id:           row['id'] as string,
    status:       row['status'] as RunStatus,
    createdAt:    new Date(row['created_at'] as string),
    completedAt:  row['completed_at'] ? new Date(row['completed_at'] as string) : undefined,
    gitCommit:    row['git_commit'] as string | undefined,
    gitBranch:    row['git_branch'] as string | undefined,
    model:        row['model'] as string,
    totalEvals:   row['total_evals'] as number,
    passed:       row['passed'] as number,
    failed:       row['failed'] as number,
    errors:       row['errors'] as number,
    skipped:      row['skipped'] as number,
    durationMs:   row['duration_ms'] as number,
    costUsd:      row['cost_usd'] as number,
    passRate:     row['pass_rate'] as number,
    avgScore:     row['avg_score'] as number,
    metadata:     row['metadata'] ? JSON.parse(row['metadata'] as string) : undefined,
  }
}

function rowToEvalResult(row: Record<string, unknown>): EvalResult {
  return {
    id:             row['id'] as string,
    runId:          row['run_id'] as string,
    evalName:       row['eval_name'] as string,
    caseId:         row['case_id'] as string,
    input:          row['input'] as string,
    output:         row['output'] as string,
    verdict:        row['verdict'] as Verdict,
    passed:         Boolean(row['passed']),
    score:          row['score'] as number,
    scores:         JSON.parse(row['scores'] as string) as Record<string, number>,
    violations:     JSON.parse(row['violations'] as string) as InvariantViolation[],
    judgeReasoning: row['judge_reasoning'] as string,
    latencyMs:      row['latency_ms'] as number,
    tokensInput:    row['tokens_input'] as number,
    tokensOutput:   row['tokens_output'] as number,
    costUsd:        row['cost_usd'] as number,
    tags:           JSON.parse(row['tags'] as string) as string[],
    error:          row['error'] as string | undefined,
    createdAt:      new Date(row['created_at'] as string),
  }
}

// ─── SQLiteStorage ────────────────────────────────────────────────────────────

export class SQLiteStorage implements Storage {
  private readonly db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
    this.db.exec(SCHEMA)
  }

  saveRun(run: Run): Promise<void> {
    this.db.prepare(`
      INSERT INTO runs
        (id, status, created_at, completed_at, git_commit, git_branch,
         model, total_evals, passed, failed, errors, skipped,
         duration_ms, cost_usd, pass_rate, avg_score, metadata)
      VALUES
        (@id, @status, @createdAt, @completedAt, @gitCommit, @gitBranch,
         @model, @totalEvals, @passed, @failed, @errors, @skipped,
         @durationMs, @costUsd, @passRate, @avgScore, @metadata)
    `).run({
      ...run,
      createdAt:   run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      metadata:    run.metadata ? JSON.stringify(run.metadata) : null,
    })
    return Promise.resolve()
  }

  updateRun(id: string, patch: Partial<Run>): Promise<void> {
    const fields = Object.keys(patch)
      .filter(k => k !== 'id' && k !== 'createdAt')
      .map(k => {
        const col = k.replace(/([A-Z])/g, '_$1').toLowerCase()
        return `${col} = @${k}`
      })
      .join(', ')

    if (!fields) return Promise.resolve()

    const params: Record<string, unknown> = { id }
    for (const [k, v] of Object.entries(patch)) {
      if (v instanceof Date) {
        params[k] = v.toISOString()
      } else if (v !== null && typeof v === 'object') {
        // SQLite can only bind primitives; serialize object fields like `metadata`.
        params[k] = JSON.stringify(v)
      } else {
        params[k] = v
      }
    }

    this.db.prepare(`UPDATE runs SET ${fields} WHERE id = @id`).run(params)
    return Promise.resolve()
  }

  getRun(id: string): Promise<Run | null> {
    const row = this.db
      .prepare('SELECT * FROM runs WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined
    return Promise.resolve(row ? rowToRun(row) : null)
  }

  listRuns(opts?: { limit?: number; offset?: number }): Promise<Run[]> {
    const limit  = opts?.limit  ?? 50
    const offset = opts?.offset ?? 0
    const rows = this.db
      .prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as Record<string, unknown>[]
    return Promise.resolve(rows.map(rowToRun))
  }

  saveEvalResult(result: EvalResult): Promise<void> {
    this.db.prepare(`
      INSERT INTO eval_results
        (id, run_id, eval_name, case_id, input, output,
         verdict, passed, score, scores, violations,
         judge_reasoning, latency_ms, tokens_input, tokens_output,
         cost_usd, tags, error, created_at)
      VALUES
        (@id, @runId, @evalName, @caseId, @input, @output,
         @verdict, @passed, @score, @scores, @violations,
         @judgeReasoning, @latencyMs, @tokensInput, @tokensOutput,
         @costUsd, @tags, @error, @createdAt)
    `).run({
      ...result,
      passed:     result.passed ? 1 : 0,
      scores:     JSON.stringify(result.scores),
      violations: JSON.stringify(result.violations),
      tags:       JSON.stringify(result.tags),
      error:      result.error ?? null,
      createdAt:  result.createdAt.toISOString(),
    })
    return Promise.resolve()
  }

  getEvalResults(runId: string): Promise<EvalResult[]> {
    const rows = this.db
      .prepare('SELECT * FROM eval_results WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId) as Record<string, unknown>[]
    return Promise.resolve(rows.map(rowToEvalResult))
  }

  getLastRun(): Promise<Run | null> {
    const row = this.db
      .prepare("SELECT * FROM runs WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined
    return Promise.resolve(row ? rowToRun(row) : null)
  }

  getEvalResultsByName(evalName: string, limit = 20): Promise<EvalResult[]> {
    const rows = this.db.prepare(`
      SELECT er.* FROM eval_results er
      JOIN runs r ON r.id = er.run_id
      WHERE er.eval_name = ? AND r.status = 'completed'
      ORDER BY er.created_at DESC
      LIMIT ?
    `).all(evalName, limit) as Record<string, unknown>[]
    return Promise.resolve(rows.map(rowToEvalResult))
  }

  close(): void {
    this.db.close()
  }
}

export function createStorage(path: string): Storage {
  return new SQLiteStorage(path)
}

export { randomUUID }
