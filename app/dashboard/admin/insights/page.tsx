import Link from 'next/link';
import { isAdminAuthed } from '@/lib/auth';
import {
  getQualitySummary,
  getFixList,
  getTopQuestions,
  getConversationShapes,
  getQualityByVersion,
} from '@/lib/queries';
import { STRONG_MATCH } from '@/lib/thresholds';
import { LoginForm } from '../LoginForm';
import { AdminShell } from '../components/AdminShell';

export const dynamic = 'force-dynamic';

const RANGES = { '7d': 7, '30d': 30, '90d': 90 } as const;
type Range = keyof typeof RANGES;

// Turns the logged data into things to act on. Everything here links back to
// the turns behind it; nothing here changes the prompt, the KB or the evals.
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  if (!(await isAdminAuthed())) {
    return <LoginForm error={null} />;
  }
  const sp = await searchParams;
  const range: Range = sp.range && Object.hasOwn(RANGES, sp.range) ? (sp.range as Range) : '30d';
  const days = RANGES[range];

  const [quality, fixes, questions, shapes, versions] = await Promise.all([
    getQualitySummary(days),
    getFixList(days),
    getTopQuestions(days, 8),
    getConversationShapes(days),
    getQualityByVersion(90),
  ]);

  const judged = quality.judged.grounded + quality.judged.partial + quality.judged.notGrounded;
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');
  const logLink = (extra: string) => `/dashboard/admin?range=${range}&${extra}`;
  const abuse = quality.labels;

  return (
    <AdminShell tab="insights">
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

      <Section title={`Live answer quality (${quality.answered} answered questions)`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            label="Grounded (judge)"
            value={pct(quality.judged.grounded, judged)}
            hint={`${quality.judged.grounded} yes · ${quality.judged.partial} partly · ${quality.judged.notGrounded} no · ${judged} judged`}
            href={logLink('label=not_grounded')}
          />
          <Card
            label="Gap declared"
            value={String(quality.gapDeclared)}
            hint={`${quality.gapWithStrongMatch} had a KB match of ${STRONG_MATCH}+`}
            href={logLink('label=gap_declared')}
          />
          <Card
            label="First-person slips"
            value={String(quality.firstPerson)}
            hint={'answered as "I" instead of "Jordanne"'}
            href={logLink('label=first_person')}
          />
          <Card
            label="Abuse labels"
            value={String(abuse.injection + abuse.prompt_leak + abuse.off_topic + abuse.moderation)}
            hint={`${abuse.injection} injection · ${abuse.prompt_leak} leak · ${abuse.off_topic} off-topic · ${abuse.moderation} moderation`}
          />
        </div>
      </Section>

      <Section title="What to fix (ranked by count)">
        {fixes.length === 0 ? (
          <Empty text="Nothing to flag in this range." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            {fixes.map((f, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-2 border-t border-zinc-800/60 px-4 py-3 text-sm first:border-t-0 md:grid-cols-[13rem_1fr_8rem]"
              >
                <div className="text-xs text-amber-300">{f.why}</div>
                <div className="text-zinc-200">
                  {f.headline}
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {f.count} {f.kind === 'rephrased' ? 'pairs' : 'times'} · {f.detail}
                  </div>
                </div>
                <div className="text-xs md:text-right">
                  <Link href={logLink(`ids=${f.rowIds.slice(0, 200).join(',')}`)} className="text-zinc-300 underline">
                    {f.rowIds.length} turns →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          Candidates only. A fix you accept becomes a named case in eval_set.json, added by hand.
          Thresholds live in lib/thresholds.ts and are placeholders until set from real data.
        </p>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Questions asked (most frequent)">
          <Panel note={`${questions.total} questions, ${questions.distinct} distinct · grouped by exact text, ignoring case`}>
            {questions.top.length === 0 ? (
              <Empty text="No questions in this range." />
            ) : (
              questions.top.map((q) => (
                <Bar
                  key={q.key}
                  label={
                    <Link href={logLink(`q=${encodeURIComponent(q.key)}`)} className="hover:underline">
                      {q.question}
                      {q.isButton && <span className="ml-1 rounded bg-sky-500/15 px-1 text-[10px] text-sky-300">button</span>}
                    </Link>
                  }
                  value={q.count}
                  max={questions.top[0].count}
                />
              ))
            )}
            <p className="mt-2 text-xs text-zinc-500">The weekly digest groups questions by meaning.</p>
          </Panel>
        </Section>

        <Section title="Button vs typed, and what follows">
          <Panel note={`${shapes.conversations} conversations`}>
            <Bar label="Started with a button" value={shapes.startedWithButton} max={shapes.conversations} />
            <Bar label="…then typed a follow-up" value={shapes.buttonThenTyped} max={shapes.conversations} color="bg-sky-400" />
            <Bar label="Started typed" value={shapes.startedTyped} max={shapes.conversations} />
            <Bar label="One question, then left" value={shapes.singleQuestion} max={shapes.conversations} color="bg-zinc-500" />
          </Panel>
        </Section>
      </div>

      <Section title="Quality by prompt and index version (last 90 days)">
        {versions.length === 0 ? (
          <Empty text="No versioned turns yet. Versions are logged from the v2 deploy on." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/30 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Prompt</th>
                  <th className="px-3 py-2">Index</th>
                  <th className="px-3 py-2">First seen</th>
                  <th className="px-3 py-2 text-right">Answered</th>
                  <th className="px-3 py-2 text-right">Gap declared</th>
                  <th className="px-3 py-2 text-right">Not grounded</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={`${v.promptVersion}-${v.indexVersion}`} className="border-t border-zinc-800/60">
                    <td className="px-3 py-2 font-mono text-xs">{v.promptVersion}</td>
                    <td className="px-3 py-2 font-mono text-xs">{v.indexVersion ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-zinc-400">{v.firstSeen}</td>
                    <td className="px-3 py-2 text-right text-xs">{v.answered}</td>
                    <td className="px-3 py-2 text-right text-xs">{pct(v.gapDeclaredRate, 1)}</td>
                    <td className="px-3 py-2 text-right text-xs">{pct(v.notGroundedRate, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </AdminShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs uppercase tracking-wide text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}

function Card({ label, value, hint, href }: { label: string; value: string; hint: string; href?: string }) {
  const body = (
    <div className="h-full rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-zinc-100">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{hint}</div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

function Panel({ note, children }: { note: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
      <div className="mb-3 text-xs text-zinc-500">{note}</div>
      {children}
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  color = 'bg-emerald-400',
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  color?: string;
}) {
  return (
    <div className="my-1.5 grid grid-cols-[minmax(0,14rem)_1fr_2.5rem] items-center gap-2 text-xs text-zinc-300">
      <span className="truncate">{label}</span>
      <span className="h-2.5 overflow-hidden rounded bg-zinc-800">
        <span className={`block h-full ${color}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="text-right text-zinc-400">{value}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">{text}</div>;
}
