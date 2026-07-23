import type {
  AnalysisSnapshot,
  CreatorBreakout,
  DeceleratorRow,
  ElementDemoDrilldown,
  GroupBreakout,
  MergedCreativeMetric,
  ParsedCreative,
  ReportWindow,
  ScriptBreakout,
  StrategistPerformance,
  ToplineMetrics,
  WindowedBreakouts,
  WinnerRow,
} from "@/types";
import { safeDiv } from "@/lib/utils";
import { isExcludedFromScopedSections } from "./campaign-rules";
import { cleanScriptStem } from "@/lib/parser/creative-name-parser";
import { STRATEGIST_ROSTER } from "@/lib/parser/codebooks";

/**
 * Analytics engine. Pure functions over merged creative rows — no I/O — so they
 * are trivially testable and reusable by jobs, API routes, and the UI.
 *
 * Metric definitions follow the NT1 Weekly Review process doc exactly:
 *  - Meta ROAS = Σ purchase value ÷ Σ spend (equivalent to spend-weighted ROAS).
 *  - TW ROAS   = Σ tw attributed revenue ÷ Σ Meta spend.
 *  - NV%       = Σ TW new visitors ÷ Σ TW unique visitors.
 *  - Thumbstop = Σ 3-second video plays ÷ Σ impressions (Meta: video_view / export rate column).
 *  - $/ad      = spend ÷ unique creatives in the row.
 *  - TOF sh.   = element TOF spend ÷ account TOF spend for the window.
 */

function sum(rows: MergedCreativeMetric[], pick: (r: MergedCreativeMetric) => number | null | undefined): number {
  let n = 0;
  for (const r of rows) n += pick(r) ?? 0;
  return n;
}

function twRoasOf(rows: MergedCreativeMetric[]): number {
  const rev = sum(rows, (r) => r.attributedRevenue);
  const spend = sum(rows.filter((r) => r.hasTwMatch), (r) => r.spend);
  return safeDiv(rev, spend);
}

function ncRoasOf(rows: MergedCreativeMetric[]): number {
  // NC ROAS uses the NC-attributed revenue proxy stored on matched rows.
  let num = 0;
  let den = 0;
  for (const r of rows) {
    if (r.ncRoas == null) continue;
    num += r.ncRoas * r.spend;
    den += r.spend;
  }
  return safeDiv(num, den);
}

function nvPctOf(rows: MergedCreativeMetric[]): number {
  const nv = sum(rows, (r) => r.newVisitors);
  const uv = sum(rows, (r) => r.uniqueVisitors);
  return safeDiv(nv, uv);
}

function thumbstopOf(rows: MergedCreativeMetric[]): number {
  const plays = sum(rows, (r) => r.video3sPlays);
  const impr = sum(rows, (r) => r.impressions);
  if (impr > 0) return safeDiv(plays, impr);
  // Fallback when only rate was stored (e.g. legacy import rows).
  let weighted = 0;
  let wImpr = 0;
  for (const r of rows) {
    if (r.thumbstopPct > 0 && r.impressions > 0) {
      weighted += r.thumbstopPct * r.impressions;
      wImpr += r.impressions;
    }
  }
  return safeDiv(weighted, wImpr);
}

/** Exclude pre-convention / unparseable names from coded element tables. */
function conventionScopedRows(rows: MergedCreativeMetric[]): MergedCreativeMetric[] {
  return rows.filter((r) => r.parsed.convention !== "unknown" && r.parsed.confidence >= 0.45);
}

/** Open-entry title only — no category, demo, or promo suffixes. */
function openEntryTitle(p: ParsedCreative): string {
  const stem = p.scriptStem;
  if (stem && !/^J-?\d+$/i.test(stem) && stem !== "Unattributed") return stem;
  const fromDesc = p.description ? cleanScriptStem(p.description, p.creator) : null;
  if (fromDesc && !/^J-?\d+$/i.test(fromDesc)) return fromDesc;
  if (p.description) return p.description.replace(/\s+/g, " ").trim();
  return stem ?? "Untitled";
}

function tofSpendOf(rows: MergedCreativeMetric[]): number {
  return rows.filter((r) => r.parsed.funnel === "TOF").reduce((a, r) => a + r.spend, 0);
}

export function computeTopline(rows: MergedCreativeMetric[], window: ReportWindow): ToplineMetrics {
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const revenue = sum(rows, (r) => r.purchaseValue);
  const attributedRevenue = sum(rows, (r) => r.attributedRevenue);
  const purchases = sum(rows, (r) => r.purchases);
  return {
    window,
    spend,
    creatives: rows.length,
    metaRoas: safeDiv(revenue, spend),
    twRoas: twRoasOf(rows),
    ncRoas: ncRoasOf(rows),
    tofShare: safeDiv(tofSpendOf(rows), spend),
    nvPct: nvPctOf(rows),
    revenue,
    attributedRevenue,
    purchases,
  };
}

function buildGroup(
  rows: MergedCreativeMetric[],
  accountTofSpend: number,
  keyFn: (r: MergedCreativeMetric) => string | null,
  labelFn: (r: MergedCreativeMetric) => string | null,
  shareDenominator?: number, // when set, `share` = group spend ÷ this (e.g. demo-coded spend)
): GroupBreakout[] {
  const groups = new Map<string, { label: string; rows: MergedCreativeMetric[] }>();
  for (const r of rows) {
    const key = keyFn(r);
    if (!key) continue;
    const label = labelFn(r) ?? key;
    const g = groups.get(key) ?? { label, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }

  const out: GroupBreakout[] = [];
  for (const [group, { label, rows: gr }] of groups) {
    const spend = gr.reduce((a, r) => a + r.spend, 0);
    const wins = gr.filter((r) => r.winLoss === "Win").length;
    const revenue = sum(gr, (r) => r.purchaseValue);
    const noMatch = gr.filter((r) => !r.hasTwMatch).length;
    out.push({
      group,
      label,
      wins,
      losses: gr.length - wins,
      spend,
      spendPerAd: safeDiv(spend, gr.length),
      tofShare: safeDiv(tofSpendOf(gr), accountTofSpend),
      share: shareDenominator != null ? safeDiv(spend, shareDenominator) : safeDiv(tofSpendOf(gr), accountTofSpend),
      nvPct: nvPctOf(gr),
      metaRoas: safeDiv(revenue, spend),
      twRoas: twRoasOf(gr),
      ncRoas: ncRoasOf(gr),
      thumbstop: thumbstopOf(gr),
      assets: gr.length,
      notes: noMatch ? `${noMatch} without TW match` : "",
    });
  }
  out.sort((a, b) => b.spend - a.spend);
  return out;
}

export function computeCategoryBreakout(rows: MergedCreativeMetric[], accountTofSpend: number): GroupBreakout[] {
  return buildGroup(rows, accountTofSpend, (r) => r.parsed.category, (r) => r.parsed.categoryLabel);
}

/** Opener breakout, limited to the top 15 by spend (per the report spec). */
export function computeOpenerBreakout(rows: MergedCreativeMetric[], accountTofSpend: number): GroupBreakout[] {
  return buildGroup(rows, accountTofSpend, (r) => r.parsed.opener, (r) => r.parsed.openerLabel).slice(0, 15);
}

export function computeColorBreakout(rows: MergedCreativeMetric[], accountTofSpend: number): GroupBreakout[] {
  return buildGroup(rows, accountTofSpend, (r) => r.parsed.color, (r) => r.parsed.colorLabel);
}

/**
 * Creator Demo breakout: group by 013 demographics, excluding NA (statics).
 * The "Share" column is the element's share of total demo-coded spend (not TOF).
 */
export function computeDemographicsBreakout(rows: MergedCreativeMetric[], accountTofSpend: number): GroupBreakout[] {
  const eligible = rows.filter((r) => {
    const d = r.parsed.demographics;
    return !!d && d.toUpperCase() !== "NA";
  });
  const demoCodedSpend = eligible.reduce((a, r) => a + r.spend, 0);
  return buildGroup(
    eligible,
    accountTofSpend,
    (r) => r.parsed.demographics,
    (r) => r.parsed.demographicsLabel ?? r.parsed.demographics,
    demoCodedSpend,
  );
}

/** Creator demo split for each category / opener / color row (UI drill-down). */
function computeDemoDrilldownMap(
  rows: MergedCreativeMetric[],
  accountTofSpend: number,
  keyFn: (r: MergedCreativeMetric) => string | null,
  keys: string[],
): Record<string, GroupBreakout[]> {
  const scoped = conventionScopedRows(rows);
  const out: Record<string, GroupBreakout[]> = {};
  for (const key of keys) {
    const filtered = scoped.filter((r) => keyFn(r) === key);
    out[key] = computeDemographicsBreakout(filtered, accountTofSpend);
  }
  return out;
}

function buildElementDemoDrilldown(
  rows: MergedCreativeMetric[],
  accountTofSpend: number,
  categories: GroupBreakout[],
  openers: GroupBreakout[],
  colors: GroupBreakout[],
): ElementDemoDrilldown {
  return {
    categories: computeDemoDrilldownMap(
      rows,
      accountTofSpend,
      (r) => r.parsed.category,
      categories.map((c) => c.group),
    ),
    openers: computeDemoDrilldownMap(
      rows,
      accountTofSpend,
      (r) => r.parsed.opener,
      openers.map((o) => o.group),
    ),
    colors: computeDemoDrilldownMap(
      rows,
      accountTofSpend,
      (r) => r.parsed.color,
      colors.map((c) => c.group),
    ),
  };
}

// ---------- Script iteration tracking ----------

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Collapse a phrase that repeats itself (e.g. "Foo AIO Foo AIO" → "Foo AIO"). */
function collapseRepeats(s: string): string {
  const words = s.split(/\s+/).filter(Boolean);
  const n = words.length;
  if (n >= 2 && n % 2 === 0) {
    const half = n / 2;
    const a = words.slice(0, half).join(" ");
    const b = words.slice(half).join(" ");
    if (a.toLowerCase() === b.toLowerCase()) return a;
  }
  return words.join(" ");
}

const SALE_FAMILIES: { test: RegExp; label: string }[] = [
  { test: /4thofjuly|fourthofjuly|july4th|july4/, label: "4thOfJulySale" },
  { test: /fathersday/, label: "FathersDaySale" },
  { test: /primetime/, label: "PrimeTimeSale" },
  { test: /canadaday/, label: "CanadaDaySale" },
  { test: /noblday/, label: "NoblDaySale" },
  { test: /memorialday/, label: "MemorialDay" },
  { test: /americas250|americana/, label: "AmericanaCollection" },
];

/**
 * Derive the script stem for iteration tracking, in priority order:
 *  1. promo/sale families, 2. named families (GFGiftCrafty / FreeAIO / ItsThe(SKU)),
 *  3. cleaned open-entry stem (creator / funnel / job / SKU stripped), 4. WL fallback.
 */
export function scriptStemForTracking(p: ParsedCreative): string {
  const hay = normalizeText(`${p.description ?? ""} ${p.promo ?? ""} ${p.raw}`);
  for (const f of SALE_FAMILIES) if (f.test.test(hay)) return f.label;
  if (/giftcrafty/.test(hay)) return "GFGiftCrafty";
  if (/freeaio/.test(hay)) return "FreeAIO";
  if (/itsthe/.test(normalizeText(p.description ?? ""))) return `ItsThe${(p.sku ?? "SKU").toUpperCase()}`;

  // Prefer the parser's already-cleaned stem, then further sanitize.
  let base = p.scriptStem ?? p.description ?? "";
  if (p.creator) {
    const cn = p.creator.replace(/[^a-zA-Z0-9]/g, "");
    base = base.replace(new RegExp(cn, "ig"), " ");
    base = base.replace(new RegExp(p.creator.replace(/\s+/g, "\\s*"), "ig"), " ");
  }
  base = base.replace(/[\u2019']/g, "");
  base = base
    .replace(/\b(Influencer|Influence|Influncer)\b/gi, " ")
    .replace(/(TOF|BOF|MOF)\d*/gi, " ")
    .replace(/\bJ-?\d{1,4}(?:v+\d+[A-Za-z]?)?\b/gi, " ")
    .replace(/\bv+\d+[A-Za-z]?\b/gi, " ")
    .replace(/\b(AIO|EBUN|NDB|EXP|AIR|MULTI|WEEKBOGO|CWK|DUO|WEEK)\b/gi, " ")
    .replace(/\bB(?:J)?\d{1,5}(?:v+\d+[A-Za-z]*)*\b/gi, " ")
    .replace(/\b(Evergreen|OTHERS?|OTHER|Branded)\b/gi, " ")
    .replace(/\b(SavvyTraveler|FunctionalTraveler|ReadyToBuy|MaleTraveler|StyleTraveler|FrequentTraveler)\b/gi, " ")
    .replace(/\b(Net\s*New|Social\s*Stills|Americas250th)\b/gi, " ")
    .replace(/\b\d{6}\b/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Drop duplicate consecutive words ("Durability Durability").
  base = base
    .split(/\s+/)
    .filter((w, i, arr) => i === 0 || w.toLowerCase() !== arr[i - 1].toLowerCase())
    .join(" ");
  base = base
    .replace(/\bI ve\b/gi, "Ive")
    .replace(/\bARule\b/g, "A Rule")
    .replace(/\bGota Rule\b/gi, "Got A Rule")
    .replace(/\bGot ARule\b/gi, "Got A Rule")
    .replace(/\s+/g, " ")
    .trim();
  const cleaned = collapseRepeats(base);
  // Ignore leftover product-only stems — fall through to WL label.
  if (
    cleaned &&
    cleaned.length >= 3 &&
    !/^J\d+$/i.test(cleaned) &&
    !/^(weekender|bundle|carry\s*ons?|luggage(\s*set)?|statics?)$/i.test(cleaned)
  ) {
    return cleaned;
  }
  // Pure-WL creators with no remaining stem → Influencer Name (WL)
  if (p.whitelisted && p.creator) {
    return p.creatorType === "Influencer" ? `Influencer ${p.creator} (WL)` : `${p.creator} (WL)`;
  }
  if (p.scriptStem && !/^J-?\d+$/i.test(p.scriptStem)) return p.scriptStem;
  return p.jobNumber ?? "Unattributed";
}

/** One job = a J number split per script; unnumbered old-convention = open entry + SKU. */
function jobKeyOf(r: MergedCreativeMetric): string {
  const stem = scriptStemForTracking(r.parsed);
  if (r.parsed.jobNumber) return `${r.parsed.jobNumber}::${stem}`;
  const desc = normalizeText(r.parsed.description ?? r.adName);
  const sku = (r.parsed.sku ?? "NA").toUpperCase();
  return `${desc}|${sku}`;
}

export function computeScriptBreakout(rows: MergedCreativeMetric[], accountTofSpend: number): ScriptBreakout[] {
  // Exclude asc+ promo + catalog/Marpipe.
  const scoped = rows.filter((r) => !isExcludedFromScopedSections(r.campaignName));

  const groups = new Map<string, { rows: MergedCreativeMetric[]; jobs: Map<string, boolean> }>();
  for (const r of scoped) {
    const stem = scriptStemForTracking(r.parsed);
    const g = groups.get(stem) ?? { rows: [] as MergedCreativeMetric[], jobs: new Map<string, boolean>() };
    g.rows.push(r);
    const jk = jobKeyOf(r);
    g.jobs.set(jk, (g.jobs.get(jk) ?? false) || r.winLoss === "Win"); // job wins if ANY creative won
    groups.set(stem, g);
  }

  const out: ScriptBreakout[] = [];
  for (const [scriptStem, { rows: gr, jobs }] of groups) {
    const spend = gr.reduce((a, r) => a + r.spend, 0);
    const revenue = sum(gr, (r) => r.purchaseValue);
    let wins = 0;
    for (const won of jobs.values()) if (won) wins += 1;
    out.push({
      scriptStem,
      iterationJobs: jobs.size,
      wins,
      losses: jobs.size - wins,
      spend,
      spendPerJob: safeDiv(spend, jobs.size),
      tofShare: safeDiv(tofSpendOf(gr), accountTofSpend),
      nvPct: nvPctOf(gr),
      metaRoas: safeDiv(revenue, spend),
      twRoas: twRoasOf(gr),
      ncRoas: ncRoasOf(gr),
    });
  }
  out.sort((a, b) => b.spend - a.spend);
  return out;
}

/** True person-name creators only — reject product/promo scrap tails. */
function isRealCreatorName(name: string | null | undefined): boolean {
  if (!name) return false;
  const t = name.trim();
  if (t.length < 2) return false;
  if (/^(sale|bundle|weekender|carry\s*ons?|luggage|collection|statics?|net\s*new|organic|travel|cabin|americana|americas|gf\s*gift|gift\s*crafty)/i.test(t)) {
    return false;
  }
  if (/\b(sale|bundle|weekender|carry\s*ons?|luggage\s*set|collection|statics?|net\s*new|organic|sticky\s*notes?|gift\s*crafty)\b/i.test(t)) {
    return false;
  }
  // Must look like a person: at least one alphabetic token, no digit-heavy codes.
  if (/^\d/.test(t) || /J\d{2,}/i.test(t)) return false;
  return /[A-Za-z]{2,}/.test(t);
}

/** Creator Performance — WHITELISTED ads only, attributed by open-entry creator. */
export function computeCreatorBreakout(rows: MergedCreativeMetric[]): CreatorBreakout[] {
  const wl = rows.filter(
    (r) => r.parsed.whitelisted && r.parsed.convention !== "unknown" && isRealCreatorName(r.parsed.creator),
  );
  const groups = new Map<string, MergedCreativeMetric[]>();
  for (const r of wl) {
    const key = r.parsed.creator as string;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }
  const out: CreatorBreakout[] = [];
  for (const [creator, gr] of groups) {
    const spend = gr.reduce((a, r) => a + r.spend, 0);
    const revenue = sum(gr, (r) => r.purchaseValue);
    const type = gr.some((r) => r.parsed.creatorType === "Influencer")
      ? "Influencer"
      : gr.some((r) => r.parsed.creatorType === "Creator")
        ? "Creator"
        : "Unknown";
    out.push({
      creator,
      type,
      spend,
      assets: gr.length,
      metaRoas: safeDiv(revenue, spend),
      twRoas: twRoasOf(gr),
      nvPct: nvPctOf(gr),
    });
  }
  out.sort((a, b) => b.spend - a.spend);
  return out;
}

function normalizedCampaignName(name: string | null): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .trim();
}

function explicitTokens(name: string): Set<string> {
  return new Set((name.toUpperCase().match(/[A-Z0-9]+/g) ?? []).filter(Boolean));
}

export function computeStrategistPerformance(rows: MergedCreativeMetric[]): StrategistPerformance[] {
  if (rows.length > 0 && rows[0].brand !== "NOBL") return [];
  const usaTofSpend = rows
    .filter((r) => normalizedCampaignName(r.campaignName) === "usa-tof-all")
    .reduce((total, r) => total + r.spend, 0);

  return STRATEGIST_ROSTER.map((person) => {
    const codes = person.codes.map((code) => code.toUpperCase());
    const gr = rows.filter((r) => codes.includes(String(r.parsed.strat ?? "").toUpperCase()));
    const spend = sum(gr, (r) => r.spend);
    const jobs = new Set(gr.map(jobKeyOf));
    const wins = gr.filter((r) => r.winLoss === "Win").length;
    const strategyTags = gr.map((r) => explicitTokens(r.adName));
    const nc = strategyTags.filter((tokens) => tokens.has("NC")).length;
    const iterations = strategyTags.filter((tokens) => tokens.has("IT")).length;
    const nvns = strategyTags.filter((tokens) => tokens.has("NVNS")).length;
    const nsov = strategyTags.filter((tokens) => tokens.has("NSOV")).length;
    const nvos = strategyTags.filter((tokens) => tokens.has("NVOS")).length;
    const ovos = strategyTags.filter((tokens) => tokens.has("OVOS")).length;
    const personUsaTofSpend = sum(
      gr.filter((r) => normalizedCampaignName(r.campaignName) === "usa-tof-all"),
      (r) => r.spend,
    );
    const ncRevenue = sum(gr, (r) => (r.ncRoas ?? 0) * r.spend);

    return {
      key: person.key,
      name: person.name,
      codes: [...person.codes],
      attributionStatus: person.confirmed ? "confirmed" : "unconfirmed-code",
      spend,
      usaTofSpend: personUsaTofSpend,
      usaTofSpendShare: safeDiv(personUsaTofSpend, usaTofSpend),
      creatives: gr.length,
      uniqueJobs: jobs.size,
      wins,
      losses: gr.length - wins,
      winRate: safeDiv(wins, gr.length),
      metaRoas: safeDiv(sum(gr, (r) => r.purchaseValue), spend),
      attributedRoas: safeDiv(sum(gr, (r) => r.attributedRevenue), spend),
      ncRoas: safeDiv(ncRevenue, spend),
      newVisitorRate: nvPctOf(gr),
      nc,
      iterations,
      strategyUntagged: gr.length - strategyTags.filter((tokens) => tokens.has("NC") || tokens.has("IT")).length,
      nvns,
      nsov,
      nvos,
      ovos,
      productionUntagged:
        gr.length - strategyTags.filter((tokens) => ["NVNS", "NSOV", "NVOS", "OVOS"].some((tag) => tokens.has(tag))).length,
    };
  });
}

// ---------- Job-level winners & decelerators ----------

interface JobAgg {
  key: string;
  adName: string;
  scriptStem: string;
  jobNumber: string | null;
  openEntryTitle: string;
  category: string | null;
  categoryCode: string | null;
  demographics: string | null;
  spend: number;
  purchaseValue: number;
  attributedRevenue: number;
  twSpend: number;
  bestRowSpend: number;
  won: boolean;
}

function aggregateJobs(rows: MergedCreativeMetric[]): Map<string, JobAgg> {
  const scoped = rows.filter((r) => !isExcludedFromScopedSections(r.campaignName));
  const jobs = new Map<string, JobAgg>();
  for (const r of scoped) {
    const key = jobKeyOf(r);
    let j = jobs.get(key);
    if (!j) {
      j = {
        key,
        adName: r.adName,
        scriptStem: scriptStemForTracking(r.parsed),
        jobNumber: r.parsed.jobNumber ?? null,
        openEntryTitle: openEntryTitle(r.parsed),
        category: r.parsed.categoryLabel,
        categoryCode: r.parsed.category,
        demographics: r.parsed.demographics,
        spend: 0,
        purchaseValue: 0,
        attributedRevenue: 0,
        twSpend: 0,
        bestRowSpend: -1,
        won: false,
      };
      jobs.set(key, j);
    }
    j.spend += r.spend;
    j.purchaseValue += r.purchaseValue;
    if (r.hasTwMatch) {
      j.attributedRevenue += r.attributedRevenue ?? 0;
      j.twSpend += r.spend;
    }
    if (r.winLoss === "Win") j.won = true;
    if (r.spend > j.bestRowSpend) {
      j.bestRowSpend = r.spend;
      j.adName = r.adName;
      j.jobNumber = r.parsed.jobNumber ?? j.jobNumber;
      j.openEntryTitle = openEntryTitle(r.parsed);
      j.category = r.parsed.categoryLabel;
      j.categoryCode = r.parsed.category;
      j.demographics = r.parsed.demographics;
    }
  }
  return jobs;
}

/** Job display name = J#### · open-entry title (nothing else). */
function jobLabel(j: JobAgg): string {
  const title = j.openEntryTitle;
  if (j.jobNumber && title) return `${j.jobNumber} · ${title}`;
  if (j.jobNumber) return j.jobNumber;
  return title || "Untitled";
}

/**
 * New winners & decelerators — job-level, excluding asc+ promo + catalog/Marpipe.
 * Prior weekly run-rate = (L30 spend − L7 spend) / 23 × 7 for each job.
 *  - New winner   = prior run-rate < $2K AND L7 spend ≥ $10K.
 *  - Decelerator  = prior run-rate ≥ $18K AND L7 spend < 66% of it.
 */
export function computeWinnersAndDecelerators(
  l7Rows: MergedCreativeMetric[],
  l30Rows: MergedCreativeMetric[],
): { winners: WinnerRow[]; decelerators: DeceleratorRow[] } {
  const l7Jobs = aggregateJobs(l7Rows);
  const l30Jobs = aggregateJobs(l30Rows);

  const winners: WinnerRow[] = [];
  const decelerators: DeceleratorRow[] = [];

  const keys = new Set<string>([...l7Jobs.keys(), ...l30Jobs.keys()]);
  for (const key of keys) {
    const l7 = l7Jobs.get(key);
    const l30 = l30Jobs.get(key);
    const l7Spend = l7?.spend ?? 0;
    const l30Spend = l30?.spend ?? 0;
    const priorRunRate = ((l30Spend - l7Spend) / 23) * 7;

    if (priorRunRate < 2000 && l7Spend >= 10000 && l7) {
      winners.push({
        adId: l7.key,
        label: jobLabel(l7),
        jobNumber: l7.jobNumber,
        adName: l7.adName,
        scriptStem: l7.scriptStem,
        category: l7.category,
        l7Spend,
        priorSpend: Math.max(0, priorRunRate),
        metaRoas: safeDiv(l7.purchaseValue, l7Spend),
        twRoas: safeDiv(l7.attributedRevenue, l7.twSpend),
        reason: `Prior run-rate $${priorRunRate.toFixed(0)}/wk → L7 $${l7Spend.toFixed(0)} at ${safeDiv(l7.purchaseValue, l7Spend).toFixed(2)}x Meta ROAS`,
      });
    }

    if (priorRunRate >= 18000 && l7Spend < 0.66 * priorRunRate) {
      const job = l7 ?? l30!;
      const drop = safeDiv(priorRunRate - l7Spend, priorRunRate); // positive = % down
      decelerators.push({
        adId: job.key,
        label: jobLabel(job),
        jobNumber: job.jobNumber,
        adName: job.adName,
        scriptStem: job.scriptStem,
        currentL7Spend: l7Spend,
        priorL7Spend: priorRunRate,
        dropPct: drop,
        metaRoas: safeDiv(job.purchaseValue, l7Spend),
        reason: `Prior run-rate $${priorRunRate.toFixed(0)}/wk → L7 $${l7Spend.toFixed(0)} (${(drop * 100).toFixed(0)}% down)`,
      });
    }
  }

  winners.sort((a, b) => b.l7Spend - a.l7Spend);
  decelerators.sort((a, b) => b.priorL7Spend - a.priorL7Spend);
  return { winners, decelerators };
}

export interface BuildSnapshotInput {
  l7: MergedCreativeMetric[];
  previousL7: MergedCreativeMetric[];
  previous2L7: MergedCreativeMetric[];
  l30: MergedCreativeMetric[];
}

function windowedBreakouts(rows: MergedCreativeMetric[]): WindowedBreakouts {
  const accountTofSpend = tofSpendOf(rows);
  const scoped = conventionScopedRows(rows);
  const categories = computeCategoryBreakout(scoped, accountTofSpend);
  const openers = computeOpenerBreakout(scoped, accountTofSpend);
  const colors = computeColorBreakout(scoped, accountTofSpend);
  return {
    categories,
    openers,
    colors,
    demographics: computeDemographicsBreakout(scoped, accountTofSpend),
    scripts: computeScriptBreakout(scoped, accountTofSpend),
    creators: computeCreatorBreakout(scoped),
    demoDrilldown: buildElementDemoDrilldown(rows, accountTofSpend, categories, openers, colors),
  };
}

export function buildAnalysisSnapshot(input: BuildSnapshotInput): AnalysisSnapshot {
  const { l7, previousL7, previous2L7, l30 } = input;
  const { winners, decelerators } = computeWinnersAndDecelerators(l7, l30);
  return {
    topline: {
      l7: computeTopline(l7, "L7"),
      previousL7: computeTopline(previousL7, "PRIOR_L7"),
      previous2L7: computeTopline(previous2L7, "PRIOR_2L7"),
      l30: computeTopline(l30, "L30"),
    },
    strategists: {
      l7: computeStrategistPerformance(l7),
      previousL7: computeStrategistPerformance(previousL7),
      previous2L7: computeStrategistPerformance(previous2L7),
      l30: computeStrategistPerformance(l30),
    },
    l7: windowedBreakouts(l7),
    l30: windowedBreakouts(l30),
    winners,
    decelerators,
  };
}
