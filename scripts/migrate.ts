import "./load-env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

/**
 * Applies db/schema.sql to the configured DATABASE_URL. Idempotent.
 * `--reset` drops the public schema first (DANGEROUS — dev only).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("\n✗ DATABASE_URL is not set. Add it to .env.local and try again.\n");
    process.exit(1);
  }

  const ssl = process.env.DATABASE_SSL === "true" || process.env.DATABASE_SSL === "1";
  const pool = new Pool({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : undefined });
  const reset = process.argv.includes("--reset");

  try {
    if (reset) {
      console.log("⚠  Resetting public schema (dropping all tables)…");
      await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    }
    const schema = readFileSync(path.resolve(process.cwd(), "db/schema.sql"), "utf8");
    await pool.query(schema);
    console.log("✓ Schema applied successfully.");
  } catch (err) {
    console.error("✗ Migration failed:", (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
