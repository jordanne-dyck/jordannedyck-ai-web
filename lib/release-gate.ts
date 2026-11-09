// The latest frontend release's gate result, quoted in the build story
// (decided 2026-11-09). next.config.ts reads the newest
// releases/jordbot-web-vX.Y.json at build time and passes the summary in as
// RELEASE_GATE, so the figure is fixed in the image.
//
// An image is built before its own evidence file is merged, so it quotes the
// release before it. The sentence names the tag, so it never claims more.
//
// Kept free of imports so scripts/trace.test.mjs can load it.

export type GateSummary = {
  tag: string;
  date: string;
  suites: { kind: 'single' | 'multiturn' | 'e2e'; answers: number; passed: number }[];
  failures: number;
};

type Evidence = {
  tag?: unknown;
  generated?: unknown;
  status?: unknown;
  evals?: Record<string, { answers?: unknown; all_checks_pass_rate?: unknown } | undefined>;
  failures?: unknown;
};

// The newest jordbot-web evidence filename, by version, not by name.
export function newestWebEvidence(files: string[]): string | null {
  const ver = (f: string) => f.match(/^jordbot-web-v(\d+)\.(\d+)\.json$/);
  const sorted = files.filter((f) => ver(f)).sort((a, b) => {
    const [, a1, a2] = ver(a)!;
    const [, b1, b2] = ver(b)!;
    return Number(a1) - Number(b1) || Number(a2) - Number(b2);
  });
  return sorted.at(-1) ?? null;
}

// Null unless the file says the gate passed and every suite has numbers.
export function summarizeEvidence(e: Evidence): GateSummary | null {
  if (e.status !== 'pass' || typeof e.tag !== 'string' || typeof e.generated !== 'string') return null;
  const suites: GateSummary['suites'] = [];
  for (const kind of ['single', 'multiturn', 'e2e'] as const) {
    const s = e.evals?.[kind];
    if (!s || typeof s.answers !== 'number' || typeof s.all_checks_pass_rate !== 'number') return null;
    suites.push({ kind, answers: s.answers, passed: Math.round(s.answers * s.all_checks_pass_rate) });
  }
  return { tag: e.tag, date: e.generated, suites, failures: Array.isArray(e.failures) ? e.failures.length : 0 };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// One sentence for the Evals bullet. Null when there is no summary.
export function gateSentence(raw: string | undefined): string | null {
  if (!raw) return null;
  let g: GateSummary;
  try {
    g = JSON.parse(raw) as GateSummary;
  } catch {
    return null;
  }
  const [y, m, d] = g.date.split('-').map(Number);
  const when = `${d} ${MONTHS[m - 1]} ${y}`;
  const of = (kind: string) => g.suites.find((s) => s.kind === kind);
  const single = of('single');
  const multi = of('multiturn');
  const e2e = of('e2e');
  if (!single || !multi || !e2e || !MONTHS[m - 1]) return null;
  const ruled = g.failures
    ? ` Jordanne ruled on each of the ${g.failures} failure${g.failures === 1 ? '' : 's'} before it shipped.`
    : '';
  return (
    `In the release gate for ${g.tag} (${when}), ${single.passed} of ${single.answers} single questions, ` +
    `${multi.passed} of ${multi.answers} follow-up answers and ${e2e.passed} of ${e2e.answers} answers through the live site passed every check.` +
    ruled
  );
}
