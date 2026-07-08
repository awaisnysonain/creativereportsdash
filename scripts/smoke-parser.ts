import { parseCreativeName } from "../src/lib/parser/creative-name-parser";
import { scriptStemForTracking } from "../src/lib/analytics";

const samples = [
  "062226_J0350v1_InfluencerSarahLaurenAmericas250thBundleSocialStills_BOF_Img_000EBUN_AmericanaCollection_WL_LP00Z_001NYS_002TC_005D3_006PR002_007MULTI_008MULTI_009A_013F1W_014USA_015ASX",
  "110526_J0299v3_InfluencerGabiCrossWeekender_TOF_Vid_000AIO_Evergreen_WL_LP005_001NYS_002TC_003UGC_005D1_007CRD_008MULTI_011M0S35_013F2W_014AUS_015AAT",
  "062926_J0421v4_InfluenceKylaCentomoDiscountStickyNotes_Vid_000EBUN_SummerTravelSale_WL_LP003_001NYS_002TC_003NGC_005D1_006PR002_007BYL_008BYL_009F_010F_011M0S10_013F1W_014CAN_015ATA",
  "110526_J209v2_GabiCrossNetNew_TOF_Vid_000AIO_Evergreen_WL_LP001_001NYS_002TC_003UGC_005L1_007CRD_008MULTI_009A_010A_011M0S54_013F2W_014AUS_015AAT",
  "060826_J-0419v1_MyExHusbandsGirlfriend_TOF_Vid_000AIO_Evergreen_LP001_001NYS_002FA_003UGC_005J2_007MNT_008MNT_009B_010B_011M8S37_013F4B_014USA_015AAT",
  "042026_InfluencerWeekenderSarahLaurenTOF1_v1_WEEKBOGO_Evergreen_WL - 001NYS - 002TC - 000WEEK - 004MULTI - 005US - 006SavvyTraveler - 007DEMO - 008TOF - 013USA",
  "J2v1_000AIO - 001NYS - 002PEN - 003TSABluePen - 004WHT - 005SE - 006STT - 007VO - 008TOF - 009V1 - 01045s - 011FAI - 012YWO - 013USA - 014CL",
  "051126_J0255v1_ReasonsShortEllieTat_TOF_Vid_BJ148v4_000AIO_Evergreen_WL_LP001_001NYS_002LK_003NGC_005E2_006SP009_007LAV_008LAV_009A_010A_011M0S39_013F2W_014USA_015AAA",
  "001NYS - 002TC - 000EXP - 003011226_AndrewExp3TOF1_v1_EXP_Evergreen_WL - 004BLK - 005US - 006SavvyTraveler - 007DEMO - 00850s - 009MRE - 010V1C- 011AMA - 012ENG - 013AAJ",
  "J11v1_101325_ RidgeStyleDurabilityTOF1_V1_AIO_Evergreen - 001NYS - 002FA - 003Ridge-Style Durability Carry-On - 004SIL - OTHER - 006SavvyTraveler - 007VO - 00860s - 009FAI - 010V3 - 011YAWO - 012ENG - Mauro - wl",
];

for (const s of samples) {
  const p = parseCreativeName(s);
  console.log("---");
  console.log(s.slice(0, 100));
  console.log(`  conv=${p.convention} job=${p.jobNumber} cat=${p.category} color=${p.color} demo=${p.demographics}`);
  console.log(`  creator=${p.creator} (${p.creatorType}) wl=${p.whitelisted}`);
  console.log(`  stem=${p.scriptStem}`);
  console.log(`  track=${scriptStemForTracking(p)}`);
}
