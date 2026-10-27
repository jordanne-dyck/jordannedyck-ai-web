import type { TextStreamPart, ToolSet } from 'ai';

// Chunk-id citations (added 2026-10-15). The model ends each factual sentence
// with the ids of the chunks it drew on, e.g. "…an innovation lab. [ops-009]",
// so a checker can test each claim against its own source. Visitors never see
// them: stripCitationsTransform removes them before the stream leaves the
// server, as route.ts already promises for chunk ids.
//
// MUST STAY IN SYNC with CITE_RE and strip_citations() in
// jordannedyck-ai/run_eval.py, so the eval scores the text a visitor sees.

// Every id in the index is lowercase words joined by hyphens and ending in a
// number: ops-009, proj-ai-resume-001. Checked against faiss_db 2026-10-15.
const ID = String.raw`[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\d+`;
const GROUP = String.raw`\[${ID}(?:\s*,\s*${ID})*\]`;

// A citation group plus the spaces before it, so "lab [ops-009]." strips to "lab.".
export const CITE_RE = new RegExp(String.raw`[ \t]*${GROUP}`, 'g');
const ID_RE = new RegExp(ID, 'g');

export function stripCitations(text: string): string {
  return text.replace(CITE_RE, '');
}

// One stretch of answer text and the ids cited at its end. A segment runs from
// the previous citation (or the start of the line) to the next one, so two
// sentences cited together share their ids. Text after a line's last citation
// is a segment with no ids.
export type Segment = { text: string; ids: string[] };

export function parseCitations(raw: string): { segments: Segment[]; citedIds: string[] } {
  const segments: Segment[] = [];
  for (const line of raw.split('\n')) {
    let last = 0;
    for (const m of line.matchAll(CITE_RE)) {
      pushSegment(segments, line.slice(last, m.index), m[0].match(ID_RE) ?? []);
      last = m.index + m[0].length;
    }
    pushSegment(segments, line.slice(last), []);
  }
  const citedIds = [...new Set(segments.flatMap((s) => s.ids))];
  return { segments, citedIds };
}

function pushSegment(segments: Segment[], text: string, ids: string[]) {
  const t = text.replace(/^[\s.,;:!?)]+/, '').trim();
  // Headings, bullets markers and stray punctuation are not claims.
  if (!/[a-z]{3}/i.test(t) && !ids.length) return;
  segments.push({ text: t, ids });
}

// Holds back the tail of the buffer that could still become a citation: an open
// "[" whose text so far fits an id list, and any spaces before it. Everything
// else is safe to send.
const OPEN_TAIL_RE = /[ \t]*(?:\[[a-z0-9,\s-]*)?$/;
const MAX_HELD = 200;

// Removes citations from the text stream and records the raw text, which
// onFinish does not see: streamText runs transforms before its callbacks.
export function stripCitationsTransform(sink: { raw: string }) {
  return <TOOLS extends ToolSet>() => {
    let buffer = '';
    // The id of the text block being buffered; held text is sent under it.
    let id = '';
    const flush = (controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>, all: boolean) => {
      let cut = buffer.length;
      if (!all) {
        const held = buffer.match(OPEN_TAIL_RE)?.[0] ?? '';
        if (held.length <= MAX_HELD) cut -= held.length;
      }
      // Strip the whole buffer before cutting, so a citation completed in this
      // chunk is removed as one piece.
      const out = stripCitations(buffer.slice(0, cut));
      buffer = buffer.slice(cut);
      if (out) controller.enqueue({ type: 'text-delta', id, text: out });
    };
    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === 'text-delta') {
          if (part.id !== id) flush(controller, true);
          id = part.id;
          sink.raw += part.text;
          buffer += part.text;
          flush(controller, false);
          return;
        }
        flush(controller, true);
        controller.enqueue(part);
      },
      flush(controller) {
        flush(controller, true);
      },
    });
  };
}

// Figures that make a factual claim, as extract_figures() in run_eval.py
// defines them: years and single digits are left out.
const FIGURE_RE = /\$?\d[\d,]*\.?\d*\s*(?:%|x|M|B|K|million|billion|\+)?/g;
// Bolded spans were checked too until 2026-10-15; the first live run showed the
// model rewording chunk headings in bold, so every bold flag was a false alarm.
function claimFigures(text: string): string[] {
  const tokens: string[] = [];
  for (const m of text.matchAll(FIGURE_RE)) {
    const tok = m[0].trim();
    const digits = tok.replace(/\D/g, '');
    if (/^(19|20)\d\d$/.test(digits)) continue;
    if (digits.length <= 1 && !tok.includes('%') && !/x/i.test(tok)) continue;
    tokens.push(tok);
  }
  return [...new Set(tokens)];
}

// Compares digits only, as run_eval.py's figure check does: "$150M+" matches "150".
function foundIn(figure: string, haystack: string): boolean {
  return haystack.replace(/\D/g, '').includes(figure.replace(/\D/g, ''));
}

export type CitationChunk = { chunk_id: string | null; similarity: number; content: string };

// Free checks, stored under flags.citations. Labels, not gates.
//   invented     cited ids that were not retrieved for this turn
//   unsupported  a figure absent from the chunks its segment
//                cites; in_context says whether another retrieved chunk has it
//                (miscited) or none does (not from the record)
//   uncited      segments with no citation; gap statements are legitimately here
//   top_uncited  the best-matching chunk was never cited. A weak signal for the
//                W02 kind of omission: not every top chunk is relevant.
export function citationLabels(segments: Segment[], chunks: CitationChunk[]) {
  const byId = new Map(chunks.filter((c) => c.chunk_id).map((c) => [c.chunk_id as string, c.content]));
  const allContext = chunks.map((c) => c.content).join('\n');
  const cited = new Set(segments.flatMap((s) => s.ids));
  const invented = [...cited].filter((id) => !byId.has(id));

  const unsupported: { ids: string[]; token: string; in_context: boolean }[] = [];
  for (const s of segments) {
    if (!s.ids.length) continue;
    const source = s.ids.map((id) => byId.get(id) ?? '').join('\n');
    for (const token of claimFigures(s.text)) {
      if (!foundIn(token, source)) {
        unsupported.push({ ids: s.ids, token, in_context: foundIn(token, allContext) });
      }
    }
  }

  const top = chunks.length ? chunks.reduce((a, b) => (b.similarity > a.similarity ? b : a)) : null;
  return {
    segments: segments.length,
    uncited: segments.filter((s) => !s.ids.length).length,
    invented,
    unsupported,
    top_uncited: Boolean(top?.chunk_id && !cited.has(top.chunk_id)),
  };
}
