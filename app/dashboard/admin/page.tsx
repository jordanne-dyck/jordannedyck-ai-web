import Link from 'next/link';
import { isAdminAuthed } from '@/lib/auth';
import {
  getEventsList,
  getAnomalyFlags,
  type EventFilters,
  type EventRow,
  type AnomalyFlags,
} from '@/lib/queries';
import { LoginForm } from './LoginForm';
import { logoutAction } from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGE_SIZE = 50;

type SearchParams = {
  range?: string;
  errors?: string;
  rl?: string;
  ip?: string;
  page?: string;
  error?: string;
};

function parseFilters(sp: SearchParams): { filters: EventFilters; page: number } {
  const allowed: EventFilters['range'][] = ['1h', '24h', '7d', '30d'];
  const range = (allowed.includes(sp.range as EventFilters['range'])
    ? sp.range
    : '24h') as EventFilters['range'];
  return {
    filters: {
      range,
      onlyErrors: sp.errors === '1',
      onlyRateLimited: sp.rl === '1',
      ipHash: sp.ip || undefined,
    },
    page: Math.max(0, Number(sp.page) || 0),
  };
}

function buildQuery(
  filters: EventFilters,
  page: number,
  overrides: Partial<EventFilters & { page: number }> = {},
): string {
  const merged = { ...filters, page, ...overrides };
  const params = new URLSearchParams();
  params.set('range', merged.range);
  if (merged.onlyErrors) params.set('errors', '1');
  if (merged.onlyRateLimited) params.set('rl', '1');
  if (merged.ipHash) params.set('ip', merged.ipHash);
  if (merged.page) params.set('page', String(merged.page));
  return `?${params.toString()}`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const authed = await isAdminAuthed();
  if (!authed) {
    return <LoginForm error={sp.error === '1'} />;
  }

  const { filters, page } = parseFilters(sp);
  const [list, anomalies] = await Promise.all([
    getEventsList(filters, page, PAGE_SIZE),
    getAnomalyFlags(),
  ]);

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin — event log</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Per-request drill-down. <Link href="/dashboard" className="underline">Back to public dashboard</Link>.
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              Sign out
            </button>
          </form>
        </header>

        <AnomalyBanner flags={anomalies} />

        <FilterBar filters={filters} />

        <EventTable rows={list.rows} total={list.total} page={page} totalPages={totalPages} filters={filters} />
      </div>
    </main>
  );
}

function AnomalyBanner({ flags }: { flags: AnomalyFlags }) {
  const items: { label: string; tone: 'warn' | 'good' }[] = [];
  if (flags.spendLastHourUsd > 0.5) {
    items.push({
      label: `Spend in last hour: $${flags.spendLastHourUsd.toFixed(4)}`,
      tone: 'warn',
    });
  }
  if (flags.errorsLastHour > 0) {
    items.push({ label: `${flags.errorsLastHour} errors in last hour`, tone: 'warn' });
  }
  if (flags.rateLimitedLastHour > 0) {
    items.push({
      label: `${flags.rateLimitedLastHour} rate-limited in last hour`,
      tone: 'warn',
    });
  }
  if (flags.topIpHashLastHour) {
    items.push({
      label: `Top IP ${flags.topIpHashLastHour.ipHash.slice(0, 8)}… made ${flags.topIpHashLastHour.requests} requests in 1h`,
      tone: 'warn',
    });
  }
  if (flags.longTailQuerySession) {
    items.push({
      label: `Session ${flags.longTailQuerySession.sessionId.slice(0, 8)}… made ${flags.longTailQuerySession.requests} requests in 24h`,
      tone: 'warn',
    });
  }

  if (items.length === 0) {
    return (
      <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
        No anomalies in the last hour.
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-300">
        Anomalies
      </div>
      <ul className="text-sm text-amber-100">
        {items.map((it, i) => (
          <li key={i}>• {it.label}</li>
        ))}
      </ul>
    </div>
  );
}

function FilterBar({ filters }: { filters: EventFilters }) {
  const ranges: EventFilters['range'][] = ['1h', '24h', '7d', '30d'];

  const linkBase =
    'rounded-md border px-3 py-1.5 text-xs transition-colors';
  const active = 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200';
  const idle = 'border-zinc-700 text-zinc-400 hover:bg-zinc-900';

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-zinc-500">Range:</span>
      {ranges.map((r) => (
        <Link
          key={r}
          href={buildQuery(filters, 0, { range: r })}
          className={`${linkBase} ${filters.range === r ? active : idle}`}
        >
          {r}
        </Link>
      ))}
      <span className="ml-4 text-xs uppercase tracking-wide text-zinc-500">Show:</span>
      <Link
        href={buildQuery(filters, 0, { onlyErrors: !filters.onlyErrors })}
        className={`${linkBase} ${filters.onlyErrors ? active : idle}`}
      >
        Errors
      </Link>
      <Link
        href={buildQuery(filters, 0, { onlyRateLimited: !filters.onlyRateLimited })}
        className={`${linkBase} ${filters.onlyRateLimited ? active : idle}`}
      >
        Rate-limited
      </Link>
      {filters.ipHash && (
        <Link
          href={buildQuery(filters, 0, { ipHash: undefined })}
          className={`${linkBase} ${active}`}
        >
          IP {filters.ipHash.slice(0, 8)}… ✕
        </Link>
      )}
    </div>
  );
}

function EventTable({
  rows,
  total,
  page,
  totalPages,
  filters,
}: {
  rows: EventRow[];
  total: number;
  page: number;
  totalPages: number;
  filters: EventFilters;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <div className="border-b border-zinc-800 bg-zinc-900/40 px-4 py-2 text-xs text-zinc-400">
        {total.toLocaleString()} events — page {page + 1} of {totalPages}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/30 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Query</th>
              <th className="px-3 py-2">IP hash</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Latency</th>
              <th className="px-3 py-2">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">
                  No events in this window.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-800/60 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-400">
                  {new Date(r.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                </td>
                <td className="px-3 py-2 text-zinc-200">
                  <div className="line-clamp-2 max-w-md">{r.query}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-400">
                  <Link
                    href={buildQuery(filters, 0, { ipHash: r.ipHash })}
                    className="hover:underline"
                  >
                    {r.ipHash.slice(0, 12)}…
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-zinc-300">
                  {r.costUsd == null ? '—' : `$${r.costUsd.toFixed(5)}`}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-zinc-300">
                  {r.latencyMs == null ? '—' : `${r.latencyMs} ms`}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  <Outcome row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/40 px-4 py-2 text-xs text-zinc-400">
        <div>
          Showing {rows.length === 0 ? 0 : page * PAGE_SIZE + 1}–
          {page * PAGE_SIZE + rows.length} of {total.toLocaleString()}
        </div>
        <div className="flex gap-2">
          {page > 0 && (
            <Link
              href={buildQuery(filters, page - 1)}
              className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-900"
            >
              ← Prev
            </Link>
          )}
          {page + 1 < totalPages && (
            <Link
              href={buildQuery(filters, page + 1)}
              className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-900"
            >
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Outcome({ row }: { row: EventRow }) {
  if (row.rateLimited) {
    return (
      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-300">
        rate-limited
      </span>
    );
  }
  if (row.error) {
    return (
      <span
        className="rounded bg-red-500/15 px-2 py-0.5 text-red-300"
        title={row.error}
      >
        error
      </span>
    );
  }
  return (
    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
      ok
    </span>
  );
}
