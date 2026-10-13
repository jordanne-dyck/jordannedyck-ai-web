import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { checkOpenAiKey, isMonitorRequest, type KeyStatus } from '@/lib/monitor';
import { getAnomalyFlags, getMonitorStats } from '@/lib/queries';

export const dynamic = 'force-dynamic';

type BackendHealth =
  | { ok: true; chunks: number | null; openai: KeyStatus | null }
  // 'no_health_endpoint' until jordannedyck-ai ships GET /health. The Checkly
  // health check does not assert on the backend until then.
  | { ok: false; reason: 'no_health_endpoint' | 'unhealthy' | 'unreachable'; openai: KeyStatus | null };

async function checkDb(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Expects the backend contract from the site-monitoring plan:
// GET /health -> {"ok": true, "chunks": 131, "index_bytes": ..., "openai": "ok|auth_failed|unreachable"}
async function checkBackend(): Promise<BackendHealth> {
  const apiUrl = process.env.FLASK_API_URL ?? 'http://localhost:5000';
  try {
    const res = await fetch(`${apiUrl}/health`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (res.status === 404) return { ok: false, reason: 'no_health_endpoint', openai: null };
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; chunks?: number; openai?: KeyStatus }
      | null;
    if (!res.ok || !data?.ok) {
      return { ok: false, reason: 'unhealthy', openai: data?.openai ?? null };
    }
    return { ok: true, chunks: data.chunks ?? null, openai: data.openai ?? null };
  } catch {
    return { ok: false, reason: 'unreachable', openai: null };
  }
}

// Public: GET /api/health -> {ok, db, openai, backend}
// Monitor:  GET /api/health?deep=1 with x-monitor-token -> adds anomalies and rates.
export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get('deep') === '1';
  if (deep && !isMonitorRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const [db, openai, backend] = await Promise.all([checkDb(), checkOpenAiKey(), checkBackend()]);
  const ok = db && openai === 'ok' && backend.ok && backend.openai === 'ok';

  // Always 200 so Checkly can read the body and assert on each field; `ok`
  // is the single summary flag.
  const body: Record<string, unknown> = { ok, db, openai, backend };

  if (deep && db) {
    const [anomalies, stats] = await Promise.all([getAnomalyFlags(), getMonitorStats()]);
    body.anomalies = anomalies;
    body.stats = stats;
  }

  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
