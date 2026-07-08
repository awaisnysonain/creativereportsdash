import { writeJobLog } from "@/lib/db/repositories";
import { isDbConfigured } from "@/lib/db/client";

/**
 * Job execution wrapper: times the job, writes structured start/success/failure
 * logs to job_logs (when DB is configured), and supports simple retries.
 */

export interface JobContext {
  runId?: string | null;
  job: string;
}

export async function runJob<T>(
  ctx: JobContext,
  fn: () => Promise<T>,
  opts: { retries?: number; meta?: Record<string, unknown> } = {},
): Promise<T> {
  const retries = opts.retries ?? 0;
  const start = Date.now();
  await safeLog({ ...ctx, status: "running", level: "info", message: `${ctx.job} started`, meta: opts.meta });

  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    try {
      const result = await fn();
      await safeLog({
        ...ctx,
        status: "success",
        level: "info",
        message: `${ctx.job} succeeded`,
        durationMs: Date.now() - start,
        meta: opts.meta,
      });
      return result;
    } catch (err) {
      lastErr = err;
      attempt++;
      if (attempt <= retries) {
        await safeLog({
          ...ctx,
          status: "running",
          level: "warn",
          message: `${ctx.job} retry ${attempt}/${retries}: ${(err as Error).message}`,
        });
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
    }
  }

  await safeLog({
    ...ctx,
    status: "failed",
    level: "error",
    message: `${ctx.job} failed: ${(lastErr as Error)?.message ?? "unknown error"}`,
    durationMs: Date.now() - start,
    meta: opts.meta,
  });
  throw lastErr;
}

async function safeLog(input: Parameters<typeof writeJobLog>[0]) {
  if (!isDbConfigured()) return;
  try {
    await writeJobLog(input);
  } catch {
    // Never let logging failures break a job.
  }
}
