import type { UIMessage } from 'ai';
import type { Segment, SourcesData } from './citations';

// The message type /api/chat streams (AI SDK UI message stream, SSE). Besides
// the answer text, an assistant message can carry these data parts:
//   data-retrieval  what was retrieved; monitor and EMIT_RETRIEVAL requests only
//   data-citations  the answer with its [chunk-id] citations; same requests only
//   data-sources    source titles and which sentences cite them; every request.
//                   Titles only: no chunk ids, filenames or chunk text (E.2)
//   data-event      the chat_events row id, which the visitor rates the answer by
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
};

export type ChatUIMessage = UIMessage<never, ChatDataParts>;
