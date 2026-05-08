// Regelmotor-v1 typer (ARCH-107).
// Baseret på konsekvensanalysen i docs/rule-engine-impact-analysis.md (ARCH-106).
//
// RuleEngineInput er bindeleddet mellem datalag og regelkerne.
// Alle felter er samlet fra eksisterende datakilder — ingen nye API-kald.

// ---------------------------------------------------------------------------
// Hjælpetyper
// ---------------------------------------------------------------------------

// Kildetracking på felter der stammer fra AI-udtræk (lokalplan PDF).
// estimated = true angiver felter beregnet via heuristik, ikke direkte kilde.
export type RuleValue<T> = {
  value: T | null;
  source: "pdf_extracted" | "kommuneplanramme" | "manually_entered" | "not_defined" | "unknown";
  confidence: number; // 0-1
  estimated?: boolean; // true hvis beregnet heuristisk
};

// ---------------------------------------------------------------------------
// Projekt-kontekst
// ---------------------------------------------------------------------------

export type ProjectType =
  | "new_build"
  | "extension"
  | "renovation"
  | "change_of_use"
  | "demolition_and_new";

export type BuildingUsage = "residential" | "garage" | "annex" | "commercial" | "mixed";

// ---------------------------------------------------------------------------
// RuleEngineInput
// ---------------------------------------------------------------------------

export type RuleEngineInput = {
  /** Projekttype og administrativ kontekst */
  project: {
    type: ProjectType;
    municipality: string; // kommunenavn
    kommunekode: string; // 4-cifret kode
  };

  /** Grund */
  plot: {
    areaM2: number | null;
    zone: "urban" | "rural" | "summerhouse" | "unknown";
    hasLocalplan: boolean;
    hasServitudes: boolean;
    localplanIds: string[]; // planid fra Plandata
  };

  /** Fredning og beskyttelseslinjer */
  heritage: {
    listedBuilding: boolean | null; // null = ikke vurderet (ingen integration)
    saveValue: number | null; // 1-9, null = ingen data
    preservationLocalplan: boolean;
    protectionLines: {
      coastal: boolean; // strandbeskyttelseslinje
      forest: boolean; // skovbyggelinje
      lakeRiver: boolean; // åbeskyttelseslinje
      lake: boolean; // søbeskyttelseslinje
      clitFredning: boolean; // klitfredning
      churchSurroundings: boolean; // kirkebyggelinje
    };
  };

  /** Lokalplanbestemmelser (null hvis ingen lokalplan) */
  localplan: {
    maxBuildingPercent: RuleValue<number>;
    maxHeightM: RuleValue<number>;
    maxStoreys: RuleValue<number>;
    minSetbackM: RuleValue<number>; // parsed fra byggelinjer-fritekst
    allowedRoofTypes: string[] | null; // parsed fra tagform-fritekst
    allowedMaterials: string[]; // fra lokalplanExtract.materialer
    specialConditions: string[]; // fra lokalplanExtract.specialBestemmelser
    buildingFieldDefined: boolean; // altid false indtil byggefeltkort-integration
  } | null;

  /** Kommuneplanramme (fallback hvis ingen lokalplan, eller supplerende) */
  municipalPlan: {
    maxBuildingPercent: number | null; // bebygpct
    maxHeightM: number | null; // maxbygnhjd
    maxStoreys: number | null; // maxetager
    usageCode: number | null; // anvgen
    usageText: string | null; // anvendelseGenerel
  } | null;

  /** Eksisterende bebyggelse (fra BBR) */
  existingBuilding: {
    exists: boolean;
    floorAreaM2: number | null; // samlet_areal
    footprintM2: number | null; // bebygget_areal
    heightM: number | null; // estimeret: antal_etager × 3.0 m
    heightEstimated: boolean; // true = heuristisk beregning
    storeys: number | null; // antal_etager
    yearBuilt: number | null; // byggeaar (parsed to int)
    useCode: string | null; // anvendelseskode
    currentBuildingPercent: number | null; // bebyggelsesprocent
    heatingSource: string | null; // opvarmningsmiddel (byg057) — ARCH-117
    facadeMaterial: string | null; // ydervaegs_materiale (byg032) — ARCH-118
  } | null;

  /** Ny bebyggelse (fra Byggeoenske) — null når assembler køres serverside */
  newBuilding: {
    floorAreaM2: number | null; // oensketAreal
    footprintM2: number | null; // estimeret: oensketAreal / ceil(antalEtager)
    footprintEstimated: boolean; // true = heuristisk
    heightM: number | null; // estimeret: ceil(antalEtager) × 3.0 m
    heightEstimated: boolean; // true = heuristisk
    storeys: number | null; // ceil(antalEtager)
    distanceToBoundaryM: number | null; // skelafstand — kræver brugerinput
    buildType: ProjectType;
    roofType: string | null; // tagform
    facadeMaterial: string | null; // facademateriale
    usage: BuildingUsage;
    energyClass: string | null; // energiklasse
    heatingSource: string | null; // varmekilde
  } | null;

  /** Geoteknisk risiko */
  geotechnical: {
    radonRisk: "low" | "medium" | "high" | "unknown";
    groundwaterDepthM: number | null;
    slopePercent: number | null;
  };

  /** Kritiske servitutter */
  servituts: {
    hasCritical: boolean;
    criticalTexts: string[];
  };
};

// ---------------------------------------------------------------------------
// Output-typer (ARCH-108)
// ---------------------------------------------------------------------------

export type RuleStatus = "ok" | "incomplete" | "requires_dispensation" | "illegal";

export type RuleViolation = {
  rule: string;
  severity: "illegal" | "dispensation_required" | "warning";
  reason: string;
  authority?: string;
  confidence?: number; // propageret fra RuleValue.confidence
};

export type DispensationItem = {
  rule: string;
  label: string;
  authority: string;
  reason: string;
};

// Én beregning med hierarki-kilde og compliance-status
export type CalcEntry = {
  actual: number | null;
  limit: number | null;
  appliedRule: "lokalplan" | "kommuneplan" | "br18_default" | "unknown";
  confidence: number; // 1.0 for kommuneplan/br18, lavere for PDF-udtræk
  compliant: boolean | null; // null = kan ikke beregnes (manglende data)
  violation: RuleViolation | null;
};

export type CalculationResult = {
  buildingPercent: CalcEntry;
  height: CalcEntry;
  storeys: CalcEntry;
  setback: CalcEntry;
};

export type RuleEngineResult = {
  status: "OK" | "INCOMPLETE" | "REQUIRES_DISPENSATION" | "ILLEGAL";
  checkedRules: string[];
  missingInputs: string[];
  violations: RuleViolation[];
  dispensationList: DispensationItem[];
  calculations: CalculationResult;
};
