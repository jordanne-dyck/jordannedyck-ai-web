// Career timeline (decided 2026-11-04: option B, an animated card; a full-screen
// story may follow). Shown under an answer that cites her career-trajectory
// chunks, once per visit, and again whenever the question asks for it.
//
// The copy is hand-written from jordannedyck-ai/knowledge-base/experience/
// professional-overview.md (exp-027 to exp-030) and checked by Jordanne. The
// 2009 Shoppers Drug Mart role came from her directly and is not in the
// knowledge base yet. Nothing keeps the two in sync.

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
};

// Newest first, as the card lists them. Roles newest first within an employer.
// Warai Neko is on the timeline as well as having a project card (decided
// 2026-11-04, reversing the same day's formal-roles-only).
export const CAREER: Employer[] = [
  {
    org: 'Warai Neko',
    line: 'Her independent practice: digital strategy for small businesses',
    roles: [{ title: 'Digital Strategist', start: '2026-06', end: null, projects: ['warai-neko'] }],
  },
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
  {
    org: 'Loblaw Companies',
    line: 'Consumer insights at Shoppers Drug Mart, then B2B marketing',
    roles: [
      { title: 'Marketing Coordinator, National Wholesale', start: '2015-01', end: '2016-02' },
      { title: 'Marketing Analyst, Shoppers Drug Mart', start: '2011-05', end: '2014-12' },
    ],
  },
  {
    org: 'Kenna',
    line: 'Bilingual customer programs',
    roles: [{ title: 'Bilingual Customer Programs Assistant', start: '2010-05', end: '2010-12' }],
  },
  {
    org: 'Shoppers Drug Mart',
    line: 'Bilingual frontline support across pharmacy, stores, loyalty and pricing',
    roles: [{ title: 'Bilingual Call Centre Representative', start: '2009-05', end: '2009-08' }],
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
export const SIDE_PROJECTS: { slug: string; start: string }[] = [{ slug: 'ai-resume', start: '2025-10' }];

// The moments the animation stops at, oldest first (chosen 2026-11-04). Each
// title names the project or theme, never the employer: the timeline already
// shows that (decided 2026-11-04). `at` is
// where the playhead pauses; `view` is the stretch of years zoomed into. The
// captions are short enough to read in the pause, and come from exp-001,
// exp-027, exp-028 and the project files. A number in {braces} counts up as
// the caption appears. `project` shows that project's first image or clip.
export type Moment = { at: string; view: [string, string]; when: string; head: string; text: string; project?: string };

export const MOMENTS: Moment[] = [
  {
    at: '2016-02',
    view: ['2014-06', '2018-06'],
    when: '2016',
    head: 'Into digital',
    text: 'Growth and CRM across the Loblaw digital portfolio, {16}M+ loyalty customers',
  },
  {
    at: '2019-06',
    view: ['2018-03', '2021-09'],
    when: '2019',
    head: 'Building digital from near-zero',
    text: 'Head of Digital. DTC revenue grows to ${150}M+',
    project: 'growth-and-acquisition',
  },
  {
    // Added 2026-11-04. A users-vs-non-users comparison, not an A/B test, as
    // the Regimen Builder card says.
    at: '2021-03',
    view: ['2020-04', '2022-10'],
    when: '2021',
    head: 'Regimen Builder',
    text: 'Personalized routines: users convert {35}% better than non-users and spend {40}% more',
    project: 'regimen-builder',
  },
  {
    at: '2024-06',
    view: ['2023-01', '2026-03'],
    when: '2024–25',
    head: 'AI in production',
    text: 'AI Personal Shopper at NRF 2025; service resolution {86}% faster',
    project: 'agentic-personal-shopper',
  },
];

// The chunks that hold her role history. An answer citing any of them gets the
// timeline. By chunk id, not file: the same file holds the career summary and
// competencies, which are cited for almost everything. If these ids are
// renumbered in the knowledge base, change them here.
const CAREER_CHUNKS = new Set(['exp-027', 'exp-028', 'exp-029', 'exp-030']);

export function citesCareer(citedIds: string[]): boolean {
  return citedIds.some((id) => CAREER_CHUNKS.has(id));
}

// A question that asks for the timeline itself, e.g. "show the timeline again".
// These show it even when it was already shown this visit.
export function asksForTimeline(query: string): boolean {
  return /\btime ?line\b/i.test(query);
}

// A question asking for her career as a whole: the timeline is the answer, so
// the written answer is kept short (decided 2026-11-04). Includes every
// question that names the timeline.
export function asksForOverview(query: string): boolean {
  return (
    asksForTimeline(query) ||
    /\bcareer\s+(?:history|path|journey|story|arc|overview|so far)\b|\bwork\s+history\b|\bwalk\s+(?:me|us)\s+through\s+(?:her|jordanne'?s?)\s+(?:career|experience|background)\b/i.test(query)
  );
}

// Added to the system prompt for an overview question when the timeline will
// show. Not in jordannedyck-ai/run_eval.py's SYSTEM_PROMPT yet: these answers
// are flagged timeline_prompt in chat_events so evals can tell them apart
// (gap accepted 2026-11-04; add it to the backend before prod).
export const TIMELINE_NOTE =
  '# THIS ANSWER\n\nAn animated timeline of her whole career, with every role, date and school, appears directly under this answer. ' +
  'Write 2 to 3 sentences on the arc of her career and what connects it, citing as usual. Do not list roles, employers or dates: the timeline shows them.';
