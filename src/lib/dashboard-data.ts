import { isDbConfigured, pingDb } from "@/lib/db/client";
import {
  getMergedForRun,
  getSnapshotForRun,
  getMetaRowsForRun,
  getTwRowsForRun,
  latestSuccessfulRun,
  listAiReports,
  listJobLogs,
  listSyncRuns,
  type SyncRunRow,
} from "@/lib/db/repositories";
import type { AnalysisSnapshot, MergedCreativeMetric, ParsedCreative } from "@/types";
import type { BrandKey } from "@/config/brands";

/**
 * Server-only data layer for pages. Every function is defensive: if the DB is
 * not configured or a query fails, it returns a safe empty shape plus a status,
 * so the UI can render "connect your database" / empty states instead of crashing.
 */

export interface DbStatus {
  configured: boolean;
  ok: boolean;
  error?: string;
}

export async function dbStatus(): Promise<DbStatus> {
  if (!isDbConfigured()) return { configured: false, ok: false, error: "DATABASE_URL not set" };
  const ping = await pingDb();
  return { configured: true, ok: ping.ok, error: ping.error };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!isDbConfigured()) return fallback;
  try {
    return await fn();
  } catch (err) {
    console.error("[dashboard-data]", (err as Error).message);
    return fallback;
  }
}

export function reviveMergedRow(row: Record<string, unknown>): MergedCreativeMetric {
  const parsed = (typeof row.parsed === "string" ? JSON.parse(row.parsed as string) : row.parsed) as ParsedCreative;
  return {
    adId: String(row.ad_id),
    adName: String(row.ad_name),
    brand: (row.brand_key as BrandKey) ?? "NOBL",
    accountId: "",
    campaignId: (row.campaign_id as string) ?? null,
    campaignName: (row.campaign_name as string) ?? null,
    adsetId: (row.adset_id as string) ?? null,
    adsetName: (row.adset_name as string) ?? null,
    window: (row.window as "L7" | "L30") ?? "L7",
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    reach: 0,
    clicks: 0,
    inlineLinkClicks: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    purchases: Number(row.purchases) || 0,
    purchaseValue: Number(row.purchase_value) || 0,
    video3sPlays: Number(row.video_3s_plays) || 0,
    thumbstopPct: Number(row.thumbstop_pct) || 0,
    metaRoas: Number(row.meta_roas) || 0,
    hasTwMatch: Boolean(row.has_tw_match),
    twSpend: null,
    attributedRevenue: row.attributed_revenue != null ? Number(row.attributed_revenue) : null,
    twRoas: row.tw_roas != null ? Number(row.tw_roas) : null,
    ncRoas: row.nc_roas != null ? Number(row.nc_roas) : null,
    nvpPct: row.nvp_pct != null ? Number(row.nvp_pct) : null,
    newVisitors: row.new_visitors != null ? Number(row.new_visitors) : null,
    uniqueVisitors: row.unique_visitors != null ? Number(row.unique_visitors) : null,
    orders: row.orders != null ? Number(row.orders) : null,
    newCustomerOrders: row.new_customer_orders != null ? Number(row.new_customer_orders) : null,
    parsed,
    winLoss: (row.win_loss as "Win" | "Lose") ?? "Lose",
    campaignAvgSpendPerAd: Number(row.campaign_avg_spend) || 0,
  };
}

export async function getLatestRun(): Promise<SyncRunRow | null> {
  return safe(() => latestSuccessfulRun(), null);
}

export async function getRuns(limit = 50): Promise<SyncRunRow[]> {
  return safe(() => listSyncRuns(limit), []);
}

export async function getSnapshot(runId: string): Promise<AnalysisSnapshot | null> {
  return safe(async () => {
    const snap = await getSnapshotForRun(runId);
    return snap?.payload ?? null;
  }, null);
}

export async function getMerged(runId: string, window?: "L7" | "L30"): Promise<MergedCreativeMetric[]> {
  return safe(async () => {
    const rows = await getMergedForRun(runId, window);
    return rows.map((r) => reviveMergedRow(r as unknown as Record<string, unknown>));
  }, []);
}

export async function getRawMerged(runId: string, window: "L7" | "L30") {
  return safe(() => getMergedForRun(runId, window) as unknown as Promise<Record<string, unknown>[]>, []);
}

export async function getRawMeta(runId: string, window: "L7" | "L30") {
  return safe(() => getMetaRowsForRun(runId, window) as Promise<Record<string, unknown>[]>, []);
}

export async function getRawTw(runId: string, window: "L7" | "L30") {
  return safe(() => getTwRowsForRun(runId, window) as Promise<Record<string, unknown>[]>, []);
}

export async function getReports(limit = 50) {
  return safe(() => listAiReports(limit), []);
}

export async function getLogs(opts: { runId?: string; limit?: number } = {}) {
  return safe(() => listJobLogs(opts), []);
}
