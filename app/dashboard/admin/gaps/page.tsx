import Link from 'next/link';
import { isAdminAuthed } from '@/lib/auth';
import { getGapQuestions } from '@/lib/queries';
import { STRONG_MATCH } from '@/lib/thresholds';
import { LoginForm } from '../LoginForm';
import { AdminShell } from '../components/AdminShell';

export const dynamic = 'force-dynamic';

const RANGES = { '7d': 7, '30d': 30, '90d': 90 } as const;
type Range = keyof typeof RANGES;

// Questions the answer said the record does not cover (the gap_declared label).
// A working list for KB edits and new eval cases; it changes neither.
export default async function GapsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  if (!(await isAdminAuthed())) {
    return <LoginForm error={null} />;
  }
  const sp = await searchParams;
  const range: Range = sp.range && Object.hasOwn(RANGES, sp.range) ? (sp.range as Range) : '30d';
  const gaps = await getGapQuestions(RANGES[range]);
  const turns = gaps.reduce((n, g) => n + g.count, 0);

  return (
    <AdminShell tab="gaps">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Range:</span>
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link
            key={r}
            href={`?range=${r}`}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              r === range
                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                : 'border-zinc-700 text-zinc-400 hover:bg-zinc-900'
            }`}
          >
            {r}
          </Link>
        ))}
      </div>

      <h2 className="mb-3 text-xs uppercase tracking-wide text-zinc-500">
        Questions the record does not cover ({gaps.length} questions, {turns} turns)
      </h2>
      {gaps.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
          No gaps declared in this range.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          {gaps.map((g) => {
            const sim = g.latest.topSimilarity;
            const strong = sim != null && sim >= STRONG_MATCH;
            return (
              <div
                key={g.key}
                className="grid grid-cols-1 gap-2 border-t border-zinc-800/60 px-4 py-3 text-sm first:border-t-0 md:grid-cols-[1fr_9rem]"
              >
                <div>
                  <div className="text-zinc-100">
                    {g.question}
                    {g.isButton && (
                      <span className="ml-1 rounded bg-sky-500/15 px-1 text-[10px] text-sky-300">button</span>
                    )}
                    {strong && (
                      <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] text-amber-300">
                        strong KB match: check retrieval first
                      </span>
                    )}
                  </div>
                  {g.latest.previousQuery && (
                    <div className="mt-0.5 text-xs text-zinc-500">Follow-up to: {g.latest.previousQuery}</div>
                  )}
                  {g.latest.searchedAs && (
                    <div className="mt-0.5 text-xs text-zinc-500">Searched as: {g.latest.searchedAs}</div>
                  )}
                  {g.latest.gapSentences.map((s, i) => (
                    <div key={i} className="mt-1 border-l-2 border-zinc-700 pl-2 text-xs text-zinc-400">
                      {s}
                    </div>
                  ))}
                </div>
                <div className="text-xs text-zinc-500 md:text-right">
                  <div>
                    {g.count} {g.count === 1 ? 'time' : 'times'} · top match {sim == null ? '—' : sim.toFixed(2)}
                  </div>
                  <div>last {g.lastSeen.slice(0, 10)}</div>
                  <Link
                    href={`/dashboard/admin/session/${encodeURIComponent(g.latest.sessionId)}?row=${g.latest.id}#e${g.latest.id}`}
                    className="text-zinc-300 underline"
                  >
                    latest turn →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        Flagged by a free pattern check on the answer (gap_declared). Abuse-labelled turns are left out.
        Each question you act on becomes a KB edit written to the question and a named case in the
        backend eval set, both by hand. A strong match ({STRONG_MATCH}+) means the KB probably has the
        content and retrieval or the answer missed it.
      </p>
    </AdminShell>
  );
}
