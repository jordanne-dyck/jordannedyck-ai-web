import { openai } from '@ai-sdk/openai';
import { generateText, Output, type LanguageModelUsage } from 'ai';
import { z } from 'zod';
import { pool } from './db';
import { estimateCostUsd } from './cost';
import { buildSystemPrompt } from './system-prompt';
import { FIRST_PERSON_RE, PHONE_RE, gapAdmitted } from './eval-checks';
import type { CitationChunk, Segment } from './citations';

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
  /\bpretend\s+(?:that\s+)?(?:you\s+are|you're|to\s+be)\b/i,
  /\brole[-\s]?play\s+as\b/i,
  /\bfrom\s+now\s+on,?\s+you\b/i,
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

// The CORE POSITIONING section of the system prompt. Answers may state these
// facts without a chunk behind them, so the judge counts them as a source.
// Added 2026-10-15 after the judge flagged "managed the entire .com ecosystem"
// (D02), which the positioning states. Read from lib/system-prompt.ts, like
// LEAK_LINES, so there is no second copy.
const POSITIONING: string = (() => {
  const template = buildSystemPrompt('');
  const start = template.indexOf('# CORE POSITIONING');
  const end = template.indexOf('# HOW TO RESPOND');
  return template.slice(start, end).replace(/\n-{3,}\s*$/, '').trim();
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
  segments: Segment[];
  chunks: CitationChunk[];
};

const costOf = (u: LanguageModelUsage) => estimateCostUsd(LABEL_MODEL, u.inputTokens ?? 0, u.outputTokens ?? 0);

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
  const { output: object, usage } = await generateText({
    model: openai.chat(LABEL_MODEL),
    temperature: 0,
    output: Output.object({ schema: z.object({ label: z.enum(['on', 'off']) }) }),
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

// Answers longer than this many segments are judged on their first ones only.
const MAX_JUDGED_SEGMENTS = 40;

type ClaimVerdict = { n: number; ids: string[]; text: string; supported: 'other' | 'no'; reason: string };

// Judges each cited segment against the chunks it cites (claim by claim since
// 2026-10-15; before, one verdict for the whole answer). Catches a reading the
// source does not state, the ops-011 kind of defect, as well as invented facts.
// The overall verdict keeps its three values so the dashboard reads it as before.
// Exported for the citation side-by-side check; production calls it through paidLabels.
export async function judgeGrounding(
  query: string,
  answer: string,
  segments: Segment[],
  chunks: CitationChunk[],
): Promise<{
  verdict: 'grounded' | 'partial' | 'not_grounded';
  reason: string;
  checked: number;
  claims: ClaimVerdict[];
  cost: number;
}> {
  // An answer with no citation markers is judged as one uncited segment.
  const judged = (segments.length ? segments : [{ text: answer, ids: [] }]).slice(0, MAX_JUDGED_SEGMENTS);
  const { output: object, usage } = await generateText({
    model: openai.chat(LABEL_MODEL),
    temperature: 0,
    output: Output.object({
      schema: z.object({
        claims: z.array(
          z.object({
            n: z.number().int(),
            supported: z.enum(['yes', 'other', 'no']),
            reason: z.string().describe('Empty for "yes". Otherwise one sentence naming what the source does not say.'),
          }),
        ),
      }),
    }),
    system:
      'You check whether each numbered claim in an answer is supported by the source chunks it cites. ' +
      'Each claim lists the chunk ids it cites; the context gives each chunk under its id. ' +
      'The context also has a [positioning] block of facts about her that the site states on her behalf. ' +
      'A claim the positioning supports is "yes", whatever it cites. ' +
      'Check every specific: numbers, dates, employers, product and project names, job titles, outcomes, ' +
      'and any statement about how she works or what she prefers. ' +
      '"yes": the cited chunks say it. ' +
      '"other": the cited chunks do not say it, but another chunk in the context does. ' +
      '"no": no chunk in the context says it. ' +
      'A claim that goes further than its source — a stronger word, a bigger number, or a reading the source does not state — is not supported. ' +
      'A claim citing "none" is "yes" if it only says the context does not cover something, or makes no factual claim; ' +
      'otherwise judge it against the whole context. ' +
      'Return one entry per claim. Judge only against the context. Do not use outside knowledge.',
    prompt:
      `QUESTION:\n${query}\n\nCONTEXT:\n[positioning]\n${POSITIONING}\n\n` +
      chunks.map((c, i) => `[${c.chunk_id ?? `result ${i + 1}`}]\n${c.content}`).join('\n\n') +
      `\n\nCLAIMS:\n` +
      judged.map((s, i) => `${i + 1}. (cites: ${s.ids.join(', ') || 'none'}) ${s.text}`).join('\n'),
    abortSignal: AbortSignal.timeout(30_000),
  });

  // The model's numbering is checked against the segments; anything it made up is dropped.
  const failed: ClaimVerdict[] = object.claims
    .filter((c) => c.supported !== 'yes' && judged[c.n - 1])
    .map((c) => {
      const s = judged[c.n - 1];
      return {
        n: c.n,
        ids: s.ids,
        // The claim text and reason can quote the question or answer, so they
        // are redacted like them.
        text: redactPii(s.text).text.slice(0, 200),
        supported: c.supported as 'other' | 'no',
        reason: redactPii(c.reason).text.slice(0, 200),
      };
    });
  const unsupported = failed.filter((c) => c.supported === 'no').length;
  const verdict =
    unsupported === 0 ? 'grounded' : unsupported * 2 > judged.length ? 'not_grounded' : 'partial';
  const first = failed.find((c) => c.supported === 'no') ?? failed[0];
  const reason = first
    ? `Claim ${first.n} (${first.ids.join(', ') || 'uncited'}): ${first.reason}`.slice(0, 300)
    : `All ${judged.length} claims supported${failed.length ? ', some by a chunk they do not cite' : ''}.`;
  return { verdict, reason, checked: judged.length, claims: failed, cost: costOf(usage) };
}

// Fire-and-forget after the row is inserted. Each call is independent: one
// failing leaves the others' labels in place and records the error.
export async function paidLabels(input: PaidLabelInput): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const [mod, topic, judge] = await Promise.allSettled([
    moderate(input.query),
    classifyTopic(input.query, input.previousQuery),
    input.chunks.length
      ? judgeGrounding(input.query, input.answer, input.segments, input.chunks)
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
      flags.judge = {
        verdict: judge.value.verdict,
        reason: judge.value.reason,
        checked: judge.value.checked,
        claims: judge.value.claims,
      };
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
