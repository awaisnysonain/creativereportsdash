import { env } from "@/lib/env";
import { getMetaAccount, type MetaAccountConfig } from "@/config/brands";
import { fetchJson, HttpError } from "./http";
import { safeDiv } from "@/lib/utils";
import type { MetaAdMetric } from "@/types";
import type { BrandKey } from "@/config/brands";

/**
 * Meta Marketing API service.
 * - Fetches ad-level insights with pagination.
 * - Normalizes actions / action_values into purchases & purchase value.
 * - Computes CTR/CPC/CPM/ROAS/thumbstop (3s video views ÷ impressions) cleanly.
 * - Supports multiple ad accounts (NOBL, FLO).
 */

const GRAPH = () => `https://graph.facebook.com/${env.META_API_VERSION || "v20.0"}`;

const AD_FIELDS = [
  "account_id",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "ctr",
  "cpc",
  "cpm",
  "actions",
  "action_values",
  "video_play_actions",
  "date_start",
  "date_stop",
].join(",");

interface MetaAction {
  action_type: string;
  value: string;
}

interface MetaInsightRaw {
  account_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  video_play_actions?: MetaAction[];
  date_start?: string;
  date_stop?: string;
}

interface MetaPagedResponse {
  data: MetaInsightRaw[];
  paging?: { next?: string; cursors?: { after?: string } };
  error?: { message: string; code: number; type: string };
}

const PURCHASE_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
  "omni_purchase",
];

function sumActions(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  return actions
    .filter((a) => types.includes(a.action_type))
    .reduce((acc, a) => acc + (Number(a.value) || 0), 0);
}

/** Prefer the most specific purchase action available. */
function extractPurchase(actions: MetaAction[] | undefined): number {
  if (!actions) return 0;
  for (const t of PURCHASE_ACTION_TYPES) {
    const v = sumActions(actions, [t]);
    if (v > 0) return v;
  }
  return 0;
}

function extractVideo3sPlays(raw: MetaInsightRaw): number {
  // Meta Ads Manager export column "3-second video plays rate per impressions" =
  // actions[video_view] ÷ impressions. video_view = 3-second video views.
  const fromActions = sumActions(raw.actions, ["video_view"]);
  if (fromActions > 0) return fromActions;
  return sumActions(raw.video_play_actions, ["video_view"]);
}

function normalizeRow(raw: MetaInsightRaw, brand: BrandKey): MetaAdMetric {
  const spend = Number(raw.spend) || 0;
  const impressions = Number(raw.impressions) || 0;
  const purchases = extractPurchase(raw.actions);
  const purchaseValue = extractPurchase(raw.action_values);
  const video3s = extractVideo3sPlays(raw);

  return {
    accountId: raw.account_id ?? "",
    brand,
    campaignId: raw.campaign_id ?? null,
    campaignName: raw.campaign_name ?? null,
    adsetId: raw.adset_id ?? null,
    adsetName: raw.adset_name ?? null,
    adId: raw.ad_id ?? "",
    adName: raw.ad_name ?? "",
    spend,
    impressions,
    reach: Number(raw.reach) || 0,
    clicks: Number(raw.clicks) || 0,
    inlineLinkClicks: Number(raw.inline_link_clicks) || 0,
    ctr: Number(raw.ctr) ? Number(raw.ctr) / 100 : safeDiv(Number(raw.clicks) || 0, impressions),
    cpc: Number(raw.cpc) || safeDiv(spend, Number(raw.inline_link_clicks) || 0),
    cpm: Number(raw.cpm) || safeDiv(spend, impressions) * 1000,
    purchases,
    purchaseValue,
    video3sPlays: video3s,
    thumbstopPct: safeDiv(video3s, impressions),
    metaRoas: safeDiv(purchaseValue, spend),
    dateStart: raw.date_start ?? "",
    dateStop: raw.date_stop ?? "",
  };
}

export interface MetaFetchParams {
  accountKey: string;
  since: string; // yyyy-MM-dd
  until: string; // yyyy-MM-dd
}

/** Fetch and normalize ad-level insights for one account/date-window. */
export async function fetchMetaAdInsights(params: MetaFetchParams): Promise<MetaAdMetric[]> {
  const account = getMetaAccount(params.accountKey);
  if (!account) throw new Error(`Unknown Meta account key: ${params.accountKey}`);
  if (!account.configured) {
    throw new Error(`Meta account ${account.label} is not configured (missing id/token).`);
  }
  return fetchForAccount(account, params.since, params.until);
}

async function fetchForAccount(account: MetaAccountConfig, since: string, until: string): Promise<MetaAdMetric[]> {
  const results: MetaAdMetric[] = [];
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  let url =
    `${GRAPH()}/${account.accountId}/insights?level=ad&fields=${AD_FIELDS}` +
    `&time_range=${timeRange}&time_increment=all_days&limit=200&access_token=${account.accessToken}`;

  let guard = 0;
  while (url && guard < 100) {
    guard++;
    const page = await fetchJson<MetaPagedResponse>(url, { retries: 4, backoffMs: 800 });
    if (page.error) {
      throw new HttpError(400, JSON.stringify(page.error), `Meta API error: ${page.error.message}`);
    }
    for (const row of page.data ?? []) {
      if (row.ad_id) results.push(normalizeRow(row, account.brand));
    }
    url = page.paging?.next ?? "";
  }
  return results;
}

/** Lightweight connection test: fetch account name. */
export async function testMetaConnection(accountKey: string): Promise<{ ok: boolean; detail: string }> {
  const account = getMetaAccount(accountKey);
  if (!account) return { ok: false, detail: "unknown account" };
  if (!account.configured) return { ok: false, detail: "not configured" };
  try {
    const res = await fetchJson<{ name?: string; id?: string; error?: { message: string } }>(
      `${GRAPH()}/${account.accountId}?fields=name,account_status&access_token=${account.accessToken}`,
      { retries: 1 },
    );
    if (res.error) return { ok: false, detail: res.error.message };
    return { ok: true, detail: res.name ? `${res.name}` : account.accountId };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
