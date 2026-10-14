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

// 'model_missing': the key works but a model the site calls is no longer listed
// (retired, or blocked for this project). Added 2026-10-14.
export type KeyStatus = 'ok' | 'auth_failed' | 'unreachable' | 'model_missing';

// The models this app calls: gpt-4o answers, gpt-4o-mini labels (lib/classify.ts).
// The backend's text-embedding-ada-002 is checked by the backend's own /health.
const REQUIRED_MODELS = ['gpt-4o', 'gpt-4o-mini'];

// Cached so a public /api/health hammered by a visitor cannot turn into a
// flood of calls to OpenAI. Checkly polls every 5 minutes, well past the TTL.
const KEY_CHECK_TTL_MS = 60_000;
let cached: { status: KeyStatus; at: number } | null = null;

// Lists models with the app's key. A list call, not a generation, so it costs
// no tokens. This is the check that catches an expired or revoked key, and a
// retired model.
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
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { data?: { id: string }[] } | null;
        const listed = new Set((data?.data ?? []).map((m) => m.id));
        status = REQUIRED_MODELS.every((m) => listed.has(m)) ? 'ok' : 'model_missing';
      } else {
        status = res.status === 401 || res.status === 403 ? 'auth_failed' : 'unreachable';
      }
    } catch {
      status = 'unreachable';
    }
  }
  cached = { status, at: Date.now() };
  return status;
}
