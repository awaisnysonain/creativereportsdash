import "./load-env";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { formatCurrency, formatPercent, formatRoas } from "../src/lib/utils";

/**
 * CLI: build one full weekly run from the two real combined Meta + Triple Whale
 * exports (L7 and L30), generate the AI report, and optionally post it to Slack.
 *
 * Usage:
 *   npx tsx scripts/import-weekly.ts <L7.xlsx> <L30.xlsx> [brand=NOBL] [--slack] [--dashboard=http://host]
 */
async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const positional = args.filter((a) => !a.startsWith("--"));
  const [l7File, l30File, brandArg] = positional;
  const brand = (brandArg as "NOBL" | "FLO") ?? "NOBL";
  const postSlack = flags.includes("--slack");
  const dashboardUrl = flags.find((f) => f.startsWith("--dashboard="))?.split("=")[1];

  if (!l7File || !l30File) {
    console.error("Usage: npx tsx scripts/import-weekly.ts <L7.xlsx> <L30.xlsx> [brand] [--slack] [--dashboard=URL]");
    process.exit(1);
  }
  const l7Abs = path.resolve(process.cwd(), l7File);
  const l30Abs = path.resolve(process.cwd(), l30File);
  for (const f of [l7Abs, l30Abs]) {
    if (!existsSync(f)) {
      console.error(`File not found: ${f}`);
      process.exit(1);
    }
  }

  const { importMetaXlsx, importMetaCsv } = await import("../src/lib/importer/meta-csv");
  const { importAndAnalyze, postSlackSummary } = await import("../src/lib/jobs/pipeline");
  const { getSnapshotForRun } = await import("../src/lib/db/repositories");

  const read = (abs: string) =>
    abs.toLowerCase().endsWith(".xlsx") ? importMetaXlsx(readFileSync(abs), brand) : importMetaCsv(readFileSync(abs, "utf8"), brand);

  const l7 = read(l7Abs);
  const l30 = read(l30Abs);
  console.log(`L7:  ${l7.rows.length} ads, ${l7.twMatched} TW matched (${l7.dateStart}…${l7.dateStop})`);
  console.log(`L30: ${l30.rows.length} ads, ${l30.twMatched} TW matched (${l30.dateStart}…${l30.dateStop})`);

  const run = await importAndAnalyze({
    brand,
    windows: [
      { window: "L7", meta: l7.rows, tw: l7.tw },
      { window: "L30", meta: l30.rows, tw: l30.tw },
    ],
    generateReport: true,
  });
  console.log(`\n✓ Run created: ${run.runId}${run.reportId ? ` · report ${run.reportId}` : ""}`);

  const snap = await getSnapshotForRun(run.runId);
  if (snap) {
    const t = snap.payload.topline.l7;
    console.log(`\n── TOPLINE L7 ─────────────────────────`);
    console.log(`Spend ${formatCurrency(t.spend)} · Creatives ${t.creatives} · Meta ${formatRoas(t.metaRoas)} · TW ${formatRoas(t.twRoas)} · NC ${formatRoas(t.ncRoas)} · TOF ${formatPercent(t.tofShare)} · NV ${formatPercent(t.nvPct)}`);
    const t30 = snap.payload.topline.l30;
    console.log(`── TOPLINE L30 ────────────────────────`);
    console.log(`Spend ${formatCurrency(t30.spend)} · Creatives ${t30.creatives} · Meta ${formatRoas(t30.metaRoas)} · TW ${formatRoas(t30.twRoas)} · TOF ${formatPercent(t30.tofShare)} · NV ${formatPercent(t30.nvPct)}`);
  }

  if (postSlack && run.reportId) {
    console.log(`\n→ Posting to Slack…`);
    try {
      const r = await postSlackSummary(run.runId, run.reportId, dashboardUrl);
      console.log(`✓ Slack posted${r.permalink ? `: ${r.permalink}` : ""}`);
    } catch (e) {
      console.error(`✗ Slack post failed: ${(e as Error).message}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Weekly import failed:", err);
  process.exit(1);
});
