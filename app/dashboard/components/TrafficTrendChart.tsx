'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

export type TrendSeries = { key: string; label: string; color: string };

// Daily counts, one line per series. Used by the traffic view.
export function TrafficTrendChart({
  data,
  series,
}: {
  data: Record<string, string | number>[];
  series: TrendSeries[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="day" stroke="#71717a" fontSize={12} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis stroke="#71717a" fontSize={12} allowDecimals={false} width={36} />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
          labelStyle={{ color: '#d4d4d8' }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
