/**
 * Codebooks / mappings for the NOBL–FLO creative naming convention.
 *
 * Sourced directly from the "NEW NAME BUILDING" master sheet reference tabs
 * (Convention Reference, 001-Company, 002-Strat, 003-Category, 004-Copywriting,
 * 005-Opener, 006-Hook, 007008-Color codes, 013 Demographics, LP).
 *
 * Two conventions coexist in live ad names:
 *   • modern (underscore separated):  061526_J0448v1_Desc_TOF_Vid_B60_000AIO_..._001NYS_002LK_003UGC_005L1_006SP005_007HPK_008..._013F1W_014USA_015AAT_016.H1.S1.
 *   • legacy (" - " separated):       000AIO - 001NYS - 002PEN - 003TSABluePen - 004WHT - 005SE - 006STT - 007VO - 008TOF - ...
 *
 * The numeric position meaning DIFFERS between them (see LEGACY_* maps), so the
 * parser interprets each with the correct schema.
 */

export const SKU_CODES: Record<string, string> = {
  AIO: "All-In-One Carry-On",
  WK: "Weekender",
  EX: "Expandable",
  EXP: "Expandable",
  DUO: "Duo Carry",
  MULTI: "Multiple SKUs",
  EBUN: "6.0 Bundle",
  NDB: "NOBL Duo Bundle",
  AIR: "NOBL Air",
  EBUNAIR: "Bundle + Air",
  AL: "Aluminum",
  CI: "Check-In",
  WEEKBOGO: "Weekender BOGO",
};

export const COMPANY_CODES: Record<string, string> = {
  NYS: "Internal (Nysonian)",
  TS: "Tubescience",
  UGC: "UGC",
  GV: "GV",
  AGE: "Agency",
  TK: "TK",
  SAV: "Savannah",
  SAVANNAH: "Savannah",
  ORG: "Organic",
  INH: "In-house",
  FT: "FT",
  INF: "Influencer",
  M305: "305 Media",
};

export const STRAT_CODES: Record<string, string> = {
  FA: "Franz",
  TC: "Taylor",
  LK: "Luke",
  CA: "CA",
  NOP: "NOP",
};

/** 003 — Category. Modern convention. Sourced from both video + image builders. */
export const CATEGORY_CODES: Record<string, string> = {
  UGC: "On camera UGC",
  NGC: "Voice over UGC",
  NTM: "Native Testimonial",
  GRN: "Green Screen",
  NPD: "Notepad",
  TXM: "Text Message",
  PDC: "Podcast",
  APO: "Apology",
  SLF: "Self Talk",
  FPK: "Factory Packing",
  SIN: "Street Interview",
  EMD: "Earned Media",
  ASM: "ASMR",
  SNG: "Song",
  STN: "Sticky Note",
  PDS: "Product Shot", // image builder
  UGI: "User Generated Image", // image builder
  BIL: "Billboard", // image builder
};

/** Codes that appear in live names but are not in either builder → flag, don't invent. */
export const CATEGORY_NAMING_ERRORS = new Set(["TOS"]);

export const COPY_FRAMEWORK_CODES: Record<string, string> = {
  AIDA: "Attention, Interest, Desire, Action",
  PS: "Problem, Agitation, Solution",
  FAB: "Features, Advantages, Benefits",
  "4P": "Promise, Picture, Prove, Push",
  BAB: "Before, After, Bridge",
  SS: "Star, Solution",
  Reason: "Numbered reasons",
  NR: "Negative reasons",
  NegativeReason: "Negative reasons",
};

/** 007 / 008 — Color codes. */
export const COLOR_CODES: Record<string, string> = {
  FGN: "Forest Green",
  JBK: "Jet Black",
  MBL: "Midnight Blue",
  SIL: "Silver",
  CRD: "Cherry Red",
  LAV: "Lavender",
  BLS: "Blush",
  HPK: "Hot Pink",
  SND: "Sand",
  IVY: "Ivory",
  PBL: "Powder Blue",
  MNT: "Mint",
  SGE: "Sage",
  SLT: "Slate",
  SOR: "Sorbet Orange",
  BGY: "Burgundy",
  IBL: "Ice Blue",
  BYL: "Butter Yellow",
  TER: "Terracotta",
  CRM: "Caramel",
  MULTI: "Multiple colors",
  NA: "Not applicable",
  // Legacy 004 color codes → same canonical names (from process doc)
  YLW: "Butter Yellow",
  GRN: "Forest Green",
  BLK: "Jet Black",
  ICE: "Ice Blue",
  WHT: "White",
  BBL: "Baby Blue",
  PK: "Pink",
  PCH: "Blush", // peach variant seen in legacy
};

/**
 * Map any color token (legacy or modern) onto one canonical code, so YLW and
 * BYL both report as Butter Yellow under the same breakout key.
 */
export const COLOR_CANONICAL: Record<string, string> = {
  YLW: "BYL",
  GRN: "FGN",
  BLK: "JBK",
  ICE: "IBL",
  PCH: "BLS",
};

export function colorCanonical(code?: string | null): string | null {
  if (!code) return null;
  const up = code.toUpperCase();
  if (!COLOR_CODES[up]) return null;
  return COLOR_CANONICAL[up] ?? up;
}

/**
 * 005 — Opener codebook. Codes are <ColumnLetter><Row> from the opener matrix.
 * Column letter = concept family, row = specific execution.
 */
export const OPENER_FAMILIES: Record<string, string> = {
  A: "Feature Highlight",
  B: "Problem Highlight",
  C: "Split Screen",
  D: "Product",
  E: "Unboxing",
  F: "Airport",
  G: "Viral",
  H: "Factory",
  J: "Direct-to-Camera Testimonial",
  K: "Attention Hook",
  L: "In Public",
  M: "Destruction",
  N: "Packing",
  O: "Sticky Note",
};

export const OPENER_CODES: Record<string, string> = {
  A1: "Feature: Zipperless",
  A2: "Feature: 360 Spinner Wheels",
  A3: "Feature: Front Pocket",
  A4: "Feature: Cup Holder",
  A5: "Feature: Phone Holder",
  A6: "Feature: NOBL Air",
  A7: "Feature: Unbreakable",
  A8: "Feature: Waterproof Pocket",
  A9: "Feature: Trolley Sleeve",
  A10: "Feature: Bag Hooks",
  B1: "Problem: Zipper Break-in",
  B2: "Problem: Lost Luggage",
  B3: "Problem: Disorganized",
  B4: "Problem: Check-in Breaking",
  C1: "Split: Zipper vs Zipperless",
  C2: "Split: Disorganized vs Organized",
  C3: "Split: Competitor Comparison",
  D1: "Product: Close-up Front",
  D2: "Product: POV Looking Down",
  D3: "Product: Talent Posing",
  D4: "Product: Comparison to Competitor",
  D5: "Product: Single on Colored Bg",
  D6: "Product: Single in Space",
  D7: "Product: Multiple on Colored Bg",
  D8: "Product: Multiple in Space",
  E1: "Unboxing: POV",
  E2: "Unboxing: Talent",
  F1: "Airport: POV",
  F2: "Airport: Talent Walking",
  F3: "Airport: POV of NOBL",
  F4: "Airport: Into Overhead",
  F5: "Airport: Through Security",
  F6: "Airport: Baggage Claim",
  G1: "Viral: TikTok Freakouts",
  H1: "Factory: Being Made",
  H2: "Factory: Being Packed",
  H3: "Factory: Being Tested",
  J1: "D2C: NOBL On Screen",
  J2: "D2C: No NOBL On Screen",
  K1: "Attention Hook",
  L1: "In Public: General Outdoors",
  L2: "In Public: Local Landmark",
  L3: "In Public: Billboard",
  M1: "Destruction: Non-NOBL Luggage",
  N1: "Packing Luggage",
  N2: "Packing: Hyperlapse",
  O1: "Sticky Note",
};

/**
 * 006 — Hook theme prefixes. Full hook codes are like SP005, SE001, PR003.
 * We map the alpha prefix to its theme; the numeric suffix is the specific line.
 */
export const HOOK_THEME_PREFIXES: Record<string, string> = {
  SP: "Social Proof",
  SE: "Security",
  NF: "Negative Feature",
  PR: "Promo",
  ST: "Stress",
  CR: "Curiosity / Reveal",
  ID: "Identity",
  GF: "Gift Story",
  AR: "Arrival",
  DC: "Durability",
  LS: "Listicle",
  LF: "Lifestyle",
  SN: "Trip Setup",
  CC: "Comparison",
  FX: "FOMO / Regret",
  AP: "Apology",
  FD: "Founder",
};

/** 013 — Demographics: [Gender][Age][Race] or MULTI. */
export const DEMO_GENDER: Record<string, string> = { F: "Female", M: "Male" };
export const DEMO_AGE: Record<string, string> = {
  "1": "18-24",
  "2": "25-34",
  "3": "35-44",
  "4": "45-54",
  "5": "55-64",
  "6": "65+",
};
export const DEMO_RACE: Record<string, string> = {
  W: "White",
  B: "Black",
  H: "Hispanic",
  E: "East Asian",
  S: "South Asian",
  M: "Middle Eastern",
  X: "Multiracial",
};

/** Legacy convention position meanings (differ from modern). */
// Legacy 005 = Angle
export const LEGACY_ANGLE_CODES: Record<string, string> = {
  SE: "Security",
  US: "USP",
  PS: "Problem/Solution",
  AU: "Authority",
  SA: "Sale",
  DU: "Durability",
  MU: "Multi",
};
// Legacy 006 = Customer avatar
export const LEGACY_AVATAR_CODES: Record<string, string> = {
  FUT: "Frequent Traveler",
  STT: "Style-conscious Traveler",
  SVT: "Savvy Traveler",
  TGT: "Target",
};
// Legacy 007 = Style
export const LEGACY_STYLE_CODES: Record<string, string> = {
  VO: "Voiceover",
  DEMO: "Demo",
  MON: "Monologue",
  UGC: "UGC",
};

/** Landing pages (LP codes → human label). Abbreviated from LP tab. */
export const LP_CODES: Record<string, string> = {
  LP001: "All-in-One PDP",
  LP002: "Expandable PDP",
  LP003: "6.0 Bundle PDP",
  LP004: "Weekender BOGO PDP",
  LP005: "Weekender PDP",
  LP006: "Duo Carry PDP",
  LP007: "Duo Bundle PDP",
  LP008: "Security LP",
  LP009: "Competitor Comparison LP",
  LP00V: "Bundle Broke Internet LP",
};

/** Known talent/creator surnames extracted from historical job descriptions.
 * Helps the parser detect the creator token embedded in open-entry descriptions. */
export const KNOWN_CREATOR_TOKENS = [
  "AliciaEngle",
  "ShelbyMorisseau",
  "DavisOkeyAzunnah",
  "ChristinaHaltner",
  "WanPingZipfel",
  "DaveBrett",
  "SarahLauren",
  "KylaCentomo",
  "GabiCross",
  "MaylinPino",
  "MelissaMerk",
  "JabbarLewis",
  "KellyPrince",
  "SophiaAllen",
  "EllieTat",
  "RiannBurton",
  "JosephBourne",
  "AngeleneSusanna",
  "DanielTeng",
  "LiliiaAlfavitska",
  "EllenHellkvist",
  "VanessaVanmus",
  "SukhmanBaggri",
  "SukhmanBaghri",
  "NataliiaDanko",
  "RebeccaHart",
  "AndreaDiFilippo",
  "YuliyaBezpalko",
  "Chisannah",
  "Andrew",
  "Mauro",
];

export function colorLabel(code?: string | null): string | null {
  if (!code) return null;
  return COLOR_CODES[code.toUpperCase()] ?? code;
}

export function openerLabel(code?: string | null): string | null {
  if (!code) return null;
  const up = code.toUpperCase();
  if (OPENER_CODES[up]) return OPENER_CODES[up];
  const family = OPENER_FAMILIES[up[0]];
  return family ? `${family} (${code})` : code;
}

export function hookLabel(code?: string | null): string | null {
  if (!code) return null;
  const prefix = code.replace(/[0-9]+$/, "").toUpperCase();
  const theme = HOOK_THEME_PREFIXES[prefix];
  return theme ? `${theme} (${code})` : code;
}

export function categoryLabel(code?: string | null): string | null {
  if (!code) return null;
  const up = code.toUpperCase();
  if (CATEGORY_CODES[up]) return CATEGORY_CODES[up];
  if (CATEGORY_NAMING_ERRORS.has(up)) return `${up} (naming error)`;
  return code;
}

export function demographicsLabel(code?: string | null): string | null {
  if (!code) return null;
  if (code.toUpperCase() === "MULTI") return "Multi-talent";
  const m = code.toUpperCase().match(/^([FM])([1-6])([A-Z])$/);
  if (!m) return code;
  const [, g, a, r] = m;
  return `${DEMO_GENDER[g] ?? g}, ${DEMO_AGE[a] ?? a}, ${DEMO_RACE[r] ?? r}`;
}
