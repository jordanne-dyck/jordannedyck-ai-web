import { pool } from './db';

export type DashboardStats = {
  requestsToday: number;
  sessionsToday: number;
  rateLimitedToday: number;
  errorsToday: number;
  spendToday: number;
  spendTotal: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const { rows } = await pool.query<{
    requests_today: string;
    sessions_today: string;
    rate_limited_today: string;
    errors_today: string;
    spend_today: string;
    spend_total: string;
    avg_latency_ms: string | null;
    p95_latency_ms: string | null;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS requests_today,
       COUNT(DISTINCT session_id) FILTER (WHERE created_at >= CURRENT_DATE) AS sessions_today,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND rate_limited = TRUE) AS rate_limited_today,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND error IS NOT NULL AND rate_limited = FALSE) AS errors_today,
       COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= CURRENT_DATE), 0) AS spend_today,
       COALESCE(SUM(cost_usd), 0) AS spend_total,
       AVG(latency_ms) FILTER (WHERE created_at >= CURRENT_DATE AND error IS NULL) AS avg_latency_ms,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)
         FILTER (WHERE created_at >= CURRENT_DATE AND error IS NULL) AS p95_latency_ms
     FROM chat_events`,
  );
  const r = rows[0];
  return {
    requestsToday: Number(r.requests_today),
    sessionsToday: Number(r.sessions_today),
    rateLimitedToday: Number(r.rate_limited_today),
    errorsToday: Number(r.errors_today),
    spendToday: Number(r.spend_today),
    spendTotal: Number(r.spend_total),
    avgLatencyMs: r.avg_latency_ms ? Math.round(Number(r.avg_latency_ms)) : null,
    p95LatencyMs: r.p95_latency_ms ? Math.round(Number(r.p95_latency_ms)) : null,
  };
}

export type HourlyBucket = { hour: string; requests: number; cost: number };

export async function getHourlyHistogram(): Promise<HourlyBucket[]> {
  const { rows } = await pool.query<{ hour: Date; requests: string; cost: string }>(
    `SELECT
       date_trunc('hour', created_at) AS hour,
       COUNT(*) AS requests,
       COALESCE(SUM(cost_usd), 0) AS cost
     FROM chat_events
     WHERE created_at > NOW() - INTERVAL '24 hours'
     GROUP BY 1
     ORDER BY 1`,
  );
  return rows.map((r) => ({
    hour: r.hour.toISOString(),
    requests: Number(r.requests),
    cost: Number(r.cost),
  }));
}

export type EventRow = {
  id: string;
  createdAt: string;
  sessionId: string;
  ipHash: string;
  userAgent: string | null;
  query: string;
  queryLength: number;
  responseLength: number | null;
  costUsd: number | null;
  model: string | null;
  latencyMs: number | null;
  timeToFirstTokenMs: number | null;
  error: string | null;
  rateLimited: boolean;
};

export type EventFilters = {
  range: '1h' | '24h' | '7d' | '30d';
  onlyErrors?: boolean;
  onlyRateLimited?: boolean;
  ipHash?: string;
};

const RANGE_INTERVAL: Record<EventFilters['range'], string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

export async function getEventsList(
  filters: EventFilters,
  page: number,
  pageSize: number = 50,
): Promise<{ rows: EventRow[]; total: number }> {
  const interval = RANGE_INTERVAL[filters.range];
  const where: string[] = [`created_at > NOW() - INTERVAL '${interval}'`];
  const params: unknown[] = [];

  if (filters.onlyErrors) {
    where.push(`error IS NOT NULL AND rate_limited = FALSE`);
  }
  if (filters.onlyRateLimited) {
    where.push(`rate_limited = TRUE`);
  }
  if (filters.ipHash) {
    params.push(filters.ipHash);
    where.push(`ip_hash = $${params.length}`);
  }

  const whereSql = where.join(' AND ');
  const offset = Math.max(0, page) * pageSize;

  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::TEXT AS total FROM chat_events WHERE ${whereSql}`,
    params,
  );

  params.push(pageSize, offset);
  const rowsResult = await pool.query<{
    id: string;
    created_at: Date;
    session_id: string;
    ip_hash: string;
    user_agent: string | null;
    query: string;
    query_length: number;
    response_length: number | null;
    cost_usd: string | null;
    model: string | null;
    latency_ms: number | null;
    time_to_first_token_ms: number | null;
    error: string | null;
    rate_limited: boolean;
  }>(
    `SELECT id, created_at, session_id, ip_hash, user_agent,
            query, query_length, response_length,
            cost_usd, model, latency_ms, time_to_first_token_ms,
            error, rate_limited
       FROM chat_events
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    total: Number(countResult.rows[0].total),
    rows: rowsResult.rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at.toISOString(),
      sessionId: r.session_id,
      ipHash: r.ip_hash,
      userAgent: r.user_agent,
      query: r.query,
      queryLength: r.query_length,
      responseLength: r.response_length,
      costUsd: r.cost_usd == null ? null : Number(r.cost_usd),
      model: r.model,
      latencyMs: r.latency_ms,
      timeToFirstTokenMs: r.time_to_first_token_ms,
      error: r.error,
      rateLimited: r.rate_limited,
    })),
  };
}

export type AnomalyFlags = {
  spendLastHourUsd: number;
  errorsLastHour: number;
  rateLimitedLastHour: number;
  topIpHashLastHour: { ipHash: string; requests: number } | null;
  longTailQuerySession: { sessionId: string; requests: number } | null;
};

export async function getAnomalyFlags(): Promise<AnomalyFlags> {
  const { rows: agg } = await pool.query<{
    spend: string;
    errors: string;
    rate_limited: string;
  }>(
    `SELECT
       COALESCE(SUM(cost_usd), 0)::TEXT AS spend,
       COUNT(*) FILTER (WHERE error IS NOT NULL AND rate_limited = FALSE)::TEXT AS errors,
       COUNT(*) FILTER (WHERE rate_limited = TRUE)::TEXT AS rate_limited
     FROM chat_events
     WHERE created_at > NOW() - INTERVAL '1 hour'`,
  );

  const { rows: topIp } = await pool.query<{ ip_hash: string; requests: string }>(
    `SELECT ip_hash, COUNT(*)::TEXT AS requests
       FROM chat_events
       WHERE created_at > NOW() - INTERVAL '1 hour'
       GROUP BY ip_hash
       ORDER BY COUNT(*) DESC
       LIMIT 1`,
  );

  const { rows: topSession } = await pool.query<{ session_id: string; requests: string }>(
    `SELECT session_id, COUNT(*)::TEXT AS requests
       FROM chat_events
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY session_id
       HAVING COUNT(*) > 20
       ORDER BY COUNT(*) DESC
       LIMIT 1`,
  );

  return {
    spendLastHourUsd: Number(agg[0].spend),
    errorsLastHour: Number(agg[0].errors),
    rateLimitedLastHour: Number(agg[0].rate_limited),
    topIpHashLastHour:
      topIp[0] && Number(topIp[0].requests) >= 10
        ? { ipHash: topIp[0].ip_hash, requests: Number(topIp[0].requests) }
        : null,
    longTailQuerySession: topSession[0]
      ? { sessionId: topSession[0].session_id, requests: Number(topSession[0].requests) }
      : null,
  };
}

export type DailyBucket = { day: string; requests: number; cost: number };

export async function getDailyTrend(days: number = 30): Promise<DailyBucket[]> {
  const { rows } = await pool.query<{ day: Date; requests: string; cost: string }>(
    `SELECT
       date_trunc('day', created_at) AS day,
       COUNT(*) AS requests,
       COALESCE(SUM(cost_usd), 0) AS cost
     FROM chat_events
     WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
     GROUP BY 1
     ORDER BY 1`,
    [String(days)],
  );
  return rows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
    requests: Number(r.requests),
    cost: Number(r.cost),
  }));
}
