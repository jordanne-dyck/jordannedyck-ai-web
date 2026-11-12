// The backend's answer engine (jordannedyck-ai engine/chat.py), which answers
// one chat turn at POST /chat when ANSWER_ENGINE=python. It streams
// newline-delimited JSON: one `meta` event, `text` deltas, then `done` or
// `error`. route.ts turns those into the same UI stream parts the TypeScript
// pipeline sends, and keeps everything about the visitor (input checks, signed
// turns, rate limit, PII redaction, the chat_events row, paid labels).
// Plan: jordannedyck-ai/nimbalyst-local/plans/answer-engine-draft.md, phase 2.
//
// Kept free of runtime imports so the tests can load it.
import type { RetrievalData } from './chat-message';
import type { Segment, SourcesData } from './citations';

export type EngineMeta = {
  type: 'meta';
  prompt_version: string;
  index_version: string | null;
  ranker: string | null;
  rewrite: {
    query: string;
    status: 'ok' | 'skipped' | 'timeout' | 'error' | 'rejected';
    ms: number | null;
    cost_usd: number | null;
    model: string | null;
  };
  retrieval: RetrievalData;
  retrieval_ms: number;
  top_category: string | null;
  cite_reminder: boolean;
  // Which fixed reply this turn gets; null for a model answer. A story reply
  // has no text events: the engine decides, and route.ts writes the words
  // from lib/build-story.ts (option D, decided 2026-11-09).
  fixed: 'refusal' | 'lead' | 'story' | null;
  // null for a fixed reply.
  model: string | null;
};

export type EngineDone = {
  type: 'done';
  // The logged text: no citations, no timeline marker. null for the story,
  // whose text the site holds.
  answer: string | null;
  // The answer with its [chunk-id] citations; null for a fixed reply.
  answer_cited: string | null;
  segments: Segment[];
  cited_ids: string[];
  sources: SourcesData;
  project: string | null;
  project_predicted: string | null;
  // explicit for a fixed overview reply and for a past-jobs question; reason
  // is the row's timeline flag.
  timeline: { explicit: boolean; reason: string } | null;
  // The fixed reply's row flags: fixed_refusal, timeline and timeline_lead,
  // or story ('card' | 'asked') and story_lead ('fixed' | 'replay').
  flags: Record<string, unknown>;
  free_labels: Record<string, unknown>;
  citation_labels: Record<string, unknown> | null;
  usage: { prompt_tokens: number | null; completion_tokens: number | null } | null;
  cost_usd: number | null;
  ttft_ms: number | null;
  latency_ms: number;
};

export type EngineEvent =
  | EngineMeta
  | { type: 'text'; delta: string }
  | EngineDone
  // reason is for the log; message is what the visitor sees.
  | { type: 'error'; reason: string; message: string };

// The events in a /chat response body, one per line, as they arrive.
export async function* engineEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<EngineEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffered += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = buffered.split('\n');
    buffered = done ? '' : lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as EngineEvent;
    }
    if (done) return;
  }
}
