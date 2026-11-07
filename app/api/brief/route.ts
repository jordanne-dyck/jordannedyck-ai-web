import { openai } from '@ai-sdk/openai';
import { APICallError, generateText, Output } from 'ai';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, hashIp } from '@/lib/ip';
import { checkRateLimit } from '@/lib/rate-limit';
import { BRIEF_SYSTEM_PROMPT, briefPrompt, composeBrief, parseBriefInput } from '@/lib/concierge';
import { projectBySlug } from '@/lib/projects';

export const dynamic = 'force-dynamic';

// POST /api/brief {messages: [{role, content}], purpose?}
// The concierge pilot's note (lib/concierge.ts): drafts the email a visitor
// sends Jordanne, from their conversation. Nothing is stored, and the note and
// conversation are never logged. On any failure the panel uses its template,
// so this only ever improves the note.

const MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 12_000;

// What the model extracts; lib/concierge.ts composeBrief writes the note.
const FIELDS = z.object({
  name: z.string().nullable(),
  role: z.string().nullable(),
  company: z.string().nullable(),
  topics: z.array(z.string()),
  unanswered: z.array(z.string()),
  wants: z.string().nullable(),
});

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
    const { output } = await generateText({
      model: openai.chat(MODEL),
      temperature: 0,
      maxOutputTokens: 300,
      output: Output.object({ schema: FIELDS }),
      maxRetries: 0,
      system: BRIEF_SYSTEM_PROMPT,
      prompt: briefPrompt(input.turns),
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Opened from a project panel: its title, looked up here so the client
    // can't put arbitrary text in the note.
    const slug = (body as { project?: unknown })?.project;
    const about = typeof slug === 'string' ? (projectBySlug(slug)?.title ?? null) : null;
    return NextResponse.json({ brief: composeBrief(output, input.turns, input.purpose, about) });
  } catch (error) {
    // The error's name and status only: the request holds the visitor's
    // conversation, and the provider's message can echo it.
    const status = APICallError.isInstance(error) ? error.statusCode : undefined;
    console.error('Brief draft error:', error instanceof Error ? error.name : 'unknown', status ?? '');
    return NextResponse.json({ error: 'draft failed' }, { status: 502 });
  }
}
