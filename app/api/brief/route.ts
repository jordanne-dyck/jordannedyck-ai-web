import { openai } from '@ai-sdk/openai';
import { APICallError, generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, hashIp } from '@/lib/ip';
import { checkRateLimit } from '@/lib/rate-limit';
import { BRIEF_SYSTEM_PROMPT, briefPrompt, cleanBrief, parseBriefInput } from '@/lib/concierge';

export const dynamic = 'force-dynamic';

// POST /api/brief {messages: [{role, content}], purpose?}
// The concierge pilot's note (lib/concierge.ts): drafts the email a visitor
// sends Jordanne, from their conversation. Nothing is stored, and the note and
// conversation are never logged. On any failure the panel uses its template,
// so this only ever improves the note.

const MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 12_000;

// Per pod, on top of the chat limit: a few drafts an hour per visitor. A
// restart forgets it, which is fine for a pilot.
const BRIEFS_PER_HOUR = 6;
const recent = new Map<string, number[]>();

function overBriefLimit(ipHash: string): boolean {
  const hourAgo = Date.now() - 3_600_000;
  const times = (recent.get(ipHash) ?? []).filter((t) => t > hourAgo);
  if (times.length >= BRIEFS_PER_HOUR) {
    recent.set(ipHash, times);
    return true;
  }
  times.push(Date.now());
  recent.set(ipHash, times);
  // Keep the map from growing without bound.
  if (recent.size > 5000) recent.clear();
  return false;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const input = parseBriefInput(body);
  if (!input.ok) return NextResponse.json({ error: input.reason }, { status: 400 });

  const ipHash = hashIp(getClientIp(req));
  // Fails open, like the chat route.
  const limit = await checkRateLimit(ipHash).catch(() => ({ allowed: true as const }));
  if (!limit.allowed || overBriefLimit(ipHash)) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  try {
    const { text } = await generateText({
      model: openai.chat(MODEL),
      temperature: 0.3,
      maxOutputTokens: 300,
      maxRetries: 0,
      system: BRIEF_SYSTEM_PROMPT,
      prompt: briefPrompt(input.turns, input.purpose),
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const brief = cleanBrief(text);
    if (!brief) return NextResponse.json({ error: 'no usable draft' }, { status: 502 });
    return NextResponse.json({ brief });
  } catch (error) {
    // The error's name and status only: the request holds the visitor's
    // conversation, and the provider's message can echo it.
    const status = APICallError.isInstance(error) ? error.statusCode : undefined;
    console.error('Brief draft error:', error instanceof Error ? error.name : 'unknown', status ?? '');
    return NextResponse.json({ error: 'draft failed' }, { status: 502 });
  }
}
