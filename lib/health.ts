import { pool } from './db';
import { backendUrl } from './backend';
import { checkOpenAiKey, type KeyStatus } from './monitor';

// The checks behind GET /api/health and the health panel on /dashboard.
// Moved out of app/api/health/route.ts on 2026-10-14 so both use one copy.

export type BackendHealth =
  | { ok: true; chunks: number | null; openai: KeyStatus | null }
  // 'no_health_endpoint' if the backend predates GET /health.
  | { ok: false; reason: 'no_health_endpoint' | 'unhealthy' | 'unreachable'; openai: KeyStatus | null };

export type Health = {
  ok: boolean;
  db: boolean;
  openai: KeyStatus;
  backend: BackendHealth;
};

export async function checkDb(): Promise<boolean> {
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
export async function checkBackend(): Promise<BackendHealth> {
  const apiUrl = backendUrl();
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

export async function checkHealth(): Promise<Health> {
  const [db, openai, backend] = await Promise.all([checkDb(), checkOpenAiKey(), checkBackend()]);
  const ok = db && openai === 'ok' && backend.ok && backend.openai === 'ok';
  return { ok, db, openai, backend };
}
