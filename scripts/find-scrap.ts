import "./load-env";

async function main() {
  const { latestSuccessfulRun, getMergedForRun } = await import("../src/lib/db/repositories");
  const run = await latestSuccessfulRun();
  if (!run) throw new Error("no run");
  const merged = await getMergedForRun(run.id, "L7");
  for (const r of merged as any[]) {
    const p = typeof r.parsed === "string" ? JSON.parse(r.parsed) : r.parsed;
    const name = r.ad_name || r.adName || "";
    if (p?.creator && /gift|crafty|andrea|filippo|got.?a.?rule/i.test(String(p.creator) + name)) {
      if (/gift|crafty|andrea|filippo/i.test(String(p.creator))) {
        console.log("CREATOR", p.creator, "|", name.slice(0, 180), "|", Math.round(Number(r.spend) || 0));
      }
    }
    if (/I.?veGotARule|IveGotARule|I'veGotARule/i.test(name) && Number(r.spend) > 1000) {
      console.log("RULE", p?.scriptStem, "→", name.slice(0, 160));
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
