import type { UIMessage } from 'ai';
import type { Segment, SourcesData } from './citations';
import type { TraceData } from './trace';

// The message type /api/chat streams (AI SDK UI message stream, SSE). Besides
// the answer text, an assistant message can carry these data parts:
//   data-retrieval  what was retrieved; monitor and EMIT_RETRIEVAL requests only
//   data-citations  the answer with its [chunk-id] citations; same requests only
//   data-sources    source titles, section headings and which sentences cite
//                   them; every request. No chunk ids, filenames or chunk body
//                   text (E.2)
//   data-event      the chat_events row id, which the visitor rates the answer by
//   data-project    the slug of the project card shown under the answer; every
//                   request. Slug only: no filename or chunk id
//   data-timeline   the career timeline (lib/timeline.ts)
//   data-story      the build story (lib/build-story.ts)
//   data-trace      what happened to this question, stop by stop (lib/trace.ts);
//                   every answer, before the text, sent again with the same
//                   id once the answer has finished. Counts and timings only
//   data-turn-sig   the answer's signature, sent back with it next turn
//                   (lib/turn-signature.ts); only when TURN_SIGNING_KEY is set
//   data-index      the index_version the backend's search answered this turn
//                   from (8 hex chars, a hash of the index files; null when the
//                   backend reports none); every answer that searched.
//                   Transient: the page never stores it, so it is not sent
//                   back. run_e2e.py records it, so an e2e run proves which
//                   index answered each question (release gate, 2026-11-09).
//                   Per answer, not /api/health: health says what the backend
//                   holds when asked, not what answered a given turn
// They replace the AI SDK v4 `8:` message annotations (changed 2026-10-27).
export type RetrievalData = {
  // The text retrieval ran on: the follow-up rewrite, or the latest message.
  query: string;
  status: 'ok' | 'empty' | 'error';
  chunks: {
    chunk_id: string | null;
    filename: string | null;
    title: string | null;
    similarity: number;
    content: string;
  }[];
};

export type ChatDataParts = {
  retrieval: RetrievalData;
  citations: { answer: string; segments: Segment[] };
  sources: SourcesData;
  event: { id: string };
  project: { slug: string };
  // The career timeline; `explicit` when the question asked for it.
  timeline: { explicit: boolean };
  // The build story (lib/build-story.ts), and how the question reached it.
  story: { from: 'chip' | 'typed' | 'card'; replay: boolean };
  trace: TraceData;
  'turn-sig': { sig: string };
  index: { index_version: string | null };
};

export type ChatUIMessage = UIMessage<never, ChatDataParts>;
