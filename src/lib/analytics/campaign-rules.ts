import type { Funnel } from "@/types";

/**
 * Campaign-based methodology rules (from the NT1 Weekly Review process doc).
 *
 * Funnel is determined ENTIRELY by campaign, never by name tags:
 *   BOF  = ads in the `usa -  asc+ promo` campaign (note the double space after
 *          "usa -"; we match on the `asc+ promo` substring to be robust).
 *   TOF  = every other campaign, including `asc+ t-roas`, whitelist tests, and
 *          international.
 */
export function campaignFunnel(campaignName?: string | null): Funnel {
  const name = (campaignName ?? "").toLowerCase();
  if (/asc\+\s*promo/.test(name)) return "BOF";
  return "TOF";
}

export function isBofPromoCampaign(campaignName?: string | null): boolean {
  return /asc\+\s*promo/.test((campaignName ?? "").toLowerCase());
}

/**
 * Sections that must EXCLUDE the BOF sale campaign and catalog/Marpipe delivery:
 * Script Iteration Tracking, New Winners, and Decelerators.
 */
export function isExcludedFromScopedSections(campaignName?: string | null): boolean {
  const name = (campaignName ?? "").toLowerCase();
  if (/asc\+\s*promo/.test(name)) return true;
  if (/catalog|marpipe|dpa|dynamic\s*product|advantage\+?\s*catalog/.test(name)) return true;
  return false;
}
