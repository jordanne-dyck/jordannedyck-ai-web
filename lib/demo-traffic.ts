import { buildTrafficReport, DAY_MS, type ChatIn, type EventIn, type LeadIn, type TrafficReport, type ViewIn } from './traffic-report';
import { trafficInsights, type TrafficInsight } from './traffic-insights';

// Made-up traffic for the public dashboard's sample admin view. Generated from
// a fixed seed, then run through the same lib/traffic-report.ts code as the real
// admin page, so the panels behave the way they would on real rows. Nothing
// here reads the database.

const QUESTIONS = [
  'What does Jordanne do?',
  'Tell me about her AI work',
  'How did she build this site?',
  'What was her role at Loblaw Digital?',
  'Has she managed a team?',
  'What is she looking for next?',
  'Show me her career timeline',
  'What results did she get at DECIEM?',
  'Does she have experience with marketplaces?',
  'How does she work with engineers?',
  'Is she open to contract work?',
  'What tools does she use for evals?',
];

// Mulberry32: small, fast, and the same sequence on every render.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, weighted: [T, number][]): T {
  const total = weighted.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [v, w] of weighted) {
    x -= w;
    if (x <= 0) return v;
  }
  return weighted[weighted.length - 1][0];
}

export function sampleTraffic(days = 30, now = Date.now()): { report: TrafficReport; insights: TrafficInsight[] } {
  const r = rng(20261116);
  const views: ViewIn[] = [];
  const events: EventIn[] = [];
  const chats: ChatIn[] = [];
  const leads: LeadIn[] = [];
  const firstSeen: Record<string, number> = {};
  const seen: string[] = [];
  let n = 0;

  const start = now - 2 * days * DAY_MS;
  for (let d = 0; d < 2 * days; d++) {
    const dayStart = start + d * DAY_MS;
    // Slow growth, a weekday bump, and a spike when a post went out.
    const weekday = new Date(dayStart).getUTCDay();
    const base = 14 + d * 0.35 + (weekday === 0 || weekday === 6 ? -5 : 3) + (d === 2 * days - 9 ? 40 : 0);
    const count = Math.max(3, Math.round(base + (r() - 0.5) * 8));

    for (let i = 0; i < count; i++) {
      const returning = seen.length > 20 && r() < 0.18;
      const visitor = returning ? seen[Math.floor(r() * seen.length)] : `v${++n}`;
      if (!returning) seen.push(visitor);
      let at = dayStart + Math.floor(r() * (DAY_MS - 2 * 60 * 60 * 1000));
      if (!(visitor in firstSeen) || firstSeen[visitor] > at) firstSeen[visitor] = at;

      const device = r() < 0.58 ? 'mobile' : 'desktop';
      const source = pick<[string | null, string | null]>(r, [
        [[null, 'linkedin.com'], 34],
        [[null, null], 30],
        [[null, 'google.com'], 14],
        [[null, 'github.com'], 7],
        [['resume', null], 9],
        [[null, 'indeed.com'], 6],
      ]);
      const landing = pick(r, [['/', 80], ['/about', 12], ['/dashboard', 8]]);
      let v = 0;
      const view = (path: string, engagedMs: number) => {
        views.push({ at, viewId: `${visitor}-${d}-${i}-${v++}`, visitor, path, referrer: v === 1 ? source[1] : null, utmSource: v === 1 ? source[0] : null, device, engagedMs });
      };
      const bounce = r() < (device === 'mobile' ? 0.52 : 0.36);
      if (bounce) {
        view(landing, 2000 + Math.floor(r() * 14000));
        continue;
      }
      view(landing, 20000 + Math.floor(r() * 180000));

      const asks = landing === '/' ? r() < 0.62 : r() < 0.3;
      if (asks) {
        at += 15000;
        const turns = pick(r, [[1, 52], [2, 18], [3, 12], [4, 8], [5, 4], [7, 4], [9, 2]]);
        const story = r() < 0.16;
        const timeline = r() < 0.22;
        for (let t = 0; t < turns; t++) {
          at += 20000 + Math.floor(r() * 40000);
          const vote = r() < 0.16 ? (r() < 0.8 ? 'up' : 'down') : null;
          chats.push({
            at, session: visitor, turnIndex: t + 1, query: QUESTIONS[Math.floor(r() * QUESTIONS.length)], rateLimited: false,
            story: story && t === 0, timeline: timeline && t === Math.min(1, turns - 1), projectCard: r() < 0.3, vote,
          });
          if (r() < 0.12) events.push({ at: at + 5000, visitor, name: 'project_opened', props: { from: 'card' } });
        }
        // Some who see the build story click through to the code.
        if (story && r() < 0.3) {
          events.push({ at: at + 8000, visitor, name: 'story_link_clicked', props: { target: r() < 0.6 ? 'repo_web' : 'repo_ai' } });
        }
        const intent = r() < (turns > 1 ? 0.22 : 0.08);
        if (intent) {
          at += 30000;
          events.push({ at, visitor, name: 'concierge_opened', props: { from: 'after_answer' } });
          // In the panel: send the form (a lead), email or copy the note, or leave.
          const sends = r();
          if (sends < 0.35) {
            leads.push({ at: at + 90000, session: visitor });
            events.push({ at: at + 90000, visitor, name: 'brief_sent', props: { channel: 'form', edited: false } });
          } else if (sends < 0.5) {
            events.push({ at: at + 60000, visitor, name: 'brief_sent', props: { channel: sends < 0.45 ? 'email' : 'copy', edited: false } });
          }
        }
      }
      if (r() < 0.3) {
        at += 30000;
        view(landing === '/about' ? '/' : '/about', 10000 + Math.floor(r() * 90000));
      }
      if (r() < 0.07) {
        events.push({ at: at + 10000, visitor, name: 'contact_clicked', props: { where: 'footer', channel: pick(r, [['linkedin', 5], ['github', 3], ['vcard', 1], ['phone', 1]]) } });
      }
    }
  }
  const report = buildTrafficReport({ days, now, views, events, chats, leads, firstSeen });
  return { report, insights: trafficInsights(report) };
}
