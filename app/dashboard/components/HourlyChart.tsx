'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { HourlyBucket } from '@/lib/queries';

export function HourlyChart({ data }: { data: HourlyBucket[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.hour).toLocaleTimeString([], { hour: '2-digit' }),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={formatted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="label" stroke="#71717a" fontSize={12} />
        <YAxis stroke="#71717a" fontSize={12} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
          labelStyle={{ color: '#d4d4d8' }}
        />
        <Line
          type="monotone"
          dataKey="requests"
          stroke="#34d399"
          strokeWidth={2}
          dot={false}
          name="Requests"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
