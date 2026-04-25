'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface DataPoint {
  label: string
  score: number
  passed: boolean
}

interface Props {
  data:      DataPoint[]
  height?:   number
  showGrid?: boolean
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const score = payload[0]?.value ?? 0
  return (
    <div className="bg-fog border border-fog2 rounded px-3 py-2 text-xs">
      <p className="text-mist mb-1">{label}</p>
      <p className="text-paper font-mono">{(score * 100).toFixed(1)}%</p>
    </div>
  )
}

export function ScoreChart({ data, height = 160, showGrid = false }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        {showGrid && (
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1c19" />
        )}
        <XAxis
          dataKey="label"
          tick={{ fill: '#4a4540', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 1]}
          tickFormatter={v => `${(v * 100).toFixed(0)}%`}
          tick={{ fill: '#4a4540', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0.8} stroke="#4a4540" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#c09a58"
          strokeWidth={1.5}
          dot={({ cx, cy, payload }) => (
            <circle
              key={`dot-${cx}-${cy}`}
              cx={cx} cy={cy} r={3}
              fill={payload.passed ? '#34d399' : '#f87171'}
              stroke="none"
            />
          )}
          activeDot={{ r: 5, fill: '#c09a58', stroke: '#0b0a08', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
