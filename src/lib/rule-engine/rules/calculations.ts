// Beregningsregler — bebyggelsesprocent, højde, etager, skelafstand (ARCH-108).
// Hierarki-fallback: lokalplan → kommuneplanramme → BR18-standard.
// Pure functions uden sideeffekter.
//
// BR18-standarder (uden lokalplan/kommuneplan):
//   Bebyggelsesprocent: 30% for parcelhus (BR18 §177, grunde ≥ 700m²)
//   Max bygningshøjde:  8.5 m (BR18 §179)
//   Max etager:         2 (BR18 §179)
//   Skelafstand:        2.5 m fra nabo, 2.5 m fra vej (BR18 §181)

import type {
  RuleEngineInput,
  CalculationResult,
  CalcEntry,
  RuleViolation,
} from "@/lib/rule-engine/types";

// ---------------------------------------------------------------------------
// Hjælpefunktioner
// ---------------------------------------------------------------------------

type RuleSource = "lokalplan" | "kommuneplan" | "br18_default" | "unknown";

function makeEntry(
  actual: number | null,
  limit: number | null,
  source: RuleSource,
  confidence: number,
  ruleId: string,
  label: string,
  unit: string,
  authority = "Kommunen",
): CalcEntry {
  const compliant = actual !== null && limit !== null ? actual <= limit : null;

  let violation: RuleViolation | null = null;
  if (compliant === false) {
    violation = {
      rule: ruleId,
      severity: "dispensation_required",
      reason: `${label}: ${actual}${unit} overskriver grænsen på ${limit}${unit} (kilde: ${source === "br18_default" ? "BR18 standard" : source === "kommuneplan" ? "kommuneplanramme" : "lokalplan"}).`,
      authority,
      confidence,
    };
  }

  return { actual, limit, appliedRule: source, confidence, compliant, violation };
}

// ---------------------------------------------------------------------------
// Bebyggelsesprocent
// ---------------------------------------------------------------------------

function calcBuildingPercent(input: RuleEngineInput): CalcEntry {
  const areaM2 = input.plot.areaM2;
  const existingFootprint = input.existingBuilding?.footprintM2 ?? 0;
  const newFootprint = input.newBuilding?.footprintM2 ?? null;

  // Kan ikke beregne uden grundareal eller ny bygning
  if (areaM2 === null || areaM2 === 0 || newFootprint === null) {
    return {
      actual: null,
      limit: null,
      appliedRule: "unknown",
      confidence: 0,
      compliant: null,
      violation: null,
    };
  }

  const totalFootprint = existingFootprint + newFootprint;
  const actual = Math.round((totalFootprint / areaM2) * 100 * 10) / 10;

  // Hierarki: lokalplan → kommuneplan → BR18 (30%)
  const lpValue = input.localplan?.maxBuildingPercent.value ?? null;
  const lpConf = input.localplan?.maxBuildingPercent.confidence ?? 1.0;
  const mpValue = input.municipalPlan?.maxBuildingPercent ?? null;

  let limit: number;
  let source: RuleSource;
  let confidence: number;

  if (lpValue !== null) {
    limit = lpValue;
    source = "lokalplan";
    confidence = lpConf;
  } else if (mpValue !== null) {
    limit = mpValue;
    source = "kommuneplan";
    confidence = 1.0;
  } else {
    // BR18 §177: 30% for grunde ≥ 700m², 40% for mindre grunde
    limit = areaM2 < 700 ? 40 : 30;
    source = "br18_default";
    confidence = 1.0;
  }

  return makeEntry(
    actual,
    limit,
    source,
    confidence,
    "bebyggelsesprocent",
    "Bebyggelsesprocent",
    "%",
  );
}

// ---------------------------------------------------------------------------
// Bygningshøjde
// ---------------------------------------------------------------------------

function calcHeight(input: RuleEngineInput): CalcEntry {
  const actual = input.newBuilding?.heightM ?? null;

  const lpValue = input.localplan?.maxHeightM.value ?? null;
  const lpConf = input.localplan?.maxHeightM.confidence ?? 1.0;
  const mpValue = input.municipalPlan?.maxHeightM ?? null;

  let limit: number;
  let source: RuleSource;
  let confidence: number;

  if (lpValue !== null) {
    limit = lpValue;
    source = "lokalplan";
    confidence = lpConf;
  } else if (mpValue !== null) {
    limit = mpValue;
    source = "kommuneplan";
    confidence = 1.0;
  } else {
    limit = 8.5; // BR18 §179
    source = "br18_default";
    confidence = 1.0;
  }

  return makeEntry(actual, limit, source, confidence, "bygningshøjde", "Bygningshøjde", " m");
}

// ---------------------------------------------------------------------------
// Etager
// ---------------------------------------------------------------------------

function calcStoreys(input: RuleEngineInput): CalcEntry {
  const actual = input.newBuilding?.storeys ?? null;

  const lpValue = input.localplan?.maxStoreys.value ?? null;
  const lpConf = input.localplan?.maxStoreys.confidence ?? 1.0;
  const mpValue = input.municipalPlan?.maxStoreys ?? null;

  let limit: number;
  let source: RuleSource;
  let confidence: number;

  if (lpValue !== null) {
    limit = lpValue;
    source = "lokalplan";
    confidence = lpConf;
  } else if (mpValue !== null) {
    limit = mpValue;
    source = "kommuneplan";
    confidence = 1.0;
  } else {
    limit = 2; // BR18 §179
    source = "br18_default";
    confidence = 1.0;
  }

  return makeEntry(actual, limit, source, confidence, "etager", "Etager", " etager");
}

// ---------------------------------------------------------------------------
// Skelafstand
// ---------------------------------------------------------------------------

function calcSetback(input: RuleEngineInput): CalcEntry {
  // distanceToBoundaryM kræver brugerinput — typisk ikke tilgængeligt
  const actual = input.newBuilding?.distanceToBoundaryM ?? null;

  const lpValue = input.localplan?.minSetbackM.value ?? null;
  const lpConf = input.localplan?.minSetbackM.confidence ?? 1.0;

  let limit: number;
  let source: RuleSource;
  let confidence: number;

  if (lpValue !== null) {
    limit = lpValue;
    source = "lokalplan";
    confidence = lpConf;
  } else {
    limit = 2.5; // BR18 §181
    source = "br18_default";
    confidence = 1.0;
  }

  // Skelafstand: compliant = actual >= limit (mindste tilladt, ikke max)
  const compliant = actual !== null ? actual >= limit : null;
  let violation: RuleViolation | null = null;
  if (compliant === false) {
    violation = {
      rule: "skelafstand",
      severity: "dispensation_required",
      reason: `Skelafstand: ${actual} m er under minimumsgrænsen ${limit} m (${source === "br18_default" ? "BR18 §181" : source}).`,
      authority: "Kommunen",
      confidence,
    };
  }

  return { actual, limit, appliedRule: source, confidence, compliant, violation };
}

// ---------------------------------------------------------------------------
// Hoved-funktion
// ---------------------------------------------------------------------------

export function runCalculations(input: RuleEngineInput): CalculationResult {
  return {
    buildingPercent: calcBuildingPercent(input),
    height: calcHeight(input),
    storeys: calcStoreys(input),
    setback: calcSetback(input),
  };
}
