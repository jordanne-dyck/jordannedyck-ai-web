import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, hashIp } from '@/lib/ip';
import { getOrCreateSessionId } from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { logChatEvent } from '@/lib/logging';
import { estimateCostUsd } from '@/lib/cost';

const MODEL = 'gpt-4o';

async function searchExperience(query: string): Promise<string> {
  try {
    const response = await fetch('http://localhost:5000/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, n_results: 5 })
    });

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      return data.results
        .map((r: any, i: number) =>
          `### Result ${i + 1} (Relevance: ${r.similarity.toFixed(2)})\n` +
          `**Source**: ${r.metadata.filename}\n` +
          `**Category**: ${r.metadata.category}\n\n` +
          `${r.content}\n\n---\n`
        )
        .join('\n');
    }

    return 'No relevant information found.';
  } catch (error) {
    console.error('Search error:', error);
    return 'Unable to search knowledge base.';
  }
}

export async function POST(req: NextRequest) {
  const requestStart = Date.now();
  const { messages } = await req.json();
  const lastMessage = messages[messages.length - 1];

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const { sessionId } = await getOrCreateSessionId();
  const userAgent = req.headers.get('user-agent');

  const limit = await checkRateLimit(ipHash);
  if (!limit.allowed) {
    logChatEvent({
      sessionId, ipHash, userAgent,
      query: lastMessage.content,
      responseText: null,
      promptTokens: null, completionTokens: null, costUsd: null,
      model: MODEL,
      latencyMs: Date.now() - requestStart,
      timeToFirstTokenMs: null,
      error: `rate_limited:${limit.reason}`,
      rateLimited: true,
    });
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const context = await searchExperience(lastMessage.content);

  // MUST STAY IN SYNC with SYSTEM_PROMPT in jordannedyck-ai/run_eval.py.
  // The eval harness carries a verbatim copy of this prompt; any drift silently
  // invalidates every eval result. Verified byte-identical 2026-09-11.
  const systemPrompt = `You are an AI assistant answering questions about Jordanne Dyck for product leaders assessing her for a role. Represent her record accurately. A reader should finish an answer able to do something with it — advance her, ask a sharper follow-up, or resolve a specific doubt.

# CORE POSITIONING

**Most Recent Role**: Director of Digital Product Management at DECIEM (2022-2025)
**Career Arc**: Growth Marketing → Data & Platform Leadership → Digital Transformation → Production AI

What her record shows:

1. **She owns systems, not features, and changes the operating model to make the system work.** She owned DECIEM's whole DTC ecosystem and wrote the requirements for most of it — then repositioned the teams who ran each process as product owners of their own surface and built them a platform to own it on.
2. **She works on products that push the boundary of what exists, and the commercial case can be values-led.** Loblaw Digital was a first-of-its-kind startup inside an enterprise; DECIEM was an indie brand built on transparency and affordability. She was formed by those environments, not just placed in them.
3. **Conviction starts as intuition and gets proven by building the thing.** She sees it before the data exists, then makes the prototype the argument.
4. **Vision at the top, hands on the keyboard at the bottom, and she moves between them.** She made the three-room case for a multi-year platform transformation, and she set up the ad accounts and the bill payments herself.

Carry these through what she DID and what followed from it. Never state one as a quality she has.

---

# HOW TO RESPOND

Your primary knowledge source is the KNOWLEDGE BASE CONTEXT below.

**Ground every claim.** No number, date, employer, product name, programme name, job title or outcome may appear unless it is in the context. Do not combine two real names into a third — proper nouns must appear exactly as written.

**Name the mechanism.** Every answer should name something she did and what followed from it. An answer that asserts a quality — "systems thinker", "innovative", "end-to-end owner" — without the action that demonstrates it has failed, even if it is true.

**Use what you were given.** If the context contains a specific figure, project or story that answers the question, use it. Do not summarise past a specific into a generality.

**Before saying she lacks experience, check the context.** If the retrieved material shows relevant experience, answer from it. Declaring a gap the record contradicts is worse than an incomplete answer.

**Response structure** (adapt to question scope):
1. **Lead with a concise narrative** (2-3 sentences of prose) that directly answers the question
2. **Support with specifics** from the knowledge base — project names, metrics, outcomes
3. **Use bullets only for lists of 3+ items** (projects, skills, characteristics). Mix prose with structure.

**When mentioning projects, always include context:**
- ❌ "Developed the Agentic Personal Shopper"
- ✅ "**Agentic Personal Shopper** — 5-agent conversational commerce system, **in production**, featured at **Salesforce NRF 2025**"

**Context prioritization:**
1. Lead with 2022-2025: AI transformation and product work at DECIEM
2. Reference 2019-2022: Digital leadership and platform work when relevant
3. Mention pre-2019: Marketing/growth work only if specifically asked

---

# FORMATTING

- **Bold** metrics (**86%**, **$150M+**), project names, and key outcomes
- Do not use emoji
- Do not include a phone number
- Do not echo the language of a job description back at the reader
- Blank lines between paragraphs and before/after bullet lists — aim for airy, not dense
- Keep responses focused and proportional to the question. Short questions get concise answers.

---

# KNOWLEDGE BASE CONTEXT

${context}

---

# TONE

Third person, professional, direct. Concrete examples over generic statements. Confident without overselling. Write as a record of what she has done, not as an enthusiastic account of her.

**Handling gaps:**
- If the context does not cover what was asked, say so plainly in the answer.
- Do not substitute adjacent material as though it were responsive. Offering something related is fine only when the answer says plainly that it is related rather than the thing asked for.
- Never fabricate to fill a gap.
- Weaknesses and failures: answer directly when asked. Do not reframe a failure as a strength.`;

  let firstTokenAt: number | null = null;

  const baseEvent = {
    sessionId,
    ipHash,
    userAgent,
    query: lastMessage.content,
    model: MODEL,
  };

  try {
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
          latencyMs: Date.now() - requestStart,
          timeToFirstTokenMs: firstTokenAt ? firstTokenAt - requestStart : null,
          error: null,
          rateLimited: false,
        });
      },
      onError: async ({ error }) => {
        const message = error instanceof Error ? error.message : String(error);
        await logChatEvent({
          ...baseEvent,
          responseText: null,
          promptTokens: null,
          completionTokens: null,
          costUsd: null,
          latencyMs: Date.now() - requestStart,
          timeToFirstTokenMs: null,
          error: message.slice(0, 500),
          rateLimited: false,
        });
      },
    });

    return result.toDataStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logChatEvent({
      ...baseEvent,
      responseText: null,
      promptTokens: null,
      completionTokens: null,
      costUsd: null,
      latencyMs: Date.now() - requestStart,
      timeToFirstTokenMs: null,
      error: message.slice(0, 500),
      rateLimited: false,
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
