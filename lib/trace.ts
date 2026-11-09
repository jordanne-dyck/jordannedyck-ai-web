// The trace: what happened to the visitor's own question, stop by stop, with
// this request's real values (plan: nimbalyst-local/plans/build-story-live-trace.md,
// decided 2026-11-09). /api/chat sends it as a `data-trace` part before the
// answer text, on every answer, and updates it once the answer has finished.
// The build story plays it above its lead; every other answer has it folded
// under the sources.
//
// Counts and timings only. No chunk text, scores or file paths: the source
// titles are already public in data-sources.
//
// Kept free of imports so the tests can load it. lib/rate-limit.ts reads its
// limits from here; scripts/trace.test.mjs checks MAX_CHARS against
// lib/chat-input.ts. So the trace can't quote a limit the server doesn't apply.

export const HOURLY_LIMIT = 20;
export const DAILY_LIMIT = 100;
export const MAX_CHARS = 2000;

export type TraceData = {
  // Stop 1. This visitor's questions in the last hour and day, this one
  // included; null when not counted (a monitor request, or no database).
  hourly: number | null;
  daily: number | null;
  chars: number;
  // Stop 2. The standalone question searched, when a follow-up was rewritten.
  rewritten: string | null;
  search: 'ok' | 'empty' | 'error';
  passages: number;
  files: number;
  searchMs: number;
  // Stops 3 and 4. 'fixed': Jordanne's own text, no model call, so nothing to judge.
  answer: 'model' | 'fixed';
  // Set when the answer has finished: ms from the question to its first word.
  firstWordMs?: number;
};

// Longer rewrites are cut, so the line stays one line on a phone.
const MAX_REWRITE = 140;

const n = (x: number) => x.toLocaleString('en-US');

// What one stop did for this question: a short line under its title.
// `skipped` stops say why.
export function stopLine(i: number, t: TraceData): { text: string; skipped?: true } | null {
  switch (i) {
    case 0:
      return {
        text:
          (t.hourly !== null ? `Question ${t.hourly} of ${HOURLY_LIMIT} this hour. ` : '') +
          `${n(t.chars)} of ${n(MAX_CHARS)} characters.`,
      };
    case 1: {
      if (t.search === 'error') return { text: 'Search failed.' };
      const asked = t.rewritten
        ? `Searched as "${t.rewritten.length > MAX_REWRITE ? `${t.rewritten.slice(0, MAX_REWRITE - 1)}…` : t.rewritten}". `
        : '';
      const found = t.passages
        ? `${t.passages} passage${t.passages === 1 ? '' : 's'} from ${t.files} file${t.files === 1 ? '' : 's'}`
        : 'No passages matched';
      return { text: `${asked}${found}, in ${n(t.searchMs)} ms.` };
    }
    case 2:
      if (t.answer === 'fixed') {
        return { text: 'Skipped. Jordanne wrote this answer herself, so it is the same every time.', skipped: true };
      }
      return {
        text: t.firstWordMs !== undefined
          ? `gpt-4o. First word ${(t.firstWordMs / 1000).toFixed(1)} s after you asked.`
          : 'gpt-4o, writing now.',
      };
    case 3:
      if (t.answer === 'fixed') return { text: 'Skipped. No model-written claims to check.', skipped: true };
      return { text: 'Runs once you have your answer, so you never wait for it.' };
    default:
      return null;
  }
}

// The number of distinct files among retrieved chunks; null filenames count as one each.
export function fileCount(chunks: { filename: string | null }[]): number {
  return new Set(chunks.map((c, i) => c.filename ?? `#${i}`)).size;
}
