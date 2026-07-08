import { parseCreativeName } from "../src/lib/parser/creative-name-parser";
import { scriptStemForTracking } from "../src/lib/analytics";

const samples = [
  "030926_GFGiftCraftyBrandedTOF1_v1_AIO_Evergreen - 001NYS - 002TC - 000AIO - 003030926_GFGiftCraftyBrandedTOF1_v1_AIO_Evergreen - 004MULTI - 005US - 006SavvyTraveler - 007DEMO - 008",
  "J12v1120125_I'veGotARuleTOF1_V1_AIO_Evergreen - 001NYS - 002LK - 000AIO - 003120125_I'veGotARuleTOF1_V1_AIO_Evergreen - 004SIL - 005US - 006_FunctionalTraveler",
  "060826_J0431v2_InfluencerAndreaDiFilippoEvergreenBundleSale_TOF_Vid_B04021v1v1_000EBUN_Evergreen_WL_LP003_001NYS_002TC_003UGC_005D1_006PR002_007FGN_008FGN_009B_010B_011M0S14_013M2W",
];

for (const s of samples) {
  const p = parseCreativeName(s);
  console.log("---");
  console.log("creator=", p.creator, "stem=", p.scriptStem, "track=", scriptStemForTracking(p));
}
