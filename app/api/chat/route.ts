import { openai } from '@ai-sdk/openai';
import { createDataStreamResponse, streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, hashIp } from '@/lib/ip';
import { getOrCreateSessionId } from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { logChatEvent } from '@/lib/logging';
import { estimateCostUsd } from '@/lib/cost';
import { isMonitorRequest } from '@/lib/monitor';
import { parseChatInput, MAX_USER_MESSAGE_CHARS } from '@/lib/chat-input';
import { buildSystemPrompt } from '@/lib/system-prompt';
import { backendUrl } from '@/lib/backend';

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
  metadata: { filename?: string; category?: string; chunk_id?: string };
};

async function searchExperience(
  query: string,
): Promise<{ context: string; retrieval: RetrievalAnnotation }> {
  const apiUrl = backendUrl();
  try {
    const response = await fetch(`${apiUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, n_results: 5 })
    });

    const data: { results?: SearchResult[] } = await response.json();

    if (data.results && data.results.length > 0) {
      const context = data.results
        .map((r, i) =>
          `### Result ${i + 1} (Relevance: ${r.similarity.toFixed(2)})\n` +
          `**Source**: ${r.metadata.filename}\n` +
          `**Category**: ${r.metadata.category}\n\n` +
          `${r.content}\n\n---\n`
        )
        .join('\n');
      const chunks = data.results.map((r) => ({
        chunk_id: r.metadata.chunk_id ?? null,
        filename: r.metadata.filename ?? null,
        similarity: Math.round(r.similarity * 10000) / 10000,
        content: r.content,
      }));
      return { context, retrieval: { type: 'retrieval', status: 'ok', chunks } };
    }

    return {
      context: 'No relevant information found.',
      retrieval: { type: 'retrieval', status: 'empty', chunks: [] },
    };
  } catch (error) {
    console.error('Search error:', error);
    return {
      context: 'Unable to search knowledge base.',
      retrieval: { type: 'retrieval', status: 'error', chunks: [] },
    };
  }
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
    ...NO_RESPONSE,
  };

  // Monitor requests skip the rate limit so Checkly never trips it.
  const limit = isSynthetic ? { allowed: true as const } : await checkRateLimit(ipHash);
  if (!limit.allowed) {
    logChatEvent({
      ...rejectedEvent,
      latencyMs: elapsed(),
      error: `rate_limited:${limit.reason}`,
      rateLimited: true,
    });
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (!input.ok) {
    logChatEvent({
      ...rejectedEvent,
      latencyMs: elapsed(),
      error: 'rejected:oversize',
      rateLimited: false,
      flags: { oversize: true, oversize_reason: input.reason },
    });
    return NextResponse.json(
      { error: 'Message or conversation too long. Please start a new conversation.' },
      { status: 413 },
    );
  }

  const { messages, turnIndex } = input;
  const { context, retrieval } = await searchExperience(query);

  const systemPrompt = buildSystemPrompt(context);

  let firstTokenAt: number | null = null;

  const baseEvent = {
    sessionId,
    ipHash,
    userAgent,
    query,
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
    logChatEvent({
      ...baseEvent,
      ...NO_RESPONSE,
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
        const result = streamText({
          model: openai(MODEL),
          system: systemPrompt,
          messages,
          temperature: 0.7,
          onChunk: ({ chunk }) => {
            if (firstTokenAt === null && chunk.type === 'text-delta') {
              firstTokenAt = Date.now();
            }
          },
          onFinish: async ({ text, usage }) => {
            const promptTokens = usage.promptTokens ?? null;
            const completionTokens = usage.completionTokens ?? null;
            await logChatEvent({
              ...baseEvent,
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
          },
          onError: ({ error }) => logFailure(error),
        });

        result.mergeIntoDataStream(dataStream);
      },
    });
  } catch (err) {
    logFailure(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
