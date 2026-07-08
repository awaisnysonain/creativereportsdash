import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "@/lib/env";

/**
 * Lazy, singleton PostgreSQL pool (node-postgres). No ORM by design — we use
 * plain, reviewable SQL via typed repository functions.
 *
 * The pool is created only when first used and reused across hot reloads in dev
 * (stashed on globalThis). If DATABASE_URL is not configured, `isDbConfigured()`
 * returns false and callers should degrade gracefully instead of throwing.
 */

const globalForDb = globalThis as unknown as { __crPool?: Pool };

export function isDbConfigured(): boolean {
  return Boolean(env.DATABASE_URL && env.DATABASE_URL.trim().length > 0);
}

export function getPool(): Pool {
  if (!isDbConfigured()) {
    throw new DbNotConfiguredError();
  }
  if (!globalForDb.__crPool) {
    globalForDb.__crPool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    globalForDb.__crPool.on("error", (err) => {
      console.error("[db] idle client error", err.message);
    });
  }
  return globalForDb.__crPool;
}

export class DbNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured. Set it in .env.local and run `npm run db:migrate`.");
    this.name = "DbNotConfiguredError";
  }
}

/** Run a parameterized query. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = getPool();
  const res = await pool.query<T>(text, params);
  return res.rows;
}

/** Run a query returning a single row (or null). */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run a set of statements inside a transaction. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Ping the database. Returns latency ms or throws. */
export async function pingDb(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    if (!isDbConfigured()) return { ok: false, latencyMs: 0, error: "DATABASE_URL not set" };
    await query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message };
  }
}
