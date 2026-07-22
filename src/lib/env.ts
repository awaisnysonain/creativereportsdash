import { z } from "zod";

/**
 * Centralized, validated environment access.
 *
 * We intentionally keep every secret optional at the schema level so the app can
 * boot for local UI work even before every integration is configured. Instead of
 * crashing, we expose typed getters plus `envHealth()` so the Settings/Integrations
 * page can render exactly which pieces are wired up.
 */

const rawSchema = z.object({
  // OpenAI
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().optional().default("gpt-4.1"),

  // Meta
  META_API_VERSION: z.string().optional().default("v20.0"),
  NOBL_META_AD_ACCOUNT_ID: z.string().optional().default(""),
  NOBL_META_ACCESS_TOKEN: z.string().optional().default(""),
  FLO_META_AD_ACCOUNT_ID: z.string().optional().default(""),
  FLO_META_ACCESS_TOKEN: z.string().optional().default(""),

  // Triple Whale
  NOBL_TW_SHOP_ID: z.string().optional().default(""),
  NOBL_TW_API_KEY: z.string().optional().default(""),
  FLO_TW_SHOP_ID: z.string().optional().default(""),
  FLO_TW_API_KEY: z.string().optional().default(""),
  NOBL_EU_TW_SHOP_ID: z.string().optional().default(""),
  NOBL_EU_TW_API_KEY: z.string().optional().default(""),
  NOBL_UK_TW_SHOP_ID: z.string().optional().default(""),
  NOBL_UK_TW_API_KEY: z.string().optional().default(""),

  // Slack
  SLACK_BOT_TOKEN: z.string().optional().default(""),
  SLACK_CHANNEL_ID: z.string().optional().default(""),
  SLACK_REPORT_USER_IDS: z.string().optional().default(""),

  // Reporting / scheduling
  REPORT_TIMEZONE: z.string().optional().default("America/New_York"),
  WEEKLY_RUN_DAY: z
    .enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])
    .optional()
    .default("Tuesday"),
  WEEKLY_RUN_HOUR: z.coerce.number().int().min(0).max(23).optional().default(8),

  // Database
  DATABASE_URL: z.string().optional().default(""),
  DATABASE_SSL: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true" || v === "1"),

  // App URL (Slack "Open report" links from scheduled runs)
  APP_URL: z.string().optional().default(""),
});

export type Env = z.infer<typeof rawSchema>;

const parsed = rawSchema.safeParse(process.env);

if (!parsed.success) {
  // This should be effectively impossible since all fields are optional, but we
  // keep it explicit so misconfigured coercions (e.g. WEEKLY_RUN_HOUR) surface loudly.
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. See logs above.");
}

export const env: Env = parsed.data;

/** Whether a value looks configured (non-empty after trim). */
const has = (v?: string) => Boolean(v && v.trim().length > 0);

export interface IntegrationHealth {
  key: string;
  label: string;
  configured: boolean;
  detail?: string;
}

/**
 * A structured snapshot of which integrations are configured. Powers the
 * Settings/Integrations page and connection tests. Never returns secret values.
 */
export function envHealth(): IntegrationHealth[] {
  return [
    {
      key: "database",
      label: "PostgreSQL",
      configured: has(env.DATABASE_URL),
      detail: has(env.DATABASE_URL) ? maskUrl(env.DATABASE_URL) : "DATABASE_URL not set",
    },
    {
      key: "openai",
      label: "OpenAI",
      configured: has(env.OPENAI_API_KEY),
      detail: has(env.OPENAI_API_KEY) ? `model: ${env.OPENAI_MODEL}` : "OPENAI_API_KEY not set",
    },
    {
      key: "slack",
      label: "Slack",
      configured: has(env.SLACK_BOT_TOKEN) && has(env.SLACK_CHANNEL_ID),
      detail: has(env.SLACK_CHANNEL_ID)
        ? `channel: ${env.SLACK_CHANNEL_ID}${has(env.SLACK_REPORT_USER_IDS) ? " + direct users" : ""}`
        : "token/channel missing",
    },
    {
      key: "meta_nobl",
      label: "Meta · NOBL",
      configured: has(env.NOBL_META_AD_ACCOUNT_ID) && has(env.NOBL_META_ACCESS_TOKEN),
      detail: has(env.NOBL_META_AD_ACCOUNT_ID) ? env.NOBL_META_AD_ACCOUNT_ID : "account/token missing",
    },
    {
      key: "meta_flo",
      label: "Meta · FLO",
      configured: has(env.FLO_META_AD_ACCOUNT_ID) && has(env.FLO_META_ACCESS_TOKEN),
      detail: has(env.FLO_META_AD_ACCOUNT_ID) ? env.FLO_META_AD_ACCOUNT_ID : "account/token missing",
    },
    {
      key: "tw_nobl",
      label: "Attribution · NOBL US",
      configured: has(env.NOBL_TW_SHOP_ID) && has(env.NOBL_TW_API_KEY),
      detail: env.NOBL_TW_SHOP_ID || "shop/key missing",
    },
    {
      key: "tw_flo",
      label: "Attribution · FLO US",
      configured: has(env.FLO_TW_SHOP_ID) && has(env.FLO_TW_API_KEY),
      detail: env.FLO_TW_SHOP_ID || "shop/key missing",
    },
    {
      key: "tw_nobl_eu",
      label: "Attribution · NOBL EU",
      configured: has(env.NOBL_EU_TW_SHOP_ID) && has(env.NOBL_EU_TW_API_KEY),
      detail: env.NOBL_EU_TW_SHOP_ID || "shop/key missing",
    },
    {
      key: "tw_nobl_uk",
      label: "Attribution · NOBL UK",
      configured: has(env.NOBL_UK_TW_SHOP_ID) && has(env.NOBL_UK_TW_API_KEY),
      detail: env.NOBL_UK_TW_SHOP_ID || "shop/key missing",
    },
  ];
}

/** Mask a database URL so it can be shown in the UI without leaking the password. */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString();
  } catch {
    return "configured";
  }
}

export const hasEnv = has;
