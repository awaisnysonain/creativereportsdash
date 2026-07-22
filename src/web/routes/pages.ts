import { Router } from "express";
import {
  dbStatus,
  getLatestRun,
  getLogs,
  getRawMerged,
  getRawMeta,
  getRawTw,
  getReports,
  getRuns,
  getSnapshot,
} from "@/lib/dashboard-data";
import { envHealth } from "@/lib/env";
import { publicTopology } from "@/config/brands";
import { last30, last7, prettyWindow } from "@/lib/dates";
import type { ToplineMetrics } from "@/types";
import { renderPage } from "@/web/render";

export const pagesRouter = Router();

const runWeeklyBtn =
  '<button type="button" class="btn" data-job="weeklyFullRun" data-post-slack="true">' +
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px"><polygon points="6 3 20 12 6 21 6 3"/></svg> Run weekly report</button>';

function toplineFallback(window: "L7" | "L30"): ToplineMetrics {
  return { window, spend: 0, creatives: 0, metaRoas: 0, twRoas: 0, ncRoas: 0, tofShare: 0, nvPct: 0, revenue: 0, attributedRevenue: 0, purchases: 0 };
}

pagesRouter.get("/", (_req, res) => res.redirect("/overview"));

pagesRouter.get("/overview", async (_req, res, next) => {
  try {
    const status = await dbStatus();
    const latest = await getLatestRun();
    const snapshot = latest ? await getSnapshot(latest.id) : null;
    renderPage(res, "overview", {
      title: "Overview",
      subtitle: "Executive performance snapshot across spend, revenue, and creative delivery",
      actions: runWeeklyBtn,
      status,
      latest,
      snapshot,
      l7: snapshot?.topline.l7 ?? toplineFallback("L7"),
      l30: snapshot?.topline.l30 ?? toplineFallback("L30"),
      integrations: envHealth(),
      w7: prettyWindow(last7()),
      w30: prettyWindow(last30()),
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/creative-analysis", async (_req, res, next) => {
  try {
    const status = await dbStatus();
    const latest = await getLatestRun();
    const snapshot = latest ? await getSnapshot(latest.id) : null;
    renderPage(res, "creative-analysis", {
      title: "Creative Analysis",
      subtitle: "Performance by creative element, script, talent, and weekly window",
      actions: '<button type="button" class="btn outline" data-job="computeCreativeAnalysis"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg> Refresh analysis</button>',
      status,
      snapshot,
      windows: { l7: prettyWindow(last7()), l30: prettyWindow(last30()) },
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/winners", async (_req, res, next) => {
  try {
    const status = await dbStatus();
    const latest = await getLatestRun();
    const snapshot = latest ? await getSnapshot(latest.id) : null;
    renderPage(res, "winners", {
      title: "Winners & Decelerators",
      subtitle: "Job-level scale opportunities and delivery slowdowns to act on this week",
      actions: "",
      status,
      snapshot,
      windows: { l7: prettyWindow(last7()), l30: prettyWindow(last30()) },
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/raw-data", async (_req, res, next) => {
  try {
    const status = await dbStatus();
    const latest = await getLatestRun();
    if (!latest) {
      return renderPage(res, "raw-data", {
        title: "Raw Data",
        subtitle: "Audit the ad-level rows behind the latest reporting run",
        actions: "",
        status,
        latest: null,
        data: null,
      });
    }
    const [metaL7, metaL30, twL7, twL30, mergedL7, mergedL30] = await Promise.all([
      getRawMeta(latest.id, "L7"),
      getRawMeta(latest.id, "L30"),
      getRawTw(latest.id, "L7"),
      getRawTw(latest.id, "L30"),
      getRawMerged(latest.id, "L7"),
      getRawMerged(latest.id, "L30"),
    ]);
    renderPage(res, "raw-data", {
      title: "Raw Data",
      subtitle: `Latest run ${latest.id.slice(0, 8)} · source rows and merged output`,
      actions: "",
      status,
      latest,
      data: { meta: { l7: metaL7, l30: metaL30 }, tw: { l7: twL7, l30: twL30 }, merged: { l7: mergedL7, l30: mergedL30 } },
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/reports", async (req, res, next) => {
  try {
    const status = await dbStatus();
    const reports = await getReports(50);
    renderPage(res, "reports", {
      title: "Weekly Reports",
      subtitle: "Client-ready weekly narratives, topline tables, and Slack summaries",
      actions: "",
      status,
      reports,
      initialId: (req.query.id as string) || (reports[0] as { id?: string })?.id || "",
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/settings", async (_req, res, next) => {
  try {
    const status = await dbStatus();
    const [runs, logs, latest] = await Promise.all([getRuns(25), getLogs({ limit: 200 }), getLatestRun()]);
    renderPage(res, "settings", {
      title: "Settings",
      subtitle: "Manage data sources, pipeline runs, imports, and operational checks",
      actions: runWeeklyBtn,
      status,
      integrations: envHealth(),
      topology: publicTopology(),
      runs,
      logs,
      latest,
    });
  } catch (e) {
    next(e);
  }
});

// Legacy operational pages now live inside Settings.
pagesRouter.get("/logs", (_req, res) => res.redirect("/settings#run-history"));
