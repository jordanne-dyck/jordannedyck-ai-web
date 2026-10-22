import { SIGNATURE_ANNOTATION } from './turn-signature';

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
// An assistant turn as received, with the signature the server attached when
// it served the answer (lib/turn-signature.ts). Unverified until route.ts
// checks it against the session.
export type IncomingMessage = ChatMessage & { sig?: string };

export type ParsedChatInput =
  | {
      ok: true;
      messages: IncomingMessage[];
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
  const messages: IncomingMessage[] = [];
  const droppedRoles: string[] = [];
  for (const m of raw) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if (role === 'user' && typeof content === 'string') {
      messages.push({ role, content });
    } else if (role === 'assistant' && typeof content === 'string') {
      messages.push({ role, content, sig: signatureOf(m) });
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

// The signature useChat sends back in the message's annotations, if any.
function signatureOf(m: unknown): string | undefined {
  const annotations = (m as { annotations?: unknown })?.annotations;
  if (!Array.isArray(annotations)) return undefined;
  for (const a of annotations) {
    const { type, sig } = (a ?? {}) as { type?: unknown; sig?: unknown };
    if (type === SIGNATURE_ANNOTATION && typeof sig === 'string') return sig;
  }
  return undefined;
}

// Where the question came from, as sent by app/page.tsx: a suggested-question
// button or the text box. Anything else (Checkly, eval runners, old clients)
// is recorded as unknown (NULL). Added 2026-10-14 for button analytics.
export function parseSource(body: unknown): 'button' | 'typed' | null {
  const source = (body as { source?: unknown })?.source;
  return source === 'button' || source === 'typed' ? source : null;
}

// PostHog's anonymous distinct id, sent by app/page.tsx when PostHog is loaded,
// so chat_events.client_id joins a row to its session replay. Free text from
// the client, so only a short id-shaped value is kept. Added 2026-10-14.
export function parseClientId(body: unknown): string | null {
  const id = (body as { clientId?: unknown })?.clientId;
  return typeof id === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(id) ? id : null;
}
