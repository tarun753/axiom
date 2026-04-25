import type { EvalContext, EvalDefinition, EvalOptions } from '@axiom-ai/core'
import { registerEval } from './registry.js'

type EvalFn = (ctx: EvalContext) => Promise<void>

interface EvalFnWithVariants {
  (name: string, fn: EvalFn, opts?: EvalOptions): void
  skip: (name: string, fn: EvalFn, opts?: EvalOptions) => void
  only: (name: string, fn: EvalFn, opts?: EvalOptions) => void
}

function makeEvalDef(
  name:    string,
  fn:      EvalFn,
  opts:    EvalOptions,
  filePath: string,
): EvalDefinition {
  return {
    name,
    fn,
    filePath,
    options: {
      timeout:     opts.timeout     ?? 30_000,
      retries:     opts.retries     ?? 0,
      concurrency: opts.concurrency ?? 5,
      tags:        opts.tags        ?? [],
      // spec stays undefined when not supplied; cast through unknown to satisfy
      // Required<EvalOptions> while preserving runtime semantics.
      spec:        opts.spec as EvalDefinition['options']['spec'],
      skip:        opts.skip        ?? false,
      only:        opts.only        ?? false,
    },
  }
}

function getCallerFile(): string {
  const err    = new Error()
  const lines  = err.stack?.split('\n') ?? []
  const caller = lines[3] ?? ''
  const match  = /\((.+?):\d+:\d+\)/.exec(caller) ?? /at (.+?):\d+:\d+/.exec(caller)
  return match?.[1] ?? 'unknown'
}

const evalFn: EvalFnWithVariants = function evalFn(
  name: string,
  fn:   EvalFn,
  opts: EvalOptions = {},
) {
  registerEval(makeEvalDef(name, fn, opts, getCallerFile()))
} as EvalFnWithVariants

evalFn.skip = function skip(name, fn, opts = {}) {
  registerEval(makeEvalDef(name, fn, { ...opts, skip: true }, getCallerFile()))
}

evalFn.only = function only(name, fn, opts = {}) {
  registerEval(makeEvalDef(name, fn, { ...opts, only: true }, getCallerFile()))
}

export { evalFn as eval }
