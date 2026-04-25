import { defineConfig } from '@axiom-ai/core'

export default defineConfig({
  models: {
    default: 'claude-haiku-4-5-20251001',  // fast + cheap for the AI under test
    judge:   'claude-opus-4-7',             // strong model for evaluation
  },
  storagePath: '.axiom/db.sqlite',
  reporters:   ['console'],
  concurrency: 3,
  thresholds: {
    minPassRate:             0.85,
    maxRegressionDelta:      0.10,
    failOnCriticalViolation: true,
  },
})
