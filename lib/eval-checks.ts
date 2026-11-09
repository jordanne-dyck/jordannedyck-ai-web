// MUST STAY IN SYNC with PHONE_RE, FIRST_PERSON_RE, GAP_PHRASES, GAP_RE,
// _GAP_SUBJECT, NOT_HAVE_RE, NO_COVERAGE_RE, coverage_stated() and
// gap_admitted() in jordannedyck-ai/run_eval.py.
// The live labels on the dashboard and the offline eval must judge an answer
// the same way, or a "gap declared" on the dashboard means something different
// from a C10 failure in an eval run. run_eval.py has already been bitten by a
// drifted copy (run_e2e.py, 2026-09-11): this port keeps all three gap tests
// and runs them on lowercased text, exactly as gap_admitted() does.
// Ported from jordannedyck-ai origin/master (f4f5b60) on 2026-10-14; in sync
// with 45b7c45 (PR #45) as of 2026-11-08.
// Python's re and JavaScript's RegExp agree on every construct used here.

export const PHONE_RE = /(?:\(?647\)?[\s.\-]*454[\s.\-]*2244)|(?:6474542244)/;

export const FIRST_PERSON_RE = new RegExp(
  String.raw`\bI (?:built|led|owned|shipped|launched|designed|managed|ran|architected)\b` +
    String.raw`|\bmy (?:team|role|experience|work|time) at\b`,
  'i',
);

// 2026-11-08: "don't have", "do not have", "doesn't have" and "does not have"
// moved to NOT_HAVE_RE, "not something" became "is not something", and
// "doesn't appear" moved to NO_COVERAGE_RE. "isn't part of" / "is not part of"
// are run_eval.py's 2026-11-02 additions (G01, T2.8 scan), missed until now.
export const GAP_PHRASES = [
  "doesn't have specific", 'not covered',
  "isn't covered", 'no specific information', "don't have that specific",
  'is not something', 'no direct experience', 'not detailed',
  'no information', 'not something the knowledge base',
  "isn't documented", 'is not documented', 'not documented',
  "isn't part of", 'is not part of',
];

export const GAP_RE = new RegExp(
  String.raw`\b(?:has|have)\s*(?:n't|not)\s+` +
    String.raw`(?:specifically\s+|directly\s+|personally\s+|explicitly\s+)?` +
    String.raw`(?:built|led|run|managed|owned|worked|done|launched|designed|shipped)\b`,
);

// 2026-11-08 (bug_1794167236506_5t0gvr): a negated verb whose subject is
// plainly not her or the record is not a gap admission: "so the customer does
// not have to navigate it" (W03), "expertise most people don't have" (W09).
// These are the subjects of every false match in 3,106 stored answers. "have
// to" is obligation, never a gap.
const NOT_A_SOURCE = ['that', 'who', 'you', 'they', 'people', 'individuals', 'customer',
  'customers', 'users', 'investors', 'portfolios'];
const GAP_SUBJECT = NOT_A_SOURCE.map((w) => String.raw`(?<!\b${w} )`).join('');

export const NOT_HAVE_RE = new RegExp(
  GAP_SUBJECT + String.raw`\b(?:do|does)\s*(?:n't|not)\s+have\b(?!\s+to\b)`,
);

export const NO_COVERAGE_RE = new RegExp(
  GAP_SUBJECT + String.raw`\b(?:does|do|did)\s*(?:n't|not)\s+` +
    String.raw`(?:appear\s+to\s+|seem\s+to\s+|specifically\s+|explicitly\s+)?` +
    // show|say|describe|establish|state|list: jordannedyck-ai aa633ba (#112).
    String.raw`(?:provide|mention|include|contain|cover|specify|detail|indicate|reference|address|note` +
    String.raw`|show|say|describe|establish|state|list)\b` +
    // "kept no record of churn" is a fact about a business, not the record.
    String.raw`|(?<!kept )(?<!keep )(?<!keeps )\bno\s+(?:mention|record|reference|details?|indication)\s+of\b` +
    // A gap is absent from the record; anything else that does not appear is a
    // fact ("The Ordinary doesn't appear in department stores").
    String.raw`|\b(?:does|do)\s*(?:n't|not)\s+appear\s+in\s+(?:the\s+|her\s+)?(?:context|record` +
    String.raw`|knowledge\s+base|material|sources|documents|information|work|experience|background` +
    String.raw`|history|career)\b` +
    String.raw`|\bnothing\s+in\s+the\s+(?:context|knowledge\s+base|record|material)\b` +
    // provided|stated|mentioned|... and the optional adverb: #128 said
    // "not provided in the context".
    String.raw`|\bnot\s+(?:explicitly\s+|specifically\s+|directly\s+)?` +
    String.raw`(?:reflected|present|available|provided|stated|mentioned|included|covered|described` +
    String.raw`|documented|specified|detailed)\s+in\s+the\b`,
);

// The answer says the record does not cover this.
export function coverageStated(answer: string): boolean {
  const low = answer.toLowerCase();
  return (
    GAP_PHRASES.some((p) => low.includes(p)) ||
    NOT_HAVE_RE.test(low) ||
    NO_COVERAGE_RE.test(low)
  );
}

// C10 / T2.3: did the answer explicitly admit the corpus does not cover this?
export function gapAdmitted(answer: string): boolean {
  return coverageStated(answer) || GAP_RE.test(answer.toLowerCase());
}

// T1.8 — no speculation. MUST STAY IN SYNC with SPECULATION_RE in
// jordannedyck-ai/run_eval.py, added 2026-11-01 (answer-gaps findings, option
// 2b) from M05 turn 2: "which likely supported loyalty indirectly". Narrow on
// purpose: a broad hedge list matched 320 of 3,081 stored answers, most of them
// grounded counterfactuals or facts like "twice as likely to buy again".
// Python's re.IGNORECASE is the 'i' flag; 'g' is for matchAll only.
export const SPECULATION_RE = new RegExp(
  String.raw`\b(?:she|her work|this role|the role|it|they|which|this)\s+(?:most\s+)?(?:likely|probably|presumably)\b` +
    String.raw`|\blikely (?:focus|involv|includ|cover|span|centr|draw|leverag|enta|requir|reflect)\w*`,
  'gi',
);

// T1.8 — the matched spans, so a false positive is visible.
export function speculationSpans(answer: string): string[] {
  return Array.from(answer.matchAll(SPECULATION_RE), (m) => m[0]);
}
