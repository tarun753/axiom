type Sev = 'critical' | 'major' | 'minor' | 'high' | 'medium' | 'low'

const MAP: Record<Sev, string> = {
  critical: 'text-red-400 border-red-400/30 bg-red-400/5',
  major:    'text-orange-400 border-orange-400/30 bg-orange-400/5',
  high:     'text-orange-400 border-orange-400/30 bg-orange-400/5',
  minor:    'text-yellow-400 border-yellow-400/30 bg-yellow-400/5',
  medium:   'text-yellow-400 border-yellow-400/30 bg-yellow-400/5',
  low:      'text-mist border-mist/30 bg-mist/5',
}

export function SeverityBadge({ severity }: { severity: Sev }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-mono tracking-widest border rounded ${MAP[severity] ?? MAP.low}`}>
      {severity.toUpperCase()}
    </span>
  )
}
