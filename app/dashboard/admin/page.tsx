import Link from 'next/link';
import { isAdminAuthed } from '@/lib/auth';
import {
  getEventsList,
  getAnomalyFlags,
  getLabelCounts24h,
  getFailedLoginsLastHour,
  type EventFilters,
  type EventRow,
  type AnomalyFlags,
  type FailedLogins,
} from '@/lib/queries';
import { LABELS, LABEL_BY_KEY, type LabelKey } from '@/lib/labels';
import { MAX_FAILURES, WINDOW_MINUTES } from '@/lib/admin-login-limit';
import { LoginForm } from './LoginForm';
import { AdminShell } from './components/AdminShell';
import { TurnBadges } from './components/Badges';
import { TurnDetails } from './components/TurnDetails';
import { Outcome } from './components/Outcome';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type SearchParams = {
  range?: string;
  errors?: string;
  rl?: string;
  syn?: string;
  ip?: string;
  ret?: string;
  src?: string;
  label?: string;
  q?: string;
  ids?: string;
  page?: string;
  error?: string;
};

function parseFilters(sp: SearchParams): { filters: EventFilters; page: number } {
  const allowed: EventFilters['range'][] = ['1h', '24h', '7d', '30d', '90d'];
  const range = (allowed.includes(sp.range as EventFilters['range'])
    ? sp.range
    : '24h') as EventFilters['range'];
  const ret = ['empty', 'error', 'weak'].includes(sp.ret ?? '') ? (sp.ret as EventFilters['retrieval']) : undefined;
  const src = ['button', 'typed'].includes(sp.src ?? '') ? (sp.src as EventFilters['source']) : undefined;
  const label = sp.label && Object.hasOwn(LABEL_BY_KEY, sp.label) ? (sp.label as LabelKey) : undefined;
  const ids = sp.ids
    ?.split(',')
    .filter((id) => /^\d+$/.test(id))
    .slice(0, 200);
  return {
    filters: {
      range,
      onlyErrors: sp.errors === '1',
      onlyRateLimited: sp.rl === '1',
      onlySynthetic: sp.syn === '1',
      ipHash: sp.ip || undefined,
      retrieval: ret,
      source: src,
      label,
      question: sp.q || undefined,
      ids: ids?.length ? ids : undefined,
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
  if (merged.onlySynthetic) params.set('syn', '1');
  if (merged.ipHash) params.set('ip', merged.ipHash);
  if (merged.retrieval) params.set('ret', merged.retrieval);
  if (merged.source) params.set('src', merged.source);
  if (merged.label) params.set('label', merged.label);
  if (merged.question) params.set('q', merged.question);
  if (merged.ids?.length) params.set('ids', merged.ids.join(','));
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
    return (
      <LoginForm error={sp.error === 'locked' ? 'locked' : sp.error === '1' ? 'wrong' : null} />
    );
  }

  const { filters, page } = parseFilters(sp);
  const [list, anomalies, labels24h, failedLogins] = await Promise.all([
    getEventsList(filters, page, PAGE_SIZE),
    getAnomalyFlags(),
    getLabelCounts24h(),
    getFailedLoginsLastHour(),
  ]);

  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  return (
    <AdminShell tab="log">
      <AnomalyBanner flags={anomalies} labels24h={labels24h} failedLogins={failedLogins} />

      <FilterBar filters={filters} />

      <EventTable rows={list.rows} total={list.total} page={page} totalPages={totalPages} filters={filters} />
    </AdminShell>
  );
}

function AnomalyBanner({
  flags,
  labels24h,
  failedLogins,
}: {
  flags: AnomalyFlags;
  labels24h: Record<LabelKey, number>;
  failedLogins: FailedLogins;
}) {
  const items: string[] = [];
  if (flags.spendLastHourUsd > 0.5) {
    items.push(`Spend in last hour: $${flags.spendLastHourUsd.toFixed(4)}`);
  }
  if (flags.errorsLastHour > 0) {
    items.push(`${flags.errorsLastHour} errors in last hour`);
  }
  if (flags.rateLimitedLastHour > 0) {
    items.push(`${flags.rateLimitedLastHour} rate-limited in last hour`);
  }
  if (flags.topIpHashLastHour) {
    items.push(
      `Top IP ${flags.topIpHashLastHour.ipHash.slice(0, 8)}… made ${flags.topIpHashLastHour.requests} requests in 1h`,
    );
  }
  if (flags.longTailQuerySession) {
    items.push(
      `Session ${flags.longTailQuerySession.sessionId.slice(0, 8)}… made ${flags.longTailQuerySession.requests} requests in 24h`,
    );
  }
  // Same thresholds as the Checkly abuse check: any injection, prompt leak or
  // moderation hit, or more than 5 off-topic questions a day.
  const abuse = [
    labels24h.injection && `${labels24h.injection} injection`,
    labels24h.prompt_leak && `${labels24h.prompt_leak} prompt leak`,
    labels24h.moderation && `${labels24h.moderation} moderation`,
    labels24h.off_topic > 5 && `${labels24h.off_topic} off-topic`,
  ].filter(Boolean);
  if (abuse.length) items.push(`24h labels: ${abuse.join(', ')}`);
  for (const f of failedLogins) {
    items.push(
      `${f.attempts} failed admin logins from ${f.ipHash.slice(0, 8)}… in the last hour` +
        (f.attempts >= MAX_FAILURES ? ` (locked out for ${WINDOW_MINUTES} min after ${MAX_FAILURES})` : ''),
    );
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
          <li key={i}>• {it}</li>
        ))}
      </ul>
    </div>
  );
}

const linkBase = 'rounded-md border px-3 py-1.5 text-xs transition-colors';
const active = 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200';
const idle = 'border-zinc-700 text-zinc-400 hover:bg-zinc-900';

function FilterBar({ filters }: { filters: EventFilters }) {
  const ranges: EventFilters['range'][] = ['1h', '24h', '7d', '30d', '90d'];
  const row = 'mb-2 flex flex-wrap items-center gap-2';
  const key = 'w-20 text-xs uppercase tracking-wide text-zinc-500';
  const toggle = (on: boolean, href: string, text: string) => (
    <Link key={text} href={href} className={`${linkBase} ${on ? active : idle}`}>
      {text}
    </Link>
  );

  return (
    <div className="mb-4">
      <div className={row}>
        <span className={key}>Range:</span>
        {ranges.map((r) => toggle(filters.range === r, buildQuery(filters, 0, { range: r }), r))}
        <span className={`ml-4 ${key}`}>Show:</span>
        {toggle(!!filters.onlyErrors, buildQuery(filters, 0, { onlyErrors: !filters.onlyErrors }), 'Errors')}
        {toggle(!!filters.onlyRateLimited, buildQuery(filters, 0, { onlyRateLimited: !filters.onlyRateLimited }), 'Rate-limited')}
        {toggle(!!filters.onlySynthetic, buildQuery(filters, 0, { onlySynthetic: !filters.onlySynthetic }), 'Synthetic only')}
      </div>
      <div className={row}>
        <span className={key}>Retrieval:</span>
        {(['empty', 'error', 'weak'] as const).map((r) =>
          toggle(
            filters.retrieval === r,
            buildQuery(filters, 0, { retrieval: filters.retrieval === r ? undefined : r }),
            r === 'weak' ? 'Weak match' : r[0].toUpperCase() + r.slice(1),
          ),
        )}
        <span className={`ml-4 ${key}`}>Source:</span>
        {(['button', 'typed'] as const).map((s) =>
          toggle(
            filters.source === s,
            buildQuery(filters, 0, { source: filters.source === s ? undefined : s }),
            s[0].toUpperCase() + s.slice(1),
          ),
        )}
      </div>
      <div className={row}>
        <span className={key}>Labels:</span>
        {LABELS.map((l) =>
          toggle(
            filters.label === l.key,
            buildQuery(filters, 0, { label: filters.label === l.key ? undefined : l.key }),
            l.name,
          ),
        )}
      </div>
      {(filters.ipHash || filters.question || filters.ids) && (
        <div className={row}>
          <span className={key}>Also:</span>
          {filters.ipHash &&
            toggle(true, buildQuery(filters, 0, { ipHash: undefined }), `IP ${filters.ipHash.slice(0, 8)}… ✕`)}
          {filters.question &&
            toggle(true, buildQuery(filters, 0, { question: undefined }), `"${filters.question.slice(0, 40)}" ✕`)}
          {filters.ids &&
            toggle(true, buildQuery(filters, 0, { ids: undefined }), `${filters.ids.length} selected turns ✕`)}
        </div>
      )}
    </div>
  );
}

const secs = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}`);

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
              <th className="px-3 py-2">Conversation</th>
              <th className="px-3 py-2">Retrieval</th>
              <th className="px-3 py-2 text-right" title="Seconds: search / first word / full answer">
                Search / first word / total
              </th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
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
                  <div><TurnBadges row={r} /></div>
                  <TurnDetails row={r} ipHref={buildQuery(filters, 0, { ipHash: r.ipHash })} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  <Link
                    href={`/dashboard/admin/session/${encodeURIComponent(r.sessionId)}?row=${r.id}#e${r.id}`}
                    className="text-zinc-300 underline hover:text-zinc-100"
                  >
                    {r.sessionId.slice(0, 8)}…{r.turnIndex != null && ` · turn ${r.turnIndex}`}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-400">
                  <span className={r.retrievalStatus === 'error' ? 'text-red-300' : ''}>
                    {r.retrievalStatus ?? '—'}
                  </span>
                  {r.topSimilarity != null && ` · ${r.topSimilarity.toFixed(2)}`}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-zinc-300">
                  {r.latencyMs == null && r.retrievalMs == null
                    ? '—'
                    : `${secs(r.retrievalMs)} / ${secs(r.timeToFirstTokenMs)} / ${secs(r.latencyMs)} s`}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-zinc-300">
                  {r.costUsd == null ? '—' : `$${r.costUsd.toFixed(5)}`}
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
