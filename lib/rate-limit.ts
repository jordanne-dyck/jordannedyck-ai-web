import { pool } from './db';

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: 'hourly' | 'daily'; retryAfterSeconds: number };

const HOURLY_LIMIT = 20;
const DAILY_LIMIT = 100;

// Counts requests by ip_hash in the last hour and last 24 hours, in one round-trip.
// Excludes already-rate-limited rows so we don't trap clients in a feedback loop.
export async function checkRateLimit(ipHash: string): Promise<RateLimitResult> {
  // Local development without a database: allow everything rather than throwing.
  // `pool` is a lazy Proxy whose first property access throws when DATABASE_URL is
  // unset, and route.ts calls this BEFORE its try block — so without this guard every
  // request 500s with an empty body. Added 2026-09-11 to run the eval end to end
  // locally.
  //
  // NAMED DIVERGENCE: with no DATABASE_URL there is no rate limiting at all. This path
  // conformance-tests retrieval, prompt and generation — NOT rate limiting, and not the
  // chat_events observability that feat/observability exists to add. Any deployed
  // environment sets DATABASE_URL, so production behaviour is unchanged.
  if (!process.env.DATABASE_URL) {
    return { allowed: true };
  }

  const { rows } = await pool.query<{ hourly: number; daily: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS hourly,
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS daily
     FROM chat_events
     WHERE ip_hash = $1 AND rate_limited = FALSE`,
    [ipHash],
  );

  const { hourly, daily } = rows[0] ?? { hourly: 0, daily: 0 };

  if (daily >= DAILY_LIMIT) {
    return { allowed: false, reason: 'daily', retryAfterSeconds: 3600 };
  }
  if (hourly >= HOURLY_LIMIT) {
    return { allowed: false, reason: 'hourly', retryAfterSeconds: 600 };
  }
  return { allowed: true };
}
