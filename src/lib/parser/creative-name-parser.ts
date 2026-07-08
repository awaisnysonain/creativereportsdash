import type { Funnel, ParsedCreative } from "@/types";
import {
  CATEGORY_CODES,
  CATEGORY_NAMING_ERRORS,
  COLOR_CODES,
  COMPANY_CODES,
  COPY_FRAMEWORK_CODES,
  KNOWN_CREATOR_TOKENS,
  LEGACY_ANGLE_CODES,
  LEGACY_AVATAR_CODES,
  LEGACY_STYLE_CODES,
  LP_CODES,
  OPENER_CODES,
  SKU_CODES,
  STRAT_CODES,
  categoryLabel,
  colorCanonical,
  colorLabel,
  demographicsLabel,
  hookLabel,
  openerLabel,
} from "./codebooks";

const FUNNEL_WORDS = new Set(["TOF", "MOF", "BOF"]);
const FORMAT_WORDS = new Set(["VID", "IMG", "CAR", "INT", "VIDEO", "IMAGE", "CAROUSEL"]);

/** Product / concept suffixes that must NOT be treated as creator surnames. */
const NON_CREATOR_TAILS = new Set(
  [
    "Bundle", "Bundles", "Weekender", "CarryOns", "CarryOn", "Luggage", "LuggageSet",
    "Sale", "Stills", "SocialStills", "StickyNotes", "StickyNote", "Statics", "Static",
    "NetNew", "Collection", "Refresh", "Openers", "Opener", "Interview", "Testimonial",
    "Discount", "Organic", "FreeGift", "LPTest", "QuickCuts", "VisualUpgrade",
    "Americas250th", "Americana", "SummerTravel", "TravelSale", "CabinWeekender",
    "AIO", "EBUN", "NDB", "EXP", "AIR", "MULTI", "WEEKBOGO", "CWK", "DUO",
    "TOF", "MOF", "BOF", "TOF1", "BOF1", "MOF1", "Vid", "Img", "Car",
  ].map((s) => s.toLowerCase()),
);

function toDateFromMMDDYY(token: string): string | null {
  if (/^\d{6}$/.test(token)) {
    const mm = token.slice(0, 2);
    const dd = token.slice(2, 4);
    const yy = token.slice(4, 6);
    const month = Number(mm);
    const day = Number(dd);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `20${yy}-${mm}-${dd}`;
    }
  }
  return null;
}

/** Split a raw ad name into normalized tokens, unifying legacy " - " and modern "_". */
function tokenize(raw: string): { tokens: string[]; dotted: string[] } {
  const dotted: string[] = [];
  const ioMatches = raw.match(/(?:016)?\.(?:[A-Z][A-Z0-9]{1,2}\.)+/gi) ?? [];
  for (const m of ioMatches) {
    const codes = m.replace(/^016/, "").split(".").map((s) => s.trim()).filter(Boolean);
    dotted.push(...codes);
  }
  const cleaned = raw.replace(/(?:016)?\.(?:[A-Z][A-Z0-9]{1,2}\.)+/gi, " ");
  // Only treat spaced dashes (" - ") as legacy field separators — never bare
  // hyphens inside tokens (J-0419v1, Carry-On, WhenDidCarry-ons).
  const unified = cleaned.replace(/\s+-\s+/g, "_");
  const tokens = unified
    .split(/[_\s]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
  return { tokens, dotted };
}

interface Extracted {
  fields: Record<string, string>;
  jobNumber: string | null;
  version: string | null;
  baseJob: string | null;
  launchDate: string | null;
  format: string | null;
  funnelToken: Funnel | null;
  whitelisted: boolean;
  descriptionParts: string[];
  handles: string[];
}

function extract(tokens: string[]): Extracted {
  const fields: Record<string, string> = {};
  let jobNumber: string | null = null;
  let version: string | null = null;
  let baseJob: string | null = null;
  let launchDate: string | null = null;
  let format: string | null = null;
  let funnelToken: Funnel | null = null;
  let whitelisted = false;
  const descriptionParts: string[] = [];
  const handles: string[] = [];

  for (const token of tokens) {
    const upper = token.toUpperCase();

    if (token.startsWith("@")) {
      handles.push(token);
      continue;
    }
    // Whitelist flag (WL / wl / -wl)
    if (upper === "WL") {
      whitelisted = true;
      continue;
    }
    if (FUNNEL_WORDS.has(upper)) {
      funnelToken = upper as Funnel;
      continue;
    }
    if (FORMAT_WORDS.has(upper)) {
      format = upper.startsWith("VID")
        ? "Vid"
        : upper.startsWith("IMG") || upper.startsWith("IMA")
          ? "Img"
          : upper.startsWith("CAR")
            ? "Car"
            : "Int";
      continue;
    }
    // Job + version: J0448v1 / J-0419v1 / J6v3 / J0114vv3 / J209v2
    const jobMatch = token.match(/^J-?(\d{1,4})(?:v+(\d+)([A-Za-z]?))?$/i);
    if (jobMatch) {
      // Normalize to J + zero-padded 4 digits when the live token is 3–4 wide;
      // keep short legacy jobs (J2, J11) as-is.
      const digits = jobMatch[1];
      jobNumber = digits.length <= 2 ? `J${digits}` : `J${digits.padStart(4, "0")}`;
      if (jobMatch[2]) version = `v${jobMatch[2]}${jobMatch[3] ?? ""}`;
      continue;
    }
    if (/^v\d+[A-Za-z]?$/i.test(token) && !version) {
      version = token.toLowerCase().replace(/^vv/i, "v");
      continue;
    }
    // Base job: B94 / B148v1 / BJ60 / BJ14v1
    const baseMatch = token.match(/^B(?:J)?([A-Z]?\d{1,4})(?:v+\d+[A-Za-z]?)?$/i);
    if (baseMatch && upper !== "BOF") {
      baseJob = `B${baseMatch[1]}`;
      continue;
    }
    if (!launchDate) {
      const d = toDateFromMMDDYY(token);
      if (d) {
        launchDate = d;
        continue;
      }
    }
    const posMatch = token.match(/^(\d{3})(.*)$/);
    if (posMatch) {
      const pos = posMatch[1];
      const val = posMatch[2];
      const posNum = Number(pos);
      if (posNum >= 0 && posNum <= 16 && val) {
        if (!fields[pos]) fields[pos] = val;
        continue;
      }
    }
    if (/^LP[0-9A-Z]{1,4}$/i.test(token)) {
      fields["LP"] = token.toUpperCase();
      continue;
    }
    if (/^(Evergreen|Sale|BlackFriday|EasterSale|ValentinesDay|ValentinesSale|NoblDay|Holiday|BOGO|AmericanaCollection|SummerTravelSale|July4thSale|4thOfJulySale|FathersDaySale|PrimeTimeSale|CanadaDaySale|MemorialDay)/i.test(token)) {
      if (!fields["PROMO"]) fields["PROMO"] = token;
      continue;
    }
    descriptionParts.push(token);
  }

  // Drop legacy customer-avatar tokens that leaked into open-entry copies.
  const cleanedDesc = descriptionParts.filter(
    (t) => !/^(SavvyTraveler|FunctionalTraveler|ReadyToBuy|MaleTraveler|StyleTraveler|FrequentTraveler|MaleRelaxing)/i.test(t),
  );

  return {
    fields,
    jobNumber,
    version,
    baseJob,
    launchDate,
    format,
    funnelToken,
    whitelisted,
    descriptionParts: cleanedDesc,
    handles,
  };
}

function detectConvention(fields: Record<string, string>, funnelToken: Funnel | null): "modern" | "legacy" | "unknown" {
  const f008 = (fields["008"] ?? "").toUpperCase();
  if (FUNNEL_WORDS.has(f008)) return "legacy";
  const f005 = (fields["005"] ?? "").toUpperCase();
  const f007 = (fields["007"] ?? "").toUpperCase();
  if (LEGACY_ANGLE_CODES[f005] && (LEGACY_STYLE_CODES[f007] || fields["006"])) return "legacy";
  const f003 = (fields["003"] ?? "").toUpperCase();
  if (funnelToken && (CATEGORY_CODES[f003] || fields["006"])) return "modern";
  if (fields["005"] && /^[A-O]\d/i.test(fields["005"])) return "modern";
  if (Object.keys(fields).length > 0) return funnelToken ? "modern" : "unknown";
  return "unknown";
}

/** Split PascalCase / camelCase glued words into tokens. */
function splitPascal(raw: string): string[] {
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function humanizeName(parts: string[]): string {
  return parts
    .map((p) => (p === p.toUpperCase() && p.length <= 3 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ")
    .trim();
}

function isLikelyPersonToken(token: string): boolean {
  if (!token || token.length < 2) return false;
  if (NON_CREATOR_TAILS.has(token.toLowerCase())) return false;
  if (/^\d+$/.test(token)) return false;
  if (/^(TOF|MOF|BOF)\d*$/i.test(token)) return false;
  if (SKU_CODES[token.toUpperCase()]) return false;
  // Reject obvious product/promo/concept words glued after a person name.
  if (
    /sale|bundle|weekender|luggage|static|opener|carry|collection|refresh|organic|discount|sticky|social|still|test|gatekeep|americas|americana|cabin|netto?new|crafty|gift|evergreen|airport|theft|durability|reasons|discount|sticky|launch|statics?/i.test(
      token,
    )
  ) {
    return false;
  }
  return /^[A-Za-z][A-Za-z'-]*$/.test(token);
}

/**
 * Extract a person name from an open-entry description.
 * Handles Influencer/Influence typo prefixes and trailing product suffixes.
 */
function extractCreatorFromOpenEntry(
  description: string,
  handles: string[],
  opts: { whitelisted?: boolean } = {},
): {
  creator: string | null;
  type: "Creator" | "Influencer" | "Unknown";
  cleanDescription: string;
} {
  // Script / brand families are never creators.
  if (/gfgiftcrafty|giftcrafty/i.test(description) && !/influencer|influence/i.test(description)) {
    return { creator: null, type: "Unknown", cleanDescription: description };
  }
  const isInfluencerTagged =
    /influenc(?:er|e)|influncer/i.test(description) || handles.some((h) => /influencer/i.test(h));
  const allowGuess = Boolean(opts.whitelisted) || isInfluencerTagged;

  // Prefer known creator tokens (longest first) — always safe.
  const knownSorted = [...KNOWN_CREATOR_TOKENS].sort((a, b) => b.length - a.length);
  for (const known of knownSorted) {
    if (new RegExp(known, "i").test(description)) {
      return {
        creator: known.replace(/([a-z])([A-Z])/g, "$1 $2"),
        type: isInfluencerTagged ? "Influencer" : "Creator",
        cleanDescription: description.replace(new RegExp(known, "ig"), " ").replace(/\s+/g, " ").trim(),
      };
    }
  }

  // Strip influencer prefix typos, then take leading person-name words until a product tail.
  let work = description
    .replace(/^(Influencer|Influence|Influncer|Influencr)/i, "")
    .replace(/^(R\d+)/i, "") // R1 cohort marker
    .replace(/^(Weekender)/i, "") // InfluencerWeekenderSarahLauren
    .trim();

  const words = splitPascal(work);
  const person: string[] = [];
  for (const w of words) {
    if (!isLikelyPersonToken(w)) break;
    // Stop before glued concept / promo word in a name.
    if (
      /^(When|Why|How|Not|Did|Got|Buy|Bought|Free|Its|Itsthe|My|Ex|Ridge|TSA|Blue|Pen|Evergreen|Bundle|Sale)$/i.test(w) &&
      person.length >= 1
    ) {
      break;
    }
    person.push(w);
    if (person.length >= 3) break;
  }

  const singleOk = person.length === 1 && /^(Andrew|Mauro|Chisannah)$/i.test(person[0]);
  if (allowGuess && (person.length >= 2 || singleOk)) {
    const creator = humanizeName(person);
    const creatorCompact = person.join("");
    const cleaned = description.replace(new RegExp(creatorCompact, "i"), " ").replace(/\s+/g, " ").trim();
    return {
      creator,
      type: isInfluencerTagged ? "Influencer" : "Creator",
      cleanDescription: cleaned || description,
    };
  }

  // Trailing person heuristic (ReasonsShortEllieTat / ItstheCabinWeekenderMaylinPino)
  // Only when WL / Influencer-tagged — otherwise script titles get mistaken for people.
  if (allowGuess) {
    const trailing = [...words];
    const tailPerson: string[] = [];
    while (trailing.length) {
      const w = trailing[trailing.length - 1];
      if (!isLikelyPersonToken(w)) break;
      tailPerson.unshift(trailing.pop()!);
      if (tailPerson.length >= 2) break;
    }
    if (tailPerson.length >= 2 || (tailPerson.length === 1 && tailPerson[0].length >= 4)) {
      const creator = humanizeName(tailPerson);
      return {
        creator,
        type: isInfluencerTagged ? "Influencer" : "Creator",
        cleanDescription: trailing.join(" "),
      };
    }
  }

  // Lowercase trailing handle (legacy " - mauro - wl")
  const lowerHandle = description.match(/\b(mauro|andrew)\b/i);
  if (lowerHandle && (allowGuess || opts.whitelisted)) {
    return {
      creator: humanizeName([lowerHandle[1]]),
      type: "Creator",
      cleanDescription: description.replace(lowerHandle[0], " ").replace(/\s+/g, " ").trim(),
    };
  }

  if (handles.length && allowGuess) {
    return { creator: handles[0], type: isInfluencerTagged ? "Influencer" : "Creator", cleanDescription: description };
  }

  return { creator: null, type: isInfluencerTagged ? "Influencer" : "Unknown", cleanDescription: description };
}

/**
 * Normalize the open-entry script stem for reporting:
 * strip funnel/version/SKU noise, collapse repeats, humanize PascalCase.
 */
export function cleanScriptStem(raw: string, creator: string | null): string | null {
  let stem = raw ?? "";
  if (creator) {
    const compact = creator.replace(/\s+/g, "");
    stem = stem.replace(new RegExp(compact, "ig"), " ");
    stem = stem.replace(new RegExp(creator.replace(/\s+/g, "\\s*"), "ig"), " ");
  }
  // Normalize curly/smart apostrophes so I'veGotARule tokenizes cleanly.
  stem = stem.replace(/[\u2019']/g, "");
  stem = stem
    .replace(/\b(Influencer|Influence|Influncer|Influencr)\b/gi, " ")
    .replace(/(TOF|MOF|BOF)\d*/gi, " ")
    .replace(/\bJ-?\d{1,4}(?:v+\d+[A-Za-z]?)?\b/gi, " ")
    .replace(/\bv+\d+[A-Za-z]?\b/gi, " ")
    .replace(/\b(AIO|EBUN|NDB|EXP|AIR|MULTI|WEEKBOGO|CWK|DUO|WEEK)\b/gi, " ")
    .replace(/\bB(?:J)?\d{1,5}(?:v+\d+[A-Za-z]*)*\b/gi, " ")
    .replace(/\b(Evergreen|OTHERS?|OTHER|Branded|Bundle\s*Sale|Sale)\b/gi, " ")
    .replace(/\b(SavvyTraveler|FunctionalTraveler|ReadyToBuy|MaleTraveler|StyleTraveler|FrequentTraveler)\b/gi, " ")
    .replace(/\b\d{6}\b/g, " ")
    .replace(/\b0{2,3}\d{0,3}\b/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Collapse duplicated halves (legacy open entry repeated inside 003).
  const words = stem.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2;
    const a = words.slice(0, half).join(" ").toLowerCase();
    const b = words.slice(half).join(" ").toLowerCase();
    if (a === b) stem = words.slice(0, half).join(" ");
  }

  // Drop consecutive duplicate words.
  stem = stem
    .split(/\s+/)
    .filter((w, i, arr) => i === 0 || w.toLowerCase() !== arr[i - 1].toLowerCase())
    .join(" ");

  stem = stem.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  // Fix common apostrophe-loss artifacts: "I ve" → "Ive", "Got ARule" → "Got A Rule"
  stem = stem
    .replace(/\bI ve\b/gi, "Ive")
    .replace(/\bA Rule\b/gi, "A Rule")
    .replace(/\bARule\b/g, "A Rule")
    .replace(/\bGota Rule\b/gi, "Got A Rule")
    .replace(/\bGot ARule\b/gi, "Got A Rule")
    .replace(/\s+/g, " ")
    .trim();
  if (stem.length >= 3) return stem;
  return null;
}

function guessCreator(
  description: string,
  handles: string[],
  opts: { whitelisted?: boolean } = {},
): {
  creator: string | null;
  type: "Creator" | "Influencer" | "Unknown";
  cleanDescription: string;
} {
  return extractCreatorFromOpenEntry(description, handles, opts);
}

/**
 * Parse a Meta ad name into structured creative attributes. Fault-tolerant: any
 * unparseable name still returns a valid object with `convention: "unknown"`.
 */
export function parseCreativeName(raw: string): ParsedCreative {
  const safeRaw = (raw ?? "").toString();
  const { tokens, dotted } = tokenize(safeRaw);
  const ex = extract(tokens);
  const convention = detectConvention(ex.fields, ex.funnelToken);
  const f = ex.fields;

  // Legacy: open entry often lives inside 003 when name starts at 000...
  let description = ex.descriptionParts.join(" ").trim();
  if (!description && f["003"] && !CATEGORY_CODES[(f["003"] ?? "").toUpperCase()]) {
    description = String(f["003"]).replace(/^\d{6}_?/, "").trim();
  }

  const { creator, type, cleanDescription } = guessCreator(
    description || `${f["003"] ?? ""} ${f["002"] ?? ""}`,
    ex.handles,
    { whitelisted: ex.whitelisted },
  );

  let category: string | null = null;
  let categoryLbl: string | null = null;
  let opener: string | null = null;
  let hook: string | null = null;
  let color: string | null = null;
  let openerColor: string | null = null;
  let bodyColor: string | null = null;
  let copyFramework: string | null = null;
  let length: string | null = null;
  let demographics: string | null = null;

  const cat003 = (f["003"] ?? "").toUpperCase();
  // Only accept real category builder codes (or flagged naming errors). Long 003 open-entries are not categories.
  if (CATEGORY_CODES[cat003] || CATEGORY_NAMING_ERRORS.has(cat003)) {
    category = cat003;
    categoryLbl = categoryLabel(cat003);
  }

  const op005 = (f["005"] ?? "").toUpperCase();
  if (OPENER_CODES[op005]) {
    opener = op005;
  }

  if (convention === "legacy") {
    const c004 = colorCanonical(f["004"]);
    if (c004) color = openerColor = c004;
    demographics = null;
    length = f["010"] ?? null;
  } else {
    hook = f["006"] ?? null;
    const c007 = colorCanonical(f["007"]);
    const c008 = colorCanonical(f["008"]);
    if (c007) openerColor = c007;
    if (c008) bodyColor = c008;
    color = openerColor ?? bodyColor ?? null;
    copyFramework = f["004"] ?? null;
    const d013 = (f["013"] ?? "").toUpperCase();
    // Demographics only when format matches F2W / MULTI / NA — never country codes.
    if (d013 === "MULTI" || d013 === "NA" || /^[FM][1-6][A-Z]$/.test(d013)) {
      demographics = d013;
    } else {
      demographics = null;
    }
    const lenCandidate = [f["011"], f["010"], f["009"]].find((v) => v && /(\d{1,3}s|LONG)/i.test(v));
    length = lenCandidate ?? null;
  }

  const funnel: Funnel = ex.funnelToken ?? "TOF";
  const scriptStem = cleanScriptStem(cleanDescription || description, creator) ?? ex.jobNumber;

  const keyFields = [f["000"], f["001"], f["003"], f["005"], color, ex.jobNumber, ex.funnelToken];
  const recognized = keyFields.filter(Boolean).length;
  const confidence = convention === "unknown" ? 0.1 : Math.min(1, 0.35 + recognized * 0.1);

  return {
    raw: safeRaw,
    convention,
    confidence: Number(confidence.toFixed(2)),
    launchDate: ex.launchDate,
    jobNumber: ex.jobNumber,
    version: ex.version,
    baseJob: ex.baseJob,
    description: description || null,
    format: ex.format,
    sku: f["000"] ?? null,
    promo: f["PROMO"] ?? null,
    whitelisted: ex.whitelisted,
    landingPage: f["LP"] ?? null,
    company: f["001"] ?? null,
    companyLabel: f["001"] ? COMPANY_CODES[f["001"].toUpperCase()] ?? f["001"] : null,
    strat: f["002"] ?? null,
    stratLabel: f["002"] ? STRAT_CODES[f["002"].toUpperCase()] ?? f["002"] : null,
    category,
    categoryLabel: categoryLbl,
    copyFramework,
    opener,
    openerLabel: openerLabel(opener),
    hook,
    hookLabel: hookLabel(hook),
    openerColor,
    openerColorLabel: colorLabel(openerColor),
    bodyColor,
    bodyColorLabel: colorLabel(bodyColor),
    color,
    colorLabel: colorLabel(color),
    length,
    demographics,
    demographicsLabel: demographicsLabel(demographics),
    country: f["014"] ?? (convention === "legacy" ? f["013"] ?? null : null),
    adCopyId: f["015"] ?? null,
    infoOrder: dotted.length ? dotted : f["016"] ? f["016"].split(".").filter(Boolean) : [],
    funnel,
    creator,
    creatorType: type,
    scriptStem,
    fields: f,
  };
}

/**
 * Refine funnel classification using campaign / ad set names when available.
 * Rules: retargeting / ASC+ promo / BOF cues → BOF; otherwise keep parsed value.
 */
export function classifyFunnel(parsed: ParsedCreative, campaignName?: string | null, adsetName?: string | null): Funnel {
  const hay = `${campaignName ?? ""} ${adsetName ?? ""}`.toLowerCase();
  if (parsed.funnel && parsed.funnel !== "TOF") return parsed.funnel;
  if (/\b(bof|retarget|retargeting|rt\b|asc\+|advantage\+ shopping|promo|dpa|catalog)\b/.test(hay)) {
    return "BOF";
  }
  if (/\b(mof|consideration)\b/.test(hay)) return "MOF";
  return parsed.funnel ?? "TOF";
}

export { SKU_CODES, LP_CODES, LEGACY_AVATAR_CODES, COPY_FRAMEWORK_CODES, COLOR_CODES };
