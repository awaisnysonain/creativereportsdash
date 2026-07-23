import type { BrandKey } from "@/config/brands";

/** Funnel classification. */
export type Funnel = "TOF" | "MOF" | "BOF";

export type WinLoss = "Win" | "Lose";

export type ReportWindow = "L7" | "L30" | "PRIOR_L7" | "PRIOR_2L7";

/** Output of the creative name parser. */
export interface ParsedCreative {
  raw: string;
  convention: "modern" | "legacy" | "unknown";
  confidence: number; // 0..1
  // Header-ish fields
  launchDate: string | null; // yyyy-MM-dd if derivable
  jobNumber: string | null; // e.g. J0448
  version: string | null; // e.g. v1
  baseJob: string | null; // e.g. B94
  description: string | null; // open-entry job description
  format: string | null; // Vid / Img / Car / Int
  sku: string | null; // 000
  promo: string | null;
  whitelisted: boolean;
  landingPage: string | null; // LP001
  // Element block
  company: string | null; // 001 code
  companyLabel: string | null;
  strat: string | null; // 002 code (strategist)
  stratLabel: string | null;
  category: string | null; // 003 code
  categoryLabel: string | null;
  copyFramework: string | null; // 004
  opener: string | null; // 005 code
  openerLabel: string | null;
  hook: string | null; // 006 code
  hookLabel: string | null;
  openerColor: string | null; // 007 code
  openerColorLabel: string | null;
  bodyColor: string | null; // 008 code
  bodyColorLabel: string | null;
  color: string | null; // canonical color used for grouping (prefers opener color)
  colorLabel: string | null;
  length: string | null; // 011 (modern) / 010 (legacy)
  demographics: string | null; // 013
  demographicsLabel: string | null;
  country: string | null; // 014
  adCopyId: string | null; // 015
  infoOrder: string[]; // 016 element codes
  // Derived
  funnel: Funnel;
  creator: string | null;
  creatorType: "Creator" | "Influencer" | "Unknown";
  scriptStem: string | null; // grouping key for script iteration tracking
  fields: Record<string, string>; // every raw NNN -> value token we found
}

/** Normalized Meta ad-level metric row (post-service normalization). */
export interface MetaAdMetric {
  accountId: string;
  brand: BrandKey;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  inlineLinkClicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  purchaseValue: number;
  video3sPlays: number;
  thumbstopPct: number; // 0..1
  metaRoas: number;
  dateStart: string;
  dateStop: string;
}

/** Normalized Triple Whale ad-level metric row. */
export interface TripleWhaleAdMetric {
  storeKey: string;
  brand: BrandKey;
  adId: string;
  adName: string | null;
  spend: number;
  attributedRevenue: number;
  twRoas: number;
  ncRoas: number; // new customer ROAS
  nvpPct: number; // new visitor % (0..1)
  newVisitors: number;
  uniqueVisitors: number;
  orders: number;
  newCustomerOrders: number;
  dateStart: string;
  dateStop: string;
}

/** A merged creative row (Meta joined with Triple Whale on ad_id) enriched with parsed fields. */
export interface MergedCreativeMetric {
  adId: string;
  adName: string;
  brand: BrandKey;
  accountId: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  window: ReportWindow;
  // Meta
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  inlineLinkClicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  purchaseValue: number;
  video3sPlays: number;
  thumbstopPct: number;
  metaRoas: number;
  // Triple Whale (nullable when unmatched)
  hasTwMatch: boolean;
  twSpend: number | null;
  attributedRevenue: number | null;
  twRoas: number | null;
  ncRoas: number | null;
  nvpPct: number | null;
  newVisitors: number | null;
  uniqueVisitors: number | null;
  orders: number | null;
  newCustomerOrders: number | null;
  // Parsed creative
  parsed: ParsedCreative;
  // Verdict
  winLoss: WinLoss;
  campaignAvgSpendPerAd: number;
}

export interface ToplineMetrics {
  window: ReportWindow;
  spend: number;
  creatives: number;
  metaRoas: number;
  twRoas: number;
  ncRoas: number;
  tofShare: number; // 0..1 of spend
  nvPct: number; // 0..1
  revenue: number;
  attributedRevenue: number;
  purchases: number;
}

export interface GroupBreakout {
  group: string;
  label: string;
  wins: number;
  losses: number;
  spend: number;
  spendPerAd: number;
  tofShare: number; // element TOF spend ÷ account TOF spend for the window
  share: number; // for Demo: element spend ÷ total demo-coded spend
  nvPct: number;
  metaRoas: number;
  twRoas: number;
  ncRoas: number;
  thumbstop: number; // impression-weighted 3s video play rate (0..1)
  assets: number;
  notes: string;
}

export interface ScriptBreakout {
  scriptStem: string;
  iterationJobs: number;
  wins: number;
  losses: number;
  spend: number;
  spendPerJob: number;
  tofShare: number;
  nvPct: number;
  metaRoas: number;
  twRoas: number;
  ncRoas: number;
}

export interface CreatorBreakout {
  creator: string;
  type: "Creator" | "Influencer" | "Unknown";
  spend: number;
  assets: number;
  metaRoas: number;
  twRoas: number;
  nvPct: number;
}

export interface StrategistPerformance {
  key: string;
  name: string;
  codes: string[];
  attributionStatus: "confirmed" | "unconfirmed-code";
  spend: number;
  usaTofSpend: number;
  usaTofSpendShare: number;
  creatives: number;
  uniqueJobs: number;
  wins: number;
  losses: number;
  winRate: number;
  metaRoas: number;
  attributedRoas: number;
  ncRoas: number;
  newVisitorRate: number;
  nc: number;
  iterations: number;
  strategyUntagged: number;
  nvns: number;
  nsov: number;
  nvos: number;
  ovos: number;
  productionUntagged: number;
}

export interface WinnerRow {
  adId: string;
  label: string; // e.g. "J0419 · My Ex Husbands Girlfriend"
  jobNumber: string | null;
  adName: string;
  scriptStem: string | null;
  category: string | null;
  l7Spend: number;
  priorSpend: number;
  metaRoas: number;
  twRoas: number;
  reason: string;
}

export interface DeceleratorRow {
  adId: string;
  label: string;
  jobNumber: string | null;
  adName: string;
  scriptStem: string | null;
  currentL7Spend: number;
  priorL7Spend: number;
  dropPct: number; // fraction dropped (positive = % down)
  metaRoas: number;
  reason: string;
}

/** Per-element creator demo breakdown (click-through from category / opener / color). */
export type DemoDrilldownMap = Record<string, GroupBreakout[]>;

export interface ElementDemoDrilldown {
  categories: DemoDrilldownMap;
  openers: DemoDrilldownMap;
  colors: DemoDrilldownMap;
}

/** Every breakout is produced for both windows, stacked L7 then L30. */
export interface WindowedBreakouts {
  categories: GroupBreakout[];
  openers: GroupBreakout[];
  colors: GroupBreakout[];
  demographics: GroupBreakout[];
  scripts: ScriptBreakout[];
  creators: CreatorBreakout[];
  demoDrilldown: ElementDemoDrilldown;
}

export interface AnalysisSnapshot {
  topline: { l7: ToplineMetrics; previousL7: ToplineMetrics; previous2L7: ToplineMetrics; l30: ToplineMetrics };
  strategists?: {
    l7: StrategistPerformance[];
    previousL7: StrategistPerformance[];
    previous2L7: StrategistPerformance[];
    l30: StrategistPerformance[];
  };
  l7: WindowedBreakouts;
  l30: WindowedBreakouts;
  winners: WinnerRow[];
  decelerators: DeceleratorRow[];
}
