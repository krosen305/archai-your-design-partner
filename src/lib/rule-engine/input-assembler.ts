// Input-assembler til regelmotor-v1 (ARCH-107).
// Transformer eksisterende datakilder til RuleEngineInput.
//
// Ingen API-kald — ren datasammenstilling og -transformation.
// Følger Option A fra ARCH-106: newBuilding = null serverside,
// routes kan efterfølgende kalde med Byggeoenske.

import type {
  RuleEngineBbrData,
  RuleEngineDkJordResultat,
  RuleEngineFbbResult,
  RuleEngineGeusRiskData,
  RuleEngineKommuneplanramme,
  RuleEngineLokalplan,
  RuleEngineLokalplanExtract,
  RuleEngineNaturbeskyttelsesResultat,
  RuleEnginePlandataContext,
  RuleEngineTerrainData,
  RuleEngineTinglysningResult,
} from "@/domain/contracts/rule-engine.types";
import type { Byggeoenske, DesignPlacement } from "@/types/project-state";
import type {
  RuleEngineInput,
  RuleValue,
  ProjectType,
  BuildingUsage,
} from "@/lib/rule-engine/types";
import { parseSetbackM, parseRoofTypes, parseZone } from "./parsers";
import { mapByggetypeToProjectType, mapAntalEtager, mapUsageFromBbr } from "./mappers";

// ---------------------------------------------------------------------------
// Assembler params
// ---------------------------------------------------------------------------

export type AssemblerParams = {
  bbr: RuleEngineBbrData | null;
  kommuneplanramme: RuleEngineKommuneplanramme | null;
  lokalplaner: RuleEngineLokalplan[];
  lokalplanExtract: RuleEngineLokalplanExtract | null;
  naturbeskyttelse: RuleEngineNaturbeskyttelsesResultat | null;
  geusRisk: RuleEngineGeusRiskData | null;
  servitutter: RuleEngineTinglysningResult | null;
  terrain: RuleEngineTerrainData | null;
  fbbData: RuleEngineFbbResult | null; // ARCH-131: SAVE-bevaringsvaerdi fra FBB
  dkjord: RuleEngineDkJordResultat | null; // jordforurening V1/V2/omraadeklassificering
  plandataContext: RuleEnginePlandataContext | null;
  byggeoenske: Byggeoenske | null; // null = serverside kørslen (Option A)
  designPlacement?: DesignPlacement | null; // ARCH-180: præcis footprint/skelafstand fra korteditor
  municipality: string;
  kommunekode: string;
};

export type AssemblerResult = {
  input: RuleEngineInput;
  missingFields: string[];
};

// ---------------------------------------------------------------------------
// Hjælpefunktioner
// ---------------------------------------------------------------------------

function makeRuleValue<T>(
  value: T | null,
  source: RuleValue<T>["source"],
  confidence = 1.0,
  estimated = false,
): RuleValue<T> {
  return { value, source, confidence, estimated };
}

// ---------------------------------------------------------------------------
// Hoved-assembler
// ---------------------------------------------------------------------------

export function assembleRuleEngineInput(params: AssemblerParams): AssemblerResult {
  const {
    bbr,
    kommuneplanramme,
    lokalplaner,
    lokalplanExtract,
    naturbeskyttelse,
    geusRisk,
    servitutter,
    terrain,
    fbbData,
    dkjord,
    plandataContext,
    byggeoenske,
    designPlacement,
    municipality,
    kommunekode,
  } = params;

  const missingFields: string[] = [];

  // ── Project ──────────────────────────────────────────────────────────────

  const projectType: ProjectType = byggeoenske
    ? mapByggetypeToProjectType(byggeoenske.byggetype)
    : "new_build";

  // ── Plot ─────────────────────────────────────────────────────────────────

  const areaM2 = bbr?.grundareal ?? null;
  if (areaM2 === null) missingFields.push("plot.areaM2");

  const hasServitudes = (servitutter?.servitutter ?? []).length > 0 || (servitutter?.pant ?? 0) > 0;

  // ── Heritage ─────────────────────────────────────────────────────────────

  // saveValue: laveste bevaringskarakter fra FBB (ARCH-131)
  // Laveste tal = højest bevaringsværdi (SAVE 1-3 = høj, 7-9 = lav)
  const saveValue = fbbData?.fbb_bedste_bygning?.bevaringsvaerdi ?? null;
  if (saveValue === null) missingFields.push("heritage.saveValue");

  // MAT-felter (mat_strandbeskyttelse/mat_fredskov/mat_klitfredning) er live data
  // fra MAT_Jordstykke og OR'es med SDFI naturbeskyttelse-data (finding #8).
  // mat_fredskov (plot ER fredskov) er strengere end skovbyggelinje (buffer), men
  // begge kortlægger til `forest` da rule-engine ikke har separate kolonner endnu.
  const protectionLines = {
    coastal:
      (naturbeskyttelse?.strandbeskyttelse ?? false) || (bbr?.mat_strandbeskyttelse ?? false),
    forest: (naturbeskyttelse?.skovbyggelinje ?? false) || (bbr?.mat_fredskov ?? false),
    lakeRiver: naturbeskyttelse?.aabeskyttelse ?? false,
    lake: naturbeskyttelse?.soebeskyttelse ?? false,
    clitFredning: (naturbeskyttelse?.klitfredning ?? false) || (bbr?.mat_klitfredning ?? false),
    churchSurroundings: naturbeskyttelse?.kirkebyggelinje ?? false,
  };

  // ── Lokalplan ─────────────────────────────────────────────────────────────

  const hasLocalplan = lokalplaner.length > 0;
  let localplanSection: RuleEngineInput["localplan"] = null;

  if (hasLocalplan && lokalplanExtract) {
    const maxPct = lokalplanExtract.maxBebyggelsespct;
    const maxStoreys = lokalplanExtract.maxEtager;

    // max_height_m: ikke i LokalplanExtract endnu — fallback til kommuneplanramme
    const maxHeightFromRamme = kommuneplanramme?.maxbygnhjd ?? null;
    if (maxPct === null) missingFields.push("localplan.maxBuildingPercent");
    if (maxStoreys === null) missingFields.push("localplan.maxStoreys");
    if (maxHeightFromRamme === null) missingFields.push("localplan.maxHeightM");

    const setbackRaw = parseSetbackM(lokalplanExtract.byggelinjer);
    if (setbackRaw === null) missingFields.push("localplan.minSetbackM");

    localplanSection = {
      maxBuildingPercent: makeRuleValue(
        maxPct,
        maxPct !== null ? "pdf_extracted" : "not_defined",
        maxPct !== null ? 0.85 : 0,
      ),
      maxHeightM: makeRuleValue(
        maxHeightFromRamme,
        maxHeightFromRamme !== null ? "kommuneplanramme" : "not_defined",
        maxHeightFromRamme !== null ? 1.0 : 0,
      ),
      maxStoreys: makeRuleValue(
        maxStoreys,
        maxStoreys !== null ? "pdf_extracted" : "not_defined",
        maxStoreys !== null ? 0.9 : 0,
      ),
      minSetbackM: makeRuleValue(
        setbackRaw,
        setbackRaw !== null ? "pdf_extracted" : "not_defined",
        setbackRaw !== null ? 0.7 : 0, // parsing af fritekst giver lavere confidence
      ),
      allowedRoofTypes: parseRoofTypes(lokalplanExtract.tagform),
      allowedMaterials: lokalplanExtract.materialer,
      specialConditions: lokalplanExtract.specialBestemmelser,
      buildingFieldDefined: false, // ingen byggefeltkort-integration
    };
  } else if (hasLocalplan && !lokalplanExtract) {
    // Lokalplan fundet men PDF ikke analyseret endnu
    missingFields.push(
      "localplan.maxBuildingPercent",
      "localplan.maxHeightM",
      "localplan.maxStoreys",
      "localplan.minSetbackM",
    );
  }

  // ── Kommuneplanramme ──────────────────────────────────────────────────────

  const municipalPlan: RuleEngineInput["municipalPlan"] = kommuneplanramme
    ? {
        maxBuildingPercent: kommuneplanramme.bebygpct,
        maxHeightM: kommuneplanramme.maxbygnhjd,
        maxStoreys: kommuneplanramme.maxetager,
        usageCode: kommuneplanramme.anvgen,
        usageText: kommuneplanramme.anvendelseGenerel,
      }
    : null;

  if (!kommuneplanramme) missingFields.push("municipalPlan");

  // ── Eksisterende bygning ──────────────────────────────────────────────────

  let existingBuilding: RuleEngineInput["existingBuilding"] = null;

  if (bbr) {
    const storeys = bbr.antal_etager;
    const heightEstimated = true; // BBR har ikke eksplicit bygningshøjde
    const heightM = storeys !== null ? Math.round(storeys * 3.0 * 10) / 10 : null;
    if (heightM === null) missingFields.push("existingBuilding.heightM");

    existingBuilding = {
      exists: bbr.beregning_mulig,
      floorAreaM2: bbr.samlet_areal,
      footprintM2: bbr.bebygget_areal,
      heightM,
      heightEstimated,
      storeys,
      yearBuilt: bbr.byggeaar !== null ? parseInt(bbr.byggeaar, 10) : null,
      useCode: bbr.anvendelseskode,
      currentBuildingPercent: bbr.bebyggelsesprocent,
      heatingSource: bbr.opvarmningsmiddel ?? null, // ARCH-117
      facadeMaterial: bbr.ydervaegs_materiale ?? null, // ARCH-118
    };
  } else {
    missingFields.push("existingBuilding");
  }

  // ── Ny bygning (fra Byggeoenske) ──────────────────────────────────────────

  let newBuilding: RuleEngineInput["newBuilding"] = null;

  if (byggeoenske) {
    const storeysFromWizard = mapAntalEtager(byggeoenske.antalEtager);
    const floorAreaM2 = byggeoenske.oensketAreal ?? null;

    // ARCH-180: korteditor leverer præcise værdier der overskriver heuristiske estimater
    const hasPlacement = designPlacement != null;

    const storeys =
      hasPlacement && designPlacement.floors !== null ? designPlacement.floors : storeysFromWizard;

    const footprintEstimated = !hasPlacement;
    const footprintM2 =
      hasPlacement && designPlacement.footprintAreaM2 !== null
        ? designPlacement.footprintAreaM2
        : floorAreaM2 !== null && storeys !== null
          ? Math.round(floorAreaM2 / storeys)
          : null;

    const heightEstimated = !(hasPlacement && designPlacement.heightM !== null);
    const heightM =
      hasPlacement && designPlacement.heightM !== null
        ? designPlacement.heightM
        : storeys !== null
          ? Math.round(storeys * 3.0 * 10) / 10
          : null;

    const distanceToBoundaryM = hasPlacement ? designPlacement.minDistanceToBoundaryM : null;

    if (floorAreaM2 === null) missingFields.push("newBuilding.floorAreaM2");
    if (storeys === null) missingFields.push("newBuilding.storeys");
    if (footprintM2 === null) missingFields.push("newBuilding.footprintM2");
    if (heightM === null) missingFields.push("newBuilding.heightM");
    // skelafstand kræver korteditor eller brugerinput
    if (!hasPlacement) missingFields.push("newBuilding.distanceToBoundaryM");

    newBuilding = {
      floorAreaM2,
      footprintM2,
      footprintEstimated,
      heightM,
      heightEstimated,
      storeys,
      distanceToBoundaryM,
      buildType: mapByggetypeToProjectType(byggeoenske.byggetype),
      roofType: byggeoenske.tagform ?? null,
      facadeMaterial: byggeoenske.facademateriale ?? null,
      usage: "residential",
      energyClass: byggeoenske.energiklasse ?? null,
      heatingSource: byggeoenske.varmekilde ?? null,
    };
  } else {
    // Option A: newBuilding udfyldes af route-laget når Byggeoenske kendes
    missingFields.push(
      "newBuilding.floorAreaM2",
      "newBuilding.footprintM2",
      "newBuilding.heightM",
      "newBuilding.storeys",
    );
  }

  // ── Geoteknisk ───────────────────────────────────────────────────────────

  const geotechnical: RuleEngineInput["geotechnical"] = {
    radonRisk: geusRisk?.radonRisk ?? "unknown",
    groundwaterDepthM: geusRisk?.groundwaterDepthM ?? null,
    slopePercent: terrain?.slopePercent ?? null,
    jordforureningV1: dkjord?.v1Kortlagt ?? null,
    jordforureningV2: dkjord?.v2Kortlagt ?? null,
    omraadeklassificering: dkjord?.omraadeklassificering ?? null,
  };

  // ── Servitutter ───────────────────────────────────────────────────────────

  const kritiskeServitutter = (servitutter?.servitutter ?? []).filter((s) => s.kritisk);
  const servitutsSection: RuleEngineInput["servituts"] = {
    hasCritical: kritiskeServitutter.length > 0,
    criticalTexts: kritiskeServitutter.map((s) => s.tekst),
  };

  const planningSection: RuleEngineInput["planning"] = plandataContext
    ? {
        zoneType: plandataContext.zoneType,
        futureZoneType: plandataContext.futureZoneType,
        landzonePermitRequired: plandataContext.landzonePermitRequired,
        buildingFieldDefined: plandataContext.lokalplanByggefeltPresent,
        withinBuildingField: plandataContext.withinBuildingField,
        wastewaterPlanStatus: plandataContext.wastewaterPlanStatus,
        sewerAreaType: plandataContext.sewerAreaType,
      }
    : null;

  // ── Saml ──────────────────────────────────────────────────────────────────

  // ARCH-180: placement-sektion — kun sat når korteditor har leveret footprintAreaM2
  const placementSection: RuleEngineInput["placement"] =
    designPlacement?.footprintAreaM2 != null
      ? {
          footprintAreaM2: designPlacement.footprintAreaM2,
          minDistanceToBoundaryM: designPlacement.minDistanceToBoundaryM,
          outsideParcelAreaM2: designPlacement.outsideParcelAreaM2,
        }
      : null;

  const input: RuleEngineInput = {
    project: {
      type: projectType,
      municipality,
      kommunekode,
    },
    plot: {
      areaM2,
      zone: parseZone(kommuneplanramme),
      hasLocalplan,
      hasServitudes,
      localplanIds: lokalplaner.map((lp) => lp.planid),
    },
    heritage: {
      listedBuilding: bbr?.fredet ?? null, // ARCH-118: BBR byg070
      saveValue, // ARCH-131: FBB bevaringskarakter (null hvis ikke registreret i FBB)
      preservationLocalplan: false, // ingen integration
      protectionLines,
    },
    localplan: localplanSection,
    municipalPlan,
    existingBuilding,
    newBuilding,
    geotechnical,
    servituts: servitutsSection,
    planning: planningSection,
    placement: placementSection,
  };

  return { input, missingFields: [...new Set(missingFields)] };
}
