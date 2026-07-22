import "./load-env";

/**
 * Seeds reference config (brands, Meta accounts, TW stores).
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("\n✗ DATABASE_URL not set. Add it to .env.local, run `npm run db:migrate`, then seed.\n");
    process.exit(1);
  }

  // Import lazily so env is loaded first.
  const { query, queryOne } = await import("../src/lib/db/client");
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

  console.log("\n✓ Seed complete.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
