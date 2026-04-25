import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStorage }    from '@/lib/storage'
import { Nav }           from '@/components/layout/Nav'
import { ScoreBar }      from '@/components/ui/ScoreBar'
import { VerdictBadge }  from '@/components/ui/VerdictBadge'
import { SeverityBadge } from '@/components/ui/SeverityBadge'

function fmtCost(u: number) { return u < 0.01 ? `${(u*100).toFixed(2)}¢` : `$${u.toFixed(5)}` }
function fmtMs(ms: number)  { return ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s` }

export const dynamic = 'force-dynamic'

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = await params
  const storage = getStorage()
  const run     = await storage.getRun(id)
  if (!run) notFound()
  const results = await storage.getEvalResults(id)

  const evalGroups = new Map<string, typeof results>()
  for (const r of results) {
    if (!evalGroups.has(r.evalName)) evalGroups.set(r.evalName, [])
    evalGroups.get(r.evalName)!.push(r)
  }

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-6 pt-20 pb-16">
        <div className="pt-10 pb-8">
          <Link href="/" className="text-[10px] uppercase tracking-[0.2em] text-mist hover:text-gold transition-colors">
            ← Dashboard
          </Link>
          <div className="mt-4 flex items-start justify-between">
            <div>
              <p className="text-[11px] tracking-[0.3em] uppercase text-gold mb-2">Run</p>
              <h1 className="font-mono text-2xl text-paper">{run.id.slice(0, 16)}</h1>
              <p className="text-sm text-mist mt-1">
                {new Date(run.createdAt).toLocaleString()} · {run.model}
                {run.gitBranch && ` · ${run.gitBranch}`}
                {run.gitCommit && ` @ ${run.gitCommit}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-serif text-paper">{(run.passRate * 100).toFixed(1)}%</p>
              <p className="text-xs text-mist mt-1">{run.passed}/{run.totalEvals} passed</p>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-px bg-fog2 rounded-lg overflow-hidden mb-10">
          {[
            { label: 'Passed',   value: run.passed   },
            { label: 'Failed',   value: run.failed   },
            { label: 'Errors',   value: run.errors   },
            { label: 'Skipped',  value: run.skipped  },
            { label: 'Cost',     value: fmtCost(run.costUsd) },
            { label: 'Duration', value: fmtMs(run.durationMs) },
          ].map(s => (
            <div key={s.label} className="bg-fog px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-mist mb-1">{s.label}</p>
              <p className="text-lg font-serif text-paper">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Eval groups */}
        <div className="space-y-2">
          {[...evalGroups.entries()].map(([evalName, evalResults]) => {
            const allPassed = evalResults.every(r => r.passed)
            const avgScore  = evalResults.reduce((s, r) => s + r.score, 0) / evalResults.length
            return (
              <details key={evalName} className="border border-fog2 rounded-lg overflow-hidden group">
                <summary className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-fog transition-colors list-none">
                  <VerdictBadge verdict={allPassed ? 'pass' : 'fail'} />
                  <span className="flex-1 text-sm text-paper">{evalName}</span>
                  <div className="w-32 hidden md:block">
                    <ScoreBar score={avgScore} />
                  </div>
                  <span className="text-xs text-mist font-mono hidden md:block">
                    {evalResults.length} case{evalResults.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-mist text-xs group-open:rotate-90 transition-transform">›</span>
                </summary>

                <div className="border-t border-fog2 divide-y divide-fog2">
                  {evalResults.map(r => (
                    <div key={r.id} className="px-5 py-4">
                      <div className="flex items-start gap-3 mb-3">
                        <VerdictBadge verdict={r.verdict} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-mist truncate">{r.caseId}</p>
                        </div>
                        <span className="text-xs text-mist font-mono">{r.score.toFixed(3)}</span>
                        <span className="text-xs text-mist">{fmtMs(r.latencyMs)}</span>
                        <span className="text-xs text-mist">{fmtCost(r.costUsd)}</span>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.15em] text-mist mb-1">Input</p>
                          <p className="text-paper/70 bg-fog2 rounded p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap line-clamp-4">
                            {r.input}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.15em] text-mist mb-1">Output</p>
                          <p className="text-paper/70 bg-fog2 rounded p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap line-clamp-4">
                            {r.output}
                          </p>
                        </div>
                      </div>

                      {r.judgeReasoning && (
                        <div className="mt-3">
                          <p className="text-[10px] uppercase tracking-[0.15em] text-mist mb-1">Judge Reasoning</p>
                          <p className="text-paper/60 text-[11px] leading-relaxed whitespace-pre-wrap">
                            {r.judgeReasoning}
                          </p>
                        </div>
                      )}

                      {r.violations.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-[10px] uppercase tracking-[0.15em] text-mist mb-1">Violations</p>
                          {r.violations.map((v, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <SeverityBadge severity={v.severity} />
                              <p className="text-[11px] text-paper/60 flex-1">{v.rule}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )
          })}
        </div>
      </main>
    </>
  )
}
