// src/services/drawing/assemble-beliggenhedsplan.service.ts
import type {
  BeliggenhedsplanInput,
  DrawingMetadata,
  GeoJsonPolygon25832,
  SurveyLayer,
} from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingGeometrySourcePort } from "@/domain/drawing/ports";
import {
  classifyDrawingReadiness,
  type DrawingReadinessDecision,
} from "@/domain/drawing/decision-engine";
import {
  polygonAreaM2,
  distanceToNearestBoundaryM,
  splitPolygonIntoBoundarySegments,
} from "@/domain/drawing/geometry-engine";
import { generatedSourceMeta } from "@/domain/drawing/source-quality";

type AssembleInput = {
  matrikelId: string;
  kommunekode: string;
  addressId: string;
  proposedFootprint25832: GeoJsonPolygon25832;
  projectId: string;
  metadata: DrawingMetadata;
  geometrySource: DrawingGeometrySourcePort;
  survey: SurveyLayer | null;
};

type AssembleResult = {
  plan: BeliggenhedsplanInput | null;
  readiness: DrawingReadinessDecision;
};

export async function assembleBeliggenhedsplan(
  input: AssembleInput,
): Promise<AssembleResult> {
  const {
    matrikelId,
    kommunekode,
    proposedFootprint25832,
    geometrySource,
    survey,
    metadata,
  } = input;

  const parcel = await geometrySource.fetchParcelLayers(matrikelId);

  if (!parcel) {
    return {
      plan: null,
      readiness: classifyDrawingReadiness({
        hasAddress: true,
        hasMatrikel: true,
        hasParcelPolygon: false,
        hasProposedFootprint: true,
        hasCrsContract: true,
        parcelAreaDiscrepancyPct: 0,
        minDistanceToSetbackLineM: 999,
        setbackRequirementM: 2.5,
        hasOpmaalteKoter: false,
        hasDhmKoter: false,
        hasExistingBuildingGeometry: false,
        missingDataPoints: ["parcel.polygon25832"],
      }),
    };
  }

  const parcelWithSegments = {
    ...parcel,
    boundarySegments:
      parcel.boundarySegments.length > 0
        ? parcel.boundarySegments
        : splitPolygonIntoBoundarySegments(parcel.polygon25832),
  };

  const xs = parcel.polygon25832.coordinates[0].map((c) => c[0]);
  const ys = parcel.polygon25832.coordinates[0].map((c) => c[1]);
  const bbox: [number, number, number, number] = [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];

  const [existing, constraints] = await Promise.all([
    geometrySource.fetchNeighborBuildings(bbox),
    geometrySource.fetchPlandataLayers(kommunekode, bbox),
  ]);

  const footprintAreaM2 = polygonAreaM2(proposedFootprint25832);
  const minDistanceToBoundaryM = distanceToNearestBoundaryM(
    proposedFootprint25832,
    parcelWithSegments.polygon25832,
  );
  const areaDiscrepancyPct =
    (parcelWithSegments.areaDiscrepancyM2 / parcelWithSegments.areaRegisteredM2) * 100;

  const plan: BeliggenhedsplanInput = {
    crs: "EPSG:25832",
    parcel: parcelWithSegments,
    survey,
    existing,
    proposed: {
      footprint25832: proposedFootprint25832,
      rotationDeg: 0,
      footprintAreaM2,
      storeys: 1,
      heightM: null,
      sokkelKoteM: null,
      source: generatedSourceMeta(),
    },
    constraints,
    utilities: [],
    siteUse: [],
    terrain: null,
    metadata,
  };

  const readiness = classifyDrawingReadiness({
    hasAddress: !!metadata.address,
    hasMatrikel: !!metadata.matrikel,
    hasParcelPolygon: true,
    hasProposedFootprint: true,
    hasCrsContract: true,
    parcelAreaDiscrepancyPct: areaDiscrepancyPct,
    minDistanceToSetbackLineM: minDistanceToBoundaryM,
    setbackRequirementM: 2.5,
    hasOpmaalteKoter: (survey?.terrainPoints.length ?? 0) > 0,
    hasDhmKoter: false,
    hasExistingBuildingGeometry: existing.buildings.length > 0,
    missingDataPoints: [],
  });

  return { plan, readiness };
}
