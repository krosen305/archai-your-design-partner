// src/lib/drawing/drawing-model-builder.test.ts
import { describe, it, expect } from "bun:test";
import { buildDrawingModel } from "./drawing-model-builder";
import type {
  BeliggenhedsplanInput,
  GeoJsonPolygon25832,
} from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingReadinessDecision } from "@/domain/drawing/decision-engine";

const parcelPolygon: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [720000, 6170000],
      [720020, 6170000],
      [720020, 6170020],
      [720000, 6170020],
      [720000, 6170000],
    ],
  ],
};

const proposedFootprint: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [720005, 6170005],
      [720015, 6170005],
      [720015, 6170015],
      [720005, 6170015],
      [720005, 6170005],
    ],
  ],
};

const existingBuildingFootprint: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [720002, 6170002],
      [720006, 6170002],
      [720006, 6170006],
      [720002, 6170006],
      [720002, 6170002],
    ],
  ],
};

const sourceMeta = {
  source: "registry" as const,
  confidence: "high" as const,
  fetchedAt: "2026-05-30T00:00:00Z",
  requiresReview: false,
};

const minimalPlan: BeliggenhedsplanInput = {
  crs: "EPSG:25832",
  parcel: {
    idLokalId: "test-id",
    bfeNr: "12345",
    matrikelnummer: "7b",
    ejerlavskode: 1234,
    ejerlavsnavn: "Testejerlav",
    polygon25832: parcelPolygon,
    areaRegisteredM2: 400,
    areaGeometryM2: 400,
    areaDiscrepancyM2: 0,
    boundarySegments: [],
    neighborParcels: [],
    labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [720010, 6170010] },
    roadName: null,
    source: sourceMeta,
  },
  survey: null,
  existing: {
    buildings: [
      {
        bbrId: null,
        footprint25832: existingBuildingFootprint,
        usageCode: null,
        areaM2: 16,
        sokkelKoteM: null,
        nedrives: false,
        source: sourceMeta,
      },
    ],
    fences: [],
    source: sourceMeta,
  },
  proposed: {
    footprint25832: proposedFootprint,
    rotationDeg: 0,
    footprintAreaM2: 100,
    storeys: 1,
    heightM: null,
    sokkelKoteM: null,
    finishedFloorKoteM: null,
    terrainOffsetM: null,
    dimensions: [],
    tagform: null,
    taghaldningGrad: null,
    rygningsKoteM: null,
    source: sourceMeta,
  },
  constraints: [],
  utilities: [],
  siteUse: [],
  terrain: null,
  metadata: {
    title: "Beliggenhedsplan test",
    address: "Testvej 1",
    matrikel: "7b",
    bfeNr: null,
    bygherre: null,
    sagNr: null,
    buildingCode: null,
    draughtsman: null,
    responsibleFirm: null,
    revisions: [{ nr: "A", description: "Udgivelse", date: "2026-05-30", by: "" }],
    areaTable: null,
    date: "2026-05-30",
    scale: 250,
    paperSize: "A3",
  },
  mandatoryAnnotations: {
    koteDatum: "DVR90",
    terrainSurveyedBy: null,
    sewerResponsibility: null,
    ratBarrierNote: null,
  },
  vej: null,
  naturbeskyttelse: [],
  lerLedninger: [],
  kloakoplandType: null,
};

const autoReadiness: DrawingReadinessDecision = {
  status: "AUTO_DRAFT",
  reasons: [],
  missingDataPoints: [],
  reviewRequiredBy: [],
};

describe("buildDrawingModel — label-rendering", () => {
  it("parcel_boundary feature indeholder <polygon og <text med matrikelnummer", () => {
    const model = buildDrawingModel(minimalPlan, autoReadiness);
    const parcelFeature = model.features.find((f) => f.kind === "parcel_boundary");
    expect(parcelFeature).toBeDefined();
    expect(parcelFeature!.svgElement).toContain("<polygon");
    expect(parcelFeature!.svgElement).toContain("<text");
    expect(parcelFeature!.svgElement).toContain("7b");
  });

  it("existing_buildings feature indeholder <polygon men IKKE <text", () => {
    const model = buildDrawingModel(minimalPlan, autoReadiness);
    const existingFeature = model.features.find((f) => f.kind === "existing_buildings");
    expect(existingFeature).toBeDefined();
    expect(existingFeature!.svgElement).toContain("<polygon");
    expect(existingFeature!.svgElement).not.toContain("<text");
  });

  it("existing_buildings svgElement er ikke pakket i <g> naar label er null", () => {
    const model = buildDrawingModel(minimalPlan, autoReadiness);
    const existingFeature = model.features.find((f) => f.kind === "existing_buildings");
    expect(existingFeature).toBeDefined();
    expect(existingFeature!.svgElement).not.toContain("<g>");
  });

  it("parcel_boundary svgElement er pakket i <g> fordi den har label", () => {
    const model = buildDrawingModel(minimalPlan, autoReadiness);
    const parcelFeature = model.features.find((f) => f.kind === "parcel_boundary");
    expect(parcelFeature).toBeDefined();
    expect(parcelFeature!.svgElement).toContain("<g>");
  });

  it("road_label feature emitted when roadName is non-empty", () => {
    const planWithRoad = {
      ...minimalPlan,
      parcel: { ...minimalPlan.parcel, roadName: "Testvej" },
    };
    const model = buildDrawingModel(planWithRoad, autoReadiness);
    const f = model.features.find((feat) => feat.kind === "road_label");
    expect(f).toBeDefined();
    expect(f!.svgElement).toContain("Testvej");
    expect(f!.label).toBe("Testvej");
  });

  it("road_label NOT emitted when roadName is null", () => {
    const model = buildDrawingModel(minimalPlan, autoReadiness);
    expect(model.features.find((feat) => feat.kind === "road_label")).toBeUndefined();
  });

  it("road_label NOT emitted when roadName is empty string", () => {
    const planEmpty = {
      ...minimalPlan,
      parcel: { ...minimalPlan.parcel, roadName: "" },
    };
    const model = buildDrawingModel(planEmpty, autoReadiness);
    expect(model.features.find((feat) => feat.kind === "road_label")).toBeUndefined();
  });

  it("road geometry emits centerline, edges and centerline label", () => {
    const planWithRoad = {
      ...minimalPlan,
      parcel: { ...minimalPlan.parcel, roadName: "Fallbackvej" },
      vej: {
        vejnavn: "Testvej",
        centerline25832: {
          type: "LineString" as const,
          crs: "EPSG:25832" as const,
          coordinates: [
            [720000, 6169996],
            [720020, 6169996],
          ] as [number, number][],
        },
        vejkant25832: [
          {
            type: "LineString" as const,
            crs: "EPSG:25832" as const,
            coordinates: [
              [720000, 6169993],
              [720020, 6169993],
            ] as [number, number][],
          },
          {
            type: "LineString" as const,
            crs: "EPSG:25832" as const,
            coordinates: [
              [720000, 6169999],
              [720020, 6169999],
            ] as [number, number][],
          },
        ],
        vejbreddeM: 6,
        source: sourceMeta,
      },
    };

    const model = buildDrawingModel(planWithRoad, autoReadiness);
    expect(model.features.find((feat) => feat.kind === "road_centerline")).toBeDefined();
    expect(model.features.filter((feat) => feat.kind === "road_edge")).toHaveLength(2);
    const roadLabel = model.features.find((feat) => feat.kind === "road_label");
    expect(roadLabel?.svgElement).toContain("Testvej");
  });
});
