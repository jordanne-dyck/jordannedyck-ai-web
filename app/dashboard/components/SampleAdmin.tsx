import { SAMPLE_EVENTS, SAMPLE_CONVERSATION, SAMPLE_FIXES, SAMPLE_GAPS, SAMPLE_LEADS } from '@/lib/demo-data';
import { leadStats } from '@/lib/leads';
import { LeadsView } from '../admin/components/LeadsView';
import { STRONG_MATCH } from '@/lib/thresholds';
import { TurnBadges } from '../admin/components/Badges';
import { TurnDetails } from '../admin/components/TurnDetails';
import { Outcome } from '../admin/components/Outcome';
import { Turn } from '../admin/components/Turn';

const secs = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}`);

// The private admin views, rendered with their real components but fed the
// hand-written rows in lib/demo-data.ts. Nothing here reads the database.
export function SampleAdmin() {
  return (
    <section className="mt-10">
      <h2 className="text-xs uppercase tracking-wide text-zinc-500">Inside the admin view</h2>
      <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-sky-200">
        Sample data. These rows are made up and written by hand. They use the same components as the
        private admin pages, so this is what reviewing real traffic looks like. Real visitors&apos;
        questions never leave the admin view.
      </div>

      <Panel title="Event log" note="Every request, with its labels, timing, cost and the judge's verdict. Open details on a row.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/30 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Query</th>
                <th className="px-3 py-2">Retrieval</th>
                <th className="px-3 py-2 text-right" title="Seconds: search / first word / full answer">
                  Search / first word / total
                </th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_EVENTS.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800/60 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-400">
                    {r.createdAt.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="px-3 py-2 text-zinc-200">
                    <div className="line-clamp-2 max-w-md">{r.query}</div>
                    <div><TurnBadges row={r} /></div>
                    <TurnDetails row={r} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-400">
                    {r.retrievalStatus ?? '—'}
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
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="One conversation" note="A visitor's turns in order, each with its retrieval, timing and verdict.">
          <div className="flex flex-col gap-2 p-4">
            {SAMPLE_CONVERSATION.map((t) => (
              <Turn key={t.id} row={t} />
            ))}
          </div>
        </Panel>

        <div>
          <Panel title="What to fix" note="Ranked by count. An accepted fix becomes a named case in the eval set.">
            {SAMPLE_FIXES.map((f) => (
              <div key={f.headline} className="border-t border-zinc-800/60 px-4 py-3 text-sm first:border-t-0">
                <div className="text-xs text-amber-300">{f.why}</div>
                <div className="text-zinc-200">{f.headline}</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {f.count} {f.kind === 'rephrased' ? 'pairs' : 'times'} · {f.detail}
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="Gaps" note="Questions the record does not cover, with the sentence that said so.">
            {SAMPLE_GAPS.map((g) => {
              const sim = g.latest.topSimilarity;
              return (
                <div key={g.question} className="border-t border-zinc-800/60 px-4 py-3 text-sm first:border-t-0">
                  <div className="text-zinc-100">
                    {g.question}
                    {sim != null && sim >= STRONG_MATCH && (
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
                  {g.latest.gapSentences.map((s) => (
                    <div key={s} className="mt-1 border-l-2 border-zinc-700 pl-2 text-xs text-zinc-400">{s}</div>
                  ))}
                  <div className="mt-1 text-xs text-zinc-500">
                    {g.count} {g.count === 1 ? 'time' : 'times'} · top match {sim == null ? '—' : sim.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </Panel>
        </div>
      </div>

      <Panel
        title="Concierge pilot: leads"
        note="Notes visitors send Jordanne from “Talk to the human”, and whether she replied within one business day. Made-up people and numbers."
      >
        <div className="p-4">
          <LeadsView rows={SAMPLE_LEADS} stats={leadStats(SAMPLE_LEADS)} />
        </div>
      </Panel>
    </section>
  );
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30">
      <div className="border-b border-zinc-800 px-4 py-2">
        <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
        <p className="text-xs text-zinc-500">{note}</p>
      </div>
      {children}
    </div>
  );
}
