import { createStorage } from '@axiom-ai/core'
import type { Storage }  from '@axiom-ai/core'

// Hung off globalThis so the same connection survives Next dev HMR module reloads.
// Without this, every hot reload leaks a SQLite handle and the WAL file grows unboundedly.
const g = globalThis as unknown as { __axiomStorage?: Storage }

export function getStorage(): Storage {
  if (!g.__axiomStorage) {
    const path = process.env['AXIOM_STORAGE_PATH'] ?? '.axiom/db.sqlite'
    g.__axiomStorage = createStorage(path)
  }
  return g.__axiomStorage
}
