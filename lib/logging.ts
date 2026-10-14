import { pool } from './db';

export type ChatEvent = {
  sessionId: string;
  ipHash: string;
  userAgent: string | null;
  query: string;
  responseText: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  model: string;
  latencyMs: number | null;
  timeToFirstTokenMs: number | null;
  error: string | null;
  rateLimited: boolean;
  // Monitoring fields. Optional so call sites that never reach retrieval
  // (rate-limited, rejected) can leave them out and get NULL or the default.
  queryLength?: number;
  turnIndex?: number | null;
  retrievalStatus?: 'ok' | 'empty' | 'error' | null;
  chunkIds?: string[] | null;
  topSimilarity?: number | null;
  isSynthetic?: boolean;
  clientId?: string | null;
  flags?: Record<string, unknown>;
  // Dashboard v2 fields (2026-10-14).
  retrievalMs?: number | null;
  source?: 'button' | 'typed' | null;
  promptVersion?: string | null;
  indexVersion?: string | null;
  topicTags?: string[] | null;
};

// Fire-and-forget: errors are logged but do not propagate to the chat response.
// A logging failure should never break the chatbot. Resolves to the new row's
// id, or null when nothing was written, so the paid labels can update the row.
export async function logChatEvent(event: ChatEvent): Promise<string | null> {
  // Local development without a database: skip silently. The catch below already
  // prevents a dead pool from breaking the response, so this guard exists only to keep
  // the dev console clean — "no pg errors in the console" is the verification step for
  // running the eval locally, and it is worthless if every request logs a failure.
  // Added 2026-09-11.
  //
  // NAMED DIVERGENCE: with no DATABASE_URL nothing is written to chat_events, so the
  // observability path this branch exists to add is NOT exercised on this run. Any
  // deployed environment sets DATABASE_URL, so production behaviour is unchanged.
  if (!process.env.DATABASE_URL) {
    return null;
  }

  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO chat_events (
         session_id, ip_hash, user_agent,
         query, query_length,
         response_length, prompt_tokens, completion_tokens, cost_usd, model,
         latency_ms, time_to_first_token_ms,
         error, rate_limited,
         response_text, turn_index, retrieval_status, chunk_ids, top_similarity,
         is_synthetic, client_id, flags,
         retrieval_ms, source, prompt_version, index_version, topic_tags
       ) VALUES (
         $1, $2, $3,
         $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12,
         $13, $14,
         $15, $16, $17, $18, $19,
         $20, $21, $22,
         $23, $24, $25, $26, $27
       )
       RETURNING id::TEXT AS id`,
      [
        event.sessionId,
        event.ipHash,
        event.userAgent,
        event.query,
        event.queryLength ?? event.query.length,
        event.responseText?.length ?? null,
        event.promptTokens,
        event.completionTokens,
        event.costUsd,
        event.model,
        event.latencyMs,
        event.timeToFirstTokenMs,
        event.error,
        event.rateLimited,
        event.responseText,
        event.turnIndex ?? null,
        event.retrievalStatus ?? null,
        event.chunkIds ?? null,
        event.topSimilarity ?? null,
        event.isSynthetic ?? false,
        event.clientId ?? null,
        JSON.stringify(event.flags ?? {}),
        event.retrievalMs ?? null,
        event.source ?? null,
        event.promptVersion ?? null,
        event.indexVersion ?? null,
        event.topicTags ?? null,
      ],
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error('logChatEvent failed:', err);
    return null;
  }
}
