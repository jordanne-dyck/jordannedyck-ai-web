import { getDashboardStats, getHourlyHistogram, getDailyTrend } from '@/lib/queries';
import { StatCard } from './components/StatCard';
import { HourlyChart } from './components/HourlyChart';
import { DailyCostChart } from './components/DailyCostChart';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

const fmtMs = (n: number | null) => (n == null ? '—' : `${n} ms`);
const fmtUsd = (n: number) =>
  n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;

export default async function DashboardPage() {
  const [stats, hourly, daily] = await Promise.all([
    getDashboardStats(),
    getHourlyHistogram(),
    getDailyTrend(30),
  ]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            jordanedyck.com — chatbot observability
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Live metrics from the AI assistant at jordanedyck.com. Updated every minute.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Requests today"
            value={stats.requestsToday.toLocaleString()}
            hint={`${stats.sessionsToday} sessions`}
          />
          <StatCard
            label="Avg latency"
            value={fmtMs(stats.avgLatencyMs)}
            hint={`p95: ${fmtMs(stats.p95LatencyMs)}`}
          />
          <StatCard
            label="Spend today"
            value={fmtUsd(stats.spendToday)}
            hint={`all-time: ${fmtUsd(stats.spendTotal)}`}
          />
          <StatCard
            label="Rate-limited / errors"
            value={`${stats.rateLimitedToday} / ${stats.errorsToday}`}
            hint="today"
            tone={
              stats.rateLimitedToday > 0 || stats.errorsToday > 0 ? 'warn' : 'good'
            }
          />
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <h2 className="text-sm font-medium text-zinc-300">Requests per hour (last 24h)</h2>
            <div className="mt-4">
              {hourly.length > 0 ? (
                <HourlyChart data={hourly} />
              ) : (
                <EmptyChart message="No traffic in the last 24 hours" />
              )}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <h2 className="text-sm font-medium text-zinc-300">Cost per day (last 30d)</h2>
            <div className="mt-4">
              {daily.length > 0 ? (
                <DailyCostChart data={daily} />
              ) : (
                <EmptyChart message="No spend recorded yet" />
              )}
            </div>
          </div>
        </section>

        <footer className="mt-10 text-xs text-zinc-500">
          Built as a portfolio piece. Source:
          {' '}
          <a
            href="https://github.com/jordanne-dyck/jordannedyck-ai-web"
            className="underline hover:text-zinc-300"
          >
            jordannedyck-ai-web
          </a>
          . No personally identifiable information is collected. User queries are
          stored for analytics and shown only in the private admin view.
        </footer>
      </div>
    </main>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-zinc-500">
      {message}
    </div>
  );
}
