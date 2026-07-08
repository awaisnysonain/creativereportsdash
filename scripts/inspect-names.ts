import "./load-env";
import { parseCreativeName } from "../src/lib/parser/creative-name-parser";
import { scriptStemForTracking } from "../src/lib/analytics";

async function main() {
  const { latestSuccessfulRun, getMergedForRun } = await import("../src/lib/db/repositories");
  const run = await latestSuccessfulRun();
  if (!run) throw new Error("no run");
  const merged = await getMergedForRun(run.id, "L7");

  const scrapCreators = new Set([
    "Americana Collection", "Mauro", "Andrew", "Travel Sale", "Cross Weekender",
    "Ellie Tat", "Maylin Pino", "Carry Ons", "Net New", "Merk Bundle", "Lauren Bundle", "Luggage Set",
  ]);

  console.log("=== Scrap creator source names ===");
  let n = 0;
  for (const r of merged as any[]) {
    const p = typeof r.parsed === "string" ? JSON.parse(r.parsed) : r.parsed;
    if (!p?.whitelisted || !p.creator) continue;
    if (!scrapCreators.has(p.creator) && !/Sale|Bundle|Ons|Collection|Weekender|Luggage|Net New/i.test(p.creator)) continue;
    const name = r.ad_name || r.adName;
    const re = parseCreativeName(name);
    console.log("\nNAME:", name);
    console.log("  old creator:", p.creator, "wl:", p.whitelisted, "desc:", p.description, "job:", p.jobNumber, "stem:", p.scriptStem);
    console.log("  reparse creator:", re.creator, "desc:", re.description, "job:", re.jobNumber, "stem:", re.scriptStem, "conv:", re.convention);
    console.log("  tracking stem:", scriptStemForTracking(re));
    if (++n >= 25) break;
  }

  console.log("\n=== Bad script stems samples ===");
  n = 0;
  for (const r of merged as any[]) {
    const name = r.ad_name || r.adName;
    const re = parseCreativeName(name);
    const stem = scriptStemForTracking(re);
    if (/^(J\s?\d|TOF|AIO\b)/i.test(stem) || /TOF\d|BOF\d| 00\d|J \d/.test(stem) || stem.length < 5) {
      console.log(stem, "|", name.slice(0, 140));
      if (++n >= 25) break;
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
