import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type { AxiomConfig } from './types.js'

const DEFAULTS: AxiomConfig = {
  models: {
    default: 'claude-sonnet-4-6',
    judge:   'claude-opus-4-7',
    fast:    'claude-haiku-4-5-20251001',
  },
  storagePath:  '.axiom/db.sqlite',
  reporters:    ['console'],
  concurrency:  5,
  timeout:      30_000,
  thresholds: {
    minPassRate:              0.8,
    maxRegressionDelta:       0.1,
    failOnCriticalViolation:  true,
    failOnMajorViolation:     false,
  },
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base }
  for (const key of Object.keys(override) as (keyof T)[]) {
    const v = override[key]
    if (v !== undefined && v !== null) {
      if (
        typeof v === 'object' &&
        !Array.isArray(v) &&
        typeof base[key] === 'object' &&
        !Array.isArray(base[key])
      ) {
        result[key] = deepMerge(
          base[key] as Record<string, unknown>,
          v as Record<string, unknown>
        ) as T[keyof T]
      } else {
        result[key] = v as T[keyof T]
      }
    }
  }
  return result
}

export async function loadConfig(cwd = process.cwd()): Promise<AxiomConfig> {
  const candidates = [
    join(cwd, 'axiom.config.ts'),
    join(cwd, 'axiom.config.js'),
    join(cwd, 'axiom.config.mjs'),
  ]

  let userConfig: Partial<AxiomConfig> = {}

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const mod = await import(resolve(candidate)) as { default?: Partial<AxiomConfig> }
      userConfig = mod.default ?? (mod as unknown as Partial<AxiomConfig>)
      break
    }
  }

  // structuredClone the defaults so downstream mutation can't pollute the
  // module-level DEFAULTS across multiple loadConfig() calls.
  const merged = deepMerge(structuredClone(DEFAULTS), userConfig)

  // Inject API keys from env if not in config
  merged.apiKeys = {
    anthropic: process.env['ANTHROPIC_API_KEY'],
    openai:    process.env['OPENAI_API_KEY'],
    google:    process.env['GOOGLE_API_KEY'],
    ...merged.apiKeys,
  }

  if (merged.slackWebhookUrl === undefined && process.env['AXIOM_SLACK_WEBHOOK']) {
    merged.slackWebhookUrl = process.env['AXIOM_SLACK_WEBHOOK']
  }

  return merged
}

export function defineConfig(config: Partial<AxiomConfig>): Partial<AxiomConfig> {
  return config
}
