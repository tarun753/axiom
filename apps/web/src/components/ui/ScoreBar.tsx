'use client'

interface Props {
  score:  number   // 0–1
  width?: number   // px, default fills container
  label?: boolean  // show percentage
}

export function ScoreBar({ score, label = true }: Props) {
  const pct   = Math.round(score * 100)
  const color = score >= 0.8
    ? 'bg-emerald-500'
    : score >= 0.5
    ? 'bg-yellow-500'
    : 'bg-red-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-fog2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && (
        <span className="text-xs tabular-nums text-mist w-8 text-right">{pct}%</span>
      )}
    </div>
  )
}
