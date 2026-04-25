import { randomUUID } from 'node:crypto'
import type { Spec, SpecInvariant, SpecQuality, Severity } from '@axiom-ai/core'

interface SpecDefinition {
  version?: string
  invariants: Array<
    | string
    | { rule: string; severity?: Severity; description?: string }
  >
  qualities?: Array<{
    name: string
    description: string
    weight: number
    min?: number
  }>
}

export function spec(name: string, def: SpecDefinition): Spec {
  const invariants: SpecInvariant[] = def.invariants.map(i => {
    if (typeof i === 'string') return { rule: i, severity: 'high' as Severity }
    return {
      rule:        i.rule,
      severity:    i.severity ?? 'high',
      description: i.description,
    }
  })

  const qualities: SpecQuality[] = def.qualities ?? []

  if (qualities.length > 0) {
    const totalWeight = qualities.reduce((s, q) => s + q.weight, 0)
    if (Math.abs(totalWeight - 1) > 0.001) {
      throw new Error(
        `Spec "${name}" quality weights must sum to 1, got ${totalWeight.toFixed(3)}`
      )
    }
  }

  return {
    id:          randomUUID(),
    name,
    version:     def.version ?? '1.0',
    invariants,
    qualities,
    createdAt:   new Date(),
  }
}
