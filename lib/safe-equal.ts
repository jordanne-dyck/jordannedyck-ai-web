import { timingSafeEqual } from 'crypto';

// Constant-time string comparison for secrets (admin password, monitor token).
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
