import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { isDbConfigured, pingDb } from "@/lib/db/client";
import { envHealth } from "@/lib/env";
import { getWeeklySchedulerStatus } from "@/lib/scheduler/weekly";
import { getBrand, type BrandKey } from "@/config/brands";
import {
  computeCreativeAnalysis,
  generateWeeklyAIReport,
  importAndAnalyze,
  mergeCreativeData,
  postSlackSummary,
  syncMetaWindow,
  syncTripleWhaleWindow,
  weeklyFullRun,
} from "@/lib/jobs/pipeline";
import { createSyncRun, deleteAiReport, getAiReport, getSyncRun, latestSuccessfulRun, listSyncRuns, saveSlackPost, updateAiReport } from "@/lib/db/repositories";
import { importMetaCsv, importMetaXlsx } from "@/lib/importer/meta-csv";
import { testMetaConnection } from "@/lib/services/meta";
import { testTwConnection } from "@/lib/services/triplewhale";
import { postReportToSlack, testSlackConnection } from "@/lib/services/slack";

export const apiRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function origin(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

// ── Health ────────────────────────────────────────────────────────────────
apiRouter.get("/health", async (_req, res) => {
  const db = await pingDb();
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    database: db,
    integrations: envHealth(),
    scheduler: getWeeklySchedulerStatus(),
  });
});

// ── Connection tests ────────────────────────────────────────────────────────
const connSchema = z.object({ type: z.enum(["meta", "tw", "slack", "db"]), key: z.string().optional() });
apiRouter.post("/connections/test", async (req, res) => {
  const parsed = connSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, detail: "invalid request" });
  const { type, key } = parsed.data;
  try {
    switch (type) {
      case "db": {
        const r = await pingDb();
        return res.json({ ok: r.ok, detail: r.ok ? `${r.latencyMs}ms` : r.error });
      }
      case "slack":
        return res.json(await testSlackConnection());
      case "meta":
        if (!key) return res.status(400).json({ ok: false, detail: "missing account key" });
        return res.json(await testMetaConnection(key));
      case "tw":
        if (!key) return res.status(400).json({ ok: false, detail: "missing store key" });
        return res.json(await testTwConnection(key));
    }
  } catch (err) {
    return res.status(500).json({ ok: false, detail: (err as Error).message });
  }
});

// ── Job runner ────────────────────────────────────────────────────────────
const jobSchema = z.object({
  job: z.enum([
    "weeklyFullRun",
    "syncMetaWindow",
    "syncTripleWhaleWindow",
    "mergeCreativeData",
    "computeCreativeAnalysis",
    "generateWeeklyAIReport",
    "postSlackSummary",
  ]),
  brand: z.enum(["NOBL", "FLO"]).default("NOBL"),
  accountKey: z.string().optional(),
  storeKey: z.string().optional(),
  runId: z.string().optional(),
  reportId: z.string().optional(),
  postToSlack: z.boolean().optional(),
});

async function resolveRunId(brand: BrandKey, provided?: string): Promise<string> {
  if (provided) {
    const run = await getSyncRun(provided);
    if (run) return run.id;
  }
  const runs = await listSyncRuns(1);
  if (runs.length) return runs[0].id;
  return createSyncRun({ brandKey: brand, trigger: "manual" });
}

apiRouter.post("/jobs/run", async (req: Request, res: Response) => {
  if (!isDbConfigured()) return res.status(400).json({ ok: false, error: "Database not configured. Set DATABASE_URL." });
  const parsed = jobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  const { job, brand, accountKey, storeKey, runId: providedRun, reportId, postToSlack } = parsed.data;
  const brandCfg = getBrand(brand);
  const dashboardUrl = origin(req);

  try {
    switch (job) {
      case "weeklyFullRun": {
        const r = await weeklyFullRun({
          brand,
          accountKey: accountKey ?? brandCfg?.metaAccounts[0]?.key,
          storeKey: storeKey ?? brandCfg?.stores[0]?.key,
          postToSlack: postToSlack ?? true,
          dashboardUrl,
          trigger: "manual",
        });
        return res.json({ ok: true, ...r });
      }
      case "syncMetaWindow": {
        const key = accountKey ?? brandCfg?.metaAccounts[0]?.key;
        if (!key) return res.status(400).json({ ok: false, error: "No Meta account for brand" });
        const runId = await resolveRunId(brand, providedRun);
        const l7 = await syncMetaWindow(runId, key, "L7");
        const l30 = await syncMetaWindow(runId, key, "L30");
        return res.json({ ok: true, runId, l7, l30 });
      }
      case "syncTripleWhaleWindow": {
        const key = storeKey ?? brandCfg?.stores[0]?.key;
        if (!key) return res.status(400).json({ ok: false, error: "No TW store for brand" });
        const runId = await resolveRunId(brand, providedRun);
        const l7 = await syncTripleWhaleWindow(runId, key, "L7");
        const l30 = await syncTripleWhaleWindow(runId, key, "L30");
        return res.json({ ok: true, runId, l7, l30 });
      }
      case "mergeCreativeData": {
        const runId = await resolveRunId(brand, providedRun);
        const l7 = await mergeCreativeData(runId, brand, "L7");
        const l30 = await mergeCreativeData(runId, brand, "L30");
        return res.json({ ok: true, runId, l7, l30 });
      }
      case "computeCreativeAnalysis": {
        const runId = await resolveRunId(brand, providedRun);
        const r = await computeCreativeAnalysis(runId, brand);
        return res.json({ ok: true, runId, ...r });
      }
      case "generateWeeklyAIReport": {
        const runId = await resolveRunId(brand, providedRun);
        const r = await generateWeeklyAIReport(runId, brand);
        return res.json({ ok: true, runId, ...r });
      }
      case "postSlackSummary": {
        let rid = reportId;
        let runId = providedRun;
        if (!rid) {
          const latest = await latestSuccessfulRun();
          rid = latest?.report_id ?? undefined;
          runId = latest?.id ?? runId;
        }
        if (!rid) return res.status(400).json({ ok: false, error: "No report to post. Generate one first." });
        const r = await postSlackSummary(runId ?? "", rid, dashboardUrl);
        return res.json({ ...r, ok: true });
      }
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── Import (test data mode) ──────────────────────────────────────────────────
apiRouter.post("/import", upload.single("file"), async (req: Request, res: Response) => {
  if (!isDbConfigured()) return res.status(400).json({ ok: false, error: "Database not configured. Set DATABASE_URL." });
  const file = req.file;
  const brand = ((req.body?.brand as string) || "NOBL") as BrandKey;
  const window = ((req.body?.window as string) || "L7") as "L7" | "L30";
  if (!file) return res.status(400).json({ ok: false, error: "No file uploaded" });

  try {
    const isXlsx = file.originalname.toLowerCase().endsWith(".xlsx");
    const result = isXlsx ? importMetaXlsx(file.buffer, brand) : importMetaCsv(file.buffer.toString("utf8"), brand);
    if (!result.rows.length) return res.status(400).json({ ok: false, error: "No valid ad rows found in file." });

    const run = await importAndAnalyze({ brand, windows: [{ window, meta: result.rows, tw: result.tw }], generateReport: true });
    return res.json({
      ok: true,
      runId: run.runId,
      reportId: run.reportId,
      parsed: result.rows.length,
      twMatched: result.twMatched,
      skipped: result.skipped,
      dateStart: result.dateStart,
      dateStop: result.dateStop,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── Reports ──────────────────────────────────────────────────────────────────
apiRouter.get("/reports/:id", async (req, res) => {
  if (!isDbConfigured()) return res.status(400).json({ ok: false, error: "DB not configured" });
  const report = await getAiReport(req.params.id);
  if (!report) return res.status(404).json({ ok: false, error: "not found" });
  return res.json({ ok: true, report });
});

const reportIdSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);
const reportEditSchema = z
  .object({
    title: z.string().trim().min(1).max(150).refine((v) => !/[\r\n\0]/.test(v), "Invalid title"),
    slackSummary: z.string().trim().min(1).max(2900).refine((v) => !v.includes("\0"), "Invalid Slack summary"),
    markdown: z.string().trim().min(1).max(500_000).refine((v) => !v.includes("\0"), "Invalid report content"),
  })
  .strict();

apiRouter.patch("/reports/:id", async (req, res) => {
  if (!isDbConfigured()) return res.status(400).json({ ok: false, error: "DB not configured" });
  const id = reportIdSchema.safeParse(req.params.id);
  const body = reportEditSchema.safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ ok: false, error: "Invalid report update" });
  try {
    const report = await updateAiReport(id.data, body.data);
    if (!report) return res.status(404).json({ ok: false, error: "report not found" });
    return res.json({ ok: true, report });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

apiRouter.delete("/reports/:id", async (req, res) => {
  if (!isDbConfigured()) return res.status(400).json({ ok: false, error: "DB not configured" });
  const id = reportIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ ok: false, error: "Invalid report id" });
  try {
    const deleted = await deleteAiReport(id.data);
    if (!deleted) return res.status(404).json({ ok: false, error: "report not found" });
    return res.json({ ok: true, id: id.data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── Slack post ────────────────────────────────────────────────────────────────
apiRouter.post("/slack/post", async (req: Request, res: Response) => {
  if (!isDbConfigured()) return res.status(400).json({ ok: false, error: "DB not configured" });
  const parsed = z.object({ reportId: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "reportId required" });

  const report = await getAiReport(parsed.data.reportId);
  if (!report) return res.status(404).json({ ok: false, error: "report not found" });

  const result = await postReportToSlack({
    title: report.title,
    slackSummary: report.slack_summary,
    reportUrl: `${origin(req)}/reports?id=${report.id}`,
  });
  await saveSlackPost({
    reportId: report.id,
    runId: report.run_id,
    channelId: result.channelId,
    status: result.ok ? "success" : "failed",
    messageTs: result.ts,
    permalink: result.permalink,
    error: result.error,
  });
  return res.status(result.ok ? 200 : 500).json(result);
});
