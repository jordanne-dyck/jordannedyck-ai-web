// Project cards (plan: nimbalyst-local/plans/project-cards.md, 2026-10-27).
// When an answer cites a chunk from one of these files, the chat route sends
// the project's slug and the home page shows its card and panel.
//
// The copy is hand-written from jordannedyck-ai/knowledge-base/projects/<slug>.md
// and checked by Jordanne. If a figure changes there, change it here too:
// nothing keeps the two in sync.
//
// Not shared with the browser as a list of files: the route sends only a slug.

export type Project = {
  slug: string;
  title: string;
  when: string;
  org: string;
  role: string;
  tags: string;
  problem: string;
  built: string;
  results: string[];
  // Follow-up questions in the panel; each is sent as a chat message.
  questions: [string, string];
  // Paths under public/. A path ending in .mp4 plays as a muted loop. The
  // release waits for every card to have one (decided 2026-10-27).
  images: string[];
  // Public pages about the project, shown in the panel.
  links?: { label: string; href: string }[];
};

export const PROJECTS: Project[] = [
  {
    slug: 'ai-resume',
    title: 'AI-Powered Resume & Portfolio System',
    when: '2025 – present',
    org: 'Personal project',
    role: 'Creator & developer',
    tags: 'AI, MCP, RAG, vector search',
    problem: 'Static resumes describe skills instead of showing them.',
    built:
      'my career as an interactive web-based chat. Production RAG, custom MCP server, UI, eval harness, monitoring',
    results: ['Working prototype in 5 days', 'Used in real recruiter and networking conversations, then refined'],
    questions: ['How did she build it?', 'What would she change?'],
    images: ['/projects/ai-resume/architecture.webp', '/projects/ai-resume/frontend.mp4', '/projects/ai-resume/dashboard.webp'],
    links: [
      { label: 'Live dashboard', href: 'https://jordannedyck.com/dashboard' },
      { label: 'Backend code', href: 'https://github.com/jordanne-dyck/jordannedyck-ai' },
      { label: 'Frontend code', href: 'https://github.com/jordanne-dyck/jordannedyck-ai-web' },
    ],
  },
  {
    slug: 'abnormal-innovation',
    title: 'Abnormal Innovation',
    when: '2022 – 2025',
    org: 'DECIEM',
    role: 'Founder & lead',
    tags: 'Innovation lab, strategy, AI',
    problem:
      'DECIEM was growing 80% a year. Teams chased ideas nobody had validated, with no way to decide what was worth building.',
    built:
      'An internal venture to rapidly validate ambiguous opportunities and scale only what proved value',
    results: [
      '50+ initiatives vetted in 2 years',
      '10+ cross-functional workshops across 10+ departments',
    ],
    questions: ['Why did she start the lab?', 'What did the lab ship?'],
    images: ['/projects/abnormal-innovation/lab.webp'],
  },
  {
    slug: 'agentic-personal-shopper',
    title: 'Agentic Personal Shopper',
    when: '2024 – 2025',
    org: 'DECIEM',
    role: 'Product lead & AI architect',
    tags: 'Agentic AI, conversational commerce, Agentforce',
    problem:
      "Customers faced 100+ products across 15+ categories, unsure what to buy, in what order, or what can't be mixed.",
    built:
      'A first-of-its-kind full-service digital commerce agent -  unifying product discovery, order management and checkout in one conversational experience',
    results: ['Concept to production in 6 months', 'Featured by Salesforce at NRF 2025'],
    questions: ['How do the agents work together?', 'Where do people step in?'],
    images: ['/projects/agentic-personal-shopper/nrf-demo.mp4', '/projects/agentic-personal-shopper/operations-bot.webp', '/projects/agentic-personal-shopper/product-recos.webp'],
  },
  {
    slug: 'ai-customer-service-optimization',
    title: 'AI Customer Service Optimization',
    when: '2024 – 2025',
    org: 'DECIEM',
    role: 'Product lead & process architect',
    tags: 'AI, service automation, workflow',
    problem:
      '5,000+ tickets a month, 70% of them repetitive, with resolution stretching past 2 weeks in busy periods.',
    built:
      'Automation for repetitive CX work balancing human and digital moments at scale.',
    results: ['86% faster resolution time', 'Fewer seasonal hires needed at peak'],
    questions: ['How did she decide what to automate?', 'How was quality measured?'],
    images: ['/projects/ai-customer-service-optimization/service-replies.webp'],
  },
  {
    slug: 'brand-incubator-ecosystem',
    title: 'Brand Incubator Ecosystem',
    when: '2023 – 2025',
    org: 'DECIEM',
    role: 'Product lead',
    tags: 'Incubator, tech architecture, e-commerce',
    problem:
      "New brand concepts had to launch fast and cheap. The Ordinary's enterprise platform was too slow and costly for experiments, and fully separate systems would leave no path to scale.",
    built:
      'A tiered tech ecosystem: new brands start simple and independent, then move onto the enterprise platform as they grow.',
    results: ['Validated with pilot brand launches', 'In operation when she left DECIEM'],
    questions: ['How does a brand move to the enterprise platform?', 'What did the pilots show?'],
    images: ['/projects/brand-incubator-ecosystem/architecture.webp'],
  },
  {
    slug: 'google-gemini-enterprise-deployment',
    title: 'Google Gemini Enterprise Deployment',
    when: '2024 – 2025',
    org: 'DECIEM',
    role: 'AI strategy lead & change manager',
    tags: 'Enterprise AI, change management, governance',
    problem:
      'Teams were buried in content and analysis work, but people feared for their jobs, there was no AI governance, and confidential data could leak.',
    built:
      "The rollout of Gemini to DECIEM's 200+ office staff, with rules on who can reach which data and change management for every comfort level.",
    results: ['~60% adoption across eligible staff', 'The highest adoption of any internal tool launch at DECIEM'],
    questions: ['How did she handle resistance?', 'What governance did she set up?'],
    images: ['/projects/google-gemini-enterprise-deployment/gemini.webp'],
  },
  {
    slug: 'personalization-roadmap-and-measurement',
    title: 'Personalization Roadmap & Measurement',
    when: '2025',
    org: 'DECIEM',
    role: 'Roadmap owner',
    tags: 'Personalization, email, retention analytics',
    problem:
      'The Ordinary and NIOD treated every customer the same across web, email and SMS, and the tracking underneath could not say where growth came from.',
    built:
      'A multi-year roadmap to one-to-one personalization across every channel, built on the Salesforce stack already in place, with the measurement to back it: rebuilt GA4 and Tag Manager tracking and retention segmentation she wrote in Python.',
    results: [
      'Targets set up front: 40% higher customer lifetime value, 25% higher conversion',
      'Found the gap: mobile was 76% of users but 67% of revenue',
    ],
    questions: ['Why build on the existing stack?', 'How did she segment for retention?'],
    images: [],
  },
  {
    // From experience/growth-and-acquisition.md, not projects/: shown for chunk
    // growth-001 only (see CHUNK_PROJECTS).
    slug: 'growth-and-acquisition',
    title: 'Growth & Customer Acquisition',
    when: '2019 – 2025',
    org: 'DECIEM',
    role: 'Head of Digital, then Digital Director',
    tags: 'Growth marketing, search, paid social, attribution',
    problem:
      'The Ordinary grew through community and word of mouth, and a large share of revenue landed in "unassigned" traffic, so attribution could not say where growth came from.',
    built:
      'The analytics, CRM, MarTech and operations first, then growth marketing on top: paid social as the main paid channel, search owned end to end (paid, SEO and onsite), and rebuilt GA4 and Tag Manager tracking.',
    results: [
      '5:1 ROI on growth marketing, recognised at Google Marketing Live 2022',
      "The Ordinary became the world's #1 Googled skincare brand",
      '$150M+ DTC business with 4M+ customer accounts',
    ],
    questions: ['How did she make it #1 on Google?', 'Why was paid social the main channel?'],
    images: ['/projects/growth-and-acquisition/search-trends.webp'],
  },
  {
    slug: 'digital-transformation-salesforce',
    title: 'Digital Transformation to Salesforce',
    when: '2020 – 2021',
    org: 'DECIEM',
    role: 'Digital transformation lead & product strategist',
    tags: 'Platform migration, Commerce Cloud',
    problem:
      "A custom-built e-commerce platform couldn't keep up with 80% yearly growth across 150+ countries",
    built:
      "The move from the in-house platform to an enterprise-grade DTC ecosystem",
    results: [
      '99.95% uptime, 40% faster page loads, 18% higher conversion',
      'Engineering time on new work: 30% → 70%',
      '$150M+ annual revenue across 150+ countries',
      '100+ new features launched',
    ],
    questions: ['Why buy instead of build?', 'How was the migration run?'],
    images: ['/projects/digital-transformation-salesforce/pdp.webp', '/projects/digital-transformation-salesforce/plp.webp', '/projects/digital-transformation-salesforce/homepage.webp'],
    links: [
      { label: 'The Ordinary', href: 'https://theordinary.com' },
      { label: 'NIOD', href: 'https://niod.com' },
      { label: 'Loopha', href: 'https://loopha.com' },
      { label: 'The Chemistry Brand', href: 'https://thechemistrybrand.com' },
      { label: 'DECIEM', href: 'https://deciem.com' },
    ],
  },
  {
    slug: 'regimen-builder',
    title: 'Regimen Builder',
    when: '2021 – 2022',
    org: 'DECIEM',
    role: 'Product lead',
    tags: 'Guided selling, personalization, skincare',
    problem:
      'Every channel gave customers a different recommendation, and 40% of service tickets came from customers unsure what to buy.',
    built:
      'A rules-based tool that builds a personalized multi-step routine from skin concerns and goals, backed by one knowledge base agreed with brand, lab, legal and regulatory.',
    results: [
      '35% higher conversion and 40% higher order value, users vs. non-users',
      'Measured by comparing users with non-users, not an A/B test',
    ],
    questions: ['How was it measured?', 'How did it lead to the personal shopper?'],
    images: ['/projects/regimen-builder/flow.mp4'],
    links: [
      { label: 'Regimen Builder', href: 'https://theordinary.com/en-us/regimen-builder.html' },
    ],
  },
  {
    slug: 'tiktok-shop-integration',
    title: 'TikTok Shop Integration',
    when: '2023',
    org: 'DECIEM',
    role: 'Product lead',
    tags: 'Social commerce, Commerce Cloud',
    problem:
      "The Ordinary was going viral on TikTok, but people couldn't buy in the app. TikTok Shop was new, its APIs were changing, and there was no proven Commerce Cloud integration.",
    built:
      'A full integration, not a catalogue upload: real-time inventory, order routing, and price and promotion sync. She worked with Salesforce and TikTok to get their beta integration ready for production.',
    results: ['First fully integrated brand on TikTok Shop, live in 6 months', '$30M+ annual revenue channel'],
    questions: ['What made the integration hard?', 'Who were the new customers?'],
    images: ['/projects/tiktok-shop-integration/shop.mp4'],
    links: [
      { label: 'The Ordinary on TikTok Shop', href: 'https://shop.tiktok.com/us/k/the-ordinary-official' },
    ],
  },
];

const BY_SLUG = new Map(PROJECTS.map((p) => [p.slug, p]));

export function projectBySlug(slug: string): Project | null {
  return BY_SLUG.get(slug) ?? null;
}

// The project a retrieved chunk came from, by its knowledge-base file. The
// embedder stores a repo-relative path, with / or \ depending on where it ran.
// Matched on the file, not the chunk-id prefix: `dtx-` is used outside
// projects/ too.
function slugOfFile(filename: string | null): string | null {
  if (!filename) return null;
  const m = filename.match(/(?:^|[\\/])projects[\\/]([a-z0-9-]+)\.md$/);
  return m && BY_SLUG.has(m[1]) ? m[1] : null;
}

// Cards for chunks outside projects/, by exact chunk id. growth-002 (referral,
// mostly Loblaw) is left out on purpose: the card is about DECIEM.
const CHUNK_PROJECTS = new Map([['growth-001', 'growth-and-acquisition']]);

// The project to show for an answer: the one cited most, ties going to the one
// cited first. Null when the answer cites no project file. One card per answer
// (decided 2026-10-27).
export function pickProject(
  citedIds: string[],
  chunks: { chunk_id: string | null; filename: string | null }[],
): string | null {
  const fileOf = new Map(chunks.map((c) => [c.chunk_id, c.filename]));
  const counts = new Map<string, number>();
  for (const id of citedIds) {
    const slug = slugOfFile(fileOf.get(id) ?? null) ?? CHUNK_PROJECTS.get(id) ?? null;
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [slug, n] of counts) if (best === null || n > counts.get(best)!) best = slug;
  return best;
}
