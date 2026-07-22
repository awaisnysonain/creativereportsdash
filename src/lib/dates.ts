import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { subDays } from "date-fns";
import { env } from "@/lib/env";

/**
 * Date-window helpers. All windows are computed relative to "yesterday" in the
 * configured reporting timezone (America/New_York by default), matching how the
 * business defines L7 / L30 / prior comparison windows.
 */

export interface DateWindow {
  /** inclusive start date, yyyy-MM-dd */
  start: string;
  /** inclusive end date, yyyy-MM-dd */
  end: string;
  /** number of days in the window */
  days: number;
  label: string;
}

const TZ = () => env.REPORT_TIMEZONE || "America/New_York";

/** yyyy-MM-dd string for a date in the reporting timezone. */
export function fmt(date: Date): string {
  return formatInTimeZone(date, TZ(), "yyyy-MM-dd");
}

/** "Now" as a Date pinned to the reporting timezone wall clock. */
export function nowInTz(): Date {
  return toZonedTime(new Date(), TZ());
}

/** Yesterday (the last complete day) in the reporting timezone. */
export function yesterday(reference: Date = new Date()): Date {
  return subDays(toZonedTime(reference, TZ()), 1);
}

/**
 * L7 = yesterday-6 .. yesterday (7 inclusive days).
 */
export function last7(reference: Date = new Date()): DateWindow {
  const end = yesterday(reference);
  const start = subDays(end, 6);
  return { start: fmt(start), end: fmt(end), days: 7, label: "L7" };
}

/**
 * L30 = yesterday-29 .. yesterday (30 inclusive days).
 */
export function last30(reference: Date = new Date()): DateWindow {
  const end = yesterday(reference);
  const start = subDays(end, 29);
  return { start: fmt(start), end: fmt(end), days: 30, label: "L30" };
}

/**
 * Prior comparison window used by the "new winners" heuristic: the 23 days that
 * precede the current L7 window (i.e. yesterday-29 .. yesterday-7).
 */
export function prior23(reference: Date = new Date()): DateWindow {
  const end = subDays(yesterday(reference), 7);
  const start = subDays(end, 22);
  return { start: fmt(start), end: fmt(end), days: 23, label: "Prior 23d" };
}

/** The L7 window immediately preceding the current L7 (for decelerator run-rate). */
export function priorL7(reference: Date = new Date()): DateWindow {
  const end = subDays(yesterday(reference), 7);
  const start = subDays(end, 6);
  return { start: fmt(start), end: fmt(end), days: 7, label: "Prior L7" };
}

/** The 7-day window immediately preceding `priorL7`. */
export function prior2L7(reference: Date = new Date()): DateWindow {
  const end = subDays(yesterday(reference), 14);
  const start = subDays(end, 6);
  return { start: fmt(start), end: fmt(end), days: 7, label: "2 Prior L7" };
}

/** Human-friendly window label, e.g. "Jun 30 – Jul 6, 2026". */
export function prettyWindow(w: DateWindow): string {
  const s = new Date(`${w.start}T00:00:00`);
  const e = new Date(`${w.end}T00:00:00`);
  const sMonth = s.toLocaleString("en-US", { month: "short" });
  const eMonth = e.toLocaleString("en-US", { month: "short" });
  const year = e.getFullYear();
  if (sMonth === eMonth) return `${sMonth} ${s.getDate()} – ${e.getDate()}, ${year}`;
  return `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}, ${year}`;
}

/** Standard set of windows used across analytics. */
export function standardWindows(reference: Date = new Date()) {
  return {
    l7: last7(reference),
    l30: last30(reference),
    prior23: prior23(reference),
    priorL7: priorL7(reference),
    prior2L7: prior2L7(reference),
  };
}

const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/** Cron expression for the weekly run derived from env (minute hour * * dow). */
export function weeklyCron(): string {
  const hour = env.WEEKLY_RUN_HOUR ?? 8;
  const dow = DAY_INDEX[env.WEEKLY_RUN_DAY] ?? 2;
  return `0 ${hour} * * ${dow}`;
}
