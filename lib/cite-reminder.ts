import type { ChatMessage } from './chat-input';

// gpt-4o left follow-up answers uncited: the client sends earlier answers back
// with their citations stripped, and the model copied its own uncited replies.
// One system message after the history, before the latest question, on
// follow-ups only. Measured 2026-11-01 on index e33e7aae: follow-up turns cited
// 17/36 without it, 36/36 with it (jordannedyck-ai/eval_runs/mt-citerem-e33e_2026-11-01.json).
// MUST MATCH CITE_REMINDER in jordannedyck-ai/run_eval.py, text and placement.
export const CITE_REMINDER = `The earlier assistant replies in this conversation had their chunk-id citations removed before the visitor saw them. The citation rule has not changed: cite this answer per sentence from the KNOWLEDGE BASE CONTEXT, as the first answer was cited.`;

export type ModelChatMessage = ChatMessage | { role: 'system'; content: string };

// Runs on the server after parseChatInput, which drops every client-sent
// system turn, so a client can neither supply the reminder nor remove it.
// Expects the last message to be the visitor's, as parseChatInput guarantees.
export function withCiteReminder(messages: ChatMessage[]): {
  messages: ModelChatMessage[];
  added: boolean;
} {
  if (messages.length <= 1) return { messages, added: false };
  return {
    messages: [
      ...messages.slice(0, -1),
      { role: 'system', content: CITE_REMINDER },
      messages[messages.length - 1],
    ],
    added: true,
  };
}
