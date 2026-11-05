import type { PublicQuality } from '@/lib/public-quality';
import { StatCard } from './StatCard';
import { BarList } from './BarList';

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');

// Real counts from the admin Insights page. Totals only, no question text.
export function QualitySection({ data }: { data: PublicQuality }) {
  const { quality, shapes, versions } = data;
  const judged = quality.judged.grounded + quality.judged.partial + quality.judged.notGrounded;
  const l = quality.labels;
  const votes = l.thumbs_up + l.thumbs_down;
  const abuse = l.injection + l.prompt_leak + l.off_topic + l.moderation;

  return (
    <>
      <h2 className="mb-3 mt-8 text-xs uppercase tracking-wide text-zinc-500">
        Answer quality (last 30 days)
      </h2>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Grounded in the record"
          value={pct(quality.judged.grounded, judged)}
          hint={`a second model checks each answer against its sources · ${quality.judged.partial} partly · ${quality.judged.notGrounded} not · ${judged} judged`}
        />
        <StatCard
          label="Said it didn't know"
          value={pct(quality.gapDeclared, quality.answered)}
          hint={`${quality.gapDeclared} of ${quality.answered} answers declared a gap instead of guessing`}
        />
        <StatCard
          label="Visitor votes"
          value={votes ? pct(l.thumbs_up, votes) : '—'}
          hint={`thumbs up · ${l.thumbs_up} up · ${l.thumbs_down} down`}
        />
        <StatCard
          label="Abuse attempts caught"
          value={String(abuse)}
          hint={`${l.injection} injection · ${l.prompt_leak} prompt leak · ${l.off_topic} off-topic · ${l.moderation} moderation`}
        />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h2 className="text-sm font-medium text-zinc-300">How conversations go</h2>
          <p className="mb-4 mt-1 text-xs text-zinc-500">{shapes.conversations} conversations</p>
          <BarList
            items={[
              { label: 'Started with a button', value: shapes.startedWithButton },
              { label: '…then typed a follow-up', value: shapes.buttonThenTyped },
              { label: 'Started typed', value: shapes.startedTyped },
              { label: 'One question, then left', value: shapes.singleQuestion },
            ]}
          />
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h2 className="text-sm font-medium text-zinc-300">Quality by prompt and index version (90d)</h2>
          <p className="mb-3 mt-1 text-xs text-zinc-500">
            Every answer logs a hash of the prompt and the index it used, so a drop traces to an edit
          </p>
          {versions.length === 0 ? (
            <div className="py-6 text-center text-sm text-zinc-500">No versioned answers yet</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-1">Prompt</th>
                  <th className="py-1">Index</th>
                  <th className="py-1">From</th>
                  <th className="py-1 text-right">Answers</th>
                  <th className="py-1 text-right">Gap</th>
                  <th className="py-1 text-right">Not grounded</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {versions.slice(0, 6).map((v) => (
                  <tr key={`${v.promptVersion}-${v.indexVersion}`} className="border-t border-zinc-800/60">
                    <td className="py-1 font-mono">{v.promptVersion}</td>
                    <td className="py-1 font-mono">{v.indexVersion ?? '—'}</td>
                    <td className="py-1 text-zinc-400">{v.firstSeen}</td>
                    <td className="py-1 text-right">{v.answered}</td>
                    <td className="py-1 text-right">{pct(v.gapDeclaredRate, 1)}</td>
                    <td className="py-1 text-right">{pct(v.notGroundedRate, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
