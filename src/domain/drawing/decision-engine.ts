export type DrawingReadinessStatus =
  | "AUTO_DRAFT"
  | "AUTO_REVIEW"
  | "SURVEY_REQUIRED"
  | "BLOCKED_MISSING_CORE_DATA";

export type ReadinessReason = {
  code: string;
  severity: "info" | "warning" | "blocking";
  message: string;
  affectedLayer: string;
};

export type DrawingReadinessDecision = {
  status: DrawingReadinessStatus;
  reasons: ReadinessReason[];
  missingDataPoints: string[];
  reviewRequiredBy: Array<
    "landinspektoer" | "arkitekt" | "ingenioer" | "kloakmester" | "myndighed"
  >;
};

export type DrawingReadinessInput = {
  hasAddress: boolean;
  hasMatrikel: boolean;
  hasParcelPolygon: boolean;
  hasProposedFootprint: boolean;
  hasCrsContract: boolean;
  parcelAreaDiscrepancyPct: number;
  minDistanceToSetbackLineM: number;
  setbackRequirementM: number;
  hasOpmaalteKoter: boolean;
  hasDhmKoter: boolean;
  hasExistingBuildingGeometry: boolean;
  missingDataPoints: string[];
};

const THRESHOLDS = {
  setbackSafetyMarginM: 0.5,
  maxParcelAreaDiscrepancyPct: 1.0,
};

export function classifyDrawingReadiness(input: DrawingReadinessInput): DrawingReadinessDecision {
  const reasons: ReadinessReason[] = [];
  const reviewRequiredBy: DrawingReadinessDecision["reviewRequiredBy"] = [];

  if (!input.hasParcelPolygon) {
    return {
      status: "BLOCKED_MISSING_CORE_DATA",
      reasons: [
        {
          code: "NO_PARCEL_POLYGON",
          severity: "blocking",
          message: "Ingen parcelpolygon fundet",
          affectedLayer: "parcel",
        },
      ],
      missingDataPoints: ["parcel.polygon25832", ...input.missingDataPoints],
      reviewRequiredBy: ["landinspektoer"],
    };
  }

  if (!input.hasProposedFootprint) {
    return {
      status: "BLOCKED_MISSING_CORE_DATA",
      reasons: [
        {
          code: "NO_PROPOSED_FOOTPRINT",
          severity: "blocking",
          message: "Ingen foreslaaet bygningsfodprint",
          affectedLayer: "proposed",
        },
      ],
      missingDataPoints: ["proposed.primaryBuilding.footprint25832", ...input.missingDataPoints],
      reviewRequiredBy: ["arkitekt"],
    };
  }

  if (!input.hasAddress || !input.hasMatrikel) {
    return {
      status: "BLOCKED_MISSING_CORE_DATA",
      reasons: [
        {
          code: "NO_ADDRESS_OR_MATRIKEL",
          severity: "blocking",
          message: "Adresse eller matrikel mangler",
          affectedLayer: "metadata",
        },
      ],
      missingDataPoints: input.missingDataPoints,
      reviewRequiredBy: [],
    };
  }

  let surveyRequired = false;

  const safeDistance = input.setbackRequirementM + THRESHOLDS.setbackSafetyMarginM;
  if (input.minDistanceToSetbackLineM < safeDistance) {
    surveyRequired = true;
    reasons.push({
      code: "BUILDING_TOO_CLOSE_TO_SETBACK",
      severity: "warning",
      message: `Bygning er ${input.minDistanceToSetbackLineM.toFixed(2)} m fra byggelinje — krav + margin er ${safeDistance.toFixed(2)} m`,
      affectedLayer: "proposed",
    });
    reviewRequiredBy.push("landinspektoer");
  }

  if (input.parcelAreaDiscrepancyPct > THRESHOLDS.maxParcelAreaDiscrepancyPct) {
    surveyRequired = true;
    reasons.push({
      code: "PARCEL_AREA_DISCREPANCY",
      severity: "warning",
      message: `Arealafvigelse er ${input.parcelAreaDiscrepancyPct.toFixed(1)}% — graense er ${THRESHOLDS.maxParcelAreaDiscrepancyPct}%`,
      affectedLayer: "parcel",
    });
    reviewRequiredBy.push("landinspektoer");
  }

  if (surveyRequired) {
    return {
      status: "SURVEY_REQUIRED",
      reasons,
      missingDataPoints: input.missingDataPoints,
      reviewRequiredBy,
    };
  }

  const isAutoReview =
    input.hasCrsContract &&
    input.hasExistingBuildingGeometry &&
    (input.hasOpmaalteKoter || input.hasDhmKoter) &&
    input.missingDataPoints.length === 0;

  if (isAutoReview) {
    return { status: "AUTO_REVIEW", reasons, missingDataPoints: [], reviewRequiredBy };
  }

  if (input.missingDataPoints.length > 0) {
    reasons.push({
      code: "MISSING_DATA_POINTS",
      severity: "info",
      message: `${input.missingDataPoints.length} datapunkter mangler`,
      affectedLayer: "multiple",
    });
  }

  return {
    status: "AUTO_DRAFT",
    reasons,
    missingDataPoints: input.missingDataPoints,
    reviewRequiredBy,
  };
}
