import "./load-env";

async function main() {
  const { latestSuccessfulRun, getSnapshotForRun, getMergedForRun } = await import("../src/lib/db/repositories");
  const run = await latestSuccessfulRun();
  if (!run) throw new Error("no run");
  const snapRow = await getSnapshotForRun(run.id);
  if (!snapRow) throw new Error("no snap");
  const snap = snapRow.payload;

  console.log("=== CATS L7 ===");
  for (const c of snap.l7.categories) console.log(`${c.label}|${c.group}|$${Math.round(c.spend)}|assets=${c.assets}`);
  console.log("=== OPENERS L7 ===");
  for (const c of snap.l7.openers) console.log(`${c.label}|${c.group}|$${Math.round(c.spend)}`);
  console.log("=== COLORS L7 ===");
  for (const c of snap.l7.colors) console.log(`${c.label}|${c.group}|$${Math.round(c.spend)}`);
  console.log("=== DEMOS L7 ===");
  for (const c of snap.l7.demographics.slice(0, 20)) console.log(`${c.label}|${c.group}|$${Math.round(c.spend)}`);
  console.log("=== CREATORS L7 ===");
  for (const c of snap.l7.creators.slice(0, 20)) console.log(`${c.creator}|$${Math.round(c.spend)}`);
  console.log("=== SCRIPTS L7 ===");
  for (const c of snap.l7.scripts.slice(0, 20)) console.log(`${c.scriptStem}|$${Math.round(c.spend)}`);
  console.log("=== WINNERS ===");
  for (const w of snap.winners) console.log(`${w.label} | job=${w.jobNumber}`);
  console.log("=== DECELS ===");
  for (const w of snap.decelerators) console.log(`${w.label} | job=${w.jobNumber}`);

  const merged = await getMergedForRun(run.id, "L7");
  console.log(`\nMerged L7 rows: ${merged.length}`);

  // Find scrap-looking parsed fields
  const scrapCats = new Map<string, number>();
  const scrapOpeners = new Map<string, number>();
  const scrapCreators = new Map<string, number>();
  const scrapStems = new Map<string, number>();
  const samples: string[] = [];

  for (const r of merged as any[]) {
    const p = typeof r.parsed === "string" ? JSON.parse(r.parsed) : r.parsed;
    const spend = Number(r.spend) || 0;
    const name = r.ad_name || r.adName || "";
    if (p?.category && !["UGC","NGC","NTM","GRN","NPD","TXM","PDC","APO","SLF","FPK","SIN","EMD","ASM","SNG","STN","PDS","UGI","BIL"].includes(String(p.category).toUpperCase())) {
      scrapCats.set(p.category, (scrapCats.get(p.category) || 0) + spend);
      if (samples.length < 30) samples.push(`CAT ${p.category} $${Math.round(spend)} ${name}`);
    }
    if (p?.opener && !/^[A-O]\d{1,2}$/i.test(p.opener)) {
      scrapOpeners.set(p.opener, (scrapOpeners.get(p.opener) || 0) + spend);
    }
    if (p?.creator && (/^(creator|influencer|unknown)$/i.test(p.creator) || p.creator.length < 3 || /[0-9]{3}/.test(p.creator))) {
      scrapCreators.set(p.creator, (scrapCreators.get(p.creator) || 0) + spend);
    }
    if (p?.scriptStem && (p.scriptStem.length < 4 || /^(j\d+|tof|mof|bof|vid|img)/i.test(p.scriptStem))) {
      scrapStems.set(p.scriptStem, (scrapStems.get(p.scriptStem) || 0) + spend);
    }
  }
  console.log("\n=== SCRAP CATEGORIES ===");
  console.log([...scrapCats.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20));
  console.log("=== SCRAP OPENERS ===");
  console.log([...scrapOpeners.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20));
  console.log("=== SCRAP CREATORS ===");
  console.log([...scrapCreators.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20));
  console.log("=== SCRAP STEMS ===");
  console.log([...scrapStems.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20));
  console.log("=== SAMPLES ===");
  samples.forEach((s) => console.log(s));

  // convention mix
  const conv = new Map<string, {n:number; spend:number}>();
  for (const r of merged as any[]) {
    const p = typeof r.parsed === "string" ? JSON.parse(r.parsed) : r.parsed;
    const k = p?.convention || "null";
    const e = conv.get(k) || {n:0, spend:0};
    e.n++; e.spend += Number(r.spend)||0;
    conv.set(k, e);
  }
  console.log("=== CONVENTION MIX ===");
  console.log([...conv.entries()]);
}

main().catch((e) => { console.error(e); process.exit(1); });
