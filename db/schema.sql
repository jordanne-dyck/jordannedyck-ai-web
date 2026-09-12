-- Chat event log: one row per request to /api/chat
-- Powers the /dashboard (aggregates) and /dashboard/admin (drill-down) views.

CREATE TABLE IF NOT EXISTS chat_events (
  id                      BIGSERIAL PRIMARY KEY,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Identity (anonymous)
  session_id              TEXT NOT NULL,
  ip_hash                 TEXT NOT NULL,
  user_agent              TEXT,
  country                 TEXT,

  -- Request
  query                   TEXT NOT NULL,
  query_length            INTEGER NOT NULL,

  -- Response
  response_length         INTEGER,
  prompt_tokens           INTEGER,
  completion_tokens       INTEGER,
  cost_usd                NUMERIC(10, 6),
  model                   TEXT,

  -- Performance
  latency_ms              INTEGER,
  time_to_first_token_ms  INTEGER,

  -- Outcome
  error                   TEXT,
  rate_limited            BOOLEAN NOT NULL DEFAULT FALSE,

  -- Reserved for later: LLM-classified topic tags for the public dashboard
  topic_tags              TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_chat_events_created_at
  ON chat_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_events_session
  ON chat_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_events_ip_hash
  ON chat_events (ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_events_rate_limited
  ON chat_events (created_at DESC) WHERE rate_limited = TRUE;

CREATE INDEX IF NOT EXISTS idx_chat_events_errors
  ON chat_events (created_at DESC) WHERE error IS NOT NULL;
