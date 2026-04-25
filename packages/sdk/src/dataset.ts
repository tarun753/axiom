import { createHash }       from 'node:crypto'
import { readFileSync }     from 'node:fs'
import { resolve }          from 'node:path'
import type { Dataset, EvalCase } from '@axiom-ai/core'

function caseId(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12)
}

type RawCase = Omit<EvalCase, 'id'> & { id?: string }

function dataset(
  name: string,
  cases: RawCase[],
): Dataset {
  const normalized: EvalCase[] = cases.map(c => ({
    ...c,
    id: c.id ?? caseId(c.input),
  }))

  return {
    id:        caseId(name + normalized.length),
    name,
    version:   '1.0',
    cases:     normalized,
    createdAt: new Date(),
  }
}

dataset.fromJSON = function fromJSON(path: string): Dataset {
  const raw = JSON.parse(readFileSync(resolve(path), 'utf8')) as {
    name?: string
    cases: RawCase[]
  }
  return dataset(raw.name ?? path, raw.cases)
}

// RFC 4180-ish CSV parser: handles quoted fields, embedded commas/newlines, and `""` escape.
/** @internal exported for unit tests */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\n' || ch === '\r') {
      // Push the current field and row, skip the LF in CRLF
      if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
      field = ''
      row = []
      if (ch === '\r' && text[i + 1] === '\n') i++
      continue
    }
    field += ch
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

dataset.fromCSV = function fromCSV(path: string, opts?: {
  inputCol?: string
  expectedCol?: string
  name?: string
}): Dataset {
  const rows = parseCSV(readFileSync(resolve(path), 'utf8'))
  if (rows.length < 2) throw new Error('CSV must have header + at least one row')

  const headers = (rows[0] ?? []).map(h => h.trim())
  const inputCol    = opts?.inputCol    ?? 'input'
  const expectedCol = opts?.expectedCol ?? 'expected'
  const inputIdx    = headers.indexOf(inputCol)
  const expectedIdx = headers.indexOf(expectedCol)

  if (inputIdx === -1) throw new Error(`CSV missing column: ${inputCol}`)

  const cases: RawCase[] = rows.slice(1).map(cols => ({
    input:    (cols[inputIdx] ?? '').trim(),
    expected: expectedIdx !== -1 ? (cols[expectedIdx] ?? '').trim() : undefined,
  }))

  return dataset(opts?.name ?? path, cases)
}

export { dataset }
