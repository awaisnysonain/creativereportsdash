import * as XLSX from "xlsx";
import path from "node:path";

const file = process.argv[2] ?? "NEW NAME BUILDING  (8).xlsx";
const wb = XLSX.readFile(path.resolve(process.cwd(), file));

const target = [
  "Convention Reference",
  "000- Sku",
  "001- Company",
  "002 - Strat",
  "003 - Category",
  "004- Copywriting Framework",
  "005- Opener",
  "006 -Hook ",
  "007008- Color codes ",
  "009010- text treatment",
  "013 Demographics Key",
  "016 - Info order element key",
  "LP",
  "Convention Key",
];

for (const name of target) {
  const ws = wb.Sheets[name];
  if (!ws) {
    console.log(`\n### MISSING SHEET: ${name}`);
    continue;
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: 1, defval: "" });
  console.log(`\n================= SHEET: ${name} (${rows.length} rows) =================`);
  for (const row of rows.slice(0, 120)) {
    const cells = (row as unknown as unknown[]).map((c) => String(c ?? "").trim()).filter(Boolean);
    if (cells.length) console.log(cells.join(" | "));
  }
}
