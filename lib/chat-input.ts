// Bounds on what a browser may send to /api/chat. The client supplies the
// whole conversation history, so without these anyone can send fabricated
// system turns or a very large history straight to gpt-4o.

// Decided 2026-10-13 (site-monitoring plan, Phase 1): N = 20 turns, M = 2,000 characters.
export const MAX_USER_TURNS = 20;
export const MAX_USER_MESSAGE_CHARS = 2000;
// Assistant turns are the model's own earlier answers, which can run past
// 2,000 characters legitimately. They get a looser cap so a fabricated giant
// "assistant" turn is still refused.
export const MAX_ASSISTANT_MESSAGE_CHARS = 4 * MAX_USER_MESSAGE_CHARS;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ParsedChatInput =
  | {
      ok: true;
      messages: ChatMessage[];
      lastUserContent: string;
      turnIndex: number;
      droppedRoles: string[];
    }
  | { ok: false; status: 400; reason: string }
  | {
      ok: false;
      status: 413;
      reason: string;
      lastUserContent: string;
      turnIndex: number;
    };

export function parseChatInput(body: unknown): ParsedChatInput {
  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, status: 400, reason: 'messages must be a non-empty array' };
  }

  // Only user and assistant turns are accepted from the client. Anything else
  // (system, tool, data) is dropped, and the dropped roles are recorded in flags.
  const messages: ChatMessage[] = [];
  const droppedRoles: string[] = [];
  for (const m of raw) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      messages.push({ role, content });
    } else {
      droppedRoles.push(typeof role === 'string' ? role : 'invalid');
    }
  }

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') {
    return { ok: false, status: 400, reason: 'last message must be from the user' };
  }

  const turnIndex = messages.filter((m) => m.role === 'user').length;
  const oversize = (reason: string): ParsedChatInput => ({
    ok: false,
    status: 413,
    reason,
    lastUserContent: last.content,
    turnIndex,
  });

  if (turnIndex > MAX_USER_TURNS) {
    return oversize(`more than ${MAX_USER_TURNS} turns`);
  }
  for (const m of messages) {
    const cap = m.role === 'user' ? MAX_USER_MESSAGE_CHARS : MAX_ASSISTANT_MESSAGE_CHARS;
    if (m.content.length > cap) {
      return oversize(`${m.role} message longer than ${cap} characters`);
    }
  }

  return { ok: true, messages, lastUserContent: last.content, turnIndex, droppedRoles };
}
