import OpenAI from "openai";
import { env } from "@/lib/env";
import { formatCurrency, formatPercent, formatRoas } from "@/lib/utils";
import { prettyWindow, standardWindows } from "@/lib/dates";
import type {
  AnalysisSnapshot,
  CreatorBreakout,
  DeceleratorRow,
  GroupBreakout,
  ScriptBreakout,
  WindowedBreakouts,
  WinnerRow,
} from "@/types";

/**
 * OpenAI-powered weekly narrative report generator.
 * Produces: report title, Slack summary, and full markdown report.
 * Falls back to a deterministic template if OPENAI_API_KEY is missing so the
 * pipeline never hard-fails in local/test mode.
 */

export interface GeneratedReport {
  title: string;
  slackSummary: string;
  markdown: string;
  model: string;
  usedAi: boolean;
}

function client(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

/** Compact, token-efficient JSON of the snapshot for the model. */
function buildContext(brand: string, snapshot: AnalysisSnapshot) {
  const w = standardWindows();
  return {
    brand,
    windows: {
      l7: prettyWindow(w.l7),
      previousL7: prettyWindow(w.priorL7),
      previous2L7: prettyWindow(w.prior2L7),
      l30: prettyWindow(w.l30),
    },
    topline: snapshot.topline,
    l7: {
      categories: snapshot.l7.categories,
      openers: snapshot.l7.openers,
      colors: snapshot.l7.colors,
      demographics: snapshot.l7.demographics.slice(0, 18),
      scripts: snapshot.l7.scripts.slice(0, 12),
      creators: snapshot.l7.creators.slice(0, 16),
    },
    l30: {
      categories: snapshot.l30.categories,
      openers: snapshot.l30.openers,
      colors: snapshot.l30.colors,
      demographics: snapshot.l30.demographics.slice(0, 18),
      scripts: snapshot.l30.scripts.slice(0, 12),
      creators: snapshot.l30.creators.slice(0, 16),
    },
    newWinners: snapshot.winners.slice(0, 12),
    decelerators: snapshot.decelerators.slice(0, 12),
    methodology: {
      merge: "Meta ad-level merged with Triple Whale (Triple Attribution, 1-day) on Ad ID.",
      uniqueCreative: "Deduped by exact Ad name across ad sets; campaign = where it spent most.",
      winLose: "Delivery test: creative wins if spend ≥ average spend per unique creative in its campaign; zero-spend loses.",
      funnel: "Campaign-based: BOF = `asc+ promo` campaign only; everything else TOF.",
      tofShare: "Element top-of-funnel spend divided by total account top-of-funnel spend for the window.",
      twRoas: "Σ TW attributed revenue ÷ Σ Meta spend.",
      nvPct: "Σ TW new visitors ÷ Σ TW unique visitors.",
      thumbstop: "3-second video plays ÷ impressions (Meta export: 3-second video plays rate per impressions; API: actions.video_view).",
      elementScope: "Element tables only cover ads with a parseable builder code (convention ≠ unknown). Legacy names may produce spurious tags — ignore rows that do not map to a real J#### job or standard coded field.",
      creatorScope: "Creator Performance is whitelisted ads only.",
      scopedSections: "Script Iteration Tracking, New Winners, and Decelerators exclude the `asc+ promo` campaign and catalog/Marpipe.",
      winnersDef: "Job-level. Prior weekly run-rate = (L30 − L7)/23×7. New winner: prior <$2K and L7 ≥$10K. Decelerator: prior ≥$18K and L7 <66% of prior.",
    },
  };
}

const LEGACY_NAMING_NOTE =
  "**Naming convention caveat:** Category, Opener, Color, Demo, Script, and Creator breakouts apply only to ads built with the current naming convention (numbered fields 000–016 and J#### job codes). " +
  "Legacy or pre-convention ad names can produce meaningless tags — **ignore any breakout row that does not map to a recognizable J#### job or standard builder code.**";

/** Ensure AI-generated markdown always carries the legacy naming disclaimer. */
function withReportDisclaimer(markdown: string): string {
  if (markdown.includes("Naming convention caveat")) return markdown;
  const block = `> ${LEGACY_NAMING_NOTE}\n\n`;
  const topline = markdown.indexOf("## Topline");
  if (topline > 0) return markdown.slice(0, topline) + block + markdown.slice(topline);
  return `${markdown.trim()}\n\n${block}`;
}

const SYSTEM_PROMPT = `You are a senior paid-social creative strategist writing the weekly Creative & Creator Performance report for a DTC brand.
Be concise, strategic, and decision-oriented. Use concrete numbers. Avoid fluff and hedging.
Respect the methodology provided in the DATA payload exactly — do NOT invent code labels, and honor the campaign-based funnel rule, the delivery-based win/lose definition, the whitelist-only creator scope, and the job-level winner/decelerator thresholds.
Write in a polished operator-ready style. Avoid decorative markdown, horizontal rules, excessive bullets, hype language, or AI-sounding filler. Use concise paragraphs, clean section headings, and tables where tables are clearer than prose.
Open with a short "How to read" methodology paragraph derived from the provided methodology object (merge basis, win/lose, campaign-based funnel, top-of-funnel share, new visitor rate, Thumbstop, element-scope caveat, legacy naming disclaimer, Influencer/Creator naming).
Then structure the markdown report with these sections. In Topline, use a vertical metric table and use these exact column names: Metric, L7, Previous 7, 7 before that. Do not compare L7 against L30 side-by-side there. For the remaining detailed breakout sections, stack L7 first and L30 below it where applicable:
1. Topline (L7, Previous 7, 7 before that)
2. Category Performance
3. Opener Insights (top 15, mention Thumbstop)
4. Color Insights
5. Creator Demo (share of demo-coded spend)
6. Creator Performance (whitelisted only)
7. Script Iteration Tracking
8. New Winners
9. Decelerators
10. Actions / Recommendations (bulleted, specific, ranked by impact)
Write for a performance marketing team that will make scaling/kill decisions from this.`;

export async function generateWeeklyReport(brand: string, snapshot: AnalysisSnapshot): Promise<GeneratedReport> {
  const oa = client();
  const context = buildContext(brand, snapshot);

  if (!oa) {
    return deterministicReport(brand, snapshot);
  }

  try {
    const completion = await oa.chat.completions.create({
      model: env.OPENAI_MODEL || "gpt-4.1",
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Generate the weekly creative report for ${brand}. Return STRICT JSON with keys ` +
            `"title" (string), "slackSummary" (string, <900 chars, Slack-friendly with * bold * and bullets), ` +
            `and "markdown" (string, the full report).\n\nDATA:\n` +
            JSON.stringify(context),
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as Partial<GeneratedReport>;
    return {
      title: parsed.title || `${brand} — Weekly Creative Report`,
      slackSummary: parsed.slackSummary || deterministicReport(brand, snapshot).slackSummary,
      markdown: withReportDisclaimer(parsed.markdown || deterministicReport(brand, snapshot).markdown),
      model: env.OPENAI_MODEL || "gpt-4.1",
      usedAi: true,
    };
  } catch (err) {
    console.error("[openai] generation failed, falling back:", (err as Error).message);
    return deterministicReport(brand, snapshot);
  }
}

// ---------- Markdown table builders (mirror the reference report layout) ----------

const money = (n: number) => formatCurrency(n);
const moneyK = (n: number) => (n === 0 ? "$0" : formatCurrency(n, { compact: true }));
const nv = (n: number) => (n ? `${Math.round(n * 100)}%` : "—");
const tofsh = (n: number) => (n ? `${(n * 100).toFixed(1)}%` : "—");
const thumb = (n: number) => (n ? `${Math.round(n * 100)}%` : "—");

function groupTable(rows: GroupBreakout[], shareLabel: "TOF share" | "Share", withThumb: boolean, colLabel: string): string {
  const head = withThumb
    ? `| ${colLabel} | Wins | Losses | Spend | Spend / ad | ${shareLabel} | Thumbstop | New visitor % | Meta ROAS | Attributed ROAS |\n|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|`
    : `| ${colLabel} | Wins | Losses | Spend | Spend / ad | ${shareLabel} | New visitor % | Meta ROAS | Attributed ROAS |\n|---|--:|--:|--:|--:|--:|--:|--:|--:|`;
  const shareVal = (r: GroupBreakout) => (shareLabel === "Share" ? tofsh(r.share) : tofsh(r.tofShare));
  const body = rows
    .map((r) =>
      withThumb
        ? `| ${r.label} | ${r.wins} | ${r.losses} | ${moneyK(r.spend)} | ${money(r.spendPerAd)} | ${shareVal(r)} | ${thumb(r.thumbstop)} | ${nv(r.nvPct)} | ${formatRoas(r.metaRoas)} | ${formatRoas(r.twRoas)} |`
        : `| ${r.label} | ${r.wins} | ${r.losses} | ${moneyK(r.spend)} | ${money(r.spendPerAd)} | ${shareVal(r)} | ${nv(r.nvPct)} | ${formatRoas(r.metaRoas)} | ${formatRoas(r.twRoas)} |`,
    )
    .join("\n");
  return `${head}\n${body || "| _no coded spend this window_ |" + (withThumb ? " | | | | | | | | |" : " | | | | | | | |")}`;
}

function scriptTable(rows: ScriptBreakout[]): string {
  const head = `| Script | Jobs | Wins | Losses | Spend | Spend / job | TOF share | New visitor % | Meta ROAS | Attributed ROAS |\n|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|`;
  const body = rows
    .map(
      (r) =>
        `| ${r.scriptStem} | ${r.iterationJobs} | ${r.wins} | ${r.losses} | ${moneyK(r.spend)} | ${money(r.spendPerJob)} | ${tofsh(r.tofShare)} | ${nv(r.nvPct)} | ${formatRoas(r.metaRoas)} | ${formatRoas(r.twRoas)} |`,
    )
    .join("\n");
  return `${head}\n${body || "| _no script grouping_ | | | | | | | | | |"}`;
}

function creatorTable(rows: CreatorBreakout[]): string {
  const head = `| Creator | Type | Spend | Assets | Meta ROAS | Attributed ROAS | New visitor % |\n|---|---|--:|--:|--:|--:|--:|`;
  const body = rows
    .map((r) => `| ${r.creator} | ${r.type} | ${moneyK(r.spend)} | ${r.assets} | ${formatRoas(r.metaRoas)} | ${formatRoas(r.twRoas)} | ${nv(r.nvPct)} |`)
    .join("\n");
  return `${head}\n${body || "| _no whitelisted creator attribution_ | | | | | | |"}`;
}

function winnerTable(rows: WinnerRow[]): string {
  const head = `| Job | L7 spend | Meta ROAS | Attributed ROAS |\n|---|---|--:|--:|--:|`;
  const body = rows
    .map((r) => `| ${r.label} | ${money(r.l7Spend)} | ${formatRoas(r.metaRoas)} | ${formatRoas(r.twRoas)} |`)
    .join("\n");
  return `${head}\n${body || "| _none flagged this week_ | | | |"}`;
}

function deceleratorTable(rows: DeceleratorRow[]): string {
  const head = `| Job | Prior wk | L7 spend | % down | Meta ROAS (L7) |\n|---|---|--:|--:|--:|--:|`;
  const body = rows
    .map(
      (r) =>
        `| ${r.label} | ${money(r.priorL7Spend)} | ${money(r.currentL7Spend)} | ${Math.round(r.dropPct * 100)}% | ${formatRoas(r.metaRoas)} |`,
    )
    .join("\n");
  return `${head}\n${body || "| _none flagged this week_ | | | | |"}`;
}

const HOW_TO_READ =
  "How to read: both windows are Meta ad-level exports merged with Triple Whale on Ad ID " +
  "(all TW-unmatched rows carry $0 spend, so totals are unaffected). Win / Lose = a unique creative — " +
  "ad-set copies de-duplicated — whose delivery met or beat the average spend per creative in its campaign; " +
  "in Script Iteration Tracking it is counted once per job, not per copy. TOF sh. = the element's share of " +
  "top-of-funnel spend for the window. Funnel is assigned by campaign: only `usa - asc+ promo` is BOF; every other " +
  "campaign counts as TOF. Share (Demo table) = share of demo-coded spend. New visitor % = TW new visitors ÷ unique " +
  "visitors. Thumb = 3-second video plays ÷ impressions (Meta export column: 3-second video plays rate per impressions). " +
  "Category / Opener / Color / Demo cover only convention-compliant ads carrying that field, so those tables do not " +
  "sum to account totals. Per the naming rules: an open entry tagged \u201cInfluencer\u201d is an influencer; otherwise " +
  "the person named in the open entry is a creator. Job names in Winners / Decelerators = J#### · open-entry title only.";

/** Deterministic template so the pipeline works without an API key. */
export function deterministicReport(brand: string, s: AnalysisSnapshot): GeneratedReport {
  const w = standardWindows();
  const { l7, previousL7, previous2L7, l30 } = s.topline;
  const b7: WindowedBreakouts = s.l7;
  const b30: WindowedBreakouts = s.l30;
  const winners = s.winners;
  const decel = s.decelerators;

  const title = `${brand} · NT1 — Creative & Creator Performance`;

  const slackSummary = [
    `*${title}*`,
    `_L7 ${prettyWindow(w.l7)} · TW Triple Attribution 1-day_`,
    ``,
    `*Topline (L7)*  •  Spend ${money(l7.spend)}  •  ${l7.creatives} creatives  •  Meta ${formatRoas(l7.metaRoas)}  •  TW ${formatRoas(l7.twRoas)}  •  %TOF ${tofsh(l7.tofShare)}  •  NV% ${nv(l7.nvPct)}`,
    ``,
    b7.categories[0] ? `*Top category:* ${b7.categories[0].label} — ${moneyK(b7.categories[0].spend)} @ ${formatRoas(b7.categories[0].metaRoas)}` : ``,
    b7.openers[0] ? `*Top opener:* ${b7.openers[0].label} — ${moneyK(b7.openers[0].spend)}` : ``,
    ``,
    winners.length ? `*New winners:* ${winners.slice(0, 3).map((x) => `${x.label} (${money(x.l7Spend)})`).join(", ")}` : `*New winners:* none flagged`,
    decel.length ? `*Decelerators:* ${decel.slice(0, 3).map((x) => `${x.label} (${Math.round(x.dropPct * 100)}% down)`).join(", ")}` : `*Decelerators:* none flagged`,
  ]
    .filter(Boolean)
    .join("\n");

  const weeklyToplineTable = `| Metric | L7 (${prettyWindow(w.l7)}) | Previous 7 (${prettyWindow(w.priorL7)}) | 7 before that (${prettyWindow(w.prior2L7)}) |
|---|--:|--:|--:|
| Spend | ${money(l7.spend)} | ${money(previousL7.spend)} | ${money(previous2L7.spend)} |
| Purchases | ${l7.purchases.toLocaleString()} | ${previousL7.purchases.toLocaleString()} | ${previous2L7.purchases.toLocaleString()} |
| Revenue | ${money(l7.revenue)} | ${money(previousL7.revenue)} | ${money(previous2L7.revenue)} |
| Attrib. Revenue | ${money(l7.attributedRevenue)} | ${money(previousL7.attributedRevenue)} | ${money(previous2L7.attributedRevenue)} |
| NC ROAS | ${formatRoas(l7.ncRoas)} | ${formatRoas(previousL7.ncRoas)} | ${formatRoas(previous2L7.ncRoas)} |
| Attributed ROAS | ${formatRoas(l7.twRoas)} | ${formatRoas(previousL7.twRoas)} | ${formatRoas(previous2L7.twRoas)} |
| Meta ROAS | ${formatRoas(l7.metaRoas)} | ${formatRoas(previousL7.metaRoas)} | ${formatRoas(previous2L7.metaRoas)} |
| New visitor % | ${nv(l7.nvPct)} | ${nv(previousL7.nvPct)} | ${nv(previous2L7.nvPct)} |
| TOF Share | ${tofsh(l7.tofShare)} | ${tofsh(previousL7.tofShare)} | ${tofsh(previous2L7.tofShare)} |
| Unique Creatives | ${l7.creatives.toLocaleString()} | ${previousL7.creatives.toLocaleString()} | ${previous2L7.creatives.toLocaleString()} |`;

  const md = `# ${title}

_Data report · Meta NT1 · L7 = ${prettyWindow(w.l7)} · L30 = ${prettyWindow(w.l30)} · Triple Whale, Triple Attribution 1-day_

> ${HOW_TO_READ}

> ${LEGACY_NAMING_NOTE}

## Topline
${weeklyToplineTable}

_L30 (${prettyWindow(w.l30)}) is still used below for longer-window element breakouts and prior run-rate checks._

## 1) Creative element breakouts

### Category / asset type (003)
**L7 · ${prettyWindow(w.l7)}**

${groupTable(b7.categories, "TOF share", false, "Category")}

**L30 · ${prettyWindow(w.l30)}**

${groupTable(b30.categories, "TOF share", false, "Category")}

### Visual format — Opener (005), top 15
**L7 · ${prettyWindow(w.l7)}**

${groupTable(b7.openers, "TOF share", true, "Opener")}

**L30 · ${prettyWindow(w.l30)}**

${groupTable(b30.openers, "TOF share", true, "Opener")}

### Color (new 007 + legacy 004)
**L7 · ${prettyWindow(w.l7)}**

${groupTable(b7.colors, "TOF share", false, "Color")}

**L30 · ${prettyWindow(w.l30)}**

${groupTable(b30.colors, "TOF share", false, "Color")}

### Creator demo (013) — on-camera talent
**L7 · ${prettyWindow(w.l7)}**

${groupTable(b7.demographics, "Share", false, "Demo")}

**L30 · ${prettyWindow(w.l30)}**

${groupTable(b30.demographics, "Share", false, "Demo")}

## 2) Script iteration tracking
_Grouped by the repeating open-entry stem (one script = all its iterations). One job = a creative concept launched; versions, sizes, colours and ad-set copies are collapsed. A job wins if any of its creatives took above-average delivery. Catalog / Marpipe ads excluded._

**L7 · ${prettyWindow(w.l7)}**

${scriptTable(b7.scripts.slice(0, 15))}

**L30 · ${prettyWindow(w.l30)}**

${scriptTable(b30.scripts.slice(0, 15))}

## 3) Creator performance
_All assets carrying the creator's name in the open entry. Type per naming rule: "Influencer" when the open entry is tagged Influencer, otherwise Creator. Whitelisted ads renamed to bare job numbers cannot be attributed to a creator and are not counted here._

**L7 · ${prettyWindow(w.l7)}**

${creatorTable(b7.creators.slice(0, 16))}

**L30 · ${prettyWindow(w.l30)}**

${creatorTable(b30.creators.slice(0, 16))}

## 4) New winners this week (≈ $0 the prior period)
_Job = J#### · open-entry title. Prior weekly run-rate &lt; $2K and L7 spend ≥ $10K._

${winnerTable(winners)}

## 5) Decelerators (prior weekly run-rate vs L7)
_Job = J#### · open-entry title. Prior wk = spend in the L30-minus-L7 window ÷ 23 × 7. Sale-tied jobs going to zero after a promo is expected; the flags to act on are the evergreen lines losing delivery._

${deceleratorTable(decel)}

---
_Report generated ${env.OPENAI_API_KEY ? "with OpenAI narrative" : "locally (deterministic template — connect OPENAI_API_KEY for full narrative)"}._`;

  return { title, slackSummary, markdown: md, model: "template", usedAi: false };
}
