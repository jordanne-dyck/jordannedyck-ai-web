import {
  getDashboardStats,
  getHourlyHistogram,
  getDailyTrend,
  getRetrievalQuality,
  getTimingSplit,
  getButtonUsage,
  getTopicsByWeek,
} from '@/lib/queries';
import { checkHealth } from '@/lib/health';
import { StatCard } from './components/StatCard';
import { HourlyChart } from './components/HourlyChart';
import { DailyCostChart } from './components/DailyCostChart';
import { HealthPanel } from './components/HealthPanel';
import { BarList } from './components/BarList';
import { TopicsChart } from './components/TopicsChart';

export const dynamic = 'force-dynamic';

const fmtMs = (n: number | null) => (n == null ? '—' : `${n} ms`);
const fmtUsd = (n: number) =>
  n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
const fmtS = (ms: number | null) =>
  ms == null ? '—' : `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`;
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');

export default async function DashboardPage() {
  const [stats, hourly, daily, retrieval, timing, buttons, topics, health] = await Promise.all([
    getDashboardStats(),
    getHourlyHistogram(),
    getDailyTrend(30),
    getRetrievalQuality(30),
    getTimingSplit(30),
    getButtonUsage(30),
    getTopicsByWeek(8),
    checkHealth(),
  ]);
  const checkedAt = new Date().toISOString().slice(11, 19);
  // Width of the "search" part of the time-to-first-word bar.
  const searchShare =
    timing.medianSearchMs != null && timing.medianFirstWordMs
      ? Math.min(100, (timing.medianSearchMs / timing.medianFirstWordMs) * 100)
      : 0;
  const similarity =
    retrieval.medianTopSimilarity != null
      ? ` · median top similarity ${retrieval.medianTopSimilarity.toFixed(2)}`
      : '';

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            jordannedyck.com — chatbot observability
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Live metrics from the AI assistant at jordannedyck.com.
          </p>
        </header>

        <HealthPanel health={health} checkedAt={checkedAt} />

        <h2 className="mb-3 text-xs uppercase tracking-wide text-zinc-500">Today</h2>
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

        <h2 className="mb-3 mt-8 text-xs uppercase tracking-wide text-zinc-500">Last 30 days</h2>
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Retrieval found a match"
            value={pct(retrieval.ok, retrieval.answered)}
            hint={`of ${retrieval.answered} answered questions · ${retrieval.empty} empty · ${retrieval.error} error${similarity}`}
            tone={retrieval.error > 0 ? 'warn' : 'neutral'}
          />
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/40 px-5 py-4">
            <div className="text-xs uppercase tracking-wide text-zinc-400">
              Time to first word (median)
            </div>
            <div className="mt-2 text-3xl font-semibold text-zinc-100">
              {fmtS(timing.medianFirstWordMs)}
            </div>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded" aria-hidden="true">
              <span className="block h-full bg-blue-400" style={{ width: `${searchShare}%` }} />
              <span className="block h-full flex-1 bg-emerald-400" />
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              <span className="text-blue-300">search {fmtS(timing.medianSearchMs)}</span>
              {' · '}
              <span className="text-emerald-300">model starts {fmtS(timing.medianModelStartMs)}</span>
              {' · '}full answer {fmtS(timing.medianTotalMs)} · n = {timing.n}
            </div>
          </div>
          <StatCard
            label="Started with a button"
            value={pct(buttons.conversationsStartedWithButton, buttons.conversations)}
            hint={`of ${buttons.conversations} conversations · ${pct(buttons.totalClicks, buttons.totalQuestions)} of all questions`}
          />
        </section>

        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <h2 className="text-sm font-medium text-zinc-300">Button questions clicked (last 30d)</h2>
            <p className="mb-4 mt-1 text-xs text-zinc-500">
              {buttons.totalClicks} clicks · 3 of the 9 buttons show at a time, then 1 once a chat starts
            </p>
            {buttons.clicks.length > 0 ? (
              <BarList items={buttons.clicks.map((c) => ({ label: c.question, value: c.count }))} />
            ) : (
              <EmptyChart message="No button questions yet" />
            )}
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <h2 className="text-sm font-medium text-zinc-300">Topics by week (last 8 weeks)</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {topics.n} questions · labelled by the knowledge-base section that answered
            </p>
            <div className="mt-4">
              {topics.n > 0 ? (
                <TopicsChart weeks={topics.weeks} />
              ) : (
                <EmptyChart message="No labelled questions yet" />
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
          . Questions and answers are stored with emails and phone numbers removed.
          IP addresses are stored only as a one-way hash. Questions are shown only
          in the private admin view.
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
