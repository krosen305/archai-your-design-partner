// src/services/drawing/assemble-beliggenhedsplan.service.ts
import type {
  BeliggenhedsplanInput,
  DrawingMetadata,
  GeoJsonPolygon25832,
  SurveyLayer,
  MandatoryAnnotations,
  ConstraintLayer,
  NaturbeskyttelseLayer,
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
  polygonsIntersect,
} from "@/domain/drawing/geometry-engine";
import { NaturbeskyttelseLayerSchema } from "@/domain/drawing/beliggenhedsplan.schemas";
import { generatedSourceMeta } from "@/domain/drawing/source-quality";
import { utm32ToWgs84 } from "@/lib/geometry-utils";
import { makeOkResult } from "@/lib/source-result";

const NATURBESKYTTELSE_GEOMETRY_SOURCE_KIND = "naturbeskyttelse_geometry";

type AssembleInput = {
  matrikelId: string;
  kommunekode: string;
  addressId: string;
  proposedFootprint25832: GeoJsonPolygon25832;
  projectId: string;
  sokkelKoteM: number | null;
  heightM: number | null;
  metadata: DrawingMetadata;
  geometrySource: DrawingGeometrySourcePort;
  survey: SurveyLayer | null;
};

type AssembleResult = {
  plan: BeliggenhedsplanInput | null;
  readiness: DrawingReadinessDecision;
};

function buildMandatoryAnnotations(input: {
  hasSurvey: boolean;
  hasUtilities: boolean;
  hasRoadCenterline: boolean;
}): MandatoryAnnotations {
  const { hasSurvey, hasUtilities, hasRoadCenterline } = input;
  return {
    koteDatum:
      hasSurvey || hasRoadCenterline
        ? "Alle koter er faktiske DVR90 i meter målt fra midte vej"
        : null,
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

function applyNaturbeskyttelseIntersections(
  layers: NaturbeskyttelseLayer[],
  proposedFootprint25832: GeoJsonPolygon25832,
): NaturbeskyttelseLayer[] {
  return layers.map((layer) => {
    if (layer.geometry25832.type !== "Polygon") {
      return { ...layer, intersectsProposedBuilding: false };
    }

    return {
      ...layer,
      intersectsProposedBuilding: polygonsIntersect(proposedFootprint25832, layer.geometry25832),
    };
  });
}

async function fetchNaturbeskyttelseWithCache(input: {
  addressId: string;
  bbox25832: [number, number, number, number];
  geometrySource: DrawingGeometrySourcePort;
}): Promise<NaturbeskyttelseLayer[]> {
  const layerArraySchema = NaturbeskyttelseLayerSchema.array();

  try {
    const { getCachedSourceResult } = await import("@/integrations/cache/client");
    const cached = await getCachedSourceResult(
      input.addressId,
      NATURBESKYTTELSE_GEOMETRY_SOURCE_KIND,
      layerArraySchema,
    );
    if (cached?.data) return cached.data;
  } catch {
    // Cache is an optimization for drawing generation; live registry fetch remains the fallback.
  }

  const liveLayers = layerArraySchema.parse(
    await input.geometrySource.fetchNaturbeskyttelse(input.bbox25832),
  );

  if (liveLayers.length > 0) {
    try {
      const { setCachedSourceResult } = await import("@/integrations/cache/client");
      await setCachedSourceResult(
        input.addressId,
        NATURBESKYTTELSE_GEOMETRY_SOURCE_KIND,
        makeOkResult(liveLayers, {
          kilde: NATURBESKYTTELSE_GEOMETRY_SOURCE_KIND,
          sourceUrl: "DMP GeoServer + SLKS WFS + Datafordeler MAT WFS",
          rawFeatureCount: liveLayers.length,
          confidence: "confirmed",
        }),
      );
    } catch {
      // Do not fail drawing export if shared source-result cache is unavailable.
    }
  }

  return liveLayers;
}

export async function assembleBeliggenhedsplan(input: AssembleInput): Promise<AssembleResult> {
  const {
    matrikelId,
    kommunekode,
    addressId,
    proposedFootprint25832,
    geometrySource,
    survey,
    metadata,
    sokkelKoteM,
    heightM,
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
        hasRoadCenterlineGeometry: false,
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

  const centroidCoords = parcel.labelPoint25832.coordinates;
  const { lat: centroidLat, lng: centroidLng } = utm32ToWgs84(centroidCoords[0], centroidCoords[1]);

  const [
    existing,
    constraints,
    neighborParcels,
    roadNameResult,
    roadGeometry,
    dhmTerrain,
    naturbeskyttelseRaw,
    kloakoplandType,
  ] = await Promise.all([
    geometrySource.fetchNeighborBuildings(bbox),
    geometrySource.fetchPlandataLayers(kommunekode, bbox),
    geometrySource.fetchNeighborParcels(parcel.idLokalId, bbox),
    geometrySource.fetchRoadName(addressId),
    geometrySource.fetchRoadGeometry(addressId, bbox),
    geometrySource.fetchDhmKoter(bbox, centroidLat, centroidLng),
    fetchNaturbeskyttelseWithCache({ addressId, bbox25832: bbox, geometrySource }),
    geometrySource.fetchKloakopland(kommunekode, bbox),
  ]);
  const naturbeskyttelse = applyNaturbeskyttelseIntersections(
    naturbeskyttelseRaw,
    proposedFootprint25832,
  );

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
  const roadLayer = roadGeometry
    ? { ...roadGeometry, vejnavn: roadGeometry.vejnavn ?? roadNameResult.name }
    : null;
  const hasRoadCenterlineGeometry = roadLayer?.centerline25832 !== null && roadLayer !== null;
  const missingDataPoints = [
    ...(hasRoadCenterlineGeometry ? [] : ["vej.centerline25832"]),
    ...(roadLayer?.vejkant25832.length ? [] : ["vej.vejkant25832"]),
  ];

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
      heightM: heightM,
      sokkelKoteM: sokkelKoteM,
      finishedFloorKoteM: sokkelKoteM !== null ? sokkelKoteM + 0.15 : null,
      terrainOffsetM: null,
      dimensions: [],
      tagform: null,
      taghaldningGrad: null,
      rygningsKoteM: null,
      source: generatedSourceMeta(),
    },
    constraints: allConstraints,
    utilities: [],
    siteUse: [],
    terrain: dhmTerrain,
    metadata,
    mandatoryAnnotations: buildMandatoryAnnotations({
      hasSurvey: survey !== null,
      hasUtilities: false,
      hasRoadCenterline: hasRoadCenterlineGeometry,
    }),
    vej: roadLayer,
    naturbeskyttelse,
    lerLedninger: [],
    kloakoplandType,
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
    hasDhmKoter: dhmTerrain !== null,
    hasExistingBuildingGeometry: existing.buildings.length > 0,
    missingDataPoints,
    hasRoadCenterlineGeometry,
    hasCenterlineDeklaration,
    hasSurveyorAttestation: !!survey?.surveyorName,
  });

  return { plan, readiness };
}
