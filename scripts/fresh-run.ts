/**
 * Wipe all run data (optional) and execute a full weekly pipeline with Slack post.
 * Usage: npx tsx scripts/fresh-run.ts [--reset]
 */
import "./load-env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { BRANDS, META_ACCOUNTS, TW_STORES } from "@/config/brands";
import { weeklyFullRun } from "@/lib/jobs/pipeline";

async function resetDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const ssl = process.env.DATABASE_SSL === "true" || process.env.DATABASE_SSL === "1";
  const pool = new Pool({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : undefined });

  console.log("→ Dropping all data and reapplying schema…");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const schema = readFileSync(path.resolve(process.cwd(), "db/schema.sql"), "utf8");
  await pool.query(schema);

  console.log("→ Seeding brand / account reference config…");
  for (const b of BRANDS) {
    await pool.query(
      `INSERT INTO brands (key, label) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label`,
      [b.key, b.label],
    );
  }
  for (const a of META_ACCOUNTS) {
    await pool.query(
      `INSERT INTO meta_account_configs (key, brand_key, label, account_id, configured)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (key) DO UPDATE SET account_id = EXCLUDED.account_id, configured = EXCLUDED.configured`,
      [a.key, a.brand, a.label, a.accountId, a.configured],
    );
  }
  for (const s of TW_STORES) {
    await pool.query(
      `INSERT INTO store_configs (key, brand_key, label, region, shop_id, configured)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (key) DO UPDATE SET shop_id = EXCLUDED.shop_id, configured = EXCLUDED.configured`,
      [s.key, s.brand, s.label, s.region, s.shopId, s.configured],
    );
  }
  await pool.end();
  console.log("✓ Database reset complete.");
}

async function main() {
  if (process.argv.includes("--reset")) {
    await resetDatabase();
  }

  const dashboardUrl = process.env.DASHBOARD_URL || "http://52.77.228.212";
  console.log("→ Running full weekly pipeline (Meta → attribution → merge → analysis → report → Slack)…");

  const result = await weeklyFullRun({
    brand: "NOBL",
    postToSlack: true,
    dashboardUrl,
    trigger: "manual",
  });

  console.log("\n── Result ─────────────────────────────");
  console.log(`Run ID:    ${result.runId}`);
  console.log(`Report ID: ${result.reportId ?? "—"}`);
  console.log(`Status:    ${result.partial ? "partial" : "success"}`);
  if (result.errors.length) console.log(`Notes:     ${result.errors.join(" | ")}`);
  console.log("✓ Fresh run complete.\n");
}

main().catch((err) => {
  console.error("✗ Fresh run failed:", (err as Error).message);
  process.exit(1);
});
