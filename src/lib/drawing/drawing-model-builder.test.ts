// src/lib/drawing/drawing-model-builder.test.ts
import { describe, it, expect } from "bun:test";
import { buildDrawingModel } from "./drawing-model-builder";
import { northUpRotationDeg } from "@/lib/geometry-utils";
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

  it("long road geometry does not control drawing scale", () => {
    const planWithLongRoad = {
      ...minimalPlan,
      vej: {
        vejnavn: "Langvej",
        centerline25832: {
          type: "LineString" as const,
          crs: "EPSG:25832" as const,
          coordinates: [
            [719000, 6169000],
            [722000, 6172000],
          ] as [number, number][],
        },
        vejkant25832: [],
        vejbreddeM: null,
        source: sourceMeta,
      },
    };

    const model = buildDrawingModel(planWithLongRoad, autoReadiness);

    expect(model.features.find((feat) => feat.kind === "road_centerline")).toBeDefined();
    expect(Number(model.titleBlock.scale.replace("1:", ""))).toBeLessThan(500);
  });

  it("REGRESSION: a long road does not change the viewport scale at all", () => {
    const baseline = buildDrawingModel(minimalPlan, autoReadiness);

    const kilometreLongRoad = {
      ...minimalPlan,
      parcel: { ...minimalPlan.parcel, roadName: "Motorvejen" },
      vej: {
        vejnavn: "Motorvejen",
        // A 4+ km centerline that dwarfs the parcel; must not affect scale.
        centerline25832: {
          type: "LineString" as const,
          crs: "EPSG:25832" as const,
          coordinates: [
            [716000, 6166000],
            [724000, 6174000],
          ] as [number, number][],
        },
        vejkant25832: [],
        vejbreddeM: null,
        source: sourceMeta,
      },
    };

    const withRoad = buildDrawingModel(kilometreLongRoad, autoReadiness);

    // Parcel + buildings drive the viewport; the road is excluded from the bbox.
    expect(withRoad.viewport.metersPerMm).toBeCloseTo(baseline.viewport.metersPerMm, 6);
    expect(withRoad.titleBlock.scale).toBe(baseline.titleBlock.scale);
  });

  it("orients the drawing toward geographic north (arrow up, geometry pre-rotated by convergence)", () => {
    const model = buildDrawingModel(minimalPlan, autoReadiness);
    const [ex, ny] = minimalPlan.parcel.labelPoint25832.coordinates;
    // The sheet is rotated by the site's grid convergence so true north points up.
    expect(model.projectionRotationDeg).toBeCloseTo(northUpRotationDeg(ex, ny), 5);
    // The fixture sits near Copenhagen ⇒ convergence ≈ +2.9°, clearly non-trivial.
    expect(Math.abs(model.projectionRotationDeg)).toBeGreaterThan(2);
    // Geometry is rotated to true north ⇒ the arrow itself points straight up.
    expect(model.northArrowRotationDeg).toBe(0);
    // The orientation basis is disclosed to the authority.
    expect(model.infoPanel.technicalNotes.some((n) => /geografisk nord/i.test(n.text))).toBe(true);
  });

  it("rotating to true north does not change parcel side-lengths (rigid transform)", () => {
    const model = buildDrawingModel(minimalPlan, autoReadiness);
    // The 20 m parcel edges must still measure 20.00 m after rotation.
    const dimFeatures = model.features.filter((f) => f.id.startsWith("parcel-dim"));
    expect(dimFeatures.some((f) => f.label === "20.00 m")).toBe(true);
  });

  it("naturbeskyttelse emits drawing features, legend and source summary", () => {
    const planWithNature: BeliggenhedsplanInput = {
      ...minimalPlan,
      naturbeskyttelse: [
        {
          type: "fortidsmindebeskyttelse",
          geometry25832: {
            type: "Polygon",
            crs: "EPSG:25832",
            coordinates: [
              [
                [720004, 6170004],
                [720016, 6170004],
                [720016, 6170016],
                [720004, 6170016],
                [720004, 6170004],
              ],
            ],
          },
          bufferDistanceM: 100,
          intersectsProposedBuilding: true,
          source: sourceMeta,
        },
      ],
    };

    const model = buildDrawingModel(planWithNature, autoReadiness);
    const natureFeature = model.features.find((feat) => feat.kind === "naturbeskyttelse_zones");

    expect(natureFeature).toBeDefined();
    expect(natureFeature?.label).toContain("Fortidsminde");
    expect(model.legend.some((item) => item.label === "Naturbeskyttelse")).toBe(true);
    expect(model.infoPanel.sourceRegister.some((e) => e.label.includes("Naturbeskyttelse"))).toBe(
      true,
    );
  });
});
