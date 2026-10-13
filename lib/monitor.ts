import { safeEqual } from './safe-equal';
import type { NextRequest } from 'next/server';

// True when the request carries the x-monitor-token header and it matches
// MONITOR_TOKEN. Used by Checkly: such requests are marked synthetic, skip the
// rate limit, and may read the deep health view. With MONITOR_TOKEN unset,
// nothing is ever treated as a monitor request.
export function isMonitorRequest(req: NextRequest): boolean {
  const expected = process.env.MONITOR_TOKEN;
  const supplied = req.headers.get('x-monitor-token');
  if (!expected || !supplied) return false;
  return safeEqual(supplied, expected);
}

export type KeyStatus = 'ok' | 'auth_failed' | 'unreachable';

// Cached so a public /api/health hammered by a visitor cannot turn into a
// flood of calls to OpenAI. Checkly polls every 5 minutes, well past the TTL.
const KEY_CHECK_TTL_MS = 60_000;
let cached: { status: KeyStatus; at: number } | null = null;

// Lists models with the app's key. A list call, not a generation, so it costs
// no tokens. This is the check that catches an expired or revoked key.
export async function checkOpenAiKey(): Promise<KeyStatus> {
  if (cached && Date.now() - cached.at < KEY_CHECK_TTL_MS) {
    return cached.status;
  }
  let status: KeyStatus;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    status = 'auth_failed';
  } else {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      status = res.ok ? 'ok' : res.status === 401 || res.status === 403 ? 'auth_failed' : 'unreachable';
    } catch {
      status = 'unreachable';
    }
  }
  cached = { status, at: Date.now() };
  return status;
}
