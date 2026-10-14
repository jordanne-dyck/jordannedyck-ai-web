'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import type { TopicWeek } from '@/lib/queries';

// One colour per KB category. The four categories in the index on 2026-10-14
// are projects, experience, skills and personality; anything else is grey.
const COLORS: Record<string, string> = {
  projects: '#34d399',
  experience: '#60a5fa',
  skills: '#fbbf24',
  personality: '#c084fc',
};

export function TopicsChart({ weeks }: { weeks: TopicWeek[] }) {
  const topics = [...new Set(weeks.flatMap((w) => Object.keys(w.counts)))].sort();
  const data = weeks.map((w) => ({ week: w.week.slice(5), ...w.counts }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="week" stroke="#71717a" fontSize={12} />
        <YAxis stroke="#71717a" fontSize={12} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
          labelStyle={{ color: '#d4d4d8' }}
          labelFormatter={(w) => `Week of ${w}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {topics.map((t) => (
          <Bar key={t} dataKey={t} stackId="topics" fill={COLORS[t] ?? '#a1a1aa'} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
