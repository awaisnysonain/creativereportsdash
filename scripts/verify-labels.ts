import "./load-env";

async function main() {
  const runId = process.argv[2];
  const { latestSuccessfulRun, getSnapshotForRun } = await import("../src/lib/db/repositories");
  const run = runId ? { id: runId } : await latestSuccessfulRun();
  if (!run) throw new Error("no run");
  const snapRow = await getSnapshotForRun(run.id);
  if (!snapRow) throw new Error("no snap");
  const snap = snapRow.payload;

  console.log("=== CREATORS (should be real people) ===");
  for (const c of snap.l7.creators.slice(0, 15)) console.log(`  ${c.creator} | $${Math.round(c.spend)}`);
  console.log("=== SCRIPTS (no TOF1 / JXXXX scrap) ===");
  for (const c of snap.l7.scripts.slice(0, 15)) console.log(`  ${c.scriptStem} | $${Math.round(c.spend)}`);
  console.log("=== COLORS (no legacy duplicates) ===");
  for (const c of snap.l7.colors.slice(0, 12)) console.log(`  ${c.label}|${c.group} | $${Math.round(c.spend)}`);
  console.log("=== WINNERS ===");
  for (const w of snap.winners) console.log(`  ${w.label} | job=${w.jobNumber}`);
  console.log("=== DECELS ===");
  for (const w of snap.decelerators) console.log(`  ${w.label} | job=${w.jobNumber}`);
  console.log("Run:", run.id);
}

main().catch((e) => { console.error(e); process.exit(1); });
