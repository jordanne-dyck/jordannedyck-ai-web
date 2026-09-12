import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';

const COOKIE = 'jb_sid';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function getOrCreateSessionId(): Promise<{ sessionId: string; isNew: boolean }> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) {
    return { sessionId: existing, isNew: false };
  }
  const sessionId = randomUUID();
  jar.set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: MAX_AGE,
    path: '/',
  });
  return { sessionId, isNew: true };
}
