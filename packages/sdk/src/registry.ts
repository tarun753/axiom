import type { EvalDefinition } from '@axiom-ai/core'

const _registry: EvalDefinition[] = []

export function registerEval(def: EvalDefinition): void {
  _registry.push(def)
}

export function getRegisteredEvals(): EvalDefinition[] {
  return [..._registry]
}

export function resetRegistry(): void {
  _registry.length = 0
}
