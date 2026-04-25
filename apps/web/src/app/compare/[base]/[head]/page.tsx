import Link        from 'next/link'
import { notFound } from 'next/navigation'
import { buildComparison } from '@axiom-ai/core'
import { getStorage }      from '@/lib/storage'
import { Nav }           from '@/components/layout/Nav'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { VerdictBadge }  from '@/components/ui/VerdictBadge'

function fmtCost(u: number) { return u < 0.01 ? `${(u * 100).toFixed(2)}¢` : `$${u.toFixed(4)}` }
function fmtMs(ms: number)  { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s` }
function delta(n: number, fmt: (x: number) => string, invert = false) {
  const positive = invert ? n <= 0 : n >= 0
  return (
    <span className={positive ? 'text-emerald-400' : 'text-red-400'}>
      {n >= 0 ? '+' : ''}{fmt(n)}
    </span>
  )
}

export const dynamic = 'force-dynamic'

export default async function ComparePage({
  params,
}: {
  params: Promise<{ base: string; head: string }>
}) {
  const { base, head } = await params
  const storage = getStorage()

  const [baseRun, headRun] = await Promise.all([
    storage.getRun(base),
    storage.getRun(head),
  ])

  if (!baseRun || !headRun) notFound()

  const [prevResults, currResults] = await Promise.all([
    storage.getEvalResults(base),
    storage.getEvalResults(head),
  ])

  const cmp = buildComparison(baseRun, headRun, prevResults, currResults)

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-6 pt-20 pb-16">
        <div className="pt-10 pb-8">
          <Link href="/" className="text-[10px] uppercase tracking-[0.2em] text-mist hover:text-gold transition-colors">
            ← Dashboard
          </Link>
          <div className="mt-4">
            <p className="text-[11px] tracking-[0.3em] uppercase text-gold mb-2">Comparison</p>
            <h1 className="font-mono text-2xl text-paper">
              <span className="text-mist">{base.slice(0, 8)}</span>
              <span className="text-mist mx-3">→</span>
              {head.slice(0, 8)}
            </h1>
            <p className="text-sm text-mist mt-1">
              {new Date(baseRun.createdAt).toLocaleString()} → {new Date(headRun.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-fog2 rounded-lg overflow-hidden mb-10">
          {[
            {
              label: 'Pass Rate',
              base: `${(baseRun.passRate * 100).toFixed(1)}%`,
              head: `${(headRun.passRate * 100).toFixed(1)}%`,
              d: delta(cmp.passRateDelta, v => `${(v * 100).toFixed(1)}%`),
            },
            {
              label: 'Avg Score',
              base: baseRun.avgScore.toFixed(3),
              head: headRun.avgScore.toFixed(3),
              d: delta(cmp.avgScoreDelta, v => v.toFixed(3)),
            },
            {
              label: 'Total Cost',
              base: fmtCost(baseRun.costUsd),
              head: fmtCost(headRun.costUsd),
              d: delta(cmp.costDelta, fmtCost, true),
            },
            {
              label: 'Duration',
              base: fmtMs(baseRun.durationMs),
              head: fmtMs(headRun.durationMs),
              d: delta(cmp.durationDelta, fmtMs, true),
            },
          ].map(card => (
            <div key={card.label} className="bg-fog px-5 py-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-mist mb-3">{card.label}</p>
              <div className="flex items-end gap-2">
                <p className="text-lg font-serif text-mist line-through decoration-1">{card.base}</p>
                <p className="text-xl font-serif text-paper">{card.head}</p>
              </div>
              <p className="text-xs mt-1 font-mono">{card.d}</p>
            </div>
          ))}
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-6 mb-10 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-mono text-lg">{cmp.newFailures}</span>
            <span className="text-mist">new failures</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-mono text-lg">{cmp.newPasses}</span>
            <span className="text-mist">new passes</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-mono text-lg">{cmp.regressions.length}</span>
            <span className="text-mist">regressions</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-mono text-lg">{cmp.improvements.length}</span>
            <span className="text-mist">improvements</span>
          </div>
          {cmp.significantChange && (
            <span className="ml-auto px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs uppercase tracking-[0.2em]">
              Significant change
            </span>
          )}
        </div>

        {/* Regressions */}
        {cmp.regressions.length > 0 && (
          <section className="mb-10">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold mb-4">Regressions</p>
            <div className="border border-fog2 rounded-lg overflow-hidden divide-y divide-fog2">
              {cmp.regressions.map(r => (
                <div
                  key={`${r.evalName}-${r.caseId}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-fog transition-colors"
                >
                  <SeverityBadge severity={r.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-paper truncate">{r.evalName}</p>
                    <p className="text-xs text-mist font-mono truncate">{r.caseId}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <VerdictBadge verdict={r.prevVerdict} />
                    <span className="text-mist">{r.prevScore.toFixed(3)}</span>
                    <span className="text-mist">→</span>
                    <VerdictBadge verdict={r.currVerdict} />
                    <span className="text-paper">{r.currScore.toFixed(3)}</span>
                    <span className="text-red-400">({((r.delta) * 100).toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Improvements */}
        {cmp.improvements.length > 0 && (
          <section>
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-500 mb-4">Improvements</p>
            <div className="border border-fog2 rounded-lg overflow-hidden divide-y divide-fog2">
              {cmp.improvements.map(r => (
                <div
                  key={`${r.evalName}-${r.caseId}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-fog transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-paper truncate">{r.evalName}</p>
                    <p className="text-xs text-mist font-mono truncate">{r.caseId}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-mist">{r.prevScore.toFixed(3)}</span>
                    <span className="text-mist">→</span>
                    <span className="text-paper">{r.currScore.toFixed(3)}</span>
                    <span className="text-emerald-400">(+{(r.delta * 100).toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {cmp.regressions.length === 0 && cmp.improvements.length === 0 && (
          <div className="py-16 text-center text-mist text-sm border border-fog2 rounded-lg">
            No meaningful changes between these runs.
          </div>
        )}
      </main>
    </>
  )
}
