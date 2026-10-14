import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { pool } from './db';
import { estimateCostUsd } from './cost';
import { buildSystemPrompt } from './system-prompt';
import { FIRST_PERSON_RE, PHONE_RE, gapAdmitted } from './eval-checks';

// Labels for one chat turn, written to chat_events.flags.
//
// Free checks (freeLabels) run before the row is inserted. The paid ones
// (paidLabels: moderation, off-topic, judge) run after the insert and update
// the row, so a visitor never waits for them. Decided 2026-10-13: all three
// paid calls approved; moderation confirmed free 2026-10-14 (OpenAI guide:
// "The moderation endpoint is free to use").

const LABEL_MODEL = 'gpt-4o-mini';

const INJECTION_RES = [
  /\bignore\s+(?:all\s+|any\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|messages?|rules)\b/i,
  /\bdisregard\s+(?:all\s+|any\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier)?\s*(?:instructions?|prompts?|rules)\b/i,
  /\bsystem\s+prompt\b/i,
  /\byou\s+are\s+now\b/i,
  /\brepeat\s+(?:the\s+|everything\s+|all\s+)?(?:text\s+)?above\b/i,
  /\b(?:developer|dan|jailbreak)\s+mode\b/i,
  /\byour\s+(?:initial|original|hidden)\s+(?:instructions?|prompt)\b/i,
];

// Lines of the instruction sections of the system prompt, normalised. An
// answer that reproduces one of them verbatim has leaked the prompt. The
// CORE POSITIONING section is left out: it states facts an answer may
// legitimately repeat, and so are the ✅/❌ example lines, which are samples of
// a good answer. Built from lib/system-prompt.ts at load, so there is no
// second copy of the prompt to drift.
// Section headings are too common as plain phrases ("how to respond") to use
// alone; this one is not.
const LEAK_MARKERS = ['knowledge base context'];
const LEAK_LINES: string[] = (() => {
  const template = buildSystemPrompt('');
  const start = template.indexOf('# HOW TO RESPOND');
  return template
    .slice(start)
    .split('\n')
    .filter((l) => !l.includes('✅') && !l.includes('❌'))
    .map(normalise)
    .filter((l) => l.length >= 40);
})();

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*_`#>❌✅-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// North American and international numbers with 10 or more digits. Years and
// money amounts never reach 10 digits with these separators.
const PHONE_ANY_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

// Replaces visitors' emails and phone numbers before a row is stored.
// Jordanne's own published number is left as is. Storage only: the original
// text has already gone to OpenAI to be answered. Decided 2026-10-14.
export function redactPii(text: string): { text: string; found: boolean } {
  let found = false;
  const out = text
    .replace(EMAIL_RE, () => {
      found = true;
      return '[email]';
    })
    .replace(PHONE_ANY_RE, (m) => {
      if (PHONE_RE.test(m)) return m;
      found = true;
      return '[phone]';
    });
  return { text: out, found };
}

export function freeLabels(query: string, answer: string | null): Record<string, true> {
  const flags: Record<string, true> = {};
  if (INJECTION_RES.some((re) => re.test(query))) flags.injection = true;
  if (answer) {
    const a = normalise(answer);
    if (LEAK_MARKERS.some((m) => a.includes(m)) || LEAK_LINES.some((l) => a.includes(l))) {
      flags.prompt_leak = true;
    }
    if (gapAdmitted(answer)) flags.gap_declared = true;
    if (FIRST_PERSON_RE.test(answer)) flags.first_person = true;
    if (PHONE_RE.test(answer)) flags.phone = true;
  }
  return flags;
}

export type PaidLabelInput = {
  rowId: string;
  query: string;
  previousQuery: string | null;
  answer: string;
  chunks: string[];
};

type Usage = { promptTokens: number; completionTokens: number };
const costOf = (u: Usage) => estimateCostUsd(LABEL_MODEL, u.promptTokens, u.completionTokens);

async function moderate(query: string): Promise<{ flagged: boolean; categories: string[] }> {
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: query }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`moderation HTTP ${res.status}`);
  const data = (await res.json()) as {
    results: { flagged: boolean; categories: Record<string, boolean> }[];
  };
  const r = data.results[0];
  return {
    flagged: r.flagged,
    categories: Object.entries(r.categories)
      .filter(([, v]) => v)
      .map(([k]) => k),
  };
}

async function classifyTopic(
  query: string,
  previousQuery: string | null,
): Promise<{ offTopic: boolean; cost: number }> {
  const { object, usage } = await generateObject({
    model: openai(LABEL_MODEL),
    temperature: 0,
    schema: z.object({ label: z.enum(['on', 'off']) }),
    system:
      "You label questions sent to the chatbot on Jordanne Dyck's personal website. " +
      "The chatbot answers questions about Jordanne's career, experience, projects, skills " +
      'and working style, for people assessing her for a role. ' +
      'Label "on" if the question is about Jordanne, her work, hiring or working with her, ' +
      'the website or chatbot itself, or is a greeting or a follow-up to an earlier question. ' +
      'Label "off" if it asks for something unrelated: general knowledge, coding or writing help, ' +
      'questions about other people, or using the chatbot as a free assistant.',
    prompt:
      (previousQuery ? `Previous question: ${previousQuery}\n` : '') + `Question: ${query}`,
    abortSignal: AbortSignal.timeout(15_000),
  });
  return { offTopic: object.label === 'off', cost: costOf(usage) };
}

async function judgeGrounding(
  query: string,
  answer: string,
  chunks: string[],
): Promise<{ verdict: 'grounded' | 'partial' | 'not_grounded'; reason: string; cost: number }> {
  const { object, usage } = await generateObject({
    model: openai(LABEL_MODEL),
    temperature: 0,
    schema: z.object({
      verdict: z.enum(['grounded', 'partial', 'not_grounded']),
      reason: z.string().describe('One sentence naming the unsupported claim, or why it is grounded.'),
    }),
    system:
      'You check whether an answer is supported by the retrieved context it was written from. ' +
      'Check every specific claim: numbers, dates, employers, product and project names, job titles, outcomes. ' +
      '"grounded": every specific claim appears in the context, or the answer only says the context does not cover the question. ' +
      '"partial": most claims are supported but at least one is not. ' +
      '"not_grounded": the main claims are not in the context. ' +
      'Judge only against the context. Do not use outside knowledge.',
    prompt:
      `QUESTION:\n${query}\n\nCONTEXT:\n${chunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}` +
      `\n\nANSWER:\n${answer}`,
    abortSignal: AbortSignal.timeout(30_000),
  });
  // The reason can quote the question or answer, so it is redacted like them.
  return { ...object, reason: redactPii(object.reason).text.slice(0, 300), cost: costOf(usage) };
}

// Fire-and-forget after the row is inserted. Each call is independent: one
// failing leaves the others' labels in place and records the error.
export async function paidLabels(input: PaidLabelInput): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const [mod, topic, judge] = await Promise.allSettled([
    moderate(input.query),
    classifyTopic(input.query, input.previousQuery),
    input.chunks.length
      ? judgeGrounding(input.query, input.answer, input.chunks)
      : Promise.resolve(null),
  ]);

  const flags: Record<string, unknown> = {};
  const errors: string[] = [];
  let cost = 0;

  if (mod.status === 'fulfilled') flags.moderation = mod.value;
  else errors.push(`moderation: ${String(mod.reason).slice(0, 120)}`);

  if (topic.status === 'fulfilled') {
    flags.off_topic = topic.value.offTopic;
    cost += topic.value.cost;
  } else errors.push(`off_topic: ${String(topic.reason).slice(0, 120)}`);

  if (judge.status === 'fulfilled') {
    if (judge.value) {
      flags.judge = { verdict: judge.value.verdict, reason: judge.value.reason };
      cost += judge.value.cost;
    } else {
      flags.judge = { verdict: 'skipped', reason: 'no chunks retrieved' };
    }
  } else errors.push(`judge: ${String(judge.reason).slice(0, 120)}`);

  flags.label_cost_usd = Math.round(cost * 1e6) / 1e6;
  if (errors.length) flags.labels_error = errors.join('; ');

  try {
    await pool.query(`UPDATE chat_events SET flags = flags || $2::JSONB WHERE id = $1`, [
      input.rowId,
      JSON.stringify(flags),
    ]);
  } catch (err) {
    console.error('paidLabels update failed:', err);
  }
}
