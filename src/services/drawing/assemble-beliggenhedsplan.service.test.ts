// src/services/drawing/assemble-beliggenhedsplan.service.test.ts
import { describe, it, expect } from "bun:test";
import { assembleBeliggenhedsplan } from "./assemble-beliggenhedsplan.service";
import type { DrawingGeometrySourcePort } from "@/domain/drawing/ports";
import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  GeoJsonPolygon25832,
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
  labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [720010, 6170010] },
  source: registrySourceMeta(now),
};

const fakeExisting: ExistingFeaturesLayer = {
  buildings: [],
  fences: [],
  source: { source: "registry", confidence: "low", fetchedAt: null, requiresReview: true },
};

const fakeSource: DrawingGeometrySourcePort = {
  fetchParcelLayers: async () => fakeParcel,
  fetchNeighborBuildings: async () => fakeExisting,
  fetchRoadGeometry: async () => ({ centerline25832: null }),
  fetchPlandataLayers: async () => [],
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
  bygherre: null,
  sagNr: null,
  revision: "A",
  date: "2026-05-25",
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
      metadata: baseMeta,
      geometrySource: fakeSource,
      survey: null,
    });
    expect(result.plan?.proposed.footprintAreaM2).toBeCloseTo(100, 0);
  });
});
