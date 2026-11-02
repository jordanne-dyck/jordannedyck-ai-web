// The labels a chat turn can carry in chat_events.flags, in one place so the
// admin filters, the counts on the dashboard and the deep health view agree.
// `sql` is a fixed condition on chat_events, never built from user input.

export type LabelKey =
  | 'injection'
  | 'off_topic'
  | 'prompt_leak'
  | 'moderation'
  | 'gap_declared'
  | 'first_person'
  | 'phone'
  | 'speculation'
  | 'not_grounded'
  | 'pii'
  | 'oversize'
  | 'thumbs_down'
  | 'thumbs_up';

export type LabelDef = {
  key: LabelKey;
  name: string;
  // 'abuse' labels are about the visitor; 'quality' labels are about the answer;
  // 'positive' marks a good answer and never flags a turn.
  kind: 'abuse' | 'quality' | 'positive';
  sql: string;
};

const flag = (k: string) => `(flags->>'${k}')::BOOLEAN IS TRUE`;

export const LABELS: LabelDef[] = [
  { key: 'injection', name: 'Injection', kind: 'abuse', sql: flag('injection') },
  { key: 'off_topic', name: 'Off-topic', kind: 'abuse', sql: flag('off_topic') },
  { key: 'prompt_leak', name: 'Prompt leak', kind: 'abuse', sql: flag('prompt_leak') },
  {
    key: 'moderation',
    name: 'Moderation',
    kind: 'abuse',
    sql: `(flags->'moderation'->>'flagged')::BOOLEAN IS TRUE`,
  },
  { key: 'gap_declared', name: 'Gap declared', kind: 'quality', sql: flag('gap_declared') },
  { key: 'first_person', name: 'First person', kind: 'quality', sql: flag('first_person') },
  { key: 'phone', name: 'Phone in answer', kind: 'quality', sql: flag('phone') },
  // T1.8. Shown and filterable, but not in FLAGGING_LABELS: its tier is still
  // Jordanne's decision, and run_eval.py keeps it non-blocking until then.
  { key: 'speculation', name: 'Speculation', kind: 'quality', sql: flag('speculation') },
  {
    key: 'not_grounded',
    name: 'Not grounded',
    kind: 'quality',
    sql: `flags->'judge'->>'verdict' = 'not_grounded'`,
  },
  { key: 'pii', name: 'Personal details', kind: 'abuse', sql: flag('pii') },
  { key: 'oversize', name: 'Oversize', kind: 'abuse', sql: flag('oversize') },
  // The visitor's own vote, written by POST /api/feedback (Phase 2).
  {
    key: 'thumbs_down',
    name: 'Thumbs down',
    kind: 'quality',
    sql: `flags->'feedback'->>'vote' = 'down'`,
  },
  {
    key: 'thumbs_up',
    name: 'Thumbs up',
    kind: 'positive',
    sql: `flags->'feedback'->>'vote' = 'up'`,
  },
];

export const LABEL_BY_KEY = Object.fromEntries(LABELS.map((l) => [l.key, l])) as Record<
  LabelKey,
  LabelDef
>;

// Labels that turn an otherwise successful turn's Outcome from "ok" to "flagged".
// Oversize rows already show as "rejected", and personal details are the
// visitor's own information, not a problem with the turn.
export const FLAGGING_LABELS: LabelKey[] = [
  'injection',
  'off_topic',
  'prompt_leak',
  'moderation',
  'gap_declared',
  'first_person',
  'phone',
  'not_grounded',
  'thumbs_down',
];

export function labelsOf(flags: Record<string, unknown>): LabelKey[] {
  const out: LabelKey[] = [];
  for (const l of LABELS) {
    if (l.key === 'moderation') {
      if ((flags.moderation as { flagged?: boolean } | undefined)?.flagged) out.push(l.key);
    } else if (l.key === 'not_grounded') {
      if ((flags.judge as { verdict?: string } | undefined)?.verdict === 'not_grounded') {
        out.push(l.key);
      }
    } else if (l.key === 'thumbs_down') {
      if ((flags.feedback as { vote?: string } | undefined)?.vote === 'down') out.push(l.key);
    } else if (l.key === 'thumbs_up') {
      if ((flags.feedback as { vote?: string } | undefined)?.vote === 'up') out.push(l.key);
    } else if (flags[l.key] === true) {
      out.push(l.key);
    }
  }
  return out;
}
