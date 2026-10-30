// MUST STAY IN SYNC with PHONE_RE, FIRST_PERSON_RE, GAP_PHRASES, GAP_RE,
// NO_COVERAGE_RE and gap_admitted() in jordannedyck-ai/run_eval.py.
// The live labels on the dashboard and the offline eval must judge an answer
// the same way, or a "gap declared" on the dashboard means something different
// from a C10 failure in an eval run. run_eval.py has already been bitten by a
// drifted copy (run_e2e.py, 2026-09-11): this port keeps all three gap tests
// and runs them on lowercased text, exactly as gap_admitted() does.
// Ported from jordannedyck-ai origin/master (f4f5b60) on 2026-10-14.
// Python's re and JavaScript's RegExp agree on every construct used here.

export const PHONE_RE = /(?:\(?647\)?[\s.\-]*454[\s.\-]*2244)|(?:6474542244)/;

export const FIRST_PERSON_RE = new RegExp(
  String.raw`\bI (?:built|led|owned|shipped|launched|designed|managed|ran|architected)\b` +
    String.raw`|\bmy (?:team|role|experience|work|time) at\b`,
  'i',
);

export const GAP_PHRASES = [
  "don't have", 'do not have', "doesn't have specific", 'not covered',
  "isn't covered", 'no specific information', "don't have that specific",
  'not something', 'no direct experience', "doesn't appear", 'not detailed',
  'no information', 'not something the knowledge base',
  "isn't documented", 'is not documented', 'not documented',
  'does not have', "doesn't have",
];

export const GAP_RE = new RegExp(
  String.raw`\b(?:has|have)\s*(?:n't|not)\s+` +
    String.raw`(?:specifically\s+|directly\s+|personally\s+|explicitly\s+)?` +
    String.raw`(?:built|led|run|managed|owned|worked|done|launched|designed|shipped)\b`,
);

export const NO_COVERAGE_RE = new RegExp(
  String.raw`\b(?:does|do|did)\s*(?:n't|not)\s+` +
    String.raw`(?:appear\s+to\s+|seem\s+to\s+|specifically\s+|explicitly\s+)?` +
    // show|say|describe|establish|state|list: jordannedyck-ai aa633ba (#112).
    String.raw`(?:provide|mention|include|contain|cover|specify|detail|indicate|reference|address|note` +
    String.raw`|show|say|describe|establish|state|list)\b` +
    String.raw`|\bno\s+(?:mention|record|reference|details?|indication)\s+of\b` +
    String.raw`|\bnothing\s+in\s+the\s+(?:context|knowledge\s+base|record|material)\b` +
    // provided|stated|mentioned|... and the optional adverb: #128 said
    // "not provided in the context".
    String.raw`|\bnot\s+(?:explicitly\s+|specifically\s+|directly\s+)?` +
    String.raw`(?:reflected|present|available|provided|stated|mentioned|included|covered|described` +
    String.raw`|documented|specified|detailed)\s+in\s+the\b`,
);

// C10 / T2.3: did the answer explicitly admit the corpus does not cover this?
export function gapAdmitted(answer: string): boolean {
  const low = answer.toLowerCase();
  return (
    GAP_PHRASES.some((p) => low.includes(p)) ||
    GAP_RE.test(low) ||
    NO_COVERAGE_RE.test(low)
  );
}
