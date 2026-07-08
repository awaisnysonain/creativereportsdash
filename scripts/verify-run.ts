import "./load-env";

async function main() {
  const runId = process.argv[2];
  const { latestSuccessfulRun, getSnapshotForRun } = await import("../src/lib/db/repositories");
  const run = runId ? { id: runId } : await latestSuccessfulRun();
  if (!run) throw new Error("no run found");
  const snapRow = await getSnapshotForRun(run.id);
  if (!snapRow) throw new Error("no snapshot for run " + run.id);
  const snap = snapRow.payload;

  const fmt = (n: number, d = 2) => Number(n ?? 0).toFixed(d);
  for (const w of ["l7", "l30"] as const) {
    const t = snap.topline[w];
    console.log(`\n=== ${w.toUpperCase()} ===`);
    console.log(`Spend:      $${fmt(t.spend, 0)}`);
    console.log(`Creatives:  ${t.creatives}`);
    console.log(`Meta ROAS:  ${fmt(t.metaRoas)}x`);
    console.log(`TW ROAS:    ${fmt(t.twRoas)}x`);
    console.log(`NC ROAS:    ${fmt(t.ncRoas)}x`);
    console.log(`TOF share:  ${fmt(t.tofShare * 100, 1)}%`);
    console.log(`NV%:        ${fmt(t.nvPct * 100, 1)}%`);
    const cats = snap[w].categories.slice(0, 5);
    console.log("Top categories:", cats.map((c) => `${c.label} $${fmt(c.spend, 0)} (TW ${fmt(c.twRoas)}x)`).join(" | "));
  }
  console.log(`\nWinners: ${snap.winners.length}, Decelerators: ${snap.decelerators.length}`);
  if (snap.winners[0]) console.log("Top winner:", snap.winners[0].label, `$${fmt(snap.winners[0].l7Spend, 0)}`);
  console.log("Run:", run.id);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
