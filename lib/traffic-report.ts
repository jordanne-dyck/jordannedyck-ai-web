// The traffic dashboard's numbers (2026-11-16), built from raw rows. Pure, so
// the admin page (rows from Postgres, lib/traffic.ts) and the public dashboard
// (made-up rows, lib/demo-traffic.ts) run the same code.
//
// Definitions, used everywhere below:
// - Visitor: one jb_sid cookie. It lasts 30 days, so a visitor who returns
//   after that counts as new, and one person on two devices counts twice.
// - Visit: a visitor's page views with no gap over 30 minutes.
// - Bounce: a visit with one page view, no counted click and no question.
// - Conversation: lib/queries.ts splitConversations rules (turn number resets,
//   or 30 minutes of silence on rows without one).
// - Curated: the conversation got the build story or the career timeline, or
//   the visitor opened a project card during it.
// - Reached out: sent a lead, clicked an email/LinkedIn/phone/GitHub/vCard
//   contact, or emailed or copied a drafted note.

export const DAY_MS = 24 * 60 * 60 * 1000;
const VISIT_GAP_MS = 30 * 60 * 1000;
// A click can reach the server just before its page view does.
const EARLY_MS = 60 * 1000;

export type ViewIn = {
  at: number; viewId: string; visitor: string; path: string;
  referrer: string | null; utmSource: string | null; device: string; engagedMs: number | null;
};
export type EventIn = { at: number; visitor: string; name: string; props: Record<string, unknown> };
export type ChatIn = {
  at: number; session: string; turnIndex: number | null; query: string; rateLimited: boolean;
  story: boolean; timeline: boolean; projectCard: boolean; vote: 'up' | 'down' | null;
};
export type LeadIn = { at: number; session: string | null };

export type TrafficInput = {
  days: number;
  now: number;
  // Every row from (now - 2 * days) on: the current window and the one before it.
  views: ViewIn[];
  events: EventIn[];
  chats: ChatIn[];
  leads: LeadIn[];
  // Each visitor's first page view ever, for new against returning.
  firstSeen: Record<string, number>;
};

export type Pair = { cur: number | null; prev: number | null };

export type CuratedKind = 'story' | 'timeline' | 'project';

export type ConversationSummary = {
  startedAt: string;
  visitor: string;
  questions: number;
  firstQuestion: string;
  curated: CuratedKind[];
  up: number;
  down: number;
  reachedOut: boolean;
  source: string | null;
  device: string | null;
};

export type TrafficReport = {
  days: number;
  generatedAt: string;
  totals: {
    visitors: Pair; newVisitors: Pair; returningVisitors: Pair; visits: Pair; pageViews: Pair;
    bounceRate: Pair; avgEngagedSec: Pair; usedBotRate: Pair; conversations: Pair; questions: Pair;
    curatedRate: Pair; thumbsUpRate: Pair; rated: Pair; avgQuestions: Pair;
    reachedOutRate: Pair; leads: Pair; contactClicks: Pair;
  };
  daily: { day: string; visitors: number; pageViews: number; conversations: number; questions: number; reachedOut: number }[];
  pages: { path: string; views: number; visitors: number; landings: number; bounceRate: number | null; avgEngagedSec: number | null }[];
  curated: { conversations: number; any: number; story: number; timeline: number; project: number; projectCardShown: number };
  chatLength: { label: string; count: number }[];
  convoVsAnswer: {
    kind: 'single' | 'multi'; label: string; conversations: number;
    thumbsUpRate: number | null; rated: number; curatedRate: number | null; reachedOutRate: number | null;
  }[];
  funnel: { label: string; visitors: number }[];
  sources: { source: string; visitors: number; usedBotRate: number | null; reachedOutRate: number | null }[];
  devices: { device: string; visitors: number; bounceRate: number | null; usedBotRate: number | null }[];
  contacts: { channel: string; count: number }[];
  flows: { steps: string[]; visits: number }[];
  recentConversations: ConversationSummary[];
};

type Visit = {
  visitor: string; start: number; end: number; views: ViewIn[];
  steps: { at: number; label: string }[]; acted: boolean; source: string; device: string;
};
type Convo = {
  session: string; start: number; end: number; turns: ChatIn[];
  curated: Set<CuratedKind>; projectCardShown: boolean; up: number; down: number;
};

const ratio = (n: number, of: number): number | null => (of ? n / of : null);
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const PAGE_LABEL: Record<string, string> = { '/': 'Home', '/about': 'About', '/dashboard': 'Dashboard', '/other': 'Other page' };

const SOURCE_HOSTS: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)google\.[a-z.]+$/, 'Google'],
  [/(^|\.)(bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org|kagi\.com)$/, 'Other search'],
  [/(^|\.)github\.com$/, 'GitHub'],
  [/^(t\.co|x\.com|twitter\.com)$/, 'X'],
  [/(^|\.)(chatgpt\.com|perplexity\.ai|claude\.ai)$/, 'AI assistant'],
  [/(^|\.)(indeed\.com|glassdoor\.[a-z.]+|wellfound\.com|otta\.com|welcometothejungle\.com)$/, 'Job board'],
];

export function sourceOf(utm: string | null, referrer: string | null): string {
  if (utm) return `tag: ${utm}`;
  if (!referrer) return 'Direct';
  for (const [re, label] of SOURCE_HOSTS) if (re.test(referrer)) return label;
  return referrer;
}

const CONTACT_STEP: Record<string, string> = {
  email: 'Clicked email', linkedin: 'Clicked LinkedIn', github: 'Clicked GitHub', phone: 'Clicked phone', vcard: 'Saved contact card',
};

// Which visit a timestamp belongs to: the latest one that started before it.
function visitAt(list: Visit[] | undefined, at: number): Visit | null {
  if (!list?.length) return null;
  let hit: Visit | null = null;
  for (const v of list) {
    if (v.start - EARLY_MS <= at) hit = v;
    else break;
  }
  return hit && at <= hit.end + VISIT_GAP_MS ? hit : null;
}

function buildConversations(chats: ChatIn[]): Convo[] {
  const bySession = new Map<string, ChatIn[]>();
  for (const c of [...chats].sort((a, b) => a.at - b.at)) {
    const list = bySession.get(c.session) ?? [];
    list.push(c);
    bySession.set(c.session, list);
  }
  const out: Convo[] = [];
  for (const [session, rows] of bySession) {
    let cur: Convo | null = null;
    let prev: ChatIn | null = null;
    for (const r of rows) {
      const restarted =
        prev === null ||
        (r.turnIndex != null && prev.turnIndex != null && r.turnIndex <= prev.turnIndex) ||
        ((r.turnIndex == null || prev.turnIndex == null) && r.at - prev.at > VISIT_GAP_MS);
      if (restarted || !cur) {
        cur = { session, start: r.at, end: r.at, turns: [], curated: new Set(), projectCardShown: false, up: 0, down: 0 };
        out.push(cur);
      }
      cur.end = r.at;
      prev = r;
      if (r.rateLimited) continue;
      cur.turns.push(r);
      if (r.story) cur.curated.add('story');
      if (r.timeline) cur.curated.add('timeline');
      if (r.projectCard) cur.projectCardShown = true;
      if (r.vote === 'up') cur.up++;
      if (r.vote === 'down') cur.down++;
    }
  }
  return out.filter((c) => c.turns.length > 0);
}

export function buildTrafficReport(input: TrafficInput): TrafficReport {
  const { days, now } = input;
  const curStart = now - days * DAY_MS;
  const prevStart = now - 2 * days * DAY_MS;

  // Visits.
  const visitsBy = new Map<string, Visit[]>();
  for (const v of [...input.views].sort((a, b) => a.at - b.at)) {
    const list = visitsBy.get(v.visitor) ?? [];
    const last = list[list.length - 1];
    if (last && v.at - last.end <= VISIT_GAP_MS) {
      last.views.push(v);
      last.end = v.at;
    } else {
      list.push({
        visitor: v.visitor, start: v.at, end: v.at, views: [v], steps: [], acted: false,
        source: sourceOf(v.utmSource, v.referrer), device: v.device,
      });
    }
    list[list.length - 1].steps.push({ at: v.at, label: PAGE_LABEL[v.path] ?? 'Other page' });
    visitsBy.set(v.visitor, list);
  }
  const visits = [...visitsBy.values()].flat();

  // Conversations, and the visitor's clicks during them.
  const convos = buildConversations(input.chats);
  const reachedAt = new Map<string, number[]>();
  const intentAt = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string, at: number) => m.set(k, [...(m.get(k) ?? []), at]);
  const contactCounts = new Map<string, number>();
  const contactClicksIn = (s: number, e: number) =>
    input.events.filter((ev) => ev.name === 'contact_clicked' && ev.at >= s && ev.at < e).length;

  for (const ev of input.events) {
    const visit = visitAt(visitsBy.get(ev.visitor), ev.at);
    if (visit && ev.name !== 'stream_abandoned') visit.acted = true;
    let step: string | null = null;
    if (ev.name === 'project_opened') step = 'Project card';
    if (ev.name === 'concierge_opened') {
      step = 'Contact panel';
      push(intentAt, ev.visitor, ev.at);
    }
    if (ev.name === 'contact_clicked') {
      const ch = String(ev.props.channel ?? 'email');
      step = CONTACT_STEP[ch] ?? 'Clicked contact';
      push(intentAt, ev.visitor, ev.at);
      push(reachedAt, ev.visitor, ev.at);
      if (ev.at >= curStart) contactCounts.set(ch, (contactCounts.get(ch) ?? 0) + 1);
    }
    if (ev.name === 'brief_sent' && ev.props.channel !== 'form') {
      step = 'Sent note';
      push(reachedAt, ev.visitor, ev.at);
      if (ev.at >= curStart) contactCounts.set(`note (${ev.props.channel})`, (contactCounts.get(`note (${ev.props.channel})`) ?? 0) + 1);
    }
    if (step && visit) visit.steps.push({ at: ev.at, label: step });
  }
  for (const l of input.leads) {
    if (!l.session) continue;
    push(reachedAt, l.session, l.at);
    push(intentAt, l.session, l.at);
    const visit = visitAt(visitsBy.get(l.session), l.at);
    if (visit) visit.steps.push({ at: l.at, label: 'Sent lead' });
  }
  if (input.leads.some((l) => l.at >= curStart)) {
    contactCounts.set('lead form', input.leads.filter((l) => l.at >= curStart).length);
  }
  for (const c of convos) {
    for (const ev of input.events) {
      if (ev.name === 'project_opened' && ev.visitor === c.session && ev.at >= c.start - EARLY_MS && ev.at <= c.end + VISIT_GAP_MS) {
        c.curated.add('project');
      }
    }
    for (const t of c.turns) {
      const visit = visitAt(visitsBy.get(c.session), t.at);
      if (!visit) continue;
      visit.acted = true;
      visit.steps.push({ at: t.at, label: 'Asked' });
      if (t.story) visit.steps.push({ at: t.at + 1, label: 'Build story' });
      if (t.timeline) visit.steps.push({ at: t.at + 1, label: 'Timeline' });
    }
  }
  const reachedOutAfter = (visitor: string, from: number, to: number) =>
    (reachedAt.get(visitor) ?? []).some((at) => at >= from && at < to);

  // One window's totals.
  function window(s: number, e: number) {
    const vs = visits.filter((v) => v.start >= s && v.start < e);
    const views = input.views.filter((v) => v.at >= s && v.at < e);
    const visitors = new Set(vs.map((v) => v.visitor));
    const isNew = (id: string) => (input.firstSeen[id] ?? s) >= s;
    const cs = convos.filter((c) => c.start >= s && c.start < e);
    const chatters = new Set(cs.map((c) => c.session));
    const asked = [...visitors].filter((id) => chatters.has(id));
    const reached = [...visitors].filter((id) => reachedOutAfter(id, s, e));
    const engaged = views.map((v) => v.engagedMs).filter((x): x is number => x != null);
    const up = cs.reduce((a, c) => a + c.up, 0);
    const down = cs.reduce((a, c) => a + c.down, 0);
    const leads = input.leads.filter((l) => l.at >= s && l.at < e).length;
    return {
      visitors: visitors.size,
      newVisitors: [...visitors].filter(isNew).length,
      returningVisitors: [...visitors].filter((id) => !isNew(id)).length,
      visits: vs.length,
      pageViews: views.length,
      bounceRate: ratio(vs.filter((v) => v.views.length === 1 && !v.acted).length, vs.length),
      avgEngagedSec: engaged.length ? (mean(engaged) as number) / 1000 : null,
      usedBotRate: ratio(asked.length, visitors.size),
      conversations: cs.length,
      questions: cs.reduce((a, c) => a + c.turns.length, 0),
      curatedRate: ratio(cs.filter((c) => c.curated.size > 0).length, cs.length),
      thumbsUpRate: ratio(up, up + down),
      rated: up + down,
      avgQuestions: mean(cs.map((c) => c.turns.length)),
      reachedOutRate: ratio(reached.length, visitors.size),
      leads,
      contactClicks: contactClicksIn(s, e),
    };
  }
  const cur = window(curStart, now + 1);
  const prev = window(prevStart, curStart);
  const totals = Object.fromEntries(
    (Object.keys(cur) as (keyof typeof cur)[]).map((k) => [k, { cur: cur[k], prev: prev[k] }]),
  ) as TrafficReport['totals'];

  const curVisits = visits.filter((v) => v.start >= curStart);
  const curViews = input.views.filter((v) => v.at >= curStart);
  const curConvos = convos.filter((c) => c.start >= curStart);
  const curVisitors = new Set(curVisits.map((v) => v.visitor));
  const chatters = new Set(curConvos.map((c) => c.session));

  // Daily series, oldest first.
  const daily: TrafficReport['daily'] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = dayOf(now - d * DAY_MS);
    const vs = curViews.filter((v) => dayOf(v.at) === day);
    const cs = curConvos.filter((c) => dayOf(c.start) === day);
    const reachedOut =
      input.events.filter((ev) => dayOf(ev.at) === day && (ev.name === 'contact_clicked' || (ev.name === 'brief_sent' && ev.props.channel !== 'form'))).length +
      input.leads.filter((l) => dayOf(l.at) === day).length;
    daily.push({
      day,
      visitors: new Set(vs.map((v) => v.visitor)).size,
      pageViews: vs.length,
      conversations: cs.length,
      questions: cs.reduce((a, c) => a + c.turns.length, 0),
      reachedOut,
    });
  }

  // Pages.
  const pages = ['/', '/about', '/dashboard', '/other'].map((path) => {
    const vs = curViews.filter((v) => v.path === path);
    const landings = curVisits.filter((v) => v.views[0].path === path);
    const engaged = vs.map((v) => v.engagedMs).filter((x): x is number => x != null);
    return {
      path,
      views: vs.length,
      visitors: new Set(vs.map((v) => v.visitor)).size,
      landings: landings.length,
      bounceRate: ratio(landings.filter((v) => v.views.length === 1 && !v.acted).length, landings.length),
      avgEngagedSec: engaged.length ? (mean(engaged) as number) / 1000 : null,
    };
  }).filter((p) => p.views > 0);

  // Curated experience, by kind.
  const curated = {
    conversations: curConvos.length,
    any: curConvos.filter((c) => c.curated.size > 0).length,
    story: curConvos.filter((c) => c.curated.has('story')).length,
    timeline: curConvos.filter((c) => c.curated.has('timeline')).length,
    project: curConvos.filter((c) => c.curated.has('project')).length,
    projectCardShown: curConvos.filter((c) => c.projectCardShown).length,
  };

  const chatLength = [
    { label: '1 question', test: (n: number) => n === 1 },
    { label: '2–3', test: (n: number) => n >= 2 && n <= 3 },
    { label: '4–6', test: (n: number) => n >= 4 && n <= 6 },
    { label: '7 or more', test: (n: number) => n >= 7 },
  ].map((b) => ({ label: b.label, count: curConvos.filter((c) => b.test(c.turns.length)).length }));

  const convoVsAnswer = (['single', 'multi'] as const).map((kind) => {
    const cs = curConvos.filter((c) => (kind === 'single' ? c.turns.length === 1 : c.turns.length > 1));
    const up = cs.reduce((a, c) => a + c.up, 0);
    const down = cs.reduce((a, c) => a + c.down, 0);
    return {
      kind,
      label: kind === 'single' ? 'One question' : 'Conversation (2+ questions)',
      conversations: cs.length,
      thumbsUpRate: ratio(up, up + down),
      rated: up + down,
      curatedRate: ratio(cs.filter((c) => c.curated.size > 0).length, cs.length),
      reachedOutRate: ratio(cs.filter((c) => reachedOutAfter(c.session, c.start, c.end + DAY_MS)).length, cs.length),
    };
  });

  const curatedVisitors = new Set(curConvos.filter((c) => c.curated.size > 0).map((c) => c.session));
  const has = (m: Map<string, number[]>, id: string) => (m.get(id) ?? []).some((at) => at >= curStart);
  const funnel = [
    { label: 'Visited', visitors: curVisitors.size },
    { label: 'Asked the bot', visitors: [...curVisitors].filter((id) => chatters.has(id)).length },
    { label: 'Got a curated answer', visitors: [...curVisitors].filter((id) => curatedVisitors.has(id)).length },
    { label: 'Opened a way to contact', visitors: [...curVisitors].filter((id) => has(intentAt, id)).length },
    { label: 'Reached out', visitors: [...curVisitors].filter((id) => has(reachedAt, id)).length },
  ];

  // Sources and devices: from each visitor's first visit in the window.
  const firstVisit = new Map<string, Visit>();
  for (const v of curVisits) if (!firstVisit.has(v.visitor)) firstVisit.set(v.visitor, v);
  const groupStats = (key: (v: Visit) => string) => {
    const groups = new Map<string, string[]>();
    for (const [id, v] of firstVisit) groups.set(key(v), [...(groups.get(key(v)) ?? []), id]);
    return groups;
  };
  const sources = [...groupStats((v) => v.source)]
    .map(([source, ids]) => ({
      source,
      visitors: ids.length,
      usedBotRate: ratio(ids.filter((id) => chatters.has(id)).length, ids.length),
      reachedOutRate: ratio(ids.filter((id) => has(reachedAt, id)).length, ids.length),
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 10);
  const devices = [...groupStats((v) => v.device)]
    .map(([device, ids]) => {
      const vs = curVisits.filter((v) => ids.includes(v.visitor));
      return {
        device,
        visitors: ids.length,
        bounceRate: ratio(vs.filter((v) => v.views.length === 1 && !v.acted).length, vs.length),
        usedBotRate: ratio(ids.filter((id) => chatters.has(id)).length, ids.length),
      };
    })
    .sort((a, b) => b.visitors - a.visitors);

  // Flows: each visit's steps in order, repeats collapsed, first six kept.
  const flowCounts = new Map<string, number>();
  for (const v of curVisits) {
    const steps: string[] = [];
    for (const s of [...v.steps].sort((a, b) => a.at - b.at)) {
      if (steps[steps.length - 1] !== s.label) steps.push(s.label);
    }
    if (!v.acted && v.views.length === 1) steps.push('Left');
    const key = (steps.length > 6 ? [...steps.slice(0, 6), '…'] : steps).join(' → ');
    flowCounts.set(key, (flowCounts.get(key) ?? 0) + 1);
  }
  const flows = [...flowCounts]
    .map(([k, n]) => ({ steps: k.split(' → '), visits: n }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10);

  const contacts = [...contactCounts].map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count);

  const recentConversations: ConversationSummary[] = [...curConvos]
    .sort((a, b) => b.start - a.start)
    .slice(0, 15)
    .map((c) => {
      const v = firstVisit.get(c.session);
      return {
        startedAt: new Date(c.start).toISOString(),
        visitor: c.session,
        questions: c.turns.length,
        firstQuestion: c.turns[0].query.slice(0, 140),
        curated: [...c.curated],
        up: c.up,
        down: c.down,
        reachedOut: reachedOutAfter(c.session, c.start, c.end + DAY_MS),
        source: v?.source ?? null,
        device: v?.device ?? null,
      };
    });

  return {
    days,
    generatedAt: new Date(now).toISOString(),
    totals,
    daily,
    pages,
    curated,
    chatLength,
    convoVsAnswer,
    funnel,
    sources,
    devices,
    contacts,
    flows,
    recentConversations,
  };
}
