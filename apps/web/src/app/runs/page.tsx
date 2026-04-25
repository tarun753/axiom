import Link        from 'next/link'
import { getStorage } from '@/lib/storage'
import { Nav }        from '@/components/layout/Nav'
import { ScoreBar }   from '@/components/ui/ScoreBar'

function fmtCost(u: number) { return u < 0.01 ? `${(u*100).toFixed(2)}¢` : `$${u.toFixed(4)}` }
function fmtMs(ms: number)  { return ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s` }
function fmtDate(d: Date)   {
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export const dynamic = 'force-dynamic'

export default async function RunsPage() {
  const runs = await getStorage().listRuns({ limit: 100 })

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-6 pt-20 pb-16">
        <div className="pt-10 pb-8">
          <p className="text-[11px] tracking-[0.3em] uppercase text-gold mb-3">All Runs</p>
          <h1 className="font-serif text-4xl font-normal text-paper">{runs.length} runs</h1>
        </div>

        <div className="border border-fog2 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fog2 bg-fog">
                {['ID', 'Date', 'Model', 'Branch', 'Pass Rate', 'Score', 'Evals', 'Cost', 'Duration'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-mist font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-fog2">
              {runs.map(run => (
                <tr key={run.id} className="hover:bg-fog transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/runs/${run.id}`} className="font-mono text-xs text-gold hover:text-paper transition-colors">
                      {run.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-mist">{fmtDate(run.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-mist font-mono">{run.model}</td>
                  <td className="px-4 py-3 text-xs text-mist font-mono">{run.gitBranch ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16"><ScoreBar score={run.passRate} label={false} /></div>
                      <span className="text-xs font-mono">{(run.passRate * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-paper">{run.avgScore.toFixed(3)}</td>
                  <td className="px-4 py-3 text-xs text-mist">{run.passed}/{run.totalEvals}</td>
                  <td className="px-4 py-3 text-xs text-mist font-mono">{fmtCost(run.costUsd)}</td>
                  <td className="px-4 py-3 text-xs text-mist">{fmtMs(run.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && (
            <div className="py-16 text-center text-mist text-sm">
              No runs yet. Run <code className="text-gold font-mono">axiom run</code> first.
            </div>
          )}
        </div>
      </main>
    </>
  )
}
