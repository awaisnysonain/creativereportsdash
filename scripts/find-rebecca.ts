import "./load-env";
async function main() {
  const { latestSuccessfulRun, getMergedForRun } = await import("../src/lib/db/repositories");
  const run = await latestSuccessfulRun();
  const merged = await getMergedForRun(run!.id, "L7");
  for (const r of merged as any[]) {
    const p = typeof r.parsed === "string" ? JSON.parse(r.parsed) : r.parsed;
    if (p?.creator === "Rebecca Hart Evergreen" || /RebeccaHart/i.test(r.ad_name || r.adName || "")) {
      console.log(p?.creator, "|", (r.ad_name || r.adName || "").slice(0, 180));
    }
  }
}
main();
