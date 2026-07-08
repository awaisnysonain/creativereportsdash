import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { MetaAdMetric, TripleWhaleAdMetric } from "@/types";
import type { BrandKey } from "@/config/brands";
import { safeDiv } from "@/lib/utils";

/**
 * Importer for exported Meta Ads CSV/XLSX reports ("test data mode").
 * Lets the dashboard run against real exported data before all live API
 * connections are wired up. Column headers match Meta Ads Manager exports.
 */

type Row = Record<string, string>;

function num(v: string | undefined): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Resolve a value from a row using a list of possible header names. */
function field(row: Row, names: string[]): string | undefined {
  for (const n of names) {
    if (row[n] != null && row[n] !== "") return row[n];
    // Case-insensitive fallback.
    const key = Object.keys(row).find((k) => k.toLowerCase() === n.toLowerCase());
    if (key && row[key] !== "") return row[key];
  }
  return undefined;
}

function rowToMetric(row: Row, brand: BrandKey): MetaAdMetric | null {
  const adId = field(row, ["Ad ID", "ad_id"]);
  const adName = field(row, ["Ad name", "Ad Name", "ad_name"]);
  if (!adId && !adName) return null;

  const spend = num(field(row, ["Amount spent (USD)", "Amount Spent (USD)", "spend"]));
  const impressions = num(field(row, ["Impressions", "impressions"]));
  const reach = num(field(row, ["Reach", "reach"]));
  const linkClicks = num(field(row, ["Link clicks", "Link Clicks", "inline_link_clicks"]));
  const allClicks = num(field(row, ["Clicks (all)", "clicks"]));
  const ctrRaw = num(field(row, ["CTR (link click-through rate)", "CTR (all)", "ctr"]));
  const cpc = num(field(row, ["CPC (cost per link click) (USD)", "CPC (all) (USD)", "cpc"]));
  const cpm = num(field(row, ["CPM (cost per 1,000 impressions) (USD)", "cpm"]));
  const results = num(field(row, ["Results", "results"]));
  const roas = num(field(row, ["ROAS", "Purchase ROAS (return on ad spend)", "roas"]));
  const thumbstopRaw = num(field(row, ["3-second video plays rate per impressions", "thumbstop"]));
  const plays3s = num(field(row, ["3-second video plays", "3-Second Video Plays", "Video plays at 3 seconds"]));

  const purchaseValue = roas * spend;
  let thumbstopPct = safeDiv(plays3s, impressions);
  let video3s = plays3s;
  if (thumbstopRaw > 0) {
    thumbstopPct = thumbstopRaw > 1 ? thumbstopRaw / 100 : thumbstopRaw;
    if (!video3s) video3s = Math.round(thumbstopPct * impressions);
  } else if (video3s && impressions) {
    thumbstopPct = safeDiv(video3s, impressions);
  }

  return {
    accountId: field(row, ["Account ID", "account_id"]) ?? `import_${brand}`,
    brand,
    // CSV exports usually omit campaign_id; use the name as the grouping key.
    campaignId: field(row, ["Campaign ID", "campaign_id"]) ?? field(row, ["Campaign name"]) ?? null,
    campaignName: field(row, ["Campaign name", "Campaign Name"]) ?? null,
    adsetId: field(row, ["Ad set ID", "Ad Set ID", "adset_id"]) ?? field(row, ["Ad set name"]) ?? null,
    adsetName: field(row, ["Ad set name", "Ad Set Name", "adset_name"]) ?? null,
    adId: adId ?? adName ?? "",
    adName: adName ?? adId ?? "",
    spend,
    impressions,
    reach,
    clicks: allClicks || linkClicks,
    inlineLinkClicks: linkClicks,
    ctr: ctrRaw > 1 ? ctrRaw / 100 : ctrRaw || safeDiv(linkClicks, impressions),
    cpc: cpc || safeDiv(spend, linkClicks),
    cpm: cpm || safeDiv(spend, impressions) * 1000,
    purchases: results,
    purchaseValue,
    video3sPlays: video3s,
    thumbstopPct,
    metaRoas: roas || safeDiv(purchaseValue, spend),
    dateStart: field(row, ["Reporting starts", "date_start"]) ?? "",
    dateStop: field(row, ["Reporting ends", "date_stop"]) ?? "",
  };
}

/**
 * Extract a Triple Whale row from the same combined "Meta + TW Ad Data" sheet.
 * These exports carry both Meta columns and the full `tw_*` / "TW …" column set.
 * Returns null when the row was not matched to Triple Whale (so unmatched ads
 * simply carry $0 TW spend and never distort totals — per the process doc).
 */
function rowToTw(row: Row, brand: BrandKey): TripleWhaleAdMetric | null {
  const adId = field(row, ["ad_id", "Ad ID"]);
  if (!adId) return null;

  const matchStatus = (field(row, ["TW Match Status"]) ?? "").toLowerCase();
  const twSpend = num(field(row, ["tw_spend"]));
  const attributedRevenue = num(field(row, ["tw_pixel_conversion_value", "TW Pixel Conversion Value"]));
  const ncRevenue = num(field(row, ["tw_new_customer_conversion_value", "TW New Customer Conversion Value"]));
  const uniqueVisitors = num(field(row, ["tw_unique_visitors", "TW Unique Visitors"]));

  // No usable Triple Whale signal → treat as unmatched.
  const hasSignal = matchStatus.includes("match") || twSpend > 0 || attributedRevenue > 0 || uniqueVisitors > 0;
  if (!hasSignal) return null;

  const newVisitors = num(field(row, ["tw_new_visitors", "TW New Visitors"]));
  const nvpRaw = num(field(row, ["tw_new_visitor_percent", "TW NVP / New Visitor %"]));

  return {
    storeKey: field(row, ["tw_account_id"]) ?? `import_${brand}`,
    brand,
    adId,
    adName: field(row, ["tw_ad_name", "Ad name", "Ad Name"]) ?? null,
    spend: twSpend,
    attributedRevenue,
    twRoas: num(field(row, ["tw_pixel_roas", "TW Pixel ROAS"])) || safeDiv(attributedRevenue, twSpend),
    // Persist NC ROAS as NC-conversion-value ÷ TW spend so the merge can recover NC revenue.
    ncRoas: num(field(row, ["tw_new_customer_roas", "TW New Customer ROAS"])) || safeDiv(ncRevenue, twSpend),
    nvpPct: nvpRaw > 1 ? nvpRaw / 100 : nvpRaw || safeDiv(newVisitors, uniqueVisitors),
    newVisitors,
    uniqueVisitors,
    orders: num(field(row, ["tw_pixel_purchases", "TW Pixel Purchases"])),
    newCustomerOrders: num(field(row, ["tw_new_customer_purchases", "TW New Customer Purchases"])),
    dateStart: field(row, ["Reporting starts", "date_start"]) ?? "",
    dateStop: field(row, ["Reporting ends", "date_stop"]) ?? "",
  };
}

export interface ImportResult {
  rows: MetaAdMetric[];
  tw: TripleWhaleAdMetric[];
  totalRows: number;
  skipped: number;
  twMatched: number;
  dateStart: string | null;
  dateStop: string | null;
}

function finalize(rows: MetaAdMetric[], tw: TripleWhaleAdMetric[], total: number): ImportResult {
  const dates = rows.map((r) => r.dateStart).filter(Boolean).sort();
  const ends = rows.map((r) => r.dateStop).filter(Boolean).sort();
  return {
    rows,
    tw,
    totalRows: total,
    skipped: total - rows.length,
    twMatched: tw.length,
    dateStart: dates[0] ?? null,
    dateStop: ends[ends.length - 1] ?? null,
  };
}

function parseRows(data: Row[], brand: BrandKey): ImportResult {
  const rows: MetaAdMetric[] = [];
  const tw: TripleWhaleAdMetric[] = [];
  for (const r of data) {
    const m = rowToMetric(r, brand);
    if (m) rows.push(m);
    const t = rowToTw(r, brand);
    if (t) tw.push(t);
  }
  return finalize(rows, tw, data.length);
}

/** Parse a Meta (or combined Meta+TW) export from raw CSV text. */
export function importMetaCsv(csvText: string, brand: BrandKey): ImportResult {
  const parsed = Papa.parse<Row>(csvText, { header: true, skipEmptyLines: true });
  return parseRows(parsed.data, brand);
}

/** Parse a Meta (or combined Meta+TW) export from an XLSX buffer (first sheet). */
export function importMetaXlsx(buffer: ArrayBuffer | Buffer, brand: BrandKey): ImportResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });
  return parseRows(json, brand);
}
