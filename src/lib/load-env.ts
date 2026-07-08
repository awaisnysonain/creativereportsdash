import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Minimal .env loader. Loads .env.local then .env into process.env without
 * overwriting variables already present. Imported as the very first thing in
 * the server / scripts so `env.ts` sees populated values on evaluation.
 */
function loadFile(file: string) {
  const p = path.resolve(process.cwd(), file);
  if (!existsSync(p)) return;
  const content = readFileSync(p, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadFile(".env.local");
loadFile(".env");
