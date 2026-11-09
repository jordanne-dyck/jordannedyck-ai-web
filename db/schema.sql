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

-- Monitoring columns (site-monitoring plan, Phase 1, 2026-10-13).
-- Additive and idempotent: the migration Job re-runs this whole file, so every
-- statement below must be safe to run against a table that already has it.
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS response_text    TEXT;
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS turn_index       INTEGER;
-- 'ok' | 'empty' | 'error', as reported by searchExperience() in route.ts.
-- NULL on rows that never reached retrieval (rate-limited, rejected).
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS retrieval_status TEXT;
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS chunk_ids        TEXT[];
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS top_similarity   REAL;
-- TRUE for requests carrying a valid x-monitor-token (Checkly).
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS is_synthetic     BOOLEAN NOT NULL DEFAULT FALSE;
-- Join key to a client analytics tool, if one is adopted (Phase 2).
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS client_id        TEXT;
-- Open-ended labels: oversize, dropped_roles, later abuse classification and feedback.
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS flags            JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_chat_events_synthetic
  ON chat_events (is_synthetic, created_at DESC);

-- Dashboard v2 columns (site-monitoring plan, "Dashboard v2", 2026-10-14).
-- Additive and idempotent, like the block above.
-- Time spent in searchExperience(), so time_to_first_token_ms can be split
-- into search time and model time.
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS retrieval_ms     INTEGER;
-- 'button' | 'typed', as sent by app/page.tsx. NULL on rows from before
-- 2026-10-14 and on requests that don't say (Checkly, eval runners).
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS source           TEXT;
-- Short hash of the system-prompt template (lib/prompt-version.ts), so a
-- quality change can be traced to a prompt edit.
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS prompt_version   TEXT;
-- Fingerprint of the FAISS index that answered. NULL until the backend's
-- /search reports one.
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS index_version    TEXT;

-- Citations (2026-10-15). Chunk ids the answer cited, parsed from the model's
-- [ops-009] markers (lib/citations.ts), so groundedness can be checked claim by
-- claim. Compare with chunk_ids, which is what was retrieved. NULL on rows from
-- before citations and on rows with no answer.
ALTER TABLE chat_events ADD COLUMN IF NOT EXISTS cited_chunk_ids  TEXT[];

-- The conversation view reads a session's rows in order.
CREATE INDEX IF NOT EXISTS idx_chat_events_session_asc
  ON chat_events (session_id, created_at);

-- One row per admin login attempt. lib/admin-login-limit.ts locks an IP hash
-- out after repeated failures; the admin anomaly banner shows them.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash     TEXT NOT NULL,
  success     BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip
  ON admin_login_attempts (ip_hash, created_at DESC);

-- Concierge pilot, phase 2 (nimbalyst-local/plans/concierge-pilot.md,
-- 2026-11-07). One row per note a visitor sends Jordanne from the "Talk to the
-- human" panel. Kept apart from chat_events: this is what the visitor chose to
-- send, with their name and email, not the conversation. Deleted after 365
-- days by k8s/postgres/retention-cronjob.yaml; the period is stated to
-- visitors in lib/leads.ts (LEAD_CONSENT). Change them together.
CREATE TABLE IF NOT EXISTS leads (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  -- lib/concierge.ts PURPOSES id, or NULL if the visitor didn't pick one.
  purpose     TEXT,
  -- Project slug when the panel was opened from a project.
  project     TEXT,
  note        TEXT NOT NULL,
  -- 'ai' | 'template' | 'blank': how the note started, before the visitor's edits.
  drafted_by  TEXT,
  edited      BOOLEAN NOT NULL DEFAULT FALSE,
  -- When the visitor pressed Send under the consent wording.
  consent_at  TIMESTAMPTZ NOT NULL,
  -- For the per-visitor limit in app/api/lead/route.ts only.
  ip_hash     TEXT NOT NULL,
  -- 'new' | 'replied' | 'conversation' | 'closed', set in /dashboard/admin/leads.
  status      TEXT NOT NULL DEFAULT 'new',
  status_at   TIMESTAMPTZ,
  -- First time the lead left 'new': the pilot's reply time.
  replied_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at
  ON leads (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_ip_hash
  ON leads (ip_hash, created_at DESC);

-- lib/leads.ts LEAD_STATUSES. Dropped and re-added so a re-run picks up a
-- changed list, and so it reaches a table created before the check existed.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'replied', 'conversation', 'closed'));
