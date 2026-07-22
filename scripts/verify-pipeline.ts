import "./load-env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { importMetaCsv } from "@/lib/importer/meta-csv";
import { mergeCreativeMetrics } from "@/lib/analytics/merge";
import { buildAnalysisSnapshot } from "@/lib/analytics";
import { deterministicReport } from "@/lib/services/openai";
import { formatCurrency, formatPercent, formatRoas } from "@/lib/utils";

const l7 = importMetaCsv(readFileSync(path.resolve("samples/NT1-Ads-Jun-30-2026-Jul-6-2026.csv"), "utf8"), "NOBL");
const l30 = importMetaCsv(readFileSync(path.resolve("samples/NT1-Ads-Jun-7-2026-Jul-6-2026.csv"), "utf8"), "NOBL");

console.log(`Parsed L7=${l7.rows.length} ads, L30=${l30.rows.length} ads`);

const mergedL7 = mergeCreativeMetrics(l7.rows, [], "L7", "NOBL");
const mergedL30 = mergeCreativeMetrics(l30.rows, [], "L30", "NOBL");

const snap = buildAnalysisSnapshot({ l7: mergedL7, previousL7: mergedL7, previous2L7: mergedL7, l30: mergedL30 });

console.log("\n── TOPLINE L7 ─────────────────────────");
const t = snap.topline.l7;
console.log(`Spend ${formatCurrency(t.spend)} · Creatives ${t.creatives} · Meta ROAS ${formatRoas(t.metaRoas)} · TOF ${formatPercent(t.tofShare)}`);

console.log("\n── CATEGORY BREAKOUT L7 (top 6) ───────");
for (const c of snap.l7.categories.slice(0, 6)) {
  console.log(`${c.label.padEnd(24)} spend ${formatCurrency(c.spend).padStart(12)}  ${c.wins}W/${c.losses}L  ROAS ${formatRoas(c.metaRoas)}  assets ${c.assets}`);
}

console.log("\n── OPENERS L7 (top 5) ─────────────────");
for (const o of snap.l7.openers.slice(0, 5)) console.log(`${o.label.padEnd(32)} ${formatCurrency(o.spend).padStart(12)}  ROAS ${formatRoas(o.metaRoas)}`);

console.log("\n── CREATORS L7 (top 5) ────────────────");
for (const c of snap.l7.creators.slice(0, 5)) console.log(`${(c.creator ?? "—").padEnd(22)} ${c.type.padEnd(11)} ${formatCurrency(c.spend).padStart(12)}  assets ${c.assets}`);

console.log("\n── SCRIPTS L7 (top 5) ─────────────────");
for (const s of snap.l7.scripts.slice(0, 5)) console.log(`${s.scriptStem.padEnd(28)} iters ${s.iterationJobs}  ${formatCurrency(s.spend).padStart(12)}  ROAS ${formatRoas(s.metaRoas)}`);

console.log(`\nNew winners: ${snap.winners.length} · Decelerators: ${snap.decelerators.length}`);
if (snap.winners[0]) console.log(`Top winner: ${snap.winners[0].label} — ${snap.winners[0].reason}`);

const report = deterministicReport("NOBL", snap);
console.log(`\nReport title: ${report.title}`);
console.log("✓ Pipeline verified end-to-end (no DB).");
