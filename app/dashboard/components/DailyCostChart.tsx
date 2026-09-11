'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { DailyBucket } from '@/lib/queries';

export function DailyCostChart({ data }: { data: DailyBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="cost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="day"
          stroke="#71717a"
          fontSize={12}
          tickFormatter={(d) => d.slice(5)}
        />
        <YAxis
          stroke="#71717a"
          fontSize={12}
          tickFormatter={(v) => `$${v.toFixed(2)}`}
        />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
          labelStyle={{ color: '#d4d4d8' }}
          formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']}
        />
        <Area
          type="monotone"
          dataKey="cost"
          stroke="#60a5fa"
          strokeWidth={2}
          fill="url(#cost)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
