import "./load-env";

/**
 * Verifies connectivity to every configured integration and prints a report.
 * Safe to run any time: `npm run test:connections`.
 */
async function main() {
  const { META_ACCOUNTS, TW_STORES } = await import("../src/config/brands");
  const { testMetaConnection } = await import("../src/lib/services/meta");
  const { testTwConnection } = await import("../src/lib/services/triplewhale");
  const { testSlackConnection } = await import("../src/lib/services/slack");
  const { pingDb } = await import("../src/lib/db/client");
  const { env } = await import("../src/lib/env");

  const line = (ok: boolean, label: string, detail: string) =>
    console.log(`${ok ? "✓" : "✗"}  ${label.padEnd(28)} ${detail}`);

  console.log("\n── Creative Reports · Connection Tests ─────────────────────\n");

  const db = await pingDb();
  line(db.ok, "PostgreSQL", db.ok ? `${db.latencyMs}ms` : db.error ?? "failed");

  line(Boolean(env.OPENAI_API_KEY), "OpenAI (key present)", env.OPENAI_API_KEY ? `model ${env.OPENAI_MODEL}` : "no key");

  const slack = await testSlackConnection();
  line(slack.ok, "Slack", slack.detail);

  for (const a of META_ACCOUNTS) {
    if (!a.configured) {
      line(false, `Meta · ${a.label}`, "not configured");
      continue;
    }
    const r = await testMetaConnection(a.key);
    line(r.ok, `Meta · ${a.label}`, r.detail);
  }

  for (const s of TW_STORES) {
    if (!s.configured) {
      line(false, `TW · ${s.label}`, "not configured");
      continue;
    }
    const r = await testTwConnection(s.key);
    line(r.ok, `TW · ${s.label}`, r.detail);
  }

  console.log("\n────────────────────────────────────────────────────────────\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
