// src/services/drawing/assemble-beliggenhedsplan.service.ts
import type {
  BeliggenhedsplanInput,
  DrawingMetadata,
  GeoJsonPolygon25832,
  SurveyLayer,
  MandatoryAnnotations,
  ConstraintLayer,
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
  generateBuffer25832,
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

function buildMandatoryAnnotations(
  hasSurvey: boolean,
  hasUtilities: boolean,
): MandatoryAnnotations {
  return {
    koteDatum: "Alle koter er faktiske DVR90 i meter målt fra midte vej",
    terrainSurveyedBy: hasSurvey ? "Terræn/grund indmålt af landinspektør" : null,
    sewerResponsibility: hasUtilities ? "Arbejdet udføres af Aut. Kloakmester" : null,
    ratBarrierNote: hasUtilities
      ? "Rottespærre placeres i parcelbrand eller 1. spildevandsbrand på grunden"
      : null,
  };
}

function buildBr18Constraint(parcelPolygon: GeoJsonPolygon25832): ConstraintLayer {
  const buffer = generateBuffer25832(parcelPolygon, -2.5);
  const now = new Date().toISOString();
  return {
    type: "br18_setback",
    geometry25832: buffer,
    label: "Byggelinje 2,5 m fra skel jf. BR18",
    ruleText: "BR18 §185 stk. 1",
    ruleReference: "BR18",
    source: { source: "generated", confidence: "high", fetchedAt: now, requiresReview: false },
  };
}

export async function assembleBeliggenhedsplan(
  input: AssembleInput,
): Promise<AssembleResult> {
  const {
    matrikelId,
    kommunekode,
    addressId,
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
        hasRoadCenterlineGeometry: true,
        hasCenterlineDeklaration: false,
        hasSurveyorAttestation: false,
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

  const [existing, constraints, neighborParcels, roadNameResult] = await Promise.all([
    geometrySource.fetchNeighborBuildings(bbox),
    geometrySource.fetchPlandataLayers(kommunekode, bbox),
    geometrySource.fetchNeighborParcels(parcel.idLokalId, bbox),
    geometrySource.fetchRoadName(addressId),
  ]);

  const br18Constraint = buildBr18Constraint(parcelWithSegments.polygon25832);
  const allConstraints: ConstraintLayer[] = [br18Constraint, ...constraints];

  const footprintAreaM2 = polygonAreaM2(proposedFootprint25832);
  const minDistanceToBoundaryM = distanceToNearestBoundaryM(
    proposedFootprint25832,
    parcelWithSegments.polygon25832,
  );
  const areaDiscrepancyPct =
    (parcelWithSegments.areaDiscrepancyM2 / parcelWithSegments.areaRegisteredM2) * 100;
  const hasCenterlineDeklaration = allConstraints.some(
    (c) => c.type === "road_centerline_deklaration",
  );

  const parcelWithNeighbors = {
    ...parcelWithSegments,
    neighborParcels,
    roadName: roadNameResult.name,
  };

  const plan: BeliggenhedsplanInput = {
    crs: "EPSG:25832",
    parcel: parcelWithNeighbors,
    survey,
    existing,
    proposed: {
      footprint25832: proposedFootprint25832,
      rotationDeg: 0,
      footprintAreaM2,
      storeys: 1,
      heightM: null,
      sokkelKoteM: null,
      finishedFloorKoteM: null,
      terrainOffsetM: null,
      dimensions: [],
      source: generatedSourceMeta(),
    },
    constraints: allConstraints,
    utilities: [],
    siteUse: [],
    terrain: null,
    metadata,
    mandatoryAnnotations: buildMandatoryAnnotations(survey !== null, false),
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
    hasRoadCenterlineGeometry: true,
    hasCenterlineDeklaration,
    hasSurveyorAttestation: !!(survey?.surveyorName),
  });

  return { plan, readiness };
}
