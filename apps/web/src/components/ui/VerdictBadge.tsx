import type { Verdict } from '@axiom-ai/core'

const MAP: Record<Verdict, { label: string; cls: string }> = {
  pass:  { label: 'PASS',  cls: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5'  },
  fail:  { label: 'FAIL',  cls: 'text-red-400     border-red-400/30     bg-red-400/5'      },
  error: { label: 'ERROR', cls: 'text-yellow-400  border-yellow-400/30  bg-yellow-400/5'   },
  skip:  { label: 'SKIP',  cls: 'text-mist        border-mist/30        bg-mist/5'         },
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const { label, cls } = MAP[verdict]
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-mono tracking-widest border rounded ${cls}`}>
      {label}
    </span>
  )
}
