import "./load-env";
import { getSnapshot, getReports } from "../src/lib/dashboard-data";

async function main() {
  const runId = process.argv[2] || "run_q0w1d5yqay";
  const snap = await getSnapshot(runId);
  if (!snap) {
    console.log("No snapshot");
    process.exit(1);
  }
  console.log("Winners:", snap.winners.slice(0, 3).map((w) => w.label).join(" | "));
  console.log(
    "Opener thumb:",
    snap.l7.openers
      .slice(0, 5)
      .map((o) => `${o.label}=${Math.round(o.thumbstop * 100)}%`)
      .join(" | "),
  );
  const reports = await getReports(1);
  const md = reports[0]?.markdown ?? "";
  console.log("Disclaimer:", md.includes("Naming convention caveat") ? "yes" : "no");
  console.log("Thumb in md:", md.includes("3-second video plays") ? "yes" : "no");
  console.log("Report id:", reports[0]?.id);
}
main();
