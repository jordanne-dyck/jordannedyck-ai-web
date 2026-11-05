// Career timeline (decided 2026-11-04: option B, an animated card; a full-screen
// story may follow). Shown under an answer that cites her career-trajectory
// chunks, once per visit, and again whenever the question asks for it.
//
// The copy is hand-written from jordannedyck-ai/knowledge-base/experience/
// professional-overview.md (exp-027 to exp-030, and exp-042, which holds the
// whole timeline and arc) and checked by Jordanne. Nothing keeps the two in
// sync.

export type Role = {
  title: string;
  // 'YYYY-MM', or 'YYYY' where only the year is known (education). `end` is
  // null for the current role.
  start: string;
  end: string | null;
  // Project slugs from lib/projects.ts, shown as buttons under the role.
  projects?: string[];
};

export type Employer = {
  org: string;
  line?: string;
  roles: Role[];
  // false: the name can't be tapped to zoom in, like a role title.
  zoom?: false;
};

// Newest first, as the card lists them. Roles newest first within an employer.
// Warai Neko is a personal project marker for now, not a section (Jordanne,
// 2026-11-04, reversing the same day's employer entry).
export const CAREER: Employer[] = [
  {
    org: 'DECIEM',
    line: 'Annual DTC revenue from near-zero to $150M+',
    roles: [
      {
        title: 'Director, Digital Product Management – Global',
        start: '2022-01',
        end: '2025-10',
        projects: [
          'agentic-personal-shopper',
          'ai-customer-service-optimization',
          'tiktok-shop-integration',
          'google-gemini-enterprise-deployment',
          'abnormal-innovation',
          'brand-incubator-ecosystem',
          'personalization-roadmap-and-measurement',
        ],
      },
      {
        title: 'Digital Director – Global',
        start: '2020-06',
        end: '2021-12',
        projects: ['digital-transformation-salesforce', 'regimen-builder'],
      },
      { title: 'Head of Digital – Global', start: '2019-06', end: '2020-05' },
    ],
  },
  {
    org: 'Loblaw Digital',
    line: 'Growth and CRM across the Loblaw digital portfolio, 16M+ loyalty customers',
    roles: [
      { title: 'Growth Marketing Manager', start: '2018-08', end: '2019-05' },
      { title: 'Specialist, Demand Generation', start: '2016-02', end: '2018-07' },
    ],
  },
  // Three employers as one entry, so their names don't crowd the full view
  // (decided 2026-11-04). Each role names its employer instead.
  {
    org: 'Early career',
    line: 'Consumer insights, B2B marketing and bilingual customer support',
    roles: [
      { title: 'Marketing Coordinator, National Wholesale · Loblaw Companies', start: '2015-01', end: '2016-02' },
      { title: 'Marketing Analyst · Shoppers Drug Mart', start: '2011-05', end: '2014-12' },
      { title: 'Bilingual Customer Programs Assistant · Kenna', start: '2010-05', end: '2010-12' },
      { title: 'Bilingual Call Centre Representative · Shoppers Drug Mart', start: '2009-05', end: '2009-08' },
    ],
  },
];

// Education and certifications, newest first, from exp-031. The knowledge base
// gives years only; the months are Jordanne's (2026-11-04). U of T's start
// month is not known, so it shows as a year.
export const EDUCATION: Employer[] = [
  {
    org: 'Product Faculty',
    line: 'Delivered through Maven',
    roles: [{ title: 'AI Product Management Certification, Cohort 6', start: '2026-03', end: '2026-03' }],
  },
  {
    org: 'University of Toronto',
    // A certificate course: not worth zooming into (Jordanne, 2026-11-04).
    zoom: false,
    roles: [{ title: 'Certificate in Digital Marketing', start: '2015', end: '2016-02' }],
  },
  {
    org: 'University of Guelph',
    line: 'Co-op',
    roles: [
      { title: 'Certificate in Leadership', start: '2013-05', end: '2013-05' },
      { title: 'Bachelor of Commerce, Marketing Management', start: '2008-09', end: '2013-05' },
    ],
  },
];

// Personal projects, not done for any employer: on the timeline by themselves
// (decided 2026-11-04). `start` is a year where the month is not known; the AI
// resume's month is Jordanne's.
export const SIDE_PROJECTS: { slug: string; start: string }[] = [
  { slug: 'ai-resume', start: '2025-10' },
  { slug: 'warai-neko', start: '2026-06' },
];

// The moments the animation stops at, oldest first (chosen 2026-11-04). Each
// title names the project or theme, never the employer: the timeline already
// shows that (decided 2026-11-04). `at` is
// where the playhead pauses; `view` is the stretch of years zoomed into. The
// captions are short enough to read in the pause, and come from exp-001,
// exp-027, exp-028 and the project files. Each `view` puts `at` about 60% down
// the frame, clear of the caption at the top on phones. A number in {braces} counts up as
// the caption appears. `project` shows that project's first image or clip.
export type Moment = { at: string; view: [string, string]; when: string; head: string; text: string; project?: string };

export const MOMENTS: Moment[] = [
  {
    at: '2016-02',
    view: ['2013-08', '2017-08'],
    when: '2016',
    head: 'Into digital',
    text: 'Growth and CRM across the Loblaw digital portfolio, {16}M+ loyalty customers',
  },
  {
    at: '2019-06',
    view: ['2017-04', '2020-10'],
    when: '2019',
    head: 'Building digital from near-zero',
    text: 'Head of Digital. DTC revenue grows to ${150}M+',
    project: 'growth-and-acquisition',
  },
  {
    // Added 2026-11-04. A users-vs-non-users comparison, not an A/B test, as
    // the Regimen Builder card says.
    at: '2021-03',
    view: ['2019-10', '2022-02'],
    when: '2021',
    head: 'Regimen Builder',
    text: 'Personalized routines: users convert {35}% better than non-users and spend {40}% more',
    project: 'regimen-builder',
  },
  {
    at: '2024-06',
    view: ['2022-08', '2025-05'],
    when: '2024–25',
    head: 'AI in production',
    text: 'AI Personal Shopper at NRF 2025; service resolution {86}% faster',
    project: 'agentic-personal-shopper',
  },
];

// The chunks that hold her role history. An answer citing any of them gets the
// timeline. By chunk id, not file: the same file holds the career summary and
// competencies, which are cited for almost everything. If these ids are
// renumbered in the knowledge base, change them here. Not exp-031, education:
// an education answer would always bring the whole timeline (Jordanne,
// 2026-11-04).
const CAREER_CHUNKS = new Set(['exp-027', 'exp-028', 'exp-029', 'exp-030', 'exp-042']);

export function citesCareer(citedIds: string[]): boolean {
  return citedIds.some((id) => CAREER_CHUNKS.has(id));
}

// For an answer with no citations at all: whether the top retrieved chunk is
// role history. The top one only, so an answer that retrieved a career chunk
// in passing doesn't get the timeline.
export function leadsWithCareer(chunks: { chunk_id: string | null }[]): boolean {
  const top = chunks[0]?.chunk_id;
  return !!top && CAREER_CHUNKS.has(top);
}

// A question that names the timeline, e.g. "show the timeline again".
export function asksForTimeline(query: string): boolean {
  return /\btime ?line\b/i.test(query);
}

// A question asking for her career as a whole: the timeline is the answer,
// inside a fixed lead (FIXED_LEAD), and it shows even when it was already
// shown this visit (decided 2026-11-04). Includes every question that names
// the timeline.
export function asksForOverview(query: string): boolean {
  return (
    asksForTimeline(query) ||
    /\bcareer\s+(?:history|path|journey|story|arc|overview|so far)\b|\bwork\s+history\b|\bwalk\s+(?:me|us)\s+through\s+(?:her|jordanne'?s?)\s+(?:career|experience|background)\b/i.test(query)
  );
}

// Where the timeline goes in an answer: on its own line, the page plays the
// timeline there (decided 2026-11-04). Braces, not square brackets, which the
// citation code treats as chunk ids.
export const TIMELINE_MARKER = '{{timeline}}';
const MARKER_RE = /[ \t]*\{\{\s*timeline\s*\}\}[ \t]*/i;

// The answer to an overview question: Jordanne's own words, not the model's
// (decided 2026-11-04, option D). Generated overviews broke the shape, walked
// through her jobs and went uncited (backend results log R-20261104-17). The
// model is not called for these. Text final with her OK, 2026-11-04; the 4M+ is
// DTC customers, as exp-042 says.
export const FIXED_LEAD = [
  "Jordanne's career runs from the human side of helping customers to the digital side. She started in bilingual frontline support at the Shoppers Drug Mart call centre, and has since built the systems that decide where people help customers and where technology does: at DECIEM, Regimen Builder, the AI Personal Shopper and automated service that cut resolution time 86%, while annual DTC revenue grew to $150M+ with 4M+ DTC customers globally.",
  TIMELINE_MARKER,
  'Today she runs Warai Neko, her independent practice, bringing that work to small businesses while continuing to refine her AI building skills with this AI-powered resume and portfolio system among other hobby projects.',
].join('\n\n');

// A question naming the timeline after it has shown this visit: the timeline
// again, without repeating the lead. No suggested questions in the text; they
// stay as buttons (decided 2026-10-20, kept 2026-11-04).
export const TIMELINE_REPLAY = ["Here's her timeline again.", TIMELINE_MARKER].join('\n\n');

export function isTimelineReplay(query: string, timelineShown: boolean): boolean {
  return timelineShown && asksForTimeline(query);
}

// The answer without the placeholder: for the log, the labels and the
// grounding judge, so it is never read as an uncited claim.
export function withoutTimelineMarker(answer: string): string {
  return answer.replace(new RegExp(MARKER_RE.source + '(?:\\r?\\n)?', 'gi'), '');
}

// The answer split at the placeholder: the text before the timeline, and the
// text after it (null when there is no placeholder). While the answer streams,
// a placeholder still arriving at the end is hidden.
export function splitAtTimeline(answer: string): [string, string | null] {
  const text = answer.replace(/\{(?:\{[a-z\s]*\}?)?$/i, '');
  const m = text.match(MARKER_RE);
  if (!m || m.index === undefined) return [text, null];
  return [text.slice(0, m.index).trimEnd(), text.slice(m.index + m[0].length).trimStart()];
}
