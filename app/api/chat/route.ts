import { openai } from '@ai-sdk/openai';
import { createUIMessageStream, createUIMessageStreamResponse, streamText, toUIMessageStream } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, hashIp } from '@/lib/ip';
import { getOrCreateSessionId } from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { logChatEvent, type ChatEvent } from '@/lib/logging';
import { estimateCostUsd } from '@/lib/cost';
import { isMonitorRequest } from '@/lib/monitor';
import { parseChatInput, parseSource, parseClientId, MAX_USER_MESSAGE_CHARS } from '@/lib/chat-input';
import { buildSystemPrompt } from '@/lib/system-prompt';
import { backendUrl } from '@/lib/backend';
import { freeLabels, paidLabels, redactPii } from '@/lib/classify';
import { PROMPT_VERSION } from '@/lib/prompt-version';
import { buildSources, citationLabels, parseCitations, stripCitationsTransform } from '@/lib/citations';
import { rewriteQuery, REWRITE_MODEL } from '@/lib/query-rewrite';
import type { ChatUIMessage, RetrievalData } from '@/lib/chat-message';

const MODEL = 'gpt-4o';

// A hung backend or model ends in the error state, not an endless loader.
// An answer is at most 1000 tokens, which gpt-4o streams well inside a minute.
const SEARCH_TIMEOUT_MS = 10_000;
const ANSWER_TIMEOUT = { firstChunkMs: 20_000, totalMs: 60_000 };

// The SDK's own timeout.firstChunkMs never fires with openai.chat: the
// provider's doStream waits for the first output chunk before the SDK arms
// that timer (ai 7.0.154, @ai-sdk/openai 4.0.103; tested 2026-11-01). This
// one starts with the call, so it also covers a connection or response that
// never starts. Cleared by the first text, or when the call ends.
function firstChunkDeadline(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException(`First chunk timeout of ${ms}ms exceeded`, 'TimeoutError')),
    ms,
  );
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// The event fields that stay empty whenever no answer was generated.
const NO_RESPONSE = {
  responseText: null,
  promptTokens: null,
  completionTokens: null,
  costUsd: null,
  timeToFirstTokenMs: null,
};

// Sent to the client as a data-retrieval part so the e2e eval runner
// (jordannedyck-ai/run_e2e.py) and the Checkly chat check can see what was
// retrieved. Only written when EMIT_RETRIEVAL is set or the request carries a
// valid x-monitor-token, so production visitors never see knowledge-base
// filenames, chunk ids or text. Since E.2 (2026-11-01) visitors do see the
// titles of the sources an answer cites, through the data-sources part
// (buildSources in lib/citations.ts), and nothing else about the chunks.
type RetrievalAnnotation = RetrievalData;

type SearchResult = {
  content: string;
  similarity: number;
  metadata: { filename?: string; category?: string; chunk_id?: string; title?: string };
};

// Stored with the event, never sent to the client.
type RetrievalMeta = {
  // KB category of the best match: the free topic label (decided 2026-10-14).
  topCategory: string | null;
  // Reported by the backend's /search once it exposes one; null until then.
  indexVersion: string | null;
  // The retrieval method /search reports, e.g. "hybrid-lock3-bm25-rrf60";
  // null from backends that predate it. Hybrid search left index_version
  // unchanged, so this is what traces a ranker change in chat_events.
  ranker: string | null;
};

async function searchExperience(
  query: string,
): Promise<{
  context: string;
  retrieval: RetrievalAnnotation;
  meta: RetrievalMeta;
  // Set when /search failed or timed out. The caller then sends the visitor
  // the error state instead of an answer the model wrote without sources.
  failure?: string;
}> {
  const apiUrl = backendUrl();
  const noMeta: RetrievalMeta = { topCategory: null, indexVersion: null, ranker: null };
  try {
    const response = await fetch(`${apiUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, n_results: 5 }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });

    const data: { results?: SearchResult[]; index_version?: string; ranker?: string } =
      await response.json();
    const indexVersion = typeof data.index_version === 'string' ? data.index_version : null;
    const ranker = typeof data.ranker === 'string' ? data.ranker : null;

    if (data.results && data.results.length > 0) {
      // Only id and title: no relevance score, category or file path, which do
      // not help the model and can leak into answers. On the same prompt this
      // layout cited better than the old one (eval 2026-10-21/22). MUST MATCH
      // search_experience() in jordannedyck-ai/run_eval.py, source format "labelled".
      const context = data.results
        .map((r, i) =>
          `### Result ${i + 1}\n` +
          `**Id**: ${r.metadata.chunk_id}\n` +
          `**Title**: ${r.metadata.title}\n\n` +
          `${r.content}\n\n---`
        )
        .join('\n\n');
      const chunks = data.results.map((r) => ({
        chunk_id: r.metadata.chunk_id ?? null,
        filename: r.metadata.filename ?? null,
        title: r.metadata.title ?? null,
        similarity: Math.round(r.similarity * 10000) / 10000,
        content: r.content,
      }));
      const best = data.results.reduce((a, b) => (b.similarity > a.similarity ? b : a));
      return {
        context,
        retrieval: { query, status: 'ok', chunks },
        meta: { topCategory: best.metadata.category ?? null, indexVersion, ranker },
      };
    }

    return {
      context: 'No relevant information found.',
      retrieval: { query, status: 'empty', chunks: [] },
      meta: { ...noMeta, indexVersion, ranker },
    };
  } catch (error) {
    console.error('Search error:', error);
    return {
      context: 'Unable to search knowledge base.',
      retrieval: { query, status: 'error', chunks: [] },
      meta: noMeta,
      failure: `search: ${error instanceof Error ? error.name : 'error'}`,
    };
  }
}

// Every row goes through here: visitors' emails and phone numbers are
// replaced before storage (decided 2026-10-14), and the row is labelled.
function logRedacted(event: ChatEvent): Promise<string | null> {
  const q = redactPii(event.query);
  const r = event.responseText == null ? null : redactPii(event.responseText);
  const pii = q.found || r?.found;
  return logChatEvent({
    ...event,
    query: q.text,
    responseText: r ? r.text : null,
    flags: pii ? { ...event.flags, pii: true } : event.flags,
  });
}

export async function POST(req: NextRequest) {
  const requestStart = Date.now();
  const body = await req.json().catch(() => null);
  const input = parseChatInput(body);
  if (!input.ok && input.status === 400) {
    return NextResponse.json({ error: input.reason }, { status: 400 });
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const { sessionId } = await getOrCreateSessionId();
  const userAgent = req.headers.get('user-agent');
  const isSynthetic = isMonitorRequest(req);
  const source = parseSource(body);
  const clientId = parseClientId(body);
  const query = input.lastUserContent;
  const elapsed = () => Date.now() - requestStart;

  // Shared by the two early exits, which never reach retrieval.
  const rejectedEvent = {
    sessionId, ipHash, userAgent,
    // Stored truncated: a rejected request may be oversize.
    query: query.slice(0, MAX_USER_MESSAGE_CHARS),
    queryLength: query.length,
    model: MODEL,
    turnIndex: input.turnIndex,
    isSynthetic,
    source,
    clientId,
    promptVersion: PROMPT_VERSION,
    ...NO_RESPONSE,
  };

  // Monitor requests skip the rate limit so Checkly never trips it.
  const limit = isSynthetic ? { allowed: true as const } : await checkRateLimit(ipHash);
  if (!limit.allowed) {
    logRedacted({
      ...rejectedEvent,
      latencyMs: elapsed(),
      error: `rate_limited:${limit.reason}`,
      rateLimited: true,
      flags: freeLabels(query, null),
    });
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (!input.ok) {
    logRedacted({
      ...rejectedEvent,
      latencyMs: elapsed(),
      error: 'rejected:oversize',
      rateLimited: false,
      flags: { ...freeLabels(query, null), oversize: true, oversize_reason: input.reason },
    });
    return NextResponse.json(
      { error: 'Message or conversation too long. Please start a new conversation.' },
      { status: 413 },
    );
  }

  const { messages, turnIndex } = input;
  // Follow-ups are searched on a standalone rewrite; `query` stays the
  // visitor's own words for logging and labels.
  const rewrite = await rewriteQuery(messages);
  const searchStart = Date.now();
  const { context, retrieval, meta, failure } = await searchExperience(rewrite.query);
  const retrievalMs = Date.now() - searchStart;

  const systemPrompt = buildSystemPrompt(context);

  let firstTokenAt: number | null = null;

  const baseEvent = {
    sessionId,
    ipHash,
    userAgent,
    query,
    queryLength: query.length,
    source,
    clientId,
    promptVersion: PROMPT_VERSION,
    indexVersion: meta.indexVersion,
    retrievalMs,
    topicTags: meta.topCategory ? [meta.topCategory] : null,
    model: MODEL,
    turnIndex,
    retrievalStatus: retrieval.status,
    chunkIds: retrieval.chunks
      .map((c) => c.chunk_id)
      .filter((id): id is string => id !== null),
    topSimilarity: retrieval.chunks.length
      ? Math.max(...retrieval.chunks.map((c) => c.similarity))
      : null,
    isSynthetic,
    flags: {
      ...(input.droppedRoles.length ? { dropped_roles: input.droppedRoles } : {}),
      // In flags rather than a column, so no schema change. Absent when
      // /search reported none.
      ...(meta.ranker ? { ranker: meta.ranker } : {}),
      // Logged so retrieval can be audited. time_to_first_token_ms already
      // includes `ms`; turn_index > 1 picks out the follow-ups.
      query_rewrite: {
        status: rewrite.status,
        ...(rewrite.status === 'skipped'
          ? {}
          : {
              // Redacted like query, which holds the same visitor text.
              query: redactPii(rewrite.query).text,
              ms: rewrite.ms,
              model: REWRITE_MODEL,
              cost_usd: rewrite.costUsd,
            }),
      },
    },
  };

  const logFailure = (err: unknown) =>
    logRedacted({
      ...baseEvent,
      ...NO_RESPONSE,
      flags: { ...baseEvent.flags, ...freeLabels(query, null) },
      latencyMs: elapsed(),
      error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      rateLimited: false,
    });

  // With no retrieved context the model answers from nothing and invents
  // facts (dev, 2026-11-01: a made-up Loblaw role, no sources, judge skipped).
  if (failure) {
    await logFailure(new Error(failure));
    return createUIMessageStreamResponse({
      stream: createUIMessageStream<ChatUIMessage>({
        execute: ({ writer }) => {
          writer.write({ type: 'start' });
          writer.write({ type: 'error', errorText: 'Search is unavailable.' });
          writer.write({ type: 'finish' });
        },
      }),
    });
  }

  try {
    const stream = createUIMessageStream<ChatUIMessage>({
      execute: async ({ writer }) => {
        // The start part goes first so the data parts below join the same
        // assistant message as the text.
        writer.write({ type: 'start' });
        if (process.env.EMIT_RETRIEVAL || isSynthetic) {
          writer.write({ type: 'data-retrieval', data: retrieval });
        }
        // Resolved once onFinish has written its parts, or the call failed.
        // The finish part is sent after it, so the event id is never late.
        let settle = () => {};
        const settled = new Promise<void>((resolve) => { settle = resolve; });
        // The answer with its [chunk-id] citations, which the visitor's stream
        // and onFinish's `text` no longer carry.
        const cited = { raw: '' };
        const firstChunk = firstChunkDeadline(ANSWER_TIMEOUT.firstChunkMs);
        const result = streamText({
          // Chat Completions, as with AI SDK v4 and run_eval.py; the v7
          // provider's default is the Responses API.
          model: openai.chat(MODEL),
          system: systemPrompt,
          messages,
          temperature: 0.7,
          maxOutputTokens: 1000,
          abortSignal: firstChunk.signal,
          timeout: { totalMs: ANSWER_TIMEOUT.totalMs },
          experimental_transform: stripCitationsTransform(cited),
          onChunk: ({ chunk }) => {
            if (firstTokenAt === null && chunk.type === 'text-delta') {
              firstTokenAt = Date.now();
              firstChunk.clear();
            }
          },
          onEnd: async ({ text, usage }) => {
            firstChunk.clear();
            try {
              const promptTokens = usage.inputTokens ?? null;
              const completionTokens = usage.outputTokens ?? null;
              const { segments, citedIds } = parseCitations(cited.raw);
              if (process.env.EMIT_RETRIEVAL || isSynthetic) {
                writer.write({ type: 'data-citations', data: { answer: cited.raw, segments } });
              }
              // Every request: titles and numbers only, so the client can mark
              // cited sentences and list the sources under the answer.
              writer.write({ type: 'data-sources', data: buildSources(segments, retrieval.chunks) });
              const rowId = await logRedacted({
                ...baseEvent,
                flags: {
                  ...baseEvent.flags,
                  ...freeLabels(query, text),
                  citations: {
                    ...citationLabels(segments, retrieval.chunks),
                    // Redacted like response_text, which holds the same answer
                    // without its citations.
                    answer: redactPii(cited.raw).text,
                  },
                },
                citedChunkIds: citedIds,
                responseText: text,
                promptTokens,
                completionTokens,
                costUsd:
                  promptTokens != null && completionTokens != null
                    ? estimateCostUsd(MODEL, promptTokens, completionTokens)
                    : null,
                latencyMs: elapsed(),
                timeToFirstTokenMs: firstTokenAt ? firstTokenAt - requestStart : null,
                error: null,
                rateLimited: false,
              });
              // The row id lets the visitor rate this answer (POST /api/feedback,
              // which also checks the jb_sid cookie). Not sent to Checkly, which
              // never rates, so the monitor stream is unchanged.
              if (rowId && !isSynthetic) {
                writer.write({ type: 'data-event', data: { id: rowId } });
              }
              // Paid labels run after the insert and update the row. Skipped for
              // Checkly's test chats, which would only pay to label a fixed question.
              if (rowId && !isSynthetic) {
                const userTurns = messages.filter((m) => m.role === 'user');
                void paidLabels({
                  rowId,
                  query,
                  previousQuery: userTurns.length > 1 ? userTurns[userTurns.length - 2].content : null,
                  answer: text,
                  segments,
                  chunks: retrieval.chunks,
                });
              }
            } finally {
              settle();
            }
          },
          onError: async ({ error }) => {
            firstChunk.clear();
            await logFailure(error);
            settle();
          },
          // Only ANSWER_TIMEOUT aborts the call. The SDK ends the stream without
          // an error part; this one puts the visitor's page in its error state.
          onAbort: async () => {
            firstChunk.clear();
            writer.write({ type: 'error', errorText: 'The answer timed out.' });
            await logFailure(new Error('timeout'));
            settle();
          },
        });

        writer.merge(toUIMessageStream({ stream: result.stream, sendStart: false, sendFinish: false }));
        await settled;
        writer.write({ type: 'finish' });
      },
    });
    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    logFailure(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
