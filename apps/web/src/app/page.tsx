import Link from 'next/link'
import { getStorage } from '@/lib/storage'
import { Nav }        from '@/components/layout/Nav'
import { ScoreBar }   from '@/components/ui/ScoreBar'
import { VerdictBadge } from '@/components/ui/VerdictBadge'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { buildComparison } from '@axiom-ai/core'

function fmtCost(usd: number) {
  return usd < 0.01 ? `${(usd * 100).toFixed(2)}¢` : `$${usd.toFixed(4)}`
}
function fmtDuration(ms: number) {
  if (ms < 1000)  return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}
function fmtDate(d: Date) {
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const storage = getStorage()
  const runs    = await storage.listRuns({ limit: 30 })
  const latest  = runs[0]
  const prev    = runs[1]

  let comparison = null
  if (latest && prev) {
    const [latestResults, prevResults] = await Promise.all([
      storage.getEvalResults(latest.id),
      storage.getEvalResults(prev.id),
    ])
    comparison = buildComparison(prev, latest, prevResults, latestResults)
  }

  const passRateHistory = runs
    .slice(0, 20)
    .reverse()
    .map((r, i) => ({ i, passRate: r.passRate, id: r.id }))

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-6 pt-20 pb-16">

        {/* Header */}
        <div className="pt-10 pb-12">
          <p className="text-[11px] tracking-[0.3em] uppercase text-gold mb-3">
            Evaluation Dashboard
          </p>
          <h1 className="font-serif text-4xl font-normal tracking-tight text-paper">
            {latest ? (
              <>
                {(latest.passRate * 100).toFixed(1)}% passing
                <span className="text-mist font-light"> · {latest.totalEvals} evals</span>
              </>
            ) : (
              'No runs yet'
            )}
          </h1>
          {latest && (
            <p className="text-sm text-mist mt-2">
              Last run {fmtDate(latest.createdAt)} · {latest.model} · {fmtCost(latest.costUsd)}
            </p>
          )}
        </div>

        {/* Stat cards */}
        {latest && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-fog2 rounded-lg overflow-hidden mb-10">
            {[
              {
                label: 'Pass Rate',
                value: `${(latest.passRate * 100).toFixed(1)}%`,
                delta: comparison ? `${comparison.passRateDelta >= 0 ? '+' : ''}${(comparison.passRateDelta * 100).toFixed(1)}%` : null,
                positive: comparison ? comparison.passRateDelta >= 0 : null,
              },
              {
                label: 'Avg Score',
                value: latest.avgScore.toFixed(3),
                delta: comparison ? `${comparison.avgScoreDelta >= 0 ? '+' : ''}${comparison.avgScoreDelta.toFixed(3)}` : null,
                positive: comparison ? comparison.avgScoreDelta >= 0 : null,
              },
              {
                label: 'Total Cost',
                value: fmtCost(latest.costUsd),
                delta: comparison ? `${comparison.costDelta >= 0 ? '+' : ''}${fmtCost(comparison.costDelta)}` : null,
                positive: comparison ? comparison.costDelta <= 0 : null,
              },
              {
                label: 'Duration',
                value: fmtDuration(latest.durationMs),
                delta: null,
                positive: null,
              },
            ].map(card => (
              <div key={card.label} className="bg-fog px-5 py-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-mist mb-2">{card.label}</p>
                <p className="text-2xl font-serif text-paper">{card.value}</p>
                {card.delta && (
                  <p className={`text-xs mt-1 ${card.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {card.delta} vs prev
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Regressions */}
        {comparison && comparison.regressions.length > 0 && (
          <section className="mb-10">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold mb-4">
              Regressions vs Previous Run
            </p>
            <div className="border border-fog2 rounded-lg overflow-hidden divide-y divide-fog2">
              {comparison.regressions.map(r => (
                <div
                  key={`${r.evalName}-${r.caseId}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-fog transition-colors"
                >
                  <SeverityBadge severity={r.severity} />
                  <span className="flex-1 text-sm text-paper truncate">{r.evalName}</span>
                  <span className="text-xs font-mono text-mist">
                    {r.prevScore.toFixed(2)} → {r.currScore.toFixed(2)}
                  </span>
                  <span className="text-xs font-mono text-red-400">
                    {((r.delta) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent runs table */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-mist">Recent Runs</p>
            <Link href="/runs" className="text-[10px] uppercase tracking-[0.2em] text-gold hover:text-paper transition-colors">
              View all →
            </Link>
          </div>

          <div className="border border-fog2 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-fog2 bg-fog">
                  <th className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-mist font-normal">ID</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-mist font-normal hidden md:table-cell">Date</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-mist font-normal hidden lg:table-cell">Model</th>
                  <th className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-mist font-normal">Pass Rate</th>
                  <th className="px-5 py-3 text-right text-[10px] uppercase tracking-[0.2em] text-mist font-normal hidden md:table-cell">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fog2">
                {runs.slice(0, 15).map(run => (
                  <tr key={run.id} className="hover:bg-fog transition-colors group">
                    <td className="px-5 py-3">
                      <Link href={`/runs/${run.id}`} className="font-mono text-xs text-gold hover:text-paper transition-colors">
                        {run.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-xs text-mist hidden md:table-cell">
                      {fmtDate(run.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-xs text-mist hidden lg:table-cell font-mono">
                      {run.model}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-24">
                          <ScoreBar score={run.passRate} label={false} />
                        </div>
                        <span className="text-xs font-mono text-paper">
                          {(run.passRate * 100).toFixed(0)}%
                        </span>
                        <span className="text-xs text-mist">
                          {run.passed}/{run.totalEvals}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-mist hidden md:table-cell font-mono">
                      {fmtCost(run.costUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {runs.length === 0 && (
              <div className="px-5 py-16 text-center">
                <p className="text-mist text-sm">No runs yet.</p>
                <p className="text-mist text-xs mt-2">Run <code className="text-gold font-mono">axiom run</code> to get started.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  )
}
