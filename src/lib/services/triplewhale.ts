import { getTwStore, type TripleWhaleStoreConfig } from "@/config/brands";
import { fetchJson } from "./http";
import { safeDiv } from "@/lib/utils";
import type { TripleWhaleAdMetric } from "@/types";

/**
 * Triple Whale query layer.
 *
 * Triple Whale exposes several data-out surfaces and their response shapes are
 * notoriously inconsistent, so this service is intentionally defensive:
 *  - validates auth (x-api-key per store/workspace)
 *  - runs SQL / metrics queries
 *  - normalizes wildly different key names into our TripleWhaleAdMetric shape
 *  - retries / handles 429s (via fetchJson)
 *  - logs raw request metadata (returned alongside results)
 *
 * Endpoints are centralized here so they are trivial to update as the TW API
 * evolves. Attribution defaults to Triple Attribution / 1-day where applicable.
 */

const TW_BASE = "https://api.triplewhale.com/api/v2";
const ENDPOINTS = {
  // Data-Out: Execute Custom SQL (ad-level Pixel-attributed performance).
  sql: `${TW_BASE}/orcabase/api/sql`,
  // Data-Out: Moby natural-language query (extensible entry point).
  nlq: `${TW_BASE}/willy/answer-nlq-question`,
  // Auth validation (cheap ping).
  ping: `${TW_BASE}/users/api-keys/me`,
};

/**
 * Ad-level SQL over the Pixel Joined table (Triple Attribution, lifetime window
 * by default). One row per ad; `@startDate`/`@endDate` are bound server-side.
 * We only pull the Meta channel since we merge against Meta ad-level data on Ad ID.
 */
const AD_METRICS_SQL = `SELECT ad_id,
       MAX(ad_name) AS ad_name,
       SUM(spend) AS spend,
       SUM(order_revenue) AS attributed_revenue,
       SUM(new_customer_order_revenue) AS nc_revenue,
       SUM(new_visitors) AS new_visitors,
       SUM(unique_visitors) AS unique_visitors,
       SUM(orders_quantity) AS orders,
       SUM(new_customer_orders) AS new_customer_orders
FROM pixel_joined_tvf
WHERE event_date BETWEEN @startDate AND @endDate
  AND channel = 'facebook-ads'
  AND ad_id IS NOT NULL AND ad_id != ''
GROUP BY ad_id`;

function authHeaders(store: TripleWhaleStoreConfig): Record<string, string> {
  return {
    "x-api-key": store.apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export interface TwQueryMeta {
  storeKey: string;
  shopId: string;
  endpoint: string;
  requestedAt: string;
  rowCount: number;
  attribution: string;
}

/** Pull the first numeric value present among candidate keys. */
function pick(obj: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== "") {
      const n = Number(obj[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== "") return String(obj[k]);
  }
  return null;
}

/**
 * Normalize a Pixel Joined SQL row into TripleWhaleAdMetric.
 * NC ROAS is persisted as NC-conversion-value ÷ spend so the merge can recover
 * new-customer revenue (nc_revenue = ncRoas × spend) when aggregating by creative.
 */
export function normalizeTwRow(
  row: Record<string, unknown>,
  store: TripleWhaleStoreConfig,
  window: { start: string; end: string },
): TripleWhaleAdMetric | null {
  const adId = pickStr(row, ["ad_id", "adId", "adid", "entity_id", "id"]);
  if (!adId) return null;

  const spend = pick(row, ["spend", "adSpend", "ad_spend", "total_spend", "cost"]);
  const attributedRevenue = pick(row, [
    "attributed_revenue",
    "order_revenue",
    "pixel_conversion_value",
    "conversion_value",
    "revenue",
  ]);
  const ncRevenue = pick(row, ["nc_revenue", "new_customer_order_revenue", "new_customer_conversion_value"]);
  const newVisitors = pick(row, ["new_visitors", "newVisitors", "nv"]);
  const uniqueVisitors = pick(row, ["unique_visitors", "uniqueVisitors", "visitors"]);
  const orders = pick(row, ["orders", "orders_quantity", "purchases", "conversions"]);
  const newCustomerOrders = pick(row, ["new_customer_orders", "nc_orders", "newCustomerOrders"]);

  return {
    storeKey: store.key,
    brand: store.brand,
    adId,
    adName: pickStr(row, ["ad_name", "adName", "name", "entity_name"]),
    spend,
    attributedRevenue,
    twRoas: safeDiv(attributedRevenue, spend),
    ncRoas: safeDiv(ncRevenue, spend),
    nvpPct: safeDiv(newVisitors, uniqueVisitors),
    newVisitors,
    uniqueVisitors,
    orders,
    newCustomerOrders,
    dateStart: window.start,
    dateStop: window.end,
  };
}

/** Extract a data array from any of the shapes TW might return. */
function extractRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    for (const key of ["data", "rows", "metrics", "result", "results", "records"]) {
      const v = p[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
      if (v && typeof v === "object") {
        const vv = v as Record<string, unknown>;
        if (Array.isArray(vv.data)) return vv.data as Record<string, unknown>[];
        if (Array.isArray(vv.rows)) return vv.rows as Record<string, unknown>[];
      }
    }
  }
  return [];
}

export interface TwFetchParams {
  storeKey: string;
  since: string;
  until: string;
}

export interface TwFetchResult {
  rows: TripleWhaleAdMetric[];
  meta: TwQueryMeta;
}

/**
 * Fetch ad-level Triple Whale metrics for a store/date-window via the Data-Out
 * "Execute Custom SQL" endpoint against the Pixel Joined table (Triple
 * Attribution). Returns one row per ad, matched to Meta on Ad ID downstream.
 */
export async function fetchTwAdMetrics(params: TwFetchParams): Promise<TwFetchResult> {
  const store = getTwStore(params.storeKey);
  if (!store) throw new Error(`Unknown Triple Whale store key: ${params.storeKey}`);
  if (!store.configured) throw new Error(`Triple Whale store ${store.label} is not configured.`);

  const body = {
    shopId: store.shopId,
    query: AD_METRICS_SQL,
    period: { startDate: params.since, endDate: params.until },
    currency: "USD",
  };

  const requestedAt = new Date().toISOString();
  const payload = await fetchJson<unknown>(ENDPOINTS.sql, {
    method: "POST",
    headers: authHeaders(store),
    body: JSON.stringify(body),
    retries: 4,
    backoffMs: 900,
  });

  const raw = extractRows(payload);
  const rows = raw
    .map((r) => normalizeTwRow(r, store, { start: params.since, end: params.until }))
    .filter((r): r is TripleWhaleAdMetric => r !== null);

  return {
    rows,
    meta: {
      storeKey: store.key,
      shopId: store.shopId,
      endpoint: ENDPOINTS.sql,
      requestedAt,
      rowCount: rows.length,
      attribution: "triple/lifetime",
    },
  };
}

/** Run an arbitrary SQL/NLQ query against Triple Whale (extensible entry point). */
export async function runTwSql(storeKey: string, question: string): Promise<unknown> {
  const store = getTwStore(storeKey);
  if (!store) throw new Error(`Unknown Triple Whale store key: ${storeKey}`);
  if (!store.configured) throw new Error(`Triple Whale store ${store.label} is not configured.`);
  return fetchJson<unknown>(ENDPOINTS.nlq, {
    method: "POST",
    headers: authHeaders(store),
    body: JSON.stringify({ shop: store.shopId, question }),
    retries: 3,
  });
}

/** Validate auth by pinging TW. */
export async function testTwConnection(storeKey: string): Promise<{ ok: boolean; detail: string }> {
  const store = getTwStore(storeKey);
  if (!store) return { ok: false, detail: "unknown store" };
  if (!store.configured) return { ok: false, detail: "not configured" };
  try {
    await fetchJson<unknown>(ENDPOINTS.ping, { headers: authHeaders(store), retries: 1, timeoutMs: 12_000 });
    return { ok: true, detail: `${store.shopId}` };
  } catch (err) {
    // Many TW keys are workspace-scoped and the ping endpoint may 404 while data
    // endpoints work; surface the raw detail so the operator can judge.
    return { ok: false, detail: (err as Error).message };
  }
}
