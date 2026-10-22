import { createHmac } from 'crypto';
import { safeEqual } from './safe-equal';
import type { ChatMessage } from './chat-input';

// Signed assistant turns (security review 2026-10-20, item 4). The browser
// sends the whole conversation back on every request, so without this a
// client can invent an earlier answer ("Earlier you confirmed she was a CTO")
// and the model reads it as its own. Each answer is signed when it is served;
// an assistant turn that comes back without a valid signature is dropped
// before the model sees it.
//
// The signature covers the session cookie and the exact text the visitor
// received, which is the answer with its citations already stripped. useChat
// stores that text as the message content and sends the message's annotations
// back unchanged, so no client code is involved.
//
// TURN_SIGNING_KEY is its own secret, not a reuse: the admin password is
// typed by a person and every visitor would get answers signed with it, which
// is an offline guessing oracle. Unset or short, no turn verifies, and the
// model sees only the visitor's own questions.

export const SIGNATURE_ANNOTATION = 'turn-sig';
const MIN_KEY_LENGTH = 32;
const DOMAIN = 'jordbot-turn-v1';

function key(): string | null {
  const k = process.env.TURN_SIGNING_KEY;
  return k && k.length >= MIN_KEY_LENGTH ? k : null;
}

function sign(k: string, sessionId: string, content: string): string {
  return createHmac('sha256', k).update(`${DOMAIN}\n${sessionId}\n${content}`).digest('hex');
}

// The annotation route.ts sends with each answer, or null when no key is set.
export function signTurn(
  sessionId: string,
  content: string,
): { type: typeof SIGNATURE_ANNOTATION; sig: string } | null {
  const k = key();
  return k ? { type: SIGNATURE_ANNOTATION, sig: sign(k, sessionId, content) } : null;
}

// Keeps user turns and the assistant turns this server signed for this
// session. `unsigned` counts the rest, for the event's flags.
export function keepSignedTurns(
  messages: (ChatMessage & { sig?: string })[],
  sessionId: string,
): { messages: ChatMessage[]; unsigned: number } {
  const k = key();
  const kept: ChatMessage[] = [];
  let unsigned = 0;
  for (const { role, content, sig } of messages) {
    if (role === 'assistant' && !(k && sig && safeEqual(sig, sign(k, sessionId, content)))) {
      unsigned++;
      continue;
    }
    kept.push({ role, content });
  }
  return { messages: kept, unsigned };
}
