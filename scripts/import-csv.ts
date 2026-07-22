import "./load-env";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * CLI: import a Meta CSV/XLSX export as a new analyzed run.
 * Usage:
 *   npm run import:csv -- <path-to-file> [brand] [window]
 */
async function main() {
  const [file, brandArg, windowArg] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: npm run import:csv -- <file> [brand=NOBL] [window=L7]");
    process.exit(1);
  }
  const abs = path.resolve(process.cwd(), file);
  if (!existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }
  const brand = (brandArg as "NOBL" | "FLO") ?? "NOBL";
  const window = (windowArg as "L7" | "L30") ?? "L7";

  const { importMetaCsv, importMetaXlsx } = await import("../src/lib/importer/meta-csv");
  const { importAndAnalyze } = await import("../src/lib/jobs/pipeline");

  const isXlsx = abs.toLowerCase().endsWith(".xlsx");
  const result = isXlsx
    ? importMetaXlsx(readFileSync(abs), brand)
    : importMetaCsv(readFileSync(abs, "utf8"), brand);

  console.log(`Parsed ${result.rows.length} ads (skipped ${result.skipped}, TW matched ${result.twMatched}) from ${path.basename(abs)}`);

  const run = await importAndAnalyze({
    brand,
    windows: [{ window, meta: result.rows, tw: result.tw }],
    generateReport: true,
  });
  console.log(`✓ Run created: ${run.runId}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
