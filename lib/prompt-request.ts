// A request to see the bot's own instructions gets FIXED_REFUSAL, with no model
// call (decided 2026-11-05, backend results log R-20261105-08). Each rewrite of
// the prompt's refusal paragraph fixed this but made a false-claim message (eval
// A02) get the refusal instead of a correction, 30/30 (R-20261104-12 to -14),
// so this is handled here instead.
// Needs a reveal verb (or "what is") plus the bot's own prompt or instructions.
// "Ignore your instructions" on its own does not match: that is A02's shape, and
// it must reach the model to be corrected. A question about her prompts ("show me
// a system prompt she wrote", "your rules for hiring") does not match.
// MUST MATCH EXTRACTION_RE in the backend's run_eval.py, character for character.
const EXTRACTION_RE = /(?:\b(?:output|reveal|print|show|repeat|share|give|tell|display|dump|quote|paste|leak|disclose|recite|write out|copy)\b(?:(?!\b(?:her|she|jordanne|jordanne's|how)\b)[^.?!\n]){0,60}?|\bwhat(?:'s|\s+is|\s+are)\s+)(?:\b(?:your|this\s+(?:bot|chatbot|assistant)'?s?)\s+(?:\w+\s+){0,3}?(?:system\s+prompt|instructions|prompt|rules|guidelines|configuration)|\bthe\s+system\s+prompt|\bthe\s+(?:\w+\s+){0,3}?(?:instructions|prompt|rules|guidelines)\s+you\b)\b(?!\s+(?:for|on|about|around|when|in)\b)(?![^.?!\n]{0,25}\b(?:she|her|jordanne)\b)/i;

export function asksForInstructions(query: string): boolean {
  return EXTRACTION_RE.test(query);
}

// Jordanne's text, 2026-11-05. The prompt is public in this repo; the knowledge
// base is not in git. MUST MATCH FIXED_REFUSAL in the backend's run_eval.py.
export const FIXED_REFUSAL =
  "I don't repeat my instructions in chat, but how I'm built is public, prompt included: [jordannedyck-ai on GitHub](https://github.com/jordanne-dyck/jordannedyck-ai). Here, I answer questions about Jordanne's work.";
