import cron from "node-cron";
import { BRANDS } from "@/config/brands";
import { weeklyCron } from "@/lib/dates";
import { env } from "@/lib/env";
import { weeklyFullRun } from "@/lib/jobs/pipeline";

let started = false;
let running = false;

export interface WeeklySchedulerStatus {
  enabled: boolean;
  started: boolean;
  running: boolean;
  cron: string;
  day: string;
  hour: number;
  timezone: string;
  dashboardUrl: string;
}

function resolveDashboardUrl(override?: string): string {
  if (override) return override;
  if (process.env.APP_URL?.trim()) return process.env.APP_URL.trim().replace(/\/$/, "");
  const port = Number(process.env.PORT) || 3000;
  return `http://localhost:${port}`;
}

/** Whether the weekly cron should register (default: on). Set ENABLE_WEEKLY_SCHEDULER=false to disable. */
export function isWeeklySchedulerEnabled(): boolean {
  return process.env.ENABLE_WEEKLY_SCHEDULER !== "false";
}

export function getWeeklySchedulerStatus(dashboardUrl?: string): WeeklySchedulerStatus {
  return {
    enabled: isWeeklySchedulerEnabled(),
    started,
    running,
    cron: weeklyCron(),
    day: env.WEEKLY_RUN_DAY,
    hour: env.WEEKLY_RUN_HOUR,
    timezone: env.REPORT_TIMEZONE,
    dashboardUrl: resolveDashboardUrl(dashboardUrl),
  };
}

/**
 * Register the weekly cron: every configured weekday (default Tuesday 08:00 ET),
 * pull Meta + attribution, analyze, generate report, post to Slack for each brand.
 */
export function startWeeklyScheduler(opts?: { dashboardUrl?: string }): WeeklySchedulerStatus {
  const status = getWeeklySchedulerStatus(opts?.dashboardUrl);

  if (!status.enabled) {
    console.log("[scheduler] Weekly cron disabled (ENABLE_WEEKLY_SCHEDULER=false)");
    return status;
  }

  if (started) return status;

  const dashboardUrl = status.dashboardUrl;

  console.log(
    `[scheduler] Weekly auto-run: ${status.day} @ ${status.hour}:00 (${status.timezone}) — cron "${status.cron}"`,
  );
  if (!process.env.APP_URL?.trim()) {
    console.log(`[scheduler] APP_URL not set — Slack report links will use ${dashboardUrl}`);
  }

  cron.schedule(
    status.cron,
    async () => {
      if (running) {
        console.warn("[scheduler] Skipping tick — previous weekly run still in progress");
        return;
      }
      running = true;
      console.log(`[scheduler] ${new Date().toISOString()} Starting scheduled weekly run…`);

      try {
        for (const brand of BRANDS) {
          try {
            const res = await weeklyFullRun({
              brand: brand.key,
              postToSlack: true,
              dashboardUrl,
              trigger: "scheduled",
            });
            const slackNote = res.errors.some((e) => e.startsWith("slack:")) ? " · Slack failed" : "";
            console.log(
              `[scheduler] ${brand.key}: ${res.runId}${res.partial ? " (partial)" : " (success)"}${slackNote}`,
            );
            if (res.errors.length) {
              console.warn(`[scheduler] ${brand.key} notes: ${res.errors.join(" | ")}`);
            }
          } catch (err) {
            console.error(`[scheduler] ${brand.key} failed:`, (err as Error).message);
          }
        }
      } finally {
        running = false;
      }
    },
    { timezone: status.timezone },
  );

  started = true;
  status.started = true;
  return status;
}
