// Cut-offs used by the dashboard and the "what to fix" list.
// PLACEHOLDERS, decided 2026-10-14 pending real data: set them from the
// distribution of top_similarity and retrieval_ms in prod, not by eye.
// Change them here only; every query and page reads these.

// Best chunk at or above this counts as a strong knowledge-base match.
export const STRONG_MATCH = 0.8;
// Best chunk below this counts as a weak match (probably a KB gap).
export const WEAK_MATCH = 0.7;
// A search slower than this is flagged as slow.
export const SLOW_SEARCH_MS = 2000;
// A follow-up this soon after an answer, worded like the question before it,
// counts as a rephrase (the first answer probably missed).
export const REPHRASE_SECONDS = 60;

// Quality alerts over the last 24 hours, read by the Checkly abuse check via
// /api/health?deep=1 (quality24h.breaches). Also placeholders. Nothing alerts
// until at least QUALITY_MIN_ANSWERED questions were answered, so one bad
// turn on a quiet day does not page anyone.
export const QUALITY_MIN_ANSWERED = 5;
export const QUALITY_MAX_EMPTY_RATE = 0.3;
export const QUALITY_MAX_GAP_RATE = 0.4;
export const QUALITY_MAX_NOT_GROUNDED_RATE = 0.2;
