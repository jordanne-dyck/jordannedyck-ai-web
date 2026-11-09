import { PURPOSES } from '@/lib/concierge';
import { LEAD_STATUSES, type LeadRow, type LeadStats } from '@/lib/leads';
import { StatCard } from '../../components/StatCard';

const purposeLabel = (id: string | null) => PURPOSES.find((p) => p.id === id)?.label ?? 'Not given';

const hours = (h: number | null) => (h == null ? '—' : h < 48 ? `${h} h` : `${(h / 24).toFixed(1)} days`);

// The concierge leads (lib/leads.ts): the pilot's numbers and one row per
// note sent. Used by /dashboard/admin/leads with a status action, and by the
// public dashboard's sample section without one.
export function LeadsView({
  rows,
  stats,
  setStatus,
}: {
  rows: LeadRow[];
  stats: LeadStats;
  setStatus?: (formData: FormData) => Promise<void>;
}) {
  const share = stats.total ? Math.round((stats.conversations / stats.total) * 100) : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Notes sent" value={String(stats.total)} />
        <StatCard
          label="Replied"
          value={String(stats.replied)}
          tone={stats.total > stats.replied ? 'warn' : 'neutral'}
          hint={stats.total > stats.replied ? `${stats.total - stats.replied} waiting` : undefined}
        />
        <StatCard
          label="Median reply time"
          value={hours(stats.medianReplyHours)}
          hint="Promise: one business day"
        />
        <StatCard label="Became a conversation" value={share == null ? '—' : `${share}%`} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
          No notes yet.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800">
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-1 gap-3 border-t border-zinc-800/60 px-4 py-3 text-sm first:border-t-0 md:grid-cols-[1fr_14rem]"
            >
              <div>
                <div className="text-zinc-100">
                  {r.name}{' '}
                  <a href={`mailto:${r.email}`} className="text-zinc-400 underline">{r.email}</a>
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {purposeLabel(r.purpose)}
                  {r.project && <> · project {r.project}</>}
                  {' · '}
                  {r.draftedBy === 'ai' ? 'AI draft' : r.draftedBy === 'template' ? 'template' : 'blank note'}
                  {r.edited ? ', edited' : ', not edited'}
                </div>
                <pre className="mt-2 whitespace-pre-wrap border-l-2 border-zinc-700 pl-3 font-sans text-xs text-zinc-300">
                  {r.note}
                </pre>
              </div>
              <div className="text-xs text-zinc-500 md:text-right">
                <div>in {r.createdAt.replace('T', ' ').slice(0, 16)} UTC</div>
                {r.repliedAt && <div>replied {r.repliedAt.replace('T', ' ').slice(0, 16)} UTC</div>}
                <form action={setStatus} className="mt-2 flex flex-wrap gap-1 md:justify-end">
                  <input type="hidden" name="id" value={r.id} />
                  {LEAD_STATUSES.map((s) => (
                    <button
                      key={s.id}
                      type="submit"
                      name="status"
                      value={s.id}
                      disabled={!setStatus || s.id === r.status}
                      className={`rounded-md border px-2 py-1 ${
                        s.id === r.status
                          ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                          : 'border-zinc-700 text-zinc-400 enabled:hover:bg-zinc-900'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
