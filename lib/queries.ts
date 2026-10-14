import { pool } from './db';
import { LABELS, LABEL_BY_KEY, type LabelKey } from './labels';
import {
  STRONG_MATCH,
  WEAK_MATCH,
  SLOW_SEARCH_MS,
  REPHRASE_SECONDS,
  QUALITY_MIN_ANSWERED,
  QUALITY_MAX_EMPTY_RATE,
  QUALITY_MAX_GAP_RATE,
  QUALITY_MAX_NOT_GROUNDED_RATE,
} from './thresholds';
import { SUGGESTED_QUESTIONS } from './suggested-questions';

// Spend includes the paid labels (lib/classify.ts), which record their cost in
// flags.label_cost_usd rather than cost_usd, so cost_usd stays the chat cost.
const TOTAL_COST = `(COALESCE(cost_usd, 0) + COALESCE((flags->>'label_cost_usd')::NUMERIC, 0))`;

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
       COALESCE(SUM(${TOTAL_COST}) FILTER (WHERE created_at >= CURRENT_DATE), 0) AS spend_today,
       COALESCE(SUM(${TOTAL_COST}), 0) AS spend_total,
       AVG(latency_ms) FILTER (WHERE created_at >= CURRENT_DATE AND error IS NULL) AS avg_latency_ms,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)
         FILTER (WHERE created_at >= CURRENT_DATE AND error IS NULL) AS p95_latency_ms
     FROM chat_events
     WHERE is_synthetic = FALSE`,
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
       COALESCE(SUM(${TOTAL_COST}), 0) AS cost
     FROM chat_events
     WHERE created_at > NOW() - INTERVAL '24 hours' AND is_synthetic = FALSE
     GROUP BY 1
     ORDER BY 1`,
  );
  return rows.map((r) => ({
    hour: r.hour.toISOString(),
    requests: Number(r.requests),
    cost: Number(r.cost),
  }));
}

// Matches a suggested-question button: reported by the client from 2026-10-14,
// or, for older rows (source NULL), the exact button text.
const BUTTON_TEXTS_SQL = `ARRAY[${SUGGESTED_QUESTIONS.map(
  (q) => `'${q.toLowerCase().replace(/'/g, "''")}'`,
).join(', ')}]::TEXT[]`;
export const IS_BUTTON_SQL = `(source = 'button' OR (source IS NULL AND LOWER(BTRIM(query)) = ANY(${BUTTON_TEXTS_SQL})))`;

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
  responseText: string | null;
  turnIndex: number | null;
  retrievalStatus: string | null;
  chunkIds: string[] | null;
  topSimilarity: number | null;
  isSynthetic: boolean;
  flags: Record<string, unknown>;
  retrievalMs: number | null;
  isButton: boolean;
  promptVersion: string | null;
  indexVersion: string | null;
  topicTags: string[] | null;
};

const EVENT_COLUMNS = `id, created_at, session_id, ip_hash, user_agent,
            query, query_length, response_length,
            cost_usd, model, latency_ms, time_to_first_token_ms,
            error, rate_limited,
            response_text, turn_index, retrieval_status, chunk_ids, top_similarity,
            is_synthetic, flags,
            retrieval_ms, ${IS_BUTTON_SQL} AS is_button, prompt_version, index_version, topic_tags`;

type EventDbRow = {
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
  response_text: string | null;
  turn_index: number | null;
  retrieval_status: string | null;
  chunk_ids: string[] | null;
  top_similarity: number | null;
  is_synthetic: boolean;
  flags: Record<string, unknown>;
  retrieval_ms: number | null;
  is_button: boolean;
  prompt_version: string | null;
  index_version: string | null;
  topic_tags: string[] | null;
};

function toEventRow(r: EventDbRow): EventRow {
  return {
    id: String(r.id),
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
    responseText: r.response_text,
    turnIndex: r.turn_index,
    retrievalStatus: r.retrieval_status,
    chunkIds: r.chunk_ids,
    topSimilarity: r.top_similarity,
    isSynthetic: r.is_synthetic,
    flags: r.flags ?? {},
    retrievalMs: r.retrieval_ms,
    isButton: Boolean(r.is_button),
    promptVersion: r.prompt_version,
    indexVersion: r.index_version,
    topicTags: r.topic_tags,
  };
}

export type EventFilters = {
  range: '1h' | '24h' | '7d' | '30d' | '90d';
  onlyErrors?: boolean;
  onlyRateLimited?: boolean;
  // Synthetic (Checkly) rows are hidden unless this is set, and then only they show.
  onlySynthetic?: boolean;
  ipHash?: string;
  retrieval?: 'empty' | 'error' | 'weak';
  source?: 'button' | 'typed';
  label?: LabelKey;
  // Exact question text, lowercased and trimmed (links from the Insights tab).
  question?: string;
  // Row ids (links from the "what to fix" list).
  ids?: string[];
};

export const RANGE_INTERVAL: Record<EventFilters['range'], string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

export async function getEventsList(
  filters: EventFilters,
  page: number,
  pageSize: number = 50,
): Promise<{ rows: EventRow[]; total: number }> {
  const interval = RANGE_INTERVAL[filters.range];
  const where: string[] = [
    `created_at > NOW() - INTERVAL '${interval}'`,
    `is_synthetic = ${filters.onlySynthetic ? 'TRUE' : 'FALSE'}`,
  ];
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
  if (filters.retrieval === 'empty' || filters.retrieval === 'error') {
    where.push(`retrieval_status = '${filters.retrieval}'`);
  } else if (filters.retrieval === 'weak') {
    where.push(`retrieval_status = 'ok' AND top_similarity < ${WEAK_MATCH}`);
  }
  if (filters.source === 'button') {
    where.push(IS_BUTTON_SQL);
  } else if (filters.source === 'typed') {
    where.push(`NOT ${IS_BUTTON_SQL}`);
  }
  if (filters.label && LABEL_BY_KEY[filters.label]) {
    where.push(LABEL_BY_KEY[filters.label].sql);
  }
  if (filters.question) {
    params.push(filters.question);
    where.push(`LOWER(BTRIM(query)) = $${params.length}`);
  }
  if (filters.ids?.length) {
    params.push(filters.ids);
    where.push(`id = ANY($${params.length}::BIGINT[])`);
  }

  const whereSql = where.join(' AND ');
  const offset = Math.max(0, page) * pageSize;

  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::TEXT AS total FROM chat_events WHERE ${whereSql}`,
    params,
  );

  params.push(pageSize, offset);
  const rowsResult = await pool.query<EventDbRow>(
    `SELECT ${EVENT_COLUMNS}
       FROM chat_events
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    total: Number(countResult.rows[0].total),
    rows: rowsResult.rows.map(toEventRow),
  };
}

export type MonitorStats = {
  requestsLastHour: number;
  errorRateLastHour: number;
  retrievalFailureRateLastHour: number;
  oversizeLastHour: number;
};

// For the deep health view (Checkly abuse-thresholds check). Real traffic only.
// Rates are 0 when there were no requests, so a quiet hour never alerts.
export async function getMonitorStats(): Promise<MonitorStats> {
  const { rows } = await pool.query<{
    requests: string;
    errors: string;
    retrieval_attempts: string;
    retrieval_failures: string;
    oversize: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE rate_limited = FALSE)::TEXT AS requests,
       COUNT(*) FILTER (WHERE error IS NOT NULL AND rate_limited = FALSE)::TEXT AS errors,
       COUNT(*) FILTER (WHERE retrieval_status IS NOT NULL)::TEXT AS retrieval_attempts,
       COUNT(*) FILTER (WHERE retrieval_status = 'error')::TEXT AS retrieval_failures,
       COUNT(*) FILTER (WHERE (flags->>'oversize')::BOOLEAN IS TRUE)::TEXT AS oversize
     FROM chat_events
     WHERE created_at > NOW() - INTERVAL '1 hour' AND is_synthetic = FALSE`,
  );
  const r = rows[0];
  const requests = Number(r.requests);
  const attempts = Number(r.retrieval_attempts);
  return {
    requestsLastHour: requests,
    errorRateLastHour: requests ? Number(r.errors) / requests : 0,
    retrievalFailureRateLastHour: attempts ? Number(r.retrieval_failures) / attempts : 0,
    oversizeLastHour: Number(r.oversize),
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
       COALESCE(SUM(${TOTAL_COST}), 0)::TEXT AS spend,
       COUNT(*) FILTER (WHERE error IS NOT NULL AND rate_limited = FALSE)::TEXT AS errors,
       COUNT(*) FILTER (WHERE rate_limited = TRUE)::TEXT AS rate_limited
     FROM chat_events
     WHERE created_at > NOW() - INTERVAL '1 hour' AND is_synthetic = FALSE`,
  );

  const { rows: topIp } = await pool.query<{ ip_hash: string; requests: string }>(
    `SELECT ip_hash, COUNT(*)::TEXT AS requests
       FROM chat_events
       WHERE created_at > NOW() - INTERVAL '1 hour' AND is_synthetic = FALSE
       GROUP BY ip_hash
       ORDER BY COUNT(*) DESC
       LIMIT 1`,
  );

  const { rows: topSession } = await pool.query<{ session_id: string; requests: string }>(
    `SELECT session_id, COUNT(*)::TEXT AS requests
       FROM chat_events
       WHERE created_at > NOW() - INTERVAL '24 hours' AND is_synthetic = FALSE
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
       COALESCE(SUM(${TOTAL_COST}), 0) AS cost
     FROM chat_events
     WHERE created_at > NOW() - ($1 || ' days')::INTERVAL AND is_synthetic = FALSE
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

// ── Dashboard v2 (site-monitoring plan, 2026-10-14) ──────────────────────────
// All real traffic only (is_synthetic = FALSE). "Answered" means the turn got
// past the rate limit and input bounds and produced an answer without error.

const ANSWERED = `is_synthetic = FALSE AND rate_limited = FALSE AND error IS NULL AND retrieval_status IS NOT NULL`;
const sinceDays = (days: number) => `created_at > NOW() - INTERVAL '${Math.floor(days)} days'`;

export type RetrievalQuality = {
  answered: number;
  ok: number;
  empty: number;
  error: number;
  medianTopSimilarity: number | null;
};

export async function getRetrievalQuality(days = 30): Promise<RetrievalQuality> {
  const { rows } = await pool.query<{
    answered: string; ok: string; empty: string; error: string; median_sim: number | null;
  }>(
    `SELECT
       COUNT(*)::TEXT AS answered,
       COUNT(*) FILTER (WHERE retrieval_status = 'ok')::TEXT AS ok,
       COUNT(*) FILTER (WHERE retrieval_status = 'empty')::TEXT AS empty,
       COUNT(*) FILTER (WHERE retrieval_status = 'error')::TEXT AS error,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY top_similarity)
         FILTER (WHERE retrieval_status = 'ok') AS median_sim
     FROM chat_events
     WHERE ${ANSWERED} AND ${sinceDays(days)}`,
  );
  const r = rows[0];
  return {
    answered: Number(r.answered),
    ok: Number(r.ok),
    empty: Number(r.empty),
    error: Number(r.error),
    medianTopSimilarity: r.median_sim == null ? null : Number(r.median_sim),
  };
}

export type TimingSplit = {
  n: number;
  medianSearchMs: number | null;
  medianModelStartMs: number | null;
  medianFirstWordMs: number | null;
  medianTotalMs: number | null;
};

// Only rows with retrieval_ms (logged from 2026-10-14) can be split.
export async function getTimingSplit(days = 30): Promise<TimingSplit> {
  const { rows } = await pool.query<{
    n: string; search: number | null; model: number | null; first: number | null; total: number | null;
  }>(
    `SELECT
       COUNT(*)::TEXT AS n,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY retrieval_ms) AS search,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_to_first_token_ms - retrieval_ms) AS model,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_to_first_token_ms) AS first,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS total
     FROM chat_events
     WHERE ${ANSWERED} AND ${sinceDays(days)}
       AND retrieval_ms IS NOT NULL AND time_to_first_token_ms IS NOT NULL`,
  );
  const r = rows[0];
  const round = (v: number | null) => (v == null ? null : Math.round(Number(v)));
  return {
    n: Number(r.n),
    medianSearchMs: round(r.search),
    medianModelStartMs: round(r.model),
    medianFirstWordMs: round(r.first),
    medianTotalMs: round(r.total),
  };
}

export type ButtonUsage = {
  clicks: { question: string; count: number }[];
  totalClicks: number;
  totalQuestions: number;
  conversations: number;
  conversationsStartedWithButton: number;
};

export async function getButtonUsage(days = 30): Promise<ButtonUsage> {
  const base = `is_synthetic = FALSE AND rate_limited = FALSE AND ${sinceDays(days)}`;
  const [{ rows: clicks }, { rows: totals }] = await Promise.all([
    pool.query<{ q: string; count: string }>(
      `SELECT LOWER(BTRIM(query)) AS q, COUNT(*)::TEXT AS count
         FROM chat_events
         WHERE ${base} AND ${IS_BUTTON_SQL}
         GROUP BY 1
         ORDER BY COUNT(*) DESC`,
    ),
    pool.query<{ questions: string; buttons: string; convos: string; convos_button: string }>(
      `SELECT
         COUNT(*)::TEXT AS questions,
         COUNT(*) FILTER (WHERE ${IS_BUTTON_SQL})::TEXT AS buttons,
         COUNT(*) FILTER (WHERE turn_index = 1)::TEXT AS convos,
         COUNT(*) FILTER (WHERE turn_index = 1 AND ${IS_BUTTON_SQL})::TEXT AS convos_button
       FROM chat_events
       WHERE ${base}`,
    ),
  ]);
  // Show the button's own wording, not the lowercased match key.
  const display = new Map(SUGGESTED_QUESTIONS.map((q) => [q.toLowerCase(), q]));
  const t = totals[0];
  return {
    // `source` is client-supplied, so only the known button texts are shown:
    // this list is on the public dashboard and must never echo visitor text.
    clicks: clicks
      .filter((c) => display.has(c.q))
      .map((c) => ({ question: display.get(c.q)!, count: Number(c.count) })),
    totalClicks: Number(t.buttons),
    totalQuestions: Number(t.questions),
    conversations: Number(t.convos),
    conversationsStartedWithButton: Number(t.convos_button),
  };
}

export type TopicWeek = { week: string; counts: Record<string, number> };

// Topic = KB category of the best search match (topic_tags[1]), logged from
// 2026-10-14. It labels what the knowledge base returned, not what was meant.
export async function getTopicsByWeek(weeks = 8): Promise<{ weeks: TopicWeek[]; n: number }> {
  const { rows } = await pool.query<{ week: Date; topic: string; count: string }>(
    `SELECT date_trunc('week', created_at) AS week, topic_tags[1] AS topic, COUNT(*)::TEXT AS count
       FROM chat_events
       WHERE ${ANSWERED} AND topic_tags IS NOT NULL
         AND created_at > NOW() - INTERVAL '${Math.floor(weeks) * 7} days'
       GROUP BY 1, 2
       ORDER BY 1`,
  );
  const byWeek = new Map<string, Record<string, number>>();
  let n = 0;
  for (const r of rows) {
    const week = r.week.toISOString().slice(0, 10);
    const counts = byWeek.get(week) ?? {};
    counts[r.topic] = Number(r.count);
    n += Number(r.count);
    byWeek.set(week, counts);
  }
  return { weeks: [...byWeek].map(([week, counts]) => ({ week, counts })), n };
}

export async function getLabelCounts(days: number): Promise<Record<LabelKey, number>> {
  const { rows } = await pool.query<Record<string, string>>(
    `SELECT ${LABELS.map((l) => `COUNT(*) FILTER (WHERE ${l.sql})::TEXT AS ${l.key}`).join(',\n       ')}
       FROM chat_events
       WHERE is_synthetic = FALSE AND created_at > NOW() - INTERVAL '${Math.floor(days) * 24} hours'`,
  );
  return Object.fromEntries(LABELS.map((l) => [l.key, Number(rows[0][l.key])])) as Record<
    LabelKey,
    number
  >;
}

export const getLabelCounts24h = () => getLabelCounts(1);

export type Quality24h = {
  answered: number;
  retrievalEmptyRate: number;
  gapDeclaredRate: number;
  notGroundedRate: number;
  judged: number;
  medianSearchMs: number | null;
  // Thresholds crossed, for Checkly to assert on (breachCount < 1).
  breaches: string[];
  breachCount: number;
};

// For the Checkly quality alerts. Rates are 0 with no answers, so a quiet day
// never alerts; the Checkly assertions also require a minimum `answered`.
export async function getQuality24h(): Promise<Quality24h> {
  const { rows } = await pool.query<{
    answered: string; empty: string; gap: string; judged: string; not_grounded: string; search: number | null;
  }>(
    `SELECT
       COUNT(*)::TEXT AS answered,
       COUNT(*) FILTER (WHERE retrieval_status = 'empty')::TEXT AS empty,
       COUNT(*) FILTER (WHERE ${LABEL_BY_KEY.gap_declared.sql})::TEXT AS gap,
       COUNT(*) FILTER (WHERE flags->'judge'->>'verdict' IN ('grounded', 'partial', 'not_grounded'))::TEXT AS judged,
       COUNT(*) FILTER (WHERE ${LABEL_BY_KEY.not_grounded.sql})::TEXT AS not_grounded,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY retrieval_ms) AS search
     FROM chat_events
     WHERE ${ANSWERED} AND created_at > NOW() - INTERVAL '24 hours'`,
  );
  const r = rows[0];
  const answered = Number(r.answered);
  const judged = Number(r.judged);
  const rate = (x: string, of: number) => (of ? Number(x) / of : 0);
  const q = {
    answered,
    retrievalEmptyRate: rate(r.empty, answered),
    gapDeclaredRate: rate(r.gap, answered),
    notGroundedRate: rate(r.not_grounded, judged),
    judged,
    medianSearchMs: r.search == null ? null : Math.round(Number(r.search)),
  };
  const breaches: string[] = [];
  if (answered >= QUALITY_MIN_ANSWERED) {
    if (q.retrievalEmptyRate > QUALITY_MAX_EMPTY_RATE) breaches.push('retrieval_empty_rate');
    if (q.gapDeclaredRate > QUALITY_MAX_GAP_RATE) breaches.push('gap_declared_rate');
    if (judged >= QUALITY_MIN_ANSWERED && q.notGroundedRate > QUALITY_MAX_NOT_GROUNDED_RATE) {
      breaches.push('not_grounded_rate');
    }
    if (q.medianSearchMs != null && q.medianSearchMs > SLOW_SEARCH_MS) breaches.push('median_search_ms');
  }
  return { ...q, breaches, breachCount: breaches.length };
}

export type QualitySummary = {
  answered: number;
  judged: { grounded: number; partial: number; notGrounded: number };
  gapDeclared: number;
  gapWithStrongMatch: number;
  firstPerson: number;
  labels: Record<LabelKey, number>;
};

export async function getQualitySummary(days = 30): Promise<QualitySummary> {
  const [{ rows }, labels] = await Promise.all([
    pool.query<{
      answered: string; grounded: string; partial: string; not_grounded: string;
      gap: string; gap_strong: string; first_person: string;
    }>(
      `SELECT
         COUNT(*)::TEXT AS answered,
         COUNT(*) FILTER (WHERE flags->'judge'->>'verdict' = 'grounded')::TEXT AS grounded,
         COUNT(*) FILTER (WHERE flags->'judge'->>'verdict' = 'partial')::TEXT AS partial,
         COUNT(*) FILTER (WHERE flags->'judge'->>'verdict' = 'not_grounded')::TEXT AS not_grounded,
         COUNT(*) FILTER (WHERE ${LABEL_BY_KEY.gap_declared.sql})::TEXT AS gap,
         COUNT(*) FILTER (WHERE ${LABEL_BY_KEY.gap_declared.sql} AND top_similarity >= ${STRONG_MATCH})::TEXT AS gap_strong,
         COUNT(*) FILTER (WHERE ${LABEL_BY_KEY.first_person.sql})::TEXT AS first_person
       FROM chat_events
       WHERE ${ANSWERED} AND ${sinceDays(days)}`,
    ),
    getLabelCounts(days),
  ]);
  const r = rows[0];
  return {
    answered: Number(r.answered),
    judged: {
      grounded: Number(r.grounded),
      partial: Number(r.partial),
      notGrounded: Number(r.not_grounded),
    },
    gapDeclared: Number(r.gap),
    gapWithStrongMatch: Number(r.gap_strong),
    firstPerson: Number(r.first_person),
    labels,
  };
}

export type QuestionCount = {
  question: string;
  key: string;
  count: number;
  isButton: boolean;
  topic: string | null;
};

export async function getTopQuestions(days = 30, limit = 10): Promise<{
  top: QuestionCount[];
  distinct: number;
  total: number;
}> {
  const { rows } = await pool.query<{
    q: string; example: string; count: string; is_button: boolean; topic: string | null;
    distinct_total: string; total: string;
  }>(
    `SELECT LOWER(BTRIM(query)) AS q,
            MIN(query) AS example,
            COUNT(*)::TEXT AS count,
            BOOL_OR(${IS_BUTTON_SQL}) AS is_button,
            MODE() WITHIN GROUP (ORDER BY topic_tags[1]) AS topic,
            COUNT(*) OVER ()::TEXT AS distinct_total,
            SUM(COUNT(*)) OVER ()::TEXT AS total
       FROM chat_events
       WHERE is_synthetic = FALSE AND rate_limited = FALSE AND ${sinceDays(days)}
       GROUP BY 1
       ORDER BY COUNT(*) DESC, MAX(created_at) DESC
       LIMIT $1`,
    [limit],
  );
  return {
    top: rows.map((r) => ({
      question: r.example,
      key: r.q,
      count: Number(r.count),
      isButton: r.is_button,
      topic: r.topic,
    })),
    distinct: Number(rows[0]?.distinct_total ?? 0),
    total: Number(rows[0]?.total ?? 0),
  };
}

// ── Conversations ────────────────────────────────────────────────────────────

export type Conversation = { index: number; startedAt: string; turns: EventRow[] };

// A session id lives 30 days, so one session can hold several conversations.
// A new conversation starts when the turn number fails to go up (the page was
// reloaded and the chat restarted at turn 1), or, for rows from before
// turn_index existed, after 30 minutes of silence.
export function splitConversations(rows: EventRow[]): Conversation[] {
  const out: Conversation[] = [];
  let prev: EventRow | null = null;
  for (const row of rows) {
    const restarted =
      prev === null ||
      (row.turnIndex != null && prev.turnIndex != null && row.turnIndex <= prev.turnIndex) ||
      ((row.turnIndex == null || prev.turnIndex == null) &&
        Date.parse(row.createdAt) - Date.parse(prev.createdAt) > 30 * 60 * 1000);
    if (restarted) {
      out.push({ index: out.length + 1, startedAt: row.createdAt, turns: [] });
    }
    out[out.length - 1].turns.push(row);
    prev = row;
  }
  return out;
}

export async function getSessionEvents(sessionId: string): Promise<EventRow[]> {
  const { rows } = await pool.query<EventDbRow>(
    `SELECT ${EVENT_COLUMNS}
       FROM chat_events
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT 1000`,
    [sessionId],
  );
  return rows.map(toEventRow);
}

// ── What to fix ──────────────────────────────────────────────────────────────

export type FixItem = {
  kind: 'gap_strong' | 'weak_match' | 'not_grounded' | 'rephrased' | 'slow_search';
  why: string;
  headline: string;
  detail: string;
  count: number;
  rowIds: string[];
};

function wordSet(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z0-9']{3,}/g) ?? []);
}

// Share of the shorter question's words that also appear in the other.
function overlap(a: string, b: string): number {
  const x = wordSet(a);
  const y = wordSet(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / Math.min(x.size, y.size);
}

// Patterns worth acting on, each linked to the rows behind it. Surfaces
// candidates only; nothing here changes the prompt, the KB or the eval set.
export async function getFixList(days = 30): Promise<FixItem[]> {
  const grouped = (cond: string) =>
    pool.query<{ q: string; example: string; count: string; ids: string[]; sim: number | null; reason: string | null }>(
      `SELECT LOWER(BTRIM(query)) AS q, MIN(query) AS example, COUNT(*)::TEXT AS count,
              ARRAY_AGG(id::TEXT ORDER BY created_at DESC) AS ids,
              MAX(top_similarity) AS sim,
              MIN(flags->'judge'->>'reason') AS reason
         FROM chat_events
         WHERE ${ANSWERED} AND ${sinceDays(days)} AND ${cond}
         GROUP BY 1
         ORDER BY COUNT(*) DESC
         LIMIT 20`,
    );

  const [gapStrong, weak, ungrounded, pairs, slow] = await Promise.all([
    grouped(`${LABEL_BY_KEY.gap_declared.sql} AND top_similarity >= ${STRONG_MATCH}`),
    grouped(`(retrieval_status = 'empty' OR (retrieval_status = 'ok' AND top_similarity < ${WEAK_MATCH}))`),
    grouped(LABEL_BY_KEY.not_grounded.sql),
    // Consecutive turns where the follow-up was sent within REPHRASE_SECONDS
    // of the first answer finishing.
    pool.query<{ a_id: string; a_q: string; b_id: string; b_q: string }>(
      `SELECT a.id::TEXT AS a_id, a.query AS a_q, b.id::TEXT AS b_id, b.query AS b_q
         FROM chat_events a
         JOIN chat_events b
           ON b.session_id = a.session_id
          AND b.turn_index = a.turn_index + 1
          AND b.created_at > a.created_at
          -- created_at is written when the answer finishes, so a.created_at is
          -- already the end of the first answer, and b was sent latency_ms
          -- before its own created_at.
          AND b.created_at - (COALESCE(b.latency_ms, 0) * INTERVAL '1 millisecond')
                <= a.created_at + INTERVAL '${REPHRASE_SECONDS} seconds'
         WHERE a.is_synthetic = FALSE AND b.is_synthetic = FALSE
           AND a.created_at > NOW() - INTERVAL '${Math.floor(days)} days'
           AND a.latency_ms IS NOT NULL
         ORDER BY a.created_at DESC
         LIMIT 500`,
    ),
    pool.query<{ hour: Date; count: string; ids: string[] }>(
      `SELECT date_trunc('hour', created_at) AS hour, COUNT(*)::TEXT AS count,
              ARRAY_AGG(id::TEXT ORDER BY created_at DESC) AS ids
         FROM chat_events
         WHERE ${ANSWERED} AND ${sinceDays(days)} AND retrieval_ms > ${SLOW_SEARCH_MS}
         GROUP BY 1
         ORDER BY COUNT(*) DESC
         LIMIT 10`,
    ),
  ]);

  const items: FixItem[] = [];
  for (const r of gapStrong.rows) {
    items.push({
      kind: 'gap_strong',
      why: `Gap declared, but KB matched ${STRONG_MATCH}+`,
      headline: r.example,
      detail: `Best match ${r.sim?.toFixed(2)}. The KB returned content and the answer still said it had none, which points at the prompt or the chunking.`,
      count: Number(r.count),
      rowIds: r.ids,
    });
  }
  for (const r of weak.rows) {
    items.push({
      kind: 'weak_match',
      why: 'Weak match, likely a KB gap',
      headline: r.example,
      detail: r.sim == null
        ? 'Search returned nothing. Candidate for new KB content.'
        : `Best match ${r.sim.toFixed(2)}, below ${WEAK_MATCH}. Candidate for new KB content.`,
      count: Number(r.count),
      rowIds: r.ids,
    });
  }
  for (const r of ungrounded.rows) {
    items.push({
      kind: 'not_grounded',
      why: 'Judge: not grounded',
      headline: r.example,
      detail: r.reason ?? 'The answer made claims the retrieved chunks do not support.',
      count: Number(r.count),
      rowIds: r.ids,
    });
  }
  const rephrased = pairs.rows.filter((p) => overlap(p.a_q, p.b_q) >= 0.4);
  if (rephrased.length) {
    const first = rephrased[0];
    items.push({
      kind: 'rephrased',
      why: `Rephrased within ${REPHRASE_SECONDS} s`,
      headline: `"${first.a_q}" → "${first.b_q}"`,
      detail: 'A follow-up worded like the question before it, sent soon after the answer. The first answer probably missed.',
      count: rephrased.length,
      rowIds: rephrased.flatMap((p) => [p.a_id, p.b_id]),
    });
  }
  for (const r of slow.rows) {
    items.push({
      kind: 'slow_search',
      why: `Slow search (over ${SLOW_SEARCH_MS / 1000} s)`,
      headline: `${r.count} turns in the hour from ${r.hour.toISOString().replace('T', ' ').slice(0, 16)} UTC`,
      detail: 'Probably the backend, not the question.',
      count: Number(r.count),
      rowIds: r.ids,
    });
  }
  return items.sort((a, b) => b.count - a.count);
}

export type ConversationShape = {
  conversations: number;
  startedWithButton: number;
  buttonThenTyped: number;
  startedTyped: number;
  singleQuestion: number;
};

function groupBySession(rows: EventRow[]): Map<string, EventRow[]> {
  const bySession = new Map<string, EventRow[]>();
  for (const r of rows) {
    const list = bySession.get(r.sessionId) ?? [];
    list.push(r);
    bySession.set(r.sessionId, list);
  }
  return bySession;
}

export async function getConversationShapes(days = 30): Promise<ConversationShape> {
  const { rows } = await pool.query<EventDbRow>(
    `SELECT ${EVENT_COLUMNS}
       FROM chat_events
       WHERE is_synthetic = FALSE AND ${sinceDays(days)}
       ORDER BY session_id, created_at
       LIMIT 20000`,
  );
  const shape: ConversationShape = {
    conversations: 0, startedWithButton: 0, buttonThenTyped: 0, startedTyped: 0, singleQuestion: 0,
  };
  for (const list of groupBySession(rows.map(toEventRow)).values()) {
    for (const c of splitConversations(list)) {
      const asked = c.turns.filter((t) => !t.rateLimited);
      if (!asked.length) continue;
      shape.conversations++;
      if (asked[0].isButton) {
        shape.startedWithButton++;
        if (asked.slice(1).some((t) => !t.isButton)) shape.buttonThenTyped++;
      } else {
        shape.startedTyped++;
      }
      if (asked.length === 1) shape.singleQuestion++;
    }
  }
  return shape;
}

export type VersionQuality = {
  promptVersion: string;
  indexVersion: string | null;
  firstSeen: string;
  answered: number;
  gapDeclaredRate: number;
  notGroundedRate: number;
};

// Quality split by prompt and index version, so a drop can be traced to a
// prompt edit or a re-embed.
export async function getQualityByVersion(days = 90): Promise<VersionQuality[]> {
  const { rows } = await pool.query<{
    prompt_version: string; index_version: string | null; first_seen: Date;
    answered: string; gap: string; judged: string; not_grounded: string;
  }>(
    `SELECT prompt_version, index_version, MIN(created_at) AS first_seen,
            COUNT(*)::TEXT AS answered,
            COUNT(*) FILTER (WHERE ${LABEL_BY_KEY.gap_declared.sql})::TEXT AS gap,
            COUNT(*) FILTER (WHERE flags->'judge'->>'verdict' IN ('grounded', 'partial', 'not_grounded'))::TEXT AS judged,
            COUNT(*) FILTER (WHERE ${LABEL_BY_KEY.not_grounded.sql})::TEXT AS not_grounded
       FROM chat_events
       WHERE ${ANSWERED} AND ${sinceDays(days)} AND prompt_version IS NOT NULL
       GROUP BY 1, 2
       ORDER BY MIN(created_at) DESC`,
  );
  return rows.map((r) => ({
    promptVersion: r.prompt_version,
    indexVersion: r.index_version,
    firstSeen: r.first_seen.toISOString().slice(0, 10),
    answered: Number(r.answered),
    gapDeclaredRate: Number(r.answered) ? Number(r.gap) / Number(r.answered) : 0,
    notGroundedRate: Number(r.judged) ? Number(r.not_grounded) / Number(r.judged) : 0,
  }));
}

// ── Admin logins ─────────────────────────────────────────────────────────────

export type FailedLogins = { ipHash: string; attempts: number }[];

export async function getFailedLoginsLastHour(): Promise<FailedLogins> {
  const { rows } = await pool.query<{ ip_hash: string; attempts: string }>(
    `SELECT ip_hash, COUNT(*)::TEXT AS attempts
       FROM admin_login_attempts
       WHERE success = FALSE AND created_at > NOW() - INTERVAL '1 hour'
       GROUP BY ip_hash
       ORDER BY COUNT(*) DESC
       LIMIT 5`,
  );
  return rows.map((r) => ({ ipHash: r.ip_hash, attempts: Number(r.attempts) }));
}

// ── Weekly digest export ─────────────────────────────────────────────────────

export async function getExport(since: Date): Promise<{ sessionId: string; conversations: Conversation[] }[]> {
  const { rows } = await pool.query<EventDbRow>(
    `SELECT ${EVENT_COLUMNS}
       FROM chat_events
       WHERE is_synthetic = FALSE AND created_at >= $1
       ORDER BY session_id, created_at
       LIMIT 20000`,
    [since],
  );
  return [...groupBySession(rows.map(toEventRow))].map(([sessionId, list]) => ({
    sessionId,
    conversations: splitConversations(list),
  }));
}
