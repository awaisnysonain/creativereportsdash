import type { BrandKey } from "@/config/brands";
import { getBrand } from "@/config/brands";
import { last30, last7, prior23, priorL7 } from "@/lib/dates";
import { fetchMetaAdInsights } from "@/lib/services/meta";
import { fetchTwAdMetrics } from "@/lib/services/triplewhale";
import { mergeCreativeMetrics } from "@/lib/analytics/merge";
import { buildAnalysisSnapshot } from "@/lib/analytics";
import { generateWeeklyReport } from "@/lib/services/openai";
import { postReportToSlack } from "@/lib/services/slack";
import { env } from "@/lib/env";
import { runJob } from "./runner";
import {
  createSyncRun,
  getMergedForRun,
  getMetaRowsForRun,
  getTwRowsForRun,
  insertMergedMetrics,
  insertMetaMetrics,
  insertTwMetrics,
  saveAiReport,
  saveAnalysisSnapshot,
  saveSlackPost,
  updateSyncRun,
  writeJobLog,
} from "@/lib/db/repositories";
import type {
  MergedCreativeMetric,
  MetaAdMetric,
  ParsedCreative,
  TripleWhaleAdMetric,
} from "@/types";

/**
 * Background jobs. Each job is independently runnable (manual buttons in UI) and
 * they compose into `weeklyFullRun`. Jobs persist to Postgres and record logs.
 */

const WINDOWS = () => ({ l7: last7(), l30: last30() });

// ── Individual jobs ──────────────────────────────────────────────────────────

export async function syncMetaWindow(runId: string, accountKey: string, window: "L7" | "L30") {
  return runJob({ runId, job: `syncMetaWindow:${window}` }, async () => {
    const w = window === "L7" ? last7() : last30();
    const rows = await fetchMetaAdInsights({ accountKey, since: w.start, until: w.end });
    await insertMetaMetrics(runId, window, rows);
    return { count: rows.length };
  }, { retries: 2, meta: { accountKey, window } });
}

export async function syncTripleWhaleWindow(runId: string, storeKey: string, window: "L7" | "L30") {
  return runJob({ runId, job: `syncTripleWhaleWindow:${window}` }, async () => {
    const w = window === "L7" ? last7() : last30();
    const { rows, meta } = await fetchTwAdMetrics({ storeKey, since: w.start, until: w.end });
    await insertTwMetrics(runId, window, rows);
    await writeJobLog({ runId, job: "twRequestMeta", status: "success", message: "TW request metadata", meta: meta as unknown as Record<string, unknown> });
    return { count: rows.length };
  }, { retries: 2, meta: { storeKey, window } });
}

function toMetaMetric(r: Record<string, unknown>): MetaAdMetric {
  return {
    accountId: String(r.account_id ?? ""),
    brand: (r.brand_key as BrandKey) ?? "NOBL",
    campaignId: (r.campaign_id as string) ?? null,
    campaignName: (r.campaign_name as string) ?? null,
    adsetId: (r.adset_id as string) ?? null,
    adsetName: (r.adset_name as string) ?? null,
    adId: String(r.ad_id ?? ""),
    adName: String(r.ad_name ?? ""),
    spend: Number(r.spend) || 0,
    impressions: Number(r.impressions) || 0,
    reach: Number(r.reach) || 0,
    clicks: Number(r.clicks) || 0,
    inlineLinkClicks: Number(r.inline_link_clicks) || 0,
    ctr: Number(r.ctr) || 0,
    cpc: Number(r.cpc) || 0,
    cpm: Number(r.cpm) || 0,
    purchases: Number(r.purchases) || 0,
    purchaseValue: Number(r.purchase_value) || 0,
    video3sPlays: Number(r.video_3s_plays) || 0,
    thumbstopPct: Number(r.thumbstop_pct) || 0,
    metaRoas: Number(r.meta_roas) || 0,
    dateStart: String(r.date_start ?? ""),
    dateStop: String(r.date_stop ?? ""),
  };
}

function toTwMetric(r: Record<string, unknown>): TripleWhaleAdMetric {
  return {
    storeKey: String(r.store_key ?? ""),
    brand: (r.brand_key as BrandKey) ?? "NOBL",
    adId: String(r.ad_id ?? ""),
    adName: (r.ad_name as string) ?? null,
    spend: Number(r.spend) || 0,
    attributedRevenue: Number(r.attributed_revenue) || 0,
    twRoas: Number(r.tw_roas) || 0,
    ncRoas: Number(r.nc_roas) || 0,
    nvpPct: Number(r.nvp_pct) || 0,
    newVisitors: Number(r.new_visitors) || 0,
    uniqueVisitors: Number(r.unique_visitors) || 0,
    orders: Number(r.orders) || 0,
    newCustomerOrders: Number(r.new_customer_orders) || 0,
    dateStart: String(r.date_start ?? ""),
    dateStop: String(r.date_stop ?? ""),
  };
}

export async function mergeCreativeData(runId: string, brand: BrandKey, window: "L7" | "L30") {
  return runJob({ runId, job: `mergeCreativeData:${window}` }, async () => {
    const metaRows = (await getMetaRowsForRun(runId, window)).map(toMetaMetric);
    const twRows = (await getTwRowsForRun(runId, window)).map(toTwMetric);
    const merged = mergeCreativeMetrics(metaRows, twRows, window, brand);
    await insertMergedMetrics(runId, window, merged);
    return { count: merged.length, unmatched: merged.filter((m) => !m.hasTwMatch).length };
  }, { meta: { brand, window } });
}

function reviveMerged(row: Record<string, unknown>): MergedCreativeMetric {
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

export async function computeCreativeAnalysis(runId: string, brand: BrandKey) {
  return runJob({ runId, job: "computeCreativeAnalysis" }, async () => {
    const l7 = (await getMergedForRun(runId, "L7")).map((r) => reviveMerged(r as unknown as Record<string, unknown>));
    const l30 = (await getMergedForRun(runId, "L30")).map((r) => reviveMerged(r as unknown as Record<string, unknown>));

    // Winners/decelerators derive the prior weekly run-rate from L30 vs L7 at the
    // job level: prior = (L30 − L7) / 23 × 7 (see analytics/index.ts).
    const snapshot = buildAnalysisSnapshot({ l7, l30 });
    const snapshotId = await saveAnalysisSnapshot(runId, brand, snapshot);

    await updateSyncRun(runId, {
      spend: snapshot.topline.l7.spend,
      metaRoas: snapshot.topline.l7.metaRoas,
      twRoas: snapshot.topline.l7.twRoas,
      winnersCount: snapshot.winners.length,
      deceleratorsCount: snapshot.decelerators.length,
    });

    return { snapshotId, winners: snapshot.winners.length, decelerators: snapshot.decelerators.length };
  }, { meta: { brand } });
}

export async function generateWeeklyAIReport(runId: string, brand: BrandKey) {
  return runJob({ runId, job: "generateWeeklyAIReport" }, async () => {
    const { getSnapshotForRun } = await import("@/lib/db/repositories");
    const snap = await getSnapshotForRun(runId);
    if (!snap) throw new Error("No analysis snapshot found for run — run computeCreativeAnalysis first.");
    const report = await generateWeeklyReport(brand, snap.payload);
    const reportId = await saveAiReport({
      runId,
      brandKey: brand,
      title: report.title,
      slackSummary: report.slackSummary,
      markdown: report.markdown,
      model: report.model,
    });
    await updateSyncRun(runId, { reportId });
    return { reportId, usedAi: report.usedAi };
  }, { meta: { brand } });
}

export async function postSlackSummary(runId: string, reportId: string, dashboardUrl?: string) {
  return runJob({ runId, job: "postSlackSummary" }, async () => {
    const { getAiReport } = await import("@/lib/db/repositories");
    const report = await getAiReport(reportId);
    if (!report) throw new Error("Report not found");
    const result = await postReportToSlack({
      title: report.title,
      slackSummary: report.slack_summary,
      reportUrl: dashboardUrl ? `${dashboardUrl}/reports?id=${reportId}` : undefined,
    });
    await saveSlackPost({
      reportId,
      runId,
      channelId: result.channelId,
      status: result.ok ? "success" : "failed",
      messageTs: result.ts,
      permalink: result.permalink,
      error: result.error,
    });
    await updateSyncRun(runId, { slackStatus: result.ok ? "success" : "failed" });
    if (!result.ok) throw new Error(result.error ?? "Slack post failed");
    return { ok: true, permalink: result.permalink };
  });
}

// ── Orchestrated weekly full run ──────────────────────────────────────────────

export interface WeeklyRunOptions {
  brand: BrandKey;
  accountKey?: string;
  storeKey?: string;
  postToSlack?: boolean;
  dashboardUrl?: string;
  trigger?: string;
}

export async function weeklyFullRun(opts: WeeklyRunOptions) {
  const brand = getBrand(opts.brand);
  if (!brand) throw new Error(`Unknown brand: ${opts.brand}`);
  const accountKey = opts.accountKey ?? brand.metaAccounts[0]?.key;
  const storeKey = opts.storeKey ?? brand.stores[0]?.key;
  const w = WINDOWS();

  const runId = await createSyncRun({
    brandKey: opts.brand,
    metaAccountKey: accountKey ?? null,
    storeKey: storeKey ?? null,
    trigger: opts.trigger ?? "scheduled",
    windows: { l7Start: w.l7.start, l7End: w.l7.end, l30Start: w.l30.start, l30End: w.l30.end },
  });

  let partial = false;
  const errors: string[] = [];

  // 1) Meta sync (both windows)
  if (accountKey) {
    for (const window of ["L7", "L30"] as const) {
      try {
        await syncMetaWindow(runId, accountKey, window);
      } catch (e) {
        partial = true;
        errors.push(`meta ${window}: ${(e as Error).message}`);
      }
    }
  }

  // 2) Triple Whale sync (both windows)
  if (storeKey) {
    for (const window of ["L7", "L30"] as const) {
      try {
        await syncTripleWhaleWindow(runId, storeKey, window);
      } catch (e) {
        partial = true;
        errors.push(`tw ${window}: ${(e as Error).message}`);
      }
    }
  }

  // 3) Merge
  for (const window of ["L7", "L30"] as const) {
    try {
      await mergeCreativeData(runId, opts.brand, window);
    } catch (e) {
      partial = true;
      errors.push(`merge ${window}: ${(e as Error).message}`);
    }
  }

  // 4) Analysis
  let reportId: string | undefined;
  try {
    await computeCreativeAnalysis(runId, opts.brand);
    // 5) AI report
    const rep = await generateWeeklyAIReport(runId, opts.brand);
    reportId = rep.reportId;
    // 6) Slack
    if (opts.postToSlack && reportId) {
      try {
        await postSlackSummary(runId, reportId, opts.dashboardUrl);
      } catch (e) {
        partial = true;
        errors.push(`slack: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    partial = true;
    errors.push(`analysis/report: ${(e as Error).message}`);
  }

  await updateSyncRun(runId, {
    status: partial ? "partial" : "success",
    finished: true,
    notes: errors.length ? errors.join(" | ") : undefined,
  });

  return { runId, reportId, partial, errors };
}

export const WEEKLY_META = { day: env.WEEKLY_RUN_DAY, hour: env.WEEKLY_RUN_HOUR, tz: env.REPORT_TIMEZONE };

// ── Import-based run (test data mode) ─────────────────────────────────────────

export interface ImportRunInput {
  brand: BrandKey;
  windows: { window: "L7" | "L30"; meta: MetaAdMetric[]; tw?: TripleWhaleAdMetric[] }[];
  generateReport?: boolean;
}

/**
 * Build a full analyzed run from imported metrics (no live APIs). Powers the
 * CSV/XLSX importer and the seed script so the dashboard is usable immediately.
 */
export async function importAndAnalyze(input: ImportRunInput) {
  const runId = await createSyncRun({ brandKey: input.brand, trigger: "import" });

  for (const w of input.windows) {
    await insertMetaMetrics(runId, w.window, w.meta);
    if (w.tw?.length) await insertTwMetrics(runId, w.window, w.tw);
    await mergeCreativeData(runId, input.brand, w.window);
  }

  await computeCreativeAnalysis(runId, input.brand);

  let reportId: string | undefined;
  if (input.generateReport !== false) {
    try {
      const rep = await generateWeeklyAIReport(runId, input.brand);
      reportId = rep.reportId;
    } catch (e) {
      await writeJobLog({ runId, job: "generateWeeklyAIReport", status: "failed", level: "error", message: (e as Error).message });
    }
  }

  await updateSyncRun(runId, { status: "success", finished: true });
  return { runId, reportId };
}
