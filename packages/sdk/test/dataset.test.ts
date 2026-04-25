import { describe, it, expect } from 'vitest'
import { parseCSV } from '../src/dataset.js'

describe('parseCSV', () => {
  it('parses a basic CSV', () => {
    const rows = parseCSV('a,b,c\n1,2,3\n4,5,6\n')
    expect(rows).toEqual([['a', 'b', 'c'], ['1', '2', '3'], ['4', '5', '6']])
  })

  it('preserves commas inside quoted fields', () => {
    const rows = parseCSV('input,expected\n"Hello, world",greeting\n')
    expect(rows[1]).toEqual(['Hello, world', 'greeting'])
  })

  it('handles `""` as an escaped quote inside quoted fields', () => {
    const rows = parseCSV('input\n"He said ""hi"" loudly"\n')
    expect(rows[1]).toEqual(['He said "hi" loudly'])
  })

  it('handles newlines inside quoted fields', () => {
    const rows = parseCSV('input\n"line one\nline two"\n')
    expect(rows[1]).toEqual(['line one\nline two'])
  })

  it('handles CRLF line endings', () => {
    const rows = parseCSV('a,b\r\n1,2\r\n')
    expect(rows).toEqual([['a', 'b'], ['1', '2']])
  })

  it('handles trailing newline absence', () => {
    const rows = parseCSV('a,b\n1,2')
    expect(rows).toEqual([['a', 'b'], ['1', '2']])
  })

  it('handles empty fields', () => {
    const rows = parseCSV('a,b,c\n1,,3\n')
    expect(rows[1]).toEqual(['1', '', '3'])
  })
})
