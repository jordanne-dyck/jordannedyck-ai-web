import Link from 'next/link';
import type { Pair, TrafficReport } from '@/lib/traffic-report';
import type { TrafficInsight } from '@/lib/traffic-insights';
import { BarList } from './BarList';
import { TrafficTrendChart } from './TrafficTrendChart';

// The traffic dashboard (2026-11-16). Rendered by /dashboard/admin/traffic with
// real rows, and by the public dashboard's sample admin view with made-up ones
// (`sample`: no links into the admin pages, no visitor ids).

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const num = (x: number | null, digits = 0) => (x == null ? '—' : x.toFixed(digits));
const secs = (x: number | null) => (x == null ? '—' : x < 60 ? `${Math.round(x)} s` : `${(x / 60).toFixed(1)} min`);

type Kind = 'count' | 'rate' | 'secs' | 'decimal';

function delta(p: Pair, kind: Kind, days: number): { text: string; tone: 'up' | 'down' | 'flat' } | null {
  if (p.cur == null || p.prev == null) return null;
  if (kind === 'rate') {
    const pts = Math.round((p.cur - p.prev) * 100);
    return { text: `${pts > 0 ? '+' : ''}${pts} pts vs previous ${days}d`, tone: pts > 0 ? 'up' : pts < 0 ? 'down' : 'flat' };
  }
  if (p.prev === 0) return p.cur > 0 ? { text: `new vs previous ${days}d`, tone: 'up' } : null;
  const ch = Math.round(((p.cur - p.prev) / p.prev) * 100);
  return { text: `${ch > 0 ? '+' : ''}${ch}% vs previous ${days}d`, tone: ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat' };
}

function Stat({ label, pair, kind, days, hint, lowerIsBetter }: {
  label: string; pair: Pair; kind: Kind; days: number; hint?: string; lowerIsBetter?: boolean;
}) {
  const value = kind === 'rate' ? pct(pair.cur) : kind === 'secs' ? secs(pair.cur) : kind === 'decimal' ? num(pair.cur, 1) : num(pair.cur);
  const d = delta(pair, kind, days);
  const good = d && d.tone !== 'flat' && ((d.tone === 'up') !== !!lowerIsBetter);
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/40 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-100">{value}</div>
      {d && (
        <div className={`mt-0.5 text-xs ${d.tone === 'flat' ? 'text-zinc-500' : good ? 'text-emerald-400' : 'text-amber-400'}`}>{d.text}</div>
      )}
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-zinc-500">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const TONE: Record<TrafficInsight['tone'], string> = {
  act: 'border-amber-500/40 bg-amber-500/5',
  watch: 'border-zinc-700 bg-zinc-900/40',
  good: 'border-emerald-500/40 bg-emerald-500/5',
};
const TONE_LABEL: Record<TrafficInsight['tone'], string> = { act: 'Act', watch: 'Watch', good: 'Working' };

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>{head.map((h, i) => <th key={h} className={`px-2 py-1.5 ${i ? 'text-right' : ''}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-800 text-zinc-300">
          {rows.map((r) => (
            <tr key={String(r[0])}>
              {r.map((c, i) => <td key={i} className={`px-2 py-1.5 ${i ? 'text-right tabular-nums' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PAGE_NAME: Record<string, string> = { '/': 'Home', '/about': 'About', '/dashboard': 'Public dashboard', '/other': 'Other' };
const CURATED_NAME = { story: 'Build story', timeline: 'Timeline', project: 'Project card' } as const;

export function TrafficView({ report: r, insights, sample = false }: { report: TrafficReport; insights: TrafficInsight[]; sample?: boolean }) {
  const t = r.totals;
  const days = r.days;
  const visited = r.funnel[0]?.visitors ?? 0;

  return (
    <div className="space-y-6">
      {insights.length > 0 && (
        <Panel title="What to look at" note="Rules over the numbers below. Each fires only above a minimum sample. Answer-quality fixes are on the Insights tab.">
          <ul className="space-y-2">
            {insights.map((i) => (
              <li key={i.headline} className={`rounded-lg border px-3 py-2 ${TONE[i.tone]}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">{TONE_LABEL[i.tone]} · {i.area}</span>
                  <span className="text-sm text-zinc-100">{i.headline}</span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {i.detail}
                  {i.href && !sample && <> <Link href={i.href} className="underline">Open</Link></>}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Visitors" pair={t.visitors} kind="count" days={days} hint={`${num(t.newVisitors.cur)} new · ${num(t.returningVisitors.cur)} returning`} />
        <Stat label="Page views" pair={t.pageViews} kind="count" days={days} hint={`${num(t.visits.cur)} visits`} />
        <Stat label="Bounce rate" pair={t.bounceRate} kind="rate" days={days} lowerIsBetter hint="One page, no click, no question" />
        <Stat label="Time on page" pair={t.avgEngagedSec} kind="secs" days={days} hint="Average, while the tab was visible" />
        <Stat label="Used the bot" pair={t.usedBotRate} kind="rate" days={days} hint="Visitors who asked anything" />
        <Stat label="Conversations" pair={t.conversations} kind="count" days={days} hint={`${num(t.questions.cur)} questions`} />
        <Stat label="Questions per conversation" pair={t.avgQuestions} kind="decimal" days={days} />
        <Stat label="Curated experience" pair={t.curatedRate} kind="rate" days={days} hint="Story, timeline or project card" />
        <Stat label="Thumbs up" pair={t.thumbsUpRate} kind="rate" days={days} hint={`of ${num(t.rated.cur)} rated answers`} />
        <Stat label="Reached out" pair={t.reachedOutRate} kind="rate" days={days} hint={`${num(t.leads.cur)} leads · ${num(t.contactClicks.cur)} contact clicks`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Visitors and page views per day (last ${days}d)`}>
          <TrafficTrendChart
            data={r.daily}
            series={[
              { key: 'visitors', label: 'Visitors', color: '#60a5fa' },
              { key: 'pageViews', label: 'Page views', color: '#a1a1aa' },
            ]}
          />
        </Panel>
        <Panel title={`Chats and contacts per day (last ${days}d)`}>
          <TrafficTrendChart
            data={r.daily}
            series={[
              { key: 'conversations', label: 'Conversations', color: '#34d399' },
              { key: 'questions', label: 'Questions', color: '#a1a1aa' },
              { key: 'reachedOut', label: 'Reached out', color: '#fbbf24' },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Funnel" note="Visitors in this range who got to each step. The percentage is of everyone who visited; the arrow is of the step before.">
        <div className="space-y-2">
          {r.funnel.map((f, i) => {
            const prev = i ? r.funnel[i - 1].visitors : null;
            return (
              <div key={f.label} className="grid grid-cols-[minmax(0,12rem)_1fr_5rem_5rem] items-center gap-3 text-xs text-zinc-300">
                <span>{f.label}</span>
                <span className="h-3 overflow-hidden rounded bg-zinc-800">
                  <span className="block h-full bg-sky-400" style={{ width: `${visited ? (f.visitors / visited) * 100 : 0}%` }} />
                </span>
                <span className="text-right tabular-nums">{f.visitors} · {pct(visited ? f.visitors / visited : null)}</span>
                <span className="text-right text-zinc-500 tabular-nums">{prev != null ? `→ ${pct(prev ? f.visitors / prev : null)}` : ''}</span>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pages" note="Bounce is of visits that landed on the page.">
          <Table
            head={['Page', 'Views', 'Visitors', 'Landings', 'Bounce', 'Time']}
            rows={r.pages.map((p) => [PAGE_NAME[p.path] ?? p.path, p.views, p.visitors, p.landings, pct(p.bounceRate), secs(p.avgEngagedSec)])}
          />
        </Panel>
        <Panel title="Where visitors came from" note="From the first visit in the range. 'tag:' is a ?utm_source on the link.">
          <Table
            head={['Source', 'Visitors', 'Used bot', 'Reached out']}
            rows={r.sources.map((s) => [s.source, s.visitors, pct(s.usedBotRate), pct(s.reachedOutRate)])}
          />
        </Panel>
        <Panel title="Device">
          <Table
            head={['Device', 'Visitors', 'Bounce', 'Used bot']}
            rows={r.devices.map((d) => [d.device === 'mobile' ? 'Phone or tablet' : 'Desktop', d.visitors, pct(d.bounceRate), pct(d.usedBotRate)])}
          />
        </Panel>
        <Panel title="How people reach out" note="Lead form sends, contact-link clicks and drafted notes emailed or copied.">
          {r.contacts.length ? (
            <BarList items={r.contacts.map((c) => ({ label: c.channel, value: c.count }))} />
          ) : (
            <p className="text-xs text-zinc-500">None in this range.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Curated experience" note={`Of ${r.curated.conversations} conversations, ${r.curated.any} (${pct(r.curated.conversations ? r.curated.any / r.curated.conversations : null)}) got at least one.`}>
          <BarList
            items={[
              { label: CURATED_NAME.story, value: r.curated.story },
              { label: CURATED_NAME.timeline, value: r.curated.timeline },
              { label: 'Project card opened', value: r.curated.project },
              { label: 'Project card shown', value: r.curated.projectCardShown },
            ]}
          />
        </Panel>
        <Panel title="Conversation length" note="Questions per conversation.">
          <BarList items={r.chatLength.map((c) => ({ label: c.label, value: c.count }))} />
        </Panel>
        <Panel title="Conversation vs one answer" note="Does a second question change the outcome?">
          <Table
            head={['', 'Count', 'Thumbs up', 'Curated', 'Reached out']}
            rows={r.convoVsAnswer.map((c) => [c.label, c.conversations, `${pct(c.thumbsUpRate)} (${c.rated})`, pct(c.curatedRate), pct(c.reachedOutRate)])}
          />
        </Panel>
      </div>

      <Panel title="Top paths" note="Each visit's steps in order, repeats collapsed, first six shown.">
        <ol className="space-y-1.5 text-xs text-zinc-300">
          {r.flows.map((f) => (
            <li key={f.steps.join('>')} className="flex items-start gap-3">
              <span className="w-10 shrink-0 text-right tabular-nums text-zinc-400">{f.visits}</span>
              <span className="flex flex-wrap items-center gap-1">
                {f.steps.map((s, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-zinc-600">→</span>}
                    <span className={`rounded px-1.5 py-0.5 ${s === 'Left' ? 'bg-zinc-800 text-zinc-500' : /Clicked|Sent|Saved/.test(s) ? 'bg-amber-500/15 text-amber-200' : /Asked|story|Timeline|Project/.test(s) ? 'bg-emerald-500/10 text-emerald-200' : 'bg-zinc-800'}`}>{s}</span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Recent conversations" note="Grouped from turns. Open one to read it.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-1.5">Started</th>
                <th className="px-2 py-1.5">First question</th>
                <th className="px-2 py-1.5 text-right">Questions</th>
                <th className="px-2 py-1.5">Curated</th>
                <th className="px-2 py-1.5">Rating</th>
                <th className="px-2 py-1.5">Reached out</th>
                <th className="px-2 py-1.5">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-300">
              {r.recentConversations.map((c) => (
                <tr key={`${c.visitor}-${c.startedAt}`}>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs text-zinc-400">{c.startedAt.slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-2 py-1.5">
                    {sample ? c.firstQuestion : (
                      <Link href={`/dashboard/admin/session/${encodeURIComponent(c.visitor)}`} className="hover:underline">{c.firstQuestion}</Link>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{c.questions}</td>
                  <td className="px-2 py-1.5 text-xs">{c.curated.map((k) => CURATED_NAME[k]).join(', ') || '—'}</td>
                  <td className="px-2 py-1.5 text-xs">{c.up || c.down ? `${c.up} up · ${c.down} down` : '—'}</td>
                  <td className="px-2 py-1.5 text-xs">{c.reachedOut ? 'Yes' : '—'}</td>
                  <td className="px-2 py-1.5 text-xs text-zinc-400">{c.source ?? '—'}{c.device ? ` · ${c.device}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="text-xs text-zinc-500">
        A visitor is one browser cookie, kept 30 days: someone on two devices counts twice, and someone returning after
        30 days counts as new. Bots and your own excluded browsers are left out. Visits are recorded from the day this
        tracking shipped; chat numbers include earlier conversations.
      </p>
    </div>
  );
}
