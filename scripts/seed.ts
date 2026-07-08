import "./load-env";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Seeds reference config (brands, Meta accounts, TW stores) and, if sample Meta
 * CSV exports are present in /samples, creates a fully-analyzed demo run so the
 * dashboard has data on first boot.
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("\n✗ DATABASE_URL not set. Add it to .env.local, run `npm run db:migrate`, then seed.\n");
    process.exit(1);
  }

  // Import lazily so env is loaded first.
  const { query } = await import("../src/lib/db/client");
  const { BRANDS, META_ACCOUNTS, TW_STORES } = await import("../src/config/brands");

  console.log("→ Seeding brands / accounts / stores…");
  for (const b of BRANDS) {
    await query(`INSERT INTO brands (key, label) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label`, [b.key, b.label]);
  }
  for (const a of META_ACCOUNTS) {
    await query(
      `INSERT INTO meta_account_configs (key, brand_key, label, account_id, configured)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key) DO UPDATE SET account_id = EXCLUDED.account_id, configured = EXCLUDED.configured`,
      [a.key, a.brand, a.label, a.accountId, a.configured],
    );
  }
  for (const s of TW_STORES) {
    await query(
      `INSERT INTO store_configs (key, brand_key, label, region, shop_id, configured)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (key) DO UPDATE SET shop_id = EXCLUDED.shop_id, configured = EXCLUDED.configured`,
      [s.key, s.brand, s.label, s.region, s.shopId, s.configured],
    );
  }
  console.log("✓ Reference config seeded.");

  // Sample data → demo run.
  const l7File = path.resolve(process.cwd(), "samples/NT1-Ads-Jun-30-2026-Jul-6-2026.csv");
  const l30File = path.resolve(process.cwd(), "samples/NT1-Ads-Jun-7-2026-Jul-6-2026.csv");

  if (existsSync(l7File) && existsSync(l30File)) {
    console.log("→ Importing sample Meta exports (NOBL) as a demo run…");
    const { importMetaCsv } = await import("../src/lib/importer/meta-csv");
    const { importAndAnalyze } = await import("../src/lib/jobs/pipeline");

    const l7 = importMetaCsv(readFileSync(l7File, "utf8"), "NOBL");
    const l30 = importMetaCsv(readFileSync(l30File, "utf8"), "NOBL");
    console.log(`   L7: ${l7.rows.length} ads (${l7.dateStart}…${l7.dateStop})`);
    console.log(`   L30: ${l30.rows.length} ads (${l30.dateStart}…${l30.dateStop})`);

    const result = await importAndAnalyze({
      brand: "NOBL",
      windows: [
        { window: "L7", meta: l7.rows },
        { window: "L30", meta: l30.rows },
      ],
      generateReport: true,
    });
    console.log(`✓ Demo run created: ${result.runId}${result.reportId ? ` (report ${result.reportId})` : ""}`);
  } else {
    console.log("ℹ No sample CSVs found in /samples — skipping demo run.");
  }

  console.log("\n✓ Seed complete.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
