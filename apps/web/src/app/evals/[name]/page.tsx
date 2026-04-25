'use client'

import { useEffect, useState } from 'react'
import { useParams }           from 'next/navigation'
import Link                    from 'next/link'
import { Nav }          from '@/components/layout/Nav'
import { ScoreChart }   from '@/components/charts/ScoreChart'
import { ScoreBar }     from '@/components/ui/ScoreBar'
import { VerdictBadge } from '@/components/ui/VerdictBadge'

interface HistoryResult {
  id: string
  runId: string
  caseId: string
  verdict: string
  score: number
  latencyMs: number
  costUsd: number
  createdAt: string
}

function fmtMs(ms: number)  { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s` }
function fmtCost(u: number) { return u < 0.01 ? `${(u * 100).toFixed(2)}¢` : `$${u.toFixed(5)}` }
function fmtDate(d: string) {
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function EvalHistoryPage() {
  const params  = useParams<{ name: string }>()
  const evalName = decodeURIComponent(params.name)

  const [results, setResults] = useState<HistoryResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/evals/${encodeURIComponent(evalName)}/history?limit=100`)
      .then(r => r.json())
      .then((data: HistoryResult[]) => { setResults(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [evalName])

  // Group by runId to show per-run aggregates for the chart
  const byRun = new Map<string, HistoryResult[]>()
  for (const r of results) {
    if (!byRun.has(r.runId)) byRun.set(r.runId, [])
    byRun.get(r.runId)!.push(r)
  }

  const chartData = [...byRun.entries()]
    .map(([runId, rs]) => {
      const avg    = rs.reduce((s, r) => s + r.score, 0) / rs.length
      const passed = rs.every(r => r.verdict === 'pass')
      return { label: runId.slice(0, 6), score: avg, passed }
    })
    .slice(-20)

  const passCount = results.filter(r => r.verdict === 'pass').length
  const passRate  = results.length ? passCount / results.length : 0
  const avgScore  = results.length ? results.reduce((s, r) => s + r.score, 0) / results.length : 0

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-6 pt-20 pb-16">
      <div className="pt-10 pb-8">
        <Link href="/" className="text-[10px] uppercase tracking-[0.2em] text-mist hover:text-gold transition-colors">
          ← Dashboard
        </Link>
        <div className="mt-4">
          <p className="text-[11px] tracking-[0.3em] uppercase text-gold mb-2">Eval History</p>
          <h1 className="font-mono text-2xl text-paper">{evalName}</h1>
        </div>
      </div>

      {/* Summary stats */}
      {!loading && results.length > 0 && (
        <div className="grid grid-cols-3 gap-px bg-fog2 rounded-lg overflow-hidden mb-10">
          {[
            { label: 'Pass Rate',  value: `${(passRate * 100).toFixed(1)}%` },
            { label: 'Avg Score',  value: avgScore.toFixed(3) },
            { label: 'Total Cases', value: results.length },
          ].map(s => (
            <div key={s.label} className="bg-fog px-5 py-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-mist mb-1">{s.label}</p>
              <p className="text-2xl font-serif text-paper">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Score over time chart */}
      {chartData.length > 1 && (
        <section className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-mist mb-4">Score Over Time</p>
          <div className="border border-fog2 rounded-lg p-4 bg-fog">
            <ScoreChart data={chartData} height={200} showGrid />
          </div>
        </section>
      )}

      {/* Results table */}
      <section>
        <p className="text-[10px] uppercase tracking-[0.2em] text-mist mb-4">Case Results</p>
        <div className="border border-fog2 rounded-lg overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-mist text-sm">Loading…</div>
          ) : results.length === 0 ? (
            <div className="py-16 text-center text-mist text-sm">No results found for this eval.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-fog2 bg-fog">
                  {['Run', 'Date', 'Case', 'Verdict', 'Score', 'Latency', 'Cost'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-mist font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-fog2">
                {results.map(r => (
                  <tr key={r.id} className="hover:bg-fog transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/runs/${r.runId}`}
                        className="font-mono text-xs text-gold hover:text-paper transition-colors"
                      >
                        {r.runId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-mist">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-mist max-w-[200px] truncate">{r.caseId}</td>
                    <td className="px-4 py-3"><VerdictBadge verdict={r.verdict as 'pass' | 'fail' | 'error' | 'skip'} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-12"><ScoreBar score={r.score} label={false} /></div>
                        <span className="text-xs font-mono">{r.score.toFixed(3)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-mist">{fmtMs(r.latencyMs)}</td>
                    <td className="px-4 py-3 text-xs text-mist font-mono">{fmtCost(r.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
    </>
  )
}
