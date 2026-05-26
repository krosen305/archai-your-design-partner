// src/lib/surroundings-analysis.server.ts
// SERVER-SIDE ONLY.
//
// Application service for støj, omgivelser og naboforhold.
// Kalder adaptere via injicerede gateways (testbart uden netværk/Supabase).
// Returnerer typed patch til site_constraints.
//
// WIRING TIL analysis-orchestrator.ts: IKKE en del af denne plan.
// Wiring kræver human review af beskyttet fil.

import type { SourceResult } from "@/lib/source-result";
import type {
  NeighborContext,
  PlanningSurroundingsContext,
} from "@/domain/contracts/surroundings.types";
import type { NoiseScreeningResult } from "@/domain/contracts/noise.types";
import type { RuleViolation } from "@/lib/rule-engine/types";
import type * as GeoJSON from "geojson";
import { checkNoiseRules } from "@/lib/rule-engine/rules/noise-rules";
import { checkSurroundingsRules } from "@/lib/rule-engine/rules/surroundings-rules";

export type SurroundingsInput = {
  addressId: string;
  bbox25832: [number, number, number, number];
  parcelPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  ownJordstykkeId: string | null;
};

export type SurroundingsGateways = {
  getNeighborContext: (input: SurroundingsInput) => Promise<SourceResult<NeighborContext>>;
  getSurroundings: (input: SurroundingsInput) => Promise<SourceResult<PlanningSurroundingsContext>>;
  getNoiseForParcel: (input: SurroundingsInput) => Promise<SourceResult<NoiseScreeningResult>>;
};

export type SiteConstraintsPatch = {
  neighbor_building_count_40m: number | null;
  neighbor_nearest_building_distance_m: number | null;
  road_nearest_centerline_distance_m: number | null;
  access_road_nearby: boolean | null;
  neighbor_context_confidence: string | null;
  planning_noise_area: boolean | null;
  planning_production_noise_consequence_area: boolean | null;
  planning_odor_area: boolean | null;
  planning_technical_facility_consequence_area: boolean | null;
  planning_large_livestock_area: boolean | null;
  planning_surroundings_review_required: boolean | null;
  noise_road_lden_db: number | null;
  noise_rail_lden_db: number | null;
  noise_air_lden_db: number | null;
  noise_industry_lden_db: number | null;
  noise_coverage_status: string | null;
  noise_acoustic_review_required: boolean | null;
};

export type SurroundingsAnalysisResult = {
  neighborContextResult: SourceResult<NeighborContext>;
  surroundingsResult: SourceResult<PlanningSurroundingsContext>;
  noiseResult: SourceResult<NoiseScreeningResult>;
  siteConstraintsPatch: SiteConstraintsPatch;
  violations: RuleViolation[];
};

function deriveNoiseInput(noise: NoiseScreeningResult | null) {
  if (!noise) return null;
  const road = noise.metrics.find((m) => m.source === "road");
  const rail = noise.metrics.find((m) => m.source === "rail");
  const air = noise.metrics.find((m) => m.source === "air");
  const industry = noise.metrics.find((m) => m.source === "industry");

  const coverageStatus =
    noise.metrics.length === 0
      ? "unknown"
      : noise.metrics.every((m) => m.coverage === "source_unavailable")
        ? "source_unavailable"
        : noise.metrics.every((m) => m.coverage === "outside_mapped_area")
          ? "outside_mapped_area"
          : noise.metrics.some((m) => m.coverage === "covered")
            ? "covered"
            : "unknown";

  return {
    roadLdenDb: road?.ldenDb ?? null,
    railLdenDb: rail?.ldenDb ?? null,
    airLdenDb: air?.ldenDb ?? null,
    industryLdenDb: industry?.ldenDb ?? null,
    coverageStatus: coverageStatus as
      | "covered"
      | "outside_mapped_area"
      | "source_unavailable"
      | "unknown",
    highestRisk: noise.highestRisk,
    requiresAcousticReview: noise.requiresAcousticReview,
  };
}

export async function handleSurroundingsAnalysis(
  input: SurroundingsInput,
  gateways: SurroundingsGateways,
): Promise<SurroundingsAnalysisResult> {
  const [neighborContextResult, surroundingsResult, noiseResult] = await Promise.all([
    gateways.getNeighborContext(input),
    gateways.getSurroundings(input),
    gateways.getNoiseForParcel(input),
  ]);

  const neighbor = neighborContextResult.data;
  const surroundings = surroundingsResult.data;
  const noise = noiseResult.data;

  const noiseInput = deriveNoiseInput(noise);
  const noiseMetric = (s: "road" | "rail" | "air" | "industry") =>
    noise?.metrics.find((m) => m.source === s)?.ldenDb ?? null;

  const patch: SiteConstraintsPatch = {
    neighbor_building_count_40m: neighbor?.count40m ?? null,
    neighbor_nearest_building_distance_m: neighbor?.nearestDistanceM ?? null,
    road_nearest_centerline_distance_m: neighbor?.nearestRoadCenterlineDistanceM ?? null,
    access_road_nearby: neighbor?.accessRoadNearby ?? null,
    neighbor_context_confidence: neighbor?.coverage ?? null,
    planning_noise_area: surroundings?.noiseDesignatedArea ?? null,
    planning_production_noise_consequence_area:
      surroundings?.productionNoiseConsequenceArea ?? null,
    planning_odor_area: surroundings
      ? surroundings.odorConsequenceArea === true || surroundings.odorDesignatedArea === true
      : null,
    planning_technical_facility_consequence_area:
      surroundings?.technicalFacilityConsequenceArea ?? null,
    planning_large_livestock_area: surroundings?.largeLivestockFarmArea ?? null,
    planning_surroundings_review_required: surroundings
      ? [
          surroundings.noiseDesignatedArea,
          surroundings.productionNoiseConsequenceArea,
          surroundings.odorConsequenceArea,
          surroundings.odorDesignatedArea,
          surroundings.technicalFacilityConsequenceArea,
          surroundings.largeLivestockFarmArea,
          surroundings.proposedPlanConflict,
        ].some(Boolean)
      : null,
    noise_road_lden_db: noiseMetric("road"),
    noise_rail_lden_db: noiseMetric("rail"),
    noise_air_lden_db: noiseMetric("air"),
    noise_industry_lden_db: noiseMetric("industry"),
    noise_coverage_status: noiseInput?.coverageStatus ?? null,
    noise_acoustic_review_required: noise?.requiresAcousticReview ?? null,
  };

  // Construct minimal RuleEngineInput for rule checks — only noise/neighbor/surroundings fields matter here
  const minimalPlot = {
    areaM2: 0,
    zone: "unknown" as const,
    hasLocalplan: false,
    hasServitudes: false,
    localplanIds: [],
  };
  const minimalHeritage = {
    listedBuilding: null,
    saveValue: null,
    preservationLocalplan: false,
    protectionLines: {
      coastal: false,
      forest: false,
      lakeRiver: false,
      lake: false,
      clitFredning: false,
      churchSurroundings: false,
    },
  };
  const minimalGeo = {
    radonRisk: "unknown" as const,
    groundwaterDepthM: null,
    slopePercent: null,
    jordforureningV1: null,
    jordforureningV2: null,
    omraadeklassificering: null,
  };
  const minimalServituts = { hasCritical: false, criticalTexts: [] };
  const minimalProject = { type: "new_build" as const, municipality: "", kommunekode: "" };

  const violations: RuleViolation[] = [
    ...checkNoiseRules({
      project: minimalProject,
      plot: minimalPlot,
      heritage: minimalHeritage,
      localplan: null,
      municipalPlan: null,
      existingBuilding: null,
      newBuilding: null,
      geotechnical: minimalGeo,
      servituts: minimalServituts,
      noise: noiseInput,
    }),
    ...checkSurroundingsRules({
      project: minimalProject,
      plot: minimalPlot,
      heritage: minimalHeritage,
      localplan: null,
      municipalPlan: null,
      existingBuilding: null,
      newBuilding: null,
      geotechnical: minimalGeo,
      servituts: minimalServituts,
      surroundings: surroundings
        ? {
            noiseDesignatedArea: surroundings.noiseDesignatedArea,
            productionNoiseConsequenceArea: surroundings.productionNoiseConsequenceArea,
            odorConsequenceArea: surroundings.odorConsequenceArea,
            odorDesignatedArea: surroundings.odorDesignatedArea,
            technicalFacilityConsequenceArea: surroundings.technicalFacilityConsequenceArea,
            largeLivestockFarmArea: surroundings.largeLivestockFarmArea,
            proposedPlanConflict: surroundings.proposedPlanConflict,
          }
        : null,
      neighborContext: neighbor
        ? {
            nearestBuildingDistanceM: neighbor.nearestDistanceM,
            nearestRoadCenterlineDistanceM: neighbor.nearestRoadCenterlineDistanceM,
            buildingCount40m: neighbor.count40m,
            accessRoadNearby: neighbor.accessRoadNearby,
            coverage: neighbor.coverage,
          }
        : null,
    }),
  ];

  return {
    neighborContextResult,
    surroundingsResult,
    noiseResult,
    siteConstraintsPatch: patch,
    violations,
  };
}
