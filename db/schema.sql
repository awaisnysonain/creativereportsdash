-- =============================================================================
-- Creative Reports — PostgreSQL schema
-- Idempotent: safe to run multiple times (CREATE TABLE IF NOT EXISTS).
-- Run via `npm run db:migrate`.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Reference / configuration ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  key           TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_account_configs (
  key           TEXT PRIMARY KEY,
  brand_key     TEXT NOT NULL REFERENCES brands(key) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  configured    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_configs (
  key           TEXT PRIMARY KEY,
  brand_key     TEXT NOT NULL REFERENCES brands(key) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  region        TEXT NOT NULL,
  shop_id       TEXT NOT NULL,
  configured    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Sync runs (one row per pipeline execution) ───────────────────────────────
CREATE TABLE IF NOT EXISTS sync_runs (
  id              TEXT PRIMARY KEY,
  brand_key       TEXT,
  meta_account_key TEXT,
  store_key       TEXT,
  trigger         TEXT NOT NULL DEFAULT 'manual',      -- manual | scheduled | import
  status          TEXT NOT NULL DEFAULT 'running',     -- running | success | failed | partial
  l7_start        DATE,
  l7_end          DATE,
  l30_start       DATE,
  l30_end         DATE,
  spend           NUMERIC(14,2) DEFAULT 0,
  meta_roas       NUMERIC(10,4) DEFAULT 0,
  tw_roas         NUMERIC(10,4) DEFAULT 0,
  winners_count   INTEGER DEFAULT 0,
  decelerators_count INTEGER DEFAULT 0,
  slack_status    TEXT,
  report_id       TEXT,
  notes           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs (started_at DESC);

-- ── Raw normalized Meta ad metrics ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_ad_metrics (
  id              BIGSERIAL PRIMARY KEY,
  run_id          TEXT REFERENCES sync_runs(id) ON DELETE CASCADE,
  brand_key       TEXT NOT NULL,
  account_id      TEXT NOT NULL,
  "window"        TEXT NOT NULL,                       -- L7 | L30
  campaign_id     TEXT,
  campaign_name   TEXT,
  adset_id        TEXT,
  adset_name      TEXT,
  ad_id           TEXT NOT NULL,
  ad_name         TEXT NOT NULL,
  spend           NUMERIC(14,2) DEFAULT 0,
  impressions     BIGINT DEFAULT 0,
  reach           BIGINT DEFAULT 0,
  clicks          BIGINT DEFAULT 0,
  inline_link_clicks BIGINT DEFAULT 0,
  ctr             NUMERIC(10,6) DEFAULT 0,
  cpc             NUMERIC(12,4) DEFAULT 0,
  cpm             NUMERIC(12,4) DEFAULT 0,
  purchases       NUMERIC(14,2) DEFAULT 0,
  purchase_value  NUMERIC(14,2) DEFAULT 0,
  video_3s_plays  BIGINT DEFAULT 0,
  thumbstop_pct   NUMERIC(10,6) DEFAULT 0,
  meta_roas       NUMERIC(10,4) DEFAULT 0,
  date_start      DATE,
  date_stop       DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_metrics_run ON meta_ad_metrics (run_id, "window");
CREATE INDEX IF NOT EXISTS idx_meta_metrics_ad ON meta_ad_metrics (ad_id);

-- ── Raw normalized Triple Whale ad metrics ───────────────────────────────────
CREATE TABLE IF NOT EXISTS triple_whale_ad_metrics (
  id              BIGSERIAL PRIMARY KEY,
  run_id          TEXT REFERENCES sync_runs(id) ON DELETE CASCADE,
  brand_key       TEXT NOT NULL,
  store_key       TEXT NOT NULL,
  "window"        TEXT NOT NULL,
  ad_id           TEXT NOT NULL,
  ad_name         TEXT,
  spend           NUMERIC(14,2) DEFAULT 0,
  attributed_revenue NUMERIC(14,2) DEFAULT 0,
  tw_roas         NUMERIC(10,4) DEFAULT 0,
  nc_roas         NUMERIC(10,4) DEFAULT 0,
  nvp_pct         NUMERIC(10,6) DEFAULT 0,
  new_visitors    BIGINT DEFAULT 0,
  unique_visitors BIGINT DEFAULT 0,
  orders          BIGINT DEFAULT 0,
  new_customer_orders BIGINT DEFAULT 0,
  date_start      DATE,
  date_stop       DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tw_metrics_run ON triple_whale_ad_metrics (run_id, "window");
CREATE INDEX IF NOT EXISTS idx_tw_metrics_ad ON triple_whale_ad_metrics (ad_id);

-- ── Merged creative metrics (Meta + TW + parsed fields + verdict) ─────────────
CREATE TABLE IF NOT EXISTS merged_creative_metrics (
  id              BIGSERIAL PRIMARY KEY,
  run_id          TEXT REFERENCES sync_runs(id) ON DELETE CASCADE,
  brand_key       TEXT NOT NULL,
  "window"        TEXT NOT NULL,
  ad_id           TEXT NOT NULL,
  ad_name         TEXT NOT NULL,
  campaign_id     TEXT,
  campaign_name   TEXT,
  adset_id        TEXT,
  adset_name      TEXT,
  spend           NUMERIC(14,2) DEFAULT 0,
  impressions     BIGINT DEFAULT 0,
  video_3s_plays  BIGINT DEFAULT 0,
  purchases       NUMERIC(14,2) DEFAULT 0,
  purchase_value  NUMERIC(14,2) DEFAULT 0,
  meta_roas       NUMERIC(10,4) DEFAULT 0,
  thumbstop_pct   NUMERIC(10,6) DEFAULT 0,
  has_tw_match    BOOLEAN DEFAULT false,
  attributed_revenue NUMERIC(14,2),
  tw_roas         NUMERIC(10,4),
  nc_roas         NUMERIC(10,4),
  nvp_pct         NUMERIC(10,6),
  new_visitors    BIGINT,
  unique_visitors BIGINT,
  orders          BIGINT,
  new_customer_orders BIGINT,
  win_loss        TEXT,
  campaign_avg_spend NUMERIC(14,2),
  parsed          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merged_run ON merged_creative_metrics (run_id, "window");

-- ── Analysis snapshots (computed grouped analytics per run) ───────────────────
CREATE TABLE IF NOT EXISTS analysis_snapshots (
  id              TEXT PRIMARY KEY,
  run_id          TEXT REFERENCES sync_runs(id) ON DELETE CASCADE,
  brand_key       TEXT,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_run ON analysis_snapshots (run_id);

-- ── AI reports ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_reports (
  id              TEXT PRIMARY KEY,
  run_id          TEXT REFERENCES sync_runs(id) ON DELETE SET NULL,
  brand_key       TEXT,
  title           TEXT NOT NULL,
  slack_summary   TEXT NOT NULL,
  markdown        TEXT NOT NULL,
  model           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_created ON ai_reports (created_at DESC);

-- ── Slack posts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slack_posts (
  id              TEXT PRIMARY KEY,
  report_id       TEXT REFERENCES ai_reports(id) ON DELETE CASCADE,
  run_id          TEXT,
  channel_id      TEXT NOT NULL,
  status          TEXT NOT NULL,                        -- success | failed
  message_ts      TEXT,
  permalink       TEXT,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Job logs (fine-grained per-job execution trace) ──────────────────────────
CREATE TABLE IF NOT EXISTS job_logs (
  id              BIGSERIAL PRIMARY KEY,
  run_id          TEXT,
  job             TEXT NOT NULL,
  status          TEXT NOT NULL,                        -- running | success | failed
  level           TEXT NOT NULL DEFAULT 'info',         -- info | warn | error
  message         TEXT NOT NULL,
  meta            JSONB DEFAULT '{}'::jsonb,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_logs_run ON job_logs (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_logs_created ON job_logs (created_at DESC);
