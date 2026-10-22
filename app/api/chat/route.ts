import { openai } from '@ai-sdk/openai';
import { createDataStreamResponse, streamText } from 'ai';
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
import { citationLabels, parseCitations, stripCitationsTransform } from '@/lib/citations';

const MODEL = 'gpt-4o';

// The event fields that stay empty whenever no answer was generated.
const NO_RESPONSE = {
  responseText: null,
  promptTokens: null,
  completionTokens: null,
  costUsd: null,
  timeToFirstTokenMs: null,
};

// Emitted to the client as an `8:` message annotation so the e2e eval runner
// (jordannedyck-ai/run_e2e.py) and the Checkly chat check can see what was
// retrieved. Only written when EMIT_RETRIEVAL is set or the request carries a
// valid x-monitor-token, so production visitors never see knowledge-base
// filenames, chunk ids or text.
type RetrievalAnnotation = {
  type: 'retrieval';
  status: 'ok' | 'empty' | 'error';
  chunks: {
    chunk_id: string | null;
    filename: string | null;
    similarity: number;
    content: string;
  }[];
};

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
};

async function searchExperience(
  query: string,
): Promise<{ context: string; retrieval: RetrievalAnnotation; meta: RetrievalMeta }> {
  const apiUrl = backendUrl();
  const noMeta: RetrievalMeta = { topCategory: null, indexVersion: null };
  try {
    const response = await fetch(`${apiUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, n_results: 5 })
    });

    const data: { results?: SearchResult[]; index_version?: string } = await response.json();
    const indexVersion = typeof data.index_version === 'string' ? data.index_version : null;

    if (data.results && data.results.length > 0) {
      // Only id and title: no score, category or file path, which do not help
      // the model and can leak into answers. The prompt supplies the <sources>
      // wrapper. MUST MATCH search_experience() in jordannedyck-ai/run_eval.py.
      const context = data.results
        .map((r) =>
          `<document id="${r.metadata.chunk_id}" title="${r.metadata.title}">\n` +
          `${r.content}\n` +
          `</document>`
        )
        .join('\n\n');
      const chunks = data.results.map((r) => ({
        chunk_id: r.metadata.chunk_id ?? null,
        filename: r.metadata.filename ?? null,
        similarity: Math.round(r.similarity * 10000) / 10000,
        content: r.content,
      }));
      const best = data.results.reduce((a, b) => (b.similarity > a.similarity ? b : a));
      return {
        context,
        retrieval: { type: 'retrieval', status: 'ok', chunks },
        meta: { topCategory: best.metadata.category ?? null, indexVersion },
      };
    }

    return {
      context: 'No relevant information found.',
      retrieval: { type: 'retrieval', status: 'empty', chunks: [] },
      meta: { ...noMeta, indexVersion },
    };
  } catch (error) {
    console.error('Search error:', error);
    return {
      context: 'Unable to search knowledge base.',
      retrieval: { type: 'retrieval', status: 'error', chunks: [] },
      meta: noMeta,
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
  const searchStart = Date.now();
  const { context, retrieval, meta } = await searchExperience(query);
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
    flags: input.droppedRoles.length ? { dropped_roles: input.droppedRoles } : {},
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

  try {
    return createDataStreamResponse({
      execute: (dataStream) => {
        if (process.env.EMIT_RETRIEVAL || isSynthetic) {
          dataStream.writeMessageAnnotation(retrieval);
        }
        // The answer with its [chunk-id] citations, which the visitor's stream
        // and onFinish's `text` no longer carry.
        const cited = { raw: '' };
        const result = streamText({
          model: openai(MODEL),
          system: systemPrompt,
          messages,
          temperature: 0.7,
          experimental_transform: stripCitationsTransform(cited),
          onChunk: ({ chunk }) => {
            if (firstTokenAt === null && chunk.type === 'text-delta') {
              firstTokenAt = Date.now();
            }
          },
          onFinish: async ({ text, usage }) => {
            const promptTokens = usage.promptTokens ?? null;
            const completionTokens = usage.completionTokens ?? null;
            const { segments, citedIds } = parseCitations(cited.raw);
            if (process.env.EMIT_RETRIEVAL || isSynthetic) {
              dataStream.writeMessageAnnotation({ type: 'citations', answer: cited.raw, segments });
            }
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
              dataStream.writeMessageAnnotation({ type: 'event', id: rowId });
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
          },
          onError: async ({ error }) => {
            await logFailure(error);
          },
        });

        result.mergeIntoDataStream(dataStream);
      },
    });
  } catch (err) {
    logFailure(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
