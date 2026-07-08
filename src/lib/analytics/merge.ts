import type { MergedCreativeMetric, MetaAdMetric, TripleWhaleAdMetric, WinLoss } from "@/types";
import { parseCreativeName } from "@/lib/parser/creative-name-parser";
import { campaignFunnel } from "./campaign-rules";
import { safeDiv } from "@/lib/utils";
import type { BrandKey } from "@/config/brands";

/**
 * Merge Meta + Triple Whale ad metrics into unique creatives.
 *
 * Methodology (NT1 Weekly Review process doc):
 *  - "Unique creative" = exact Ad NAME, deduped across ad sets. The same creative
 *    copied into multiple ad sets counts once; its campaign = the campaign where
 *    it spent the most.
 *  - Triple Whale joins on ad_id and is aggregated across every ad_id that shares
 *    the creative's name. Unmatched TW never breaks totals ("No Triple Whale match").
 *  - Funnel is campaign-based (BOF = `asc+ promo` campaign, else TOF).
 *  - Win/Lose is a delivery test: a creative wins if its total spend ≥ the average
 *    spend per unique creative in its campaign; zero-spend creatives lose.
 */

interface NameGroup {
  adName: string;
  adIds: Set<string>;
  bestAdId: string;
  bestAdIdSpend: number;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  inlineLinkClicks: number;
  purchases: number;
  purchaseValue: number;
  video3sPlays: number;
  accountId: string;
  // campaign spend tally → dominant campaign
  campaignSpend: Map<string, { id: string | null; adsetId: string | null; adsetName: string | null; spend: number }>;
  campaignName: string | null;
}

export function mergeCreativeMetrics(
  meta: MetaAdMetric[],
  tw: TripleWhaleAdMetric[],
  window: "L7" | "L30",
  brand: BrandKey,
): MergedCreativeMetric[] {
  // 1) Aggregate Triple Whale by ad_id.
  const twByAd = new Map<string, TripleWhaleAdMetric>();
  for (const t of tw) {
    const e = twByAd.get(t.adId);
    if (e) {
      e.spend += t.spend;
      e.attributedRevenue += t.attributedRevenue;
      e.newVisitors += t.newVisitors;
      e.uniqueVisitors += t.uniqueVisitors;
      e.orders += t.orders;
      e.newCustomerOrders += t.newCustomerOrders;
    } else {
      twByAd.set(t.adId, { ...t });
    }
  }

  // 2) Group Meta by exact ad name.
  const groups = new Map<string, NameGroup>();
  for (const m of meta) {
    const name = (m.adName ?? "").trim();
    if (!name) continue;
    let g = groups.get(name);
    if (!g) {
      g = {
        adName: name,
        adIds: new Set(),
        bestAdId: m.adId,
        bestAdIdSpend: -1,
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        inlineLinkClicks: 0,
        purchases: 0,
        purchaseValue: 0,
        video3sPlays: 0,
        accountId: m.accountId,
        campaignSpend: new Map(),
        campaignName: m.campaignName,
      };
      groups.set(name, g);
    }
    g.adIds.add(m.adId);
    g.spend += m.spend;
    g.impressions += m.impressions;
    g.reach += m.reach;
    g.clicks += m.clicks;
    g.inlineLinkClicks += m.inlineLinkClicks;
    g.purchases += m.purchases;
    g.purchaseValue += m.purchaseValue;
    g.video3sPlays += m.video3sPlays;
    if (m.spend > g.bestAdIdSpend) {
      g.bestAdIdSpend = m.spend;
      g.bestAdId = m.adId;
    }
    const key = m.campaignName ?? m.campaignId ?? "unknown";
    const cs = g.campaignSpend.get(key) ?? { id: m.campaignId, adsetId: m.adsetId, adsetName: m.adsetName, spend: 0 };
    cs.spend += m.spend;
    g.campaignSpend.set(key, cs);
  }

  // 3) Resolve dominant campaign per name group.
  for (const g of groups.values()) {
    let bestKey: string | null = null;
    let best = -1;
    for (const [key, v] of g.campaignSpend) {
      if (v.spend > best) {
        best = v.spend;
        bestKey = key;
      }
    }
    g.campaignName = bestKey;
  }

  // 4) Campaign average spend per unique creative.
  const campaignAgg = new Map<string, { spend: number; creatives: number }>();
  for (const g of groups.values()) {
    const key = g.campaignName ?? "unknown";
    const e = campaignAgg.get(key) ?? { spend: 0, creatives: 0 };
    e.spend += g.spend;
    e.creatives += 1;
    campaignAgg.set(key, e);
  }
  const campaignAvg = new Map<string, number>();
  for (const [key, v] of campaignAgg) campaignAvg.set(key, safeDiv(v.spend, v.creatives));

  // 5) Build merged rows.
  const merged: MergedCreativeMetric[] = [];
  for (const g of groups.values()) {
    const parsed = parseCreativeName(g.adName);
    parsed.funnel = campaignFunnel(g.campaignName);

    // Aggregate TW across all ad_ids that share this creative name.
    let twSpend = 0;
    let attributedRevenue = 0;
    let ncRevenue = 0;
    let newVisitors = 0;
    let uniqueVisitors = 0;
    let orders = 0;
    let newCustomerOrders = 0;
    let matched = false;
    for (const adId of g.adIds) {
      const t = twByAd.get(adId);
      if (!t) continue;
      matched = true;
      twSpend += t.spend;
      attributedRevenue += t.attributedRevenue;
      // Per-row NC ROAS is stored as NC-conversion-value ÷ TW spend, so this recovers NC revenue.
      ncRevenue += t.ncRoas * t.spend;
      newVisitors += t.newVisitors;
      uniqueVisitors += t.uniqueVisitors;
      orders += t.orders;
      newCustomerOrders += t.newCustomerOrders;
    }

    const campaignMeta = g.campaignSpend.get(g.campaignName ?? "unknown");
    const avg = campaignAvg.get(g.campaignName ?? "unknown") ?? 0;
    const winLoss: WinLoss = g.spend > 0 && avg > 0 && g.spend >= avg ? "Win" : "Lose";

    merged.push({
      adId: g.bestAdId,
      adName: g.adName,
      brand,
      accountId: g.accountId,
      campaignId: campaignMeta?.id ?? null,
      campaignName: g.campaignName,
      adsetId: campaignMeta?.adsetId ?? null,
      adsetName: campaignMeta?.adsetName ?? null,
      window,
      spend: g.spend,
      impressions: g.impressions,
      reach: g.reach,
      clicks: g.clicks,
      inlineLinkClicks: g.inlineLinkClicks,
      ctr: safeDiv(g.clicks, g.impressions),
      cpc: safeDiv(g.spend, g.inlineLinkClicks),
      cpm: safeDiv(g.spend, g.impressions) * 1000,
      purchases: g.purchases,
      purchaseValue: g.purchaseValue,
      video3sPlays: g.video3sPlays,
      thumbstopPct: safeDiv(g.video3sPlays, g.impressions),
      metaRoas: safeDiv(g.purchaseValue, g.spend),
      hasTwMatch: matched,
      twSpend: matched ? twSpend : null,
      attributedRevenue: matched ? attributedRevenue : null,
      twRoas: matched ? safeDiv(attributedRevenue, g.spend) : null,
      ncRoas: matched ? safeDiv(ncRevenue, g.spend) : null,
      nvpPct: matched ? safeDiv(newVisitors, uniqueVisitors) : null,
      newVisitors: matched ? newVisitors : null,
      uniqueVisitors: matched ? uniqueVisitors : null,
      orders: matched ? orders : null,
      newCustomerOrders: matched ? newCustomerOrders : null,
      parsed,
      winLoss,
      campaignAvgSpendPerAd: avg,
    });
  }

  merged.sort((a, b) => b.spend - a.spend);
  return merged;
}
