// The build story (Q2, decided 2026-11-08: option C, "follow your own
// question"). A question about how this site was built gets Jordanne's fixed
// lead, with a five-stop trace of what happened to the visitor's own question
// where the marker sits. Plan: nimbalyst-local/plans/build-story.md.
//
// The lead is Jordanne's text, final with her OK on 2026-11-08. The stops are
// hand-written from the files named beside each one, checked at source that
// day. Nothing keeps them in sync: if a figure changes there, change it here.
//
// Kept free of imports so scripts/build-story.test.mjs can load it.

// Where the trace goes in the answer. Braces, not square brackets, which the
// citation code treats as chunk ids (as with the timeline's marker).
export const STORY_MARKER = '{{story}}';
const MARKER_RE = /[ \t]*\{\{\s*story\s*\}\}[ \t]*/i;

// The question that names this site, chatbot or resume, about how it was built
// or how it works. Needs a self-reference, so "How did she build the AI
// Personal Shopper?" and "Is Jordanne available to build a site for us?" don't
// match. Cases in scripts/build-story.test.mjs.
const SELF =
  /\b(?:this|your)\s+(?:web\s*site|site|chat\s*bot|bot|assistant|ai[- ]powered\s+resume|ai\s+resume|resume\s+site|portfolio\s+site)\b|\bthe\s+(?:chat\s*bot|bot)\b|\bjordbot\b|\bjordannedyck(?:\.com)?\b/i;
const HOW =
  /\b(?:build|built|building|made|make|created|developed|engineered|architected|works?|architecture|tech\s+stack|stack|under\s+the\s+hood|behind)\b|\btell\s+(?:me|us)\s+about\b|\bwhat\s+is\b|\bwhat'?s\b/i;
// "How were you built?", asked of jordbot itself.
const YOU = /\bhow\s+(?:were|are|was)\s+you\s+(?:built|made|created|developed)\b|\bhow\s+do\s+you\s+work\b/i;

export function asksForBuildStory(query: string): boolean {
  return YOU.test(query) || (SELF.test(query) && HOW.test(query));
}

// The ai-resume card's own question opens the story, but only from that card:
// typed with no subject, "How did she build it?" stays a normal answer. The
// page sends the card's slug with panel questions (decided 2026-11-08).
export const STORY_CARD = { slug: 'ai-resume', question: 'How did she build it?' };

export function storyFromCard(projectSlug: string | null, query: string): boolean {
  return projectSlug === STORY_CARD.slug && query.trim() === STORY_CARD.question;
}

// The answer: Jordanne's own words, not the model's (decided 2026-11-08). The
// model is not called; retrieval still runs, for the log. Final with her OK,
// 2026-11-08, with two fixes reported to her: the MCP line filled from
// proj-ai-resume-001, and "test the site regularly".
export const STORY_LEAD = [
  "**What it is.** Jordanne's career as a live chat you can question. It runs as two parts:",
  "- **jordannedyck.com**, the website you're on\n- **jordbot**, the search over her sources, the eval harness and a custom MCP server",
  STORY_MARKER,
  '**Why she built it.** Jordanne built jordbot after losing her job in late 2025. She saw a chance to put her digital skills to work on the job search itself: a resume that shows what she can do, instead of words on a page. The first working version took about five days. She has kept improving it since, with new features, bug fixes and better workflows.',
  "**What's inside**",
  [
    '- **Human and digital.** jordbot answers what her sources cover. Anything for Jordanne herself, like hiring or availability, goes to her with a note drafted from the chat, so you never repeat yourself.',
    '- **Composable.** The website, the search and the answers are separate parts, so one can change without the others. Extending jordbot to more surfaces like email, ad space or direct to a recruiter\'s own AI tools could come next.',
    '- **Custom MCP server.** Lets an AI assistant like Claude search her knowledge base directly, so it can answer questions about her background mid-conversation.',
    '- **Evals.** 90+ test cases, with automated and human checks.',
    '- **Monitoring.** A [dashboard](https://jordannedyck.com/dashboard) shows chat requests, cost, topics etc. Automated checks test the site regularly to make sure everything is running.',
    '- **The knowledge base.** A structured database of her career including roles, projects, experience, etc. in her own words.',
    '- **UI.** An animated career timeline, project cards, numbered sources under every answer, this trace.',
  ].join('\n'),
].join('\n\n');

// Asked again after the story has shown this visit: the trace again, without
// repeating the lead.
export const STORY_REPLAY = ["Here's the trace again.", STORY_MARKER].join('\n\n');

// The five stops the visitor's question passes through. `parts` names the
// pieces; `detail` is the decision behind the stop and how she knows it works.
export type Stop = { title: string; parts: string; detail: string; fork?: true };

export const STOPS: Stop[] = [
  {
    // lib/rate-limit.ts:7-8, lib/chat-input.ts (MAX_USER_MESSAGE_CHARS), lib/ip.ts
    title: 'Website checks it',
    parts: 'Next.js · rate limit · length cap',
    detail: '20 questions an hour and 100 a day per visitor, 2,000 characters each. Your IP is kept only as a salted hash.',
  },
  {
    // lib/query-rewrite.ts; route.ts n_results 5; retrieval.py VECTOR_LOCK and
    // max_per_source (ai); results log R-20261030-13 (ai)
    title: 'Search her sources',
    parts: 'Flask · FAISS · keyword + vector',
    detail:
      'A follow-up like "tell me more" is rewritten into a full question first. Then the top five passages, no more than three from one file. She tested two newer embedding models. Both ranked her sources worse (MRR down about 0.11), so she kept the old one.',
  },
  {
    // EVALS.md:75-100 (ai); the 2026-10-19 blind sample (ai CLAUDE.local.md);
    // lib/cite-reminder.ts:3-7
    title: 'Write a cited answer',
    parts: 'gpt-4o · citations',
    detail:
      'Chosen in a four-model test. In her blind read Gemini Flash scored higher, but it missed the 15-second limit on 34 of 35 answers. gpt-4o: 1.88 s typical, under a cent an answer. When follow-up answers stopped citing, one reminder line took them from 17 of 36 cited to 36 of 36.',
  },
  {
    // lib/classify.ts:10-16; app/dashboard; README.md:50-56 (ai), 29 regression cases
    title: 'Check every claim',
    parts: 'judge · Postgres · dashboard',
    detail:
      'After you have your answer, a second model checks each cited claim against its source, so you never wait for it. Every question is logged, and the public dashboard shows the totals. Each defect found becomes a permanent test case: 29 so far.',
  },
  {
    // lib/concierge.ts (the concierge pilot)
    title: 'AI or Jordanne',
    parts: 'the concierge',
    detail:
      "jordbot answers what her sources cover. Anything that needs a person goes to Jordanne, with a note drafted from your conversation so you don't repeat yourself.",
    fork: true,
  },
];

// The answer without the placeholder: for the log, the labels and the judge.
export function withoutStoryMarker(answer: string): string {
  return answer.replace(new RegExp(MARKER_RE.source + '(?:\\r?\\n)?', 'gi'), '');
}

// The answer split at the placeholder: the text before the trace, and the text
// after it (null when there is none).
export function splitAtStory(answer: string): [string, string | null] {
  const m = answer.match(MARKER_RE);
  if (!m || m.index === undefined) return [answer, null];
  return [answer.slice(0, m.index).trimEnd(), answer.slice(m.index + m[0].length).trimStart()];
}
