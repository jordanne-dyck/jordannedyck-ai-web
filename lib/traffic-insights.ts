import type { FunnelKey, TrafficReport } from './traffic-report';

// Rules that turn the traffic report into things to look at (2026-11-16).
// Each fires only above a minimum sample, and says what it's based on. They
// point at where to look; they don't say why. The answer-quality rules live
// on /dashboard/admin/insights (the fix list) and are linked, not repeated.

export type InsightArea = 'Answers' | 'Experience' | 'Acquisition' | 'Conversion';

export type TrafficInsight = {
  area: InsightArea;
  tone: 'act' | 'watch' | 'good';
  headline: string;
  detail: string;
  href?: string;
};

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);

// Funnel steps whose visitors all took the step before as well.
const NARROWS: ReadonlySet<FunnelKey> = new Set(['asked', 'curated', 'reached']);

// Form sends needed before conversations are compared with single answers.
// One or two is not a pattern.
const MIN_FORM_SENDS = 3;

export function trafficInsights(r: TrafficReport): TrafficInsight[] {
  const out: TrafficInsight[] = [];
  const t = r.totals;
  const visitors = t.visitors.cur ?? 0;
  const convos = t.conversations.cur ?? 0;

  if (visitors < 30) {
    out.push({
      area: 'Acquisition', tone: 'watch',
      headline: `${visitors} visitors in the last ${r.days} days`,
      detail: 'Under 30, so every rate below swings on a few people. Read them as anecdotes, not trends.',
    });
  }

  // Acquisition.
  const vPrev = t.visitors.prev ?? 0;
  if (vPrev >= 20 && visitors > 0) {
    const change = (visitors - vPrev) / vPrev;
    if (Math.abs(change) >= 0.3) {
      out.push({
        area: 'Acquisition', tone: change > 0 ? 'good' : 'watch',
        headline: `Visitors ${change > 0 ? 'up' : 'down'} ${pct(Math.abs(change))} on the previous ${r.days} days`,
        detail: `${visitors} against ${vPrev}. Check the sources table for which channel moved.`,
      });
    }
  }
  const direct = r.sources.find((s) => s.source === 'Direct');
  if (direct && visitors >= 30 && direct.visitors / visitors > 0.5) {
    out.push({
      area: 'Acquisition', tone: 'watch',
      headline: `${pct(direct.visitors / visitors)} of visitors arrive with no source`,
      detail: 'Apps, email and PDFs strip the referrer. Tag the links you share, e.g. jordannedyck.com/?utm_source=resume, and they show by name here.',
    });
  }
  const avgBot = t.usedBotRate.cur;
  for (const s of r.sources) {
    if (s.visitors >= 15 && avgBot != null && s.usedBotRate != null && s.usedBotRate < avgBot / 2) {
      out.push({
        area: 'Acquisition', tone: 'watch',
        headline: `${s.source} visitors rarely ask the bot (${pct(s.usedBotRate)} against ${pct(avgBot)} overall)`,
        detail: `${s.visitors} visitors. They may expect a plain resume: check what that link promises.`,
      });
    }
  }

  // Experience.
  if (visitors >= 30 && avgBot != null && avgBot < 0.25) {
    out.push({
      area: 'Experience', tone: 'act',
      headline: `${pct(avgBot)} of visitors ask the bot`,
      detail: 'Most leave without trying it. The first screen decides this: the hero button, the chips, and whether it reads as a chat at all.',
    });
  }
  const home = r.pages.find((p) => p.path === '/');
  if (home && home.landings >= 20 && home.bounceRate != null && home.bounceRate > 0.6) {
    out.push({
      area: 'Experience', tone: 'act',
      headline: `${pct(home.bounceRate)} of visits that land on the home page leave without doing anything`,
      detail: `${home.landings} landings. A bounce here is one page view, no click and no question.`,
    });
  }
  const mobile = r.devices.find((d) => d.device === 'mobile');
  const desktop = r.devices.find((d) => d.device === 'desktop');
  if (mobile && desktop && mobile.visitors >= 15 && desktop.visitors >= 15 && mobile.bounceRate != null && desktop.bounceRate != null) {
    const gap = mobile.bounceRate - desktop.bounceRate;
    if (gap >= 0.15) {
      out.push({
        area: 'Experience', tone: 'act',
        headline: `Phones bounce ${Math.round(gap * 100)} points more than desktop`,
        detail: `${pct(mobile.bounceRate)} against ${pct(desktop.bounceRate)}. Try the first screen on a phone: keyboard, chips and the answer area.`,
      });
    }
  }
  if (convos >= 20 && r.curated.conversations && r.curated.any / r.curated.conversations < 0.2) {
    out.push({
      area: 'Experience', tone: 'watch',
      headline: `${pct(r.curated.any / r.curated.conversations)} of conversations reach the build story, timeline or a project card`,
      detail: 'The curated pieces are where the site shows the most. Few visitors find them from what they ask.',
    });
  }
  const questions = t.questions.cur ?? 0;
  if (questions >= 50 && (t.rated.cur ?? 0) / questions < 0.05) {
    out.push({
      area: 'Experience', tone: 'watch',
      headline: `${t.rated.cur ?? 0} of ${questions} answers rated`,
      detail: 'Under 5%, so the thumbs-up rate says little. The thumbs may be hard to see.',
    });
  }

  // Answers.
  const thumbs = t.thumbsUpRate.cur;
  if ((t.rated.cur ?? 0) >= 10 && thumbs != null && thumbs < 0.75) {
    out.push({
      area: 'Answers', tone: 'act',
      headline: `${pct(thumbs)} of rated answers got a thumbs up`,
      detail: `${t.rated.cur} ratings. The thumbs-down answers are in the fix list.`,
      href: '/dashboard/admin/insights',
    });
  }
  const single = r.convoVsAnswer.find((c) => c.kind === 'single');
  const multi = r.convoVsAnswer.find((c) => c.kind === 'multi');
  if (single && convos >= 20 && single.conversations / convos > 0.6) {
    out.push({
      area: 'Answers', tone: 'watch',
      headline: `${pct(single.conversations / convos)} of conversations stop after one question`,
      detail: 'Either the first answer was enough or it gave no reason to go on. Read a few in the list below to tell which.',
      href: '/dashboard/admin/insights',
    });
  }

  // Conversion. Reaching out is the contact form sent, within a day of the
  // conversation.
  if (single && multi && single.conversations >= 10 && multi.conversations >= 10 && single.reachedOutRate != null && multi.reachedOutRate != null) {
    const sent = (c: typeof single) => Math.round((c.reachedOutRate ?? 0) * c.conversations);
    const counts = `The contact form was sent after ${sent(multi)} of ${multi.conversations} conversations and ${sent(single)} of ${single.conversations} single answers.`;
    const enough = sent(multi) + sent(single) >= MIN_FORM_SENDS;
    if (enough && multi.reachedOutRate >= Math.max(single.reachedOutRate * 1.5, single.reachedOutRate + 0.05)) {
      out.push({
        area: 'Conversion', tone: 'good',
        headline: `Conversations reach out ${pct(multi.reachedOutRate)}, single answers ${pct(single.reachedOutRate)}`,
        detail: `${counts} Getting a second question matters more than polishing the first answer: follow-up chips and endings that invite one.`,
      });
    } else if (enough && single.reachedOutRate >= multi.reachedOutRate * 1.5 && single.reachedOutRate > 0) {
      out.push({
        area: 'Conversion', tone: 'watch',
        headline: `Single answers reach out more often than conversations (${pct(single.reachedOutRate)} against ${pct(multi.reachedOutRate)})`,
        detail: `${counts} Long conversations may be people who don’t find what they need. Read the longer ones.`,
      });
    }
  }
  for (let i = 1; i < r.funnel.length; i++) {
    const from = r.funnel[i - 1];
    const to = r.funnel[i];
    // Only steps that are part of the one before. The other two are not: a
    // visitor can look you up without a curated answer, and open the contact
    // panel without looking you up.
    if (!NARROWS.has(to.key)) continue;
    if (from.visitors >= 20 && to.visitors / from.visitors < 0.2) {
      out.push({
        area: 'Conversion', tone: 'watch',
        headline: `${pct(to.visitors / from.visitors)} go from “${from.label}” to “${to.label}”`,
        detail: `${to.visitors} of ${from.visitors} visitors: the biggest drop in the funnel to look at first.`,
      });
      break;
    }
  }
  const panel = r.funnel.find((f) => f.key === 'panel')?.visitors ?? 0;
  const reached = r.funnel.find((f) => f.key === 'reached')?.visitors ?? 0;
  if (panel >= 10 && reached / panel < 0.3) {
    out.push({
      area: 'Conversion', tone: 'act',
      headline: `${panel} visitors opened the contact panel, ${reached} sent the form`,
      detail: 'The rest left the panel without sending it. Some may have copied the note or emailed it themselves: that counts as looked you up. Check the form length and the consent wording on a phone.',
      href: '/dashboard/admin/leads',
    });
  }

  const order: Record<TrafficInsight['tone'], number> = { act: 0, watch: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
