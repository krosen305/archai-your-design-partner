// src/services/drawing/assemble-beliggenhedsplan.service.test.ts
import { describe, it, expect } from "bun:test";
import { assembleBeliggenhedsplan } from "./assemble-beliggenhedsplan.service";
import type { DrawingGeometrySourcePort } from "@/domain/drawing/ports";
import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  GeoJsonPolygon25832,
  NaturbeskyttelseLayer,
  VejLayer,
} from "@/domain/drawing/beliggenhedsplan.types";
import { registrySourceMeta } from "@/domain/drawing/source-quality";

const now = new Date().toISOString();

const fakeParcel: ParcelLayer = {
  idLokalId: "test-id",
  bfeNr: "12345",
  matrikelnummer: "1a",
  ejerlavskode: 1234,
  ejerlavsnavn: "Testejerlav",
  polygon25832: {
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
  },
  areaRegisteredM2: 400,
  areaGeometryM2: 400,
  areaDiscrepancyM2: 0,
  boundarySegments: [],
  neighborParcels: [],
  roadName: null,
  labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [720010, 6170010] },
  source: registrySourceMeta(now),
};

const fakeExisting: ExistingFeaturesLayer = {
  buildings: [],
  fences: [],
  source: { source: "registry", confidence: "low", fetchedAt: null, requiresReview: true },
};

const fakeRoadLayer: VejLayer = {
  vejnavn: "Testvej",
  centerline25832: {
    type: "LineString",
    crs: "EPSG:25832",
    coordinates: [
      [720000, 6169996],
      [720020, 6169996],
    ],
  },
  vejkant25832: [
    {
      type: "LineString",
      crs: "EPSG:25832",
      coordinates: [
        [720000, 6169993],
        [720020, 6169993],
      ],
    },
    {
      type: "LineString",
      crs: "EPSG:25832",
      coordinates: [
        [720000, 6169999],
        [720020, 6169999],
      ],
    },
  ],
  vejbreddeM: 6,
  source: registrySourceMeta(now),
};

const fakeNaturbeskyttelseLayer: NaturbeskyttelseLayer = {
  type: "skovbyggelinje",
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
  bufferDistanceM: 300,
  intersectsProposedBuilding: false,
  source: registrySourceMeta(now),
};

const fakeSource: DrawingGeometrySourcePort = {
  fetchParcelLayers: async () => fakeParcel,
  fetchNeighborBuildings: async () => fakeExisting,
  fetchRoadGeometry: async () => fakeRoadLayer,
  fetchPlandataLayers: async () => [],
  fetchNeighborParcels: async () => [],
  fetchRoadName: async () => ({ name: "Testvej" }),
  fetchDhmKoter: async () => null,
  fetchNaturbeskyttelse: async () => [],
  fetchLerLedninger: async () => [],
  fetchKloakopland: async () => null,
  fetchFjernvarmeDaekning: async () => null,
};

const fakeFootprint: GeoJsonPolygon25832 = {
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

const baseMeta = {
  title: "Beliggenhedsplan test",
  address: "Testvej 1",
  matrikel: "1a",
  bfeNr: null,
  bygherre: null,
  sagNr: null,
  buildingCode: null as "BR18" | "BR20" | null,
  draughtsman: null,
  responsibleFirm: null,
  revisions: [{ nr: "A", description: "Udgivelse", date: "2026-05-28", by: "" }],
  areaTable: null,
  date: "2026-05-28",
  scale: 250 as const,
  paperSize: "A3" as const,
};

describe("assembleBeliggenhedsplan", () => {
  it("returnerer plan med parcel fra port", async () => {
    const result = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      sokkelKoteM: null,
      heightM: null,
      metadata: baseMeta,
      geometrySource: fakeSource,
      survey: null,
    });
    expect(result.plan?.crs).toBe("EPSG:25832");
    expect(result.plan?.parcel.matrikelnummer).toBe("1a");
    expect(result.readiness.status).not.toBe("BLOCKED_MISSING_CORE_DATA");
  });

  it("returnerer BLOCKED naar port ikke kan finde parcel", async () => {
    const nullSource: DrawingGeometrySourcePort = {
      ...fakeSource,
      fetchParcelLayers: async () => null,
    };
    const result = await assembleBeliggenhedsplan({
      matrikelId: "missing",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      sokkelKoteM: null,
      heightM: null,
      metadata: baseMeta,
      geometrySource: nullSource,
      survey: null,
    });
    expect(result.readiness.status).toBe("BLOCKED_MISSING_CORE_DATA");
    expect(result.plan).toBeNull();
  });

  it("footprintAreaM2 beregnes fra den faktiske polygon", async () => {
    const result = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      sokkelKoteM: null,
      heightM: null,
      metadata: baseMeta,
      geometrySource: fakeSource,
      survey: null,
    });
    expect(result.plan?.proposed.footprintAreaM2).toBeCloseTo(100, 0);
  });

  it("plan indeholder mandatoryAnnotations med koteDatum", async () => {
    const result = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      sokkelKoteM: null,
      heightM: null,
      metadata: baseMeta,
      geometrySource: fakeSource,
      survey: null,
    });
    expect(result.plan?.mandatoryAnnotations.koteDatum).toContain("DVR90");
  });

  it("plan indeholder BR18-byggelinje i constraints", async () => {
    const result = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      sokkelKoteM: null,
      heightM: null,
      metadata: baseMeta,
      geometrySource: fakeSource,
      survey: null,
    });
    expect(result.plan?.constraints.some((c) => c.type === "br18_setback")).toBe(true);
  });

  it("plan.parcel.roadName sættes fra fetchRoadName", async () => {
    const result = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      sokkelKoteM: null,
      heightM: null,
      metadata: baseMeta,
      geometrySource: fakeSource,
      survey: null,
    });
    expect(result.plan?.parcel.roadName).toBe("Testvej");
  });

  it("koteDatum is null when neither survey nor road centerline exists", async () => {
    const sourceWithoutRoad: DrawingGeometrySourcePort = {
      ...fakeSource,
      fetchRoadGeometry: async () => null,
    };
    const result = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      sokkelKoteM: null,
      heightM: null,
      metadata: baseMeta,
      geometrySource: sourceWithoutRoad,
      survey: null,
    });
    expect(result.plan?.mandatoryAnnotations.koteDatum).toBeNull();
    expect(result.readiness.missingDataPoints).toContain("vej.centerline25832");
  });

  it("plan.vej is set from fetchRoadGeometry and named from DAR fallback", async () => {
    const sourceWithoutRoadName: DrawingGeometrySourcePort = {
      ...fakeSource,
      fetchRoadGeometry: async () => ({ ...fakeRoadLayer, vejnavn: null }),
    };
    const result = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      sokkelKoteM: null,
      heightM: null,
      metadata: baseMeta,
      geometrySource: sourceWithoutRoadName,
      survey: null,
    });
    expect(result.plan?.vej?.vejnavn).toBe("Testvej");
    expect(result.plan?.vej?.centerline25832).not.toBeNull();
    expect(result.plan?.vej?.vejkant25832).toHaveLength(2);
  });

  it("plan indeholder naturbeskyttelseslag med beregnet footprint-overlap", async () => {
    const sourceWithNaturbeskyttelse: DrawingGeometrySourcePort = {
      ...fakeSource,
      fetchNaturbeskyttelse: async () => [fakeNaturbeskyttelseLayer],
    };

    const result = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      sokkelKoteM: null,
      heightM: null,
      metadata: baseMeta,
      geometrySource: sourceWithNaturbeskyttelse,
      survey: null,
    });

    expect(result.plan?.naturbeskyttelse).toHaveLength(1);
    expect(result.plan?.naturbeskyttelse[0]?.type).toBe("skovbyggelinje");
    expect(result.plan?.naturbeskyttelse[0]?.intersectsProposedBuilding).toBe(true);
  });

  it("plan.kloakoplandType sættes fra port naar den returnerer faelles", async () => {
    const sourceWithKloakopland: DrawingGeometrySourcePort = {
      ...fakeSource,
      fetchKloakopland: async () => "faelles",
    };
    const result = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      sokkelKoteM: null,
      heightM: null,
      metadata: baseMeta,
      geometrySource: sourceWithKloakopland,
      survey: null,
    });
    expect(result.plan?.kloakoplandType).toBe("faelles");
  });

  it("plan.kloakoplandType er null naar port returnerer null", async () => {
    const result = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: fakeFootprint,
      projectId: "proj-1",
      sokkelKoteM: null,
      heightM: null,
      metadata: baseMeta,
      geometrySource: fakeSource,
      survey: null,
    });
    expect(result.plan?.kloakoplandType).toBeNull();
  });
});
