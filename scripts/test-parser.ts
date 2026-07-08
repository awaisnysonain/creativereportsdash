import { parseCreativeName } from "@/lib/parser/creative-name-parser";

const samples = [
  "000AIO - 001NYS - 002PEN - 003TSAasianmale - 004MULTI - 005SE - 006STT - 007VO - 008TOF - 009V2 - 01045s - 011FAI - 012YWO - 013USA - 014CL - 0150424",
  "J2v1_000AIO - 001NYS - 002PEN - 003TSABluePen - 004WHT - 005SE - 006STT - 007VO - 008TOF - 009V1 - 01045s - 011FAI - 012YWO - 013USA - 014CL - 0150424",
  "061526_J0448v1_TSAOrganicQuestionsTOS_TOF_Vid_BJ60_000AIO_Evergreen_LP001_001NYS_002LK_003UGC_005L1_007HPK_013F1W_014USA_015AAT",
  "042726_J0008v1_WhenDidCarryOnsAliciaEngle_TOF_Vid_B94_000AIO_Evergreen_LP001_001NYS_002TC_003NGC_005A7_006SP005_007SIL_008LAV_009B_010B_011M1S03_013F1W_014USA_015AAT",
  "042726_J0016v1_IveGotARuleChristinaHaltnerInfluencer_TOF_Vid_B12v1_000AIO_Evergreen_WL_LP001_001NYS_002TC_003UGC_005A4_006LF001_007BLS_008BLS_009A_010A_011M0S23_013F1W_014CAN_015AAT",
  "video - June @besttravelfinds LP: Most",
  "test - video - UGC Hate travelling - 2 - Copy",
];

for (const s of samples) {
  const p = parseCreativeName(s);
  console.log("\nRAW:", s.slice(0, 70));
  console.log(
    JSON.stringify(
      {
        convention: p.convention,
        conf: p.confidence,
        job: p.jobNumber,
        date: p.launchDate,
        sku: p.sku,
        category: p.categoryLabel,
        opener: p.openerLabel,
        hook: p.hookLabel,
        color: p.colorLabel,
        creator: p.creator,
        creatorType: p.creatorType,
        funnel: p.funnel,
        scriptStem: p.scriptStem,
        demo: p.demographicsLabel,
      },
      null,
      0,
    ),
  );
}
