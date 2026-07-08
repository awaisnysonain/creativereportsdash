import { query, queryOne, withTransaction } from "./client";
import type {
  AnalysisSnapshot,
  MergedCreativeMetric,
  MetaAdMetric,
  TripleWhaleAdMetric,
} from "@/types";
import { shortId } from "@/lib/utils";

// ── Sync runs ────────────────────────────────────────────────────────────────

export interface SyncRunRow {
  id: string;
  brand_key: string | null;
  meta_account_key: string | null;
  store_key: string | null;
  trigger: string;
  status: string;
  l7_start: string | null;
  l7_end: string | null;
  l30_start: string | null;
  l30_end: string | null;
  spend: string;
  meta_roas: string;
  tw_roas: string;
  winners_count: number;
  decelerators_count: number;
  slack_status: string | null;
  report_id: string | null;
  notes: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function createSyncRun(input: {
  brandKey?: string | null;
  metaAccountKey?: string | null;
  storeKey?: string | null;
  trigger?: string;
  windows?: { l7Start?: string; l7End?: string; l30Start?: string; l30End?: string };
}): Promise<string> {
  const id = shortId("run");
  await query(
    `INSERT INTO sync_runs (id, brand_key, meta_account_key, store_key, trigger, status, l7_start, l7_end, l30_start, l30_end)
     VALUES ($1,$2,$3,$4,$5,'running',$6,$7,$8,$9)`,
    [
      id,
      input.brandKey ?? null,
      input.metaAccountKey ?? null,
      input.storeKey ?? null,
      input.trigger ?? "manual",
      input.windows?.l7Start ?? null,
      input.windows?.l7End ?? null,
      input.windows?.l30Start ?? null,
      input.windows?.l30End ?? null,
    ],
  );
  return id;
}

export async function updateSyncRun(
  id: string,
  patch: Partial<{
    status: string;
    spend: number;
    metaRoas: number;
    twRoas: number;
    winnersCount: number;
    deceleratorsCount: number;
    slackStatus: string;
    reportId: string;
    notes: string;
    finished: boolean;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const push = (col: string, val: unknown) => {
    vals.push(val);
    sets.push(`${col} = $${vals.length}`);
  };
  if (patch.status !== undefined) push("status", patch.status);
  if (patch.spend !== undefined) push("spend", patch.spend);
  if (patch.metaRoas !== undefined) push("meta_roas", patch.metaRoas);
  if (patch.twRoas !== undefined) push("tw_roas", patch.twRoas);
  if (patch.winnersCount !== undefined) push("winners_count", patch.winnersCount);
  if (patch.deceleratorsCount !== undefined) push("decelerators_count", patch.deceleratorsCount);
  if (patch.slackStatus !== undefined) push("slack_status", patch.slackStatus);
  if (patch.reportId !== undefined) push("report_id", patch.reportId);
  if (patch.notes !== undefined) push("notes", patch.notes);
  if (patch.finished) sets.push(`finished_at = now()`);
  if (!sets.length) return;
  vals.push(id);
  await query(`UPDATE sync_runs SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
}

export async function getSyncRun(id: string): Promise<SyncRunRow | null> {
  return queryOne<SyncRunRow>(`SELECT * FROM sync_runs WHERE id = $1`, [id]);
}

export async function listSyncRuns(limit = 50): Promise<SyncRunRow[]> {
  return query<SyncRunRow>(`SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT $1`, [limit]);
}

export async function latestSuccessfulRun(): Promise<SyncRunRow | null> {
  return queryOne<SyncRunRow>(
    `SELECT * FROM sync_runs WHERE status IN ('success','partial') ORDER BY started_at DESC LIMIT 1`,
  );
}

// ── Meta metrics ─────────────────────────────────────────────────────────────

export async function insertMetaMetrics(
  runId: string,
  window: "L7" | "L30",
  rows: MetaAdMetric[],
): Promise<number> {
  if (!rows.length) return 0;
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM meta_ad_metrics WHERE run_id = $1 AND "window" = $2`, [runId, window]);
    for (const r of rows) {
      await client.query(
        `INSERT INTO meta_ad_metrics
          (run_id, brand_key, account_id, "window", campaign_id, campaign_name, adset_id, adset_name,
           ad_id, ad_name, spend, impressions, reach, clicks, inline_link_clicks, ctr, cpc, cpm,
           purchases, purchase_value, video_3s_plays, thumbstop_pct, meta_roas, date_start, date_stop)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
        [
          runId, r.brand, r.accountId, window, r.campaignId, r.campaignName, r.adsetId, r.adsetName,
          r.adId, r.adName, r.spend, r.impressions, r.reach, r.clicks, r.inlineLinkClicks, r.ctr, r.cpc, r.cpm,
          r.purchases, r.purchaseValue, r.video3sPlays, r.thumbstopPct, r.metaRoas, r.dateStart, r.dateStop,
        ],
      );
    }
  });
  return rows.length;
}

// ── Triple Whale metrics ─────────────────────────────────────────────────────

export async function insertTwMetrics(
  runId: string,
  window: "L7" | "L30",
  rows: TripleWhaleAdMetric[],
): Promise<number> {
  if (!rows.length) return 0;
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM triple_whale_ad_metrics WHERE run_id = $1 AND "window" = $2`, [runId, window]);
    for (const r of rows) {
      await client.query(
        `INSERT INTO triple_whale_ad_metrics
          (run_id, brand_key, store_key, "window", ad_id, ad_name, spend, attributed_revenue, tw_roas, nc_roas,
           nvp_pct, new_visitors, unique_visitors, orders, new_customer_orders, date_start, date_stop)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          runId, r.brand, r.storeKey, window, r.adId, r.adName, r.spend, r.attributedRevenue, r.twRoas, r.ncRoas,
          r.nvpPct, r.newVisitors, r.uniqueVisitors, r.orders, r.newCustomerOrders, r.dateStart, r.dateStop,
        ],
      );
    }
  });
  return rows.length;
}

// ── Merged metrics ───────────────────────────────────────────────────────────

export async function insertMergedMetrics(
  runId: string,
  window: "L7" | "L30",
  rows: MergedCreativeMetric[],
): Promise<number> {
  if (!rows.length) return 0;
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM merged_creative_metrics WHERE run_id = $1 AND "window" = $2`, [runId, window]);
    for (const r of rows) {
      await client.query(
        `INSERT INTO merged_creative_metrics
          (run_id, brand_key, "window", ad_id, ad_name, campaign_id, campaign_name, adset_id, adset_name,
           spend, impressions, video_3s_plays, purchases, purchase_value, meta_roas, thumbstop_pct, has_tw_match,
           attributed_revenue, tw_roas, nc_roas, nvp_pct, new_visitors, unique_visitors, orders, new_customer_orders,
           win_loss, campaign_avg_spend, parsed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
        [
          runId, r.brand, window, r.adId, r.adName, r.campaignId, r.campaignName, r.adsetId, r.adsetName,
          r.spend, r.impressions, r.video3sPlays, r.purchases, r.purchaseValue, r.metaRoas, r.thumbstopPct, r.hasTwMatch,
          r.attributedRevenue, r.twRoas, r.ncRoas, r.nvpPct, r.newVisitors, r.uniqueVisitors, r.orders, r.newCustomerOrders,
          r.winLoss, r.campaignAvgSpendPerAd, JSON.stringify(r.parsed),
        ],
      );
    }
  });
  return rows.length;
}

export interface MergedRow {
  ad_id: string;
  ad_name: string;
  brand_key: string;
  window: string;
  campaign_name: string | null;
  spend: string;
  meta_roas: string;
  tw_roas: string | null;
  nc_roas: string | null;
  nvp_pct: string | null;
  has_tw_match: boolean;
  win_loss: string | null;
  attributed_revenue: string | null;
  purchase_value: string;
  thumbstop_pct: string;
  impressions: string;
  video_3s_plays: string | null;
  purchases: string;
  new_visitors: string | null;
  unique_visitors: string | null;
  orders: string | null;
  new_customer_orders: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  adset_name: string | null;
  campaign_avg_spend: string | null;
  parsed: unknown;
}

export async function getMergedForRun(runId: string, window?: "L7" | "L30"): Promise<MergedRow[]> {
  if (window) {
    return query<MergedRow>(
      `SELECT * FROM merged_creative_metrics WHERE run_id = $1 AND "window" = $2 ORDER BY spend DESC`,
      [runId, window],
    );
  }
  return query<MergedRow>(`SELECT * FROM merged_creative_metrics WHERE run_id = $1 ORDER BY spend DESC`, [runId]);
}

export async function getMetaRowsForRun(runId: string, window?: "L7" | "L30") {
  const clause = window ? `AND "window" = $2` : "";
  const params = window ? [runId, window] : [runId];
  return query(`SELECT * FROM meta_ad_metrics WHERE run_id = $1 ${clause} ORDER BY spend DESC`, params);
}

export async function getTwRowsForRun(runId: string, window?: "L7" | "L30") {
  const clause = window ? `AND "window" = $2` : "";
  const params = window ? [runId, window] : [runId];
  return query(`SELECT * FROM triple_whale_ad_metrics WHERE run_id = $1 ${clause} ORDER BY spend DESC`, params);
}

// ── Analysis snapshots ───────────────────────────────────────────────────────

export async function saveAnalysisSnapshot(
  runId: string,
  brandKey: string | null,
  payload: AnalysisSnapshot,
): Promise<string> {
  const id = shortId("snap");
  await query(
    `INSERT INTO analysis_snapshots (id, run_id, brand_key, payload) VALUES ($1,$2,$3,$4)`,
    [id, runId, brandKey, JSON.stringify(payload)],
  );
  return id;
}

export async function getSnapshotForRun(runId: string): Promise<{ id: string; payload: AnalysisSnapshot } | null> {
  const row = await queryOne<{ id: string; payload: AnalysisSnapshot }>(
    `SELECT id, payload FROM analysis_snapshots WHERE run_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [runId],
  );
  return row;
}

// ── AI reports ───────────────────────────────────────────────────────────────

export interface AiReportRow {
  id: string;
  run_id: string | null;
  brand_key: string | null;
  title: string;
  slack_summary: string;
  markdown: string;
  model: string | null;
  created_at: string;
}

export async function saveAiReport(input: {
  runId?: string | null;
  brandKey?: string | null;
  title: string;
  slackSummary: string;
  markdown: string;
  model?: string;
}): Promise<string> {
  const id = shortId("rep");
  await query(
    `INSERT INTO ai_reports (id, run_id, brand_key, title, slack_summary, markdown, model)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, input.runId ?? null, input.brandKey ?? null, input.title, input.slackSummary, input.markdown, input.model ?? null],
  );
  return id;
}

export async function getAiReport(id: string): Promise<AiReportRow | null> {
  return queryOne<AiReportRow>(`SELECT * FROM ai_reports WHERE id = $1`, [id]);
}

export async function listAiReports(limit = 50): Promise<AiReportRow[]> {
  return query<AiReportRow>(`SELECT * FROM ai_reports ORDER BY created_at DESC LIMIT $1`, [limit]);
}

// ── Slack posts ──────────────────────────────────────────────────────────────

export async function saveSlackPost(input: {
  reportId: string;
  runId?: string | null;
  channelId: string;
  status: "success" | "failed";
  messageTs?: string;
  permalink?: string;
  error?: string;
}): Promise<string> {
  const id = shortId("slk");
  await query(
    `INSERT INTO slack_posts (id, report_id, run_id, channel_id, status, message_ts, permalink, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, input.reportId, input.runId ?? null, input.channelId, input.status, input.messageTs ?? null, input.permalink ?? null, input.error ?? null],
  );
  return id;
}

// ── Job logs ─────────────────────────────────────────────────────────────────

export interface JobLogRow {
  id: string;
  run_id: string | null;
  job: string;
  status: string;
  level: string;
  message: string;
  meta: unknown;
  duration_ms: number | null;
  created_at: string;
}

export async function writeJobLog(input: {
  runId?: string | null;
  job: string;
  status: "running" | "success" | "failed";
  level?: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
  durationMs?: number;
}): Promise<void> {
  await query(
    `INSERT INTO job_logs (run_id, job, status, level, message, meta, duration_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.runId ?? null,
      input.job,
      input.status,
      input.level ?? "info",
      input.message,
      JSON.stringify(input.meta ?? {}),
      input.durationMs ?? null,
    ],
  );
}

export async function listJobLogs(opts: { runId?: string; limit?: number } = {}): Promise<JobLogRow[]> {
  if (opts.runId) {
    return query<JobLogRow>(`SELECT * FROM job_logs WHERE run_id = $1 ORDER BY created_at DESC LIMIT $2`, [
      opts.runId,
      opts.limit ?? 200,
    ]);
  }
  return query<JobLogRow>(`SELECT * FROM job_logs ORDER BY created_at DESC LIMIT $1`, [opts.limit ?? 200]);
}
