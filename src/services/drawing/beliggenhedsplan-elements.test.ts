// src/services/drawing/beliggenhedsplan-elements.test.ts
import { describe, it, expect } from "bun:test";
import { assembleBeliggenhedsplan } from "./assemble-beliggenhedsplan.service";
import type { DrawingGeometrySourcePort } from "@/domain/drawing/ports";
import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  GeoJsonPolygon25832,
  TerrainLayer,
  BBox25832,
  VejLayer,
} from "@/domain/drawing/beliggenhedsplan.types";
import { registrySourceMeta } from "@/domain/drawing/source-quality";
import { buildDrawingModel } from "@/lib/drawing/drawing-model-builder";
import { renderSvg } from "@/lib/drawing/render-svg";

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
        [720030, 6170000],
        [720030, 6170030],
        [720000, 6170030],
        [720000, 6170000],
      ],
    ],
  },
  areaRegisteredM2: 900,
  areaGeometryM2: 900,
  areaDiscrepancyM2: 0,
  boundarySegments: [],
  neighborParcels: [
    {
      matrikelnummer: "2b",
      polygon25832: {
        type: "Polygon",
        crs: "EPSG:25832",
        coordinates: [
          [
            [720030, 6170000],
            [720060, 6170000],
            [720060, 6170030],
            [720030, 6170030],
            [720030, 6170000],
          ],
        ],
      },
      labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [720045, 6170015] },
    },
  ],
  roadName: "Testvej",
  labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [720015, 6170015] },
  source: registrySourceMeta(now),
};

const fakeExisting: ExistingFeaturesLayer = {
  buildings: [],
  fences: [],
  source: { source: "registry", confidence: "low", fetchedAt: null, requiresReview: false },
};

const fakeTerrain: TerrainLayer = {
  verticalDatum: "DVR90",
  points: [{ x: 720015, y: 6170015, z: 18.5, label: "terræn", source: "registry" }],
  slopePercent: 1.2,
  lowPointM: 18.2,
  source: registrySourceMeta(now),
};

const fakeRoadLayer: VejLayer = {
  vejnavn: "Testvej",
  centerline25832: {
    type: "LineString",
    crs: "EPSG:25832",
    coordinates: [
      [720000, 6169996],
      [720030, 6169996],
    ],
  },
  vejkant25832: [
    {
      type: "LineString",
      crs: "EPSG:25832",
      coordinates: [
        [720000, 6169993],
        [720030, 6169993],
      ],
    },
    {
      type: "LineString",
      crs: "EPSG:25832",
      coordinates: [
        [720000, 6169999],
        [720030, 6169999],
      ],
    },
  ],
  vejbreddeM: 6,
  source: registrySourceMeta(now),
};

const fakeSource: DrawingGeometrySourcePort = {
  fetchParcelLayers: async (_matrikelId: string) => fakeParcel,
  fetchNeighborBuildings: async (_bbox: BBox25832) => fakeExisting,
  fetchRoadGeometry: async (_addressId: string, _bbox: BBox25832) => fakeRoadLayer,
  fetchPlandataLayers: async (_kommunekode: string, _bbox: BBox25832) => [],
  fetchNeighborParcels: async (_jordstykkeId: string, _bbox: BBox25832) => [],
  fetchRoadName: async (_addressId: string) => ({ name: "Testvej" }),
  fetchDhmKoter: async (_bbox: BBox25832, _centroidLat: number, _centroidLng: number) =>
    fakeTerrain,
  fetchNaturbeskyttelse: async (_bbox: BBox25832) => [],
  fetchLerLedninger: async (_bbox: BBox25832) => [],
  fetchKloakopland: async (_kommunekode: string, _bbox: BBox25832) => null,
  fetchFjernvarmeDaekning: async (_centroidLat: number, _centroidLng: number) => null,
};

// Bygning centreret i parcellen med 8m til alle skel
const centeredFootprint: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [720008, 6170008],
      [720022, 6170008],
      [720022, 6170022],
      [720008, 6170022],
      [720008, 6170008],
    ],
  ],
};

const baseMeta = {
  title: "Beliggenhedsplan",
  address: "Testvej 1",
  matrikel: "1a Testejerlav",
  bfeNr: "12345",
  bygherre: "Test Bygherre",
  sagNr: null,
  buildingCode: "BR18" as const,
  draughtsman: null,
  responsibleFirm: null,
  revisions: [],
  areaTable: null,
  date: "2026-05-30",
  scale: 250 as const,
  paperSize: "A3" as const,
};

describe("beliggenhedsplan SVG — lovpligtige elementer", () => {
  async function generateSvg(): Promise<string> {
    const { plan, readiness } = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: centeredFootprint,
      projectId: "proj-1",
      sokkelKoteM: 18.65,
      heightM: 8.0,
      metadata: baseMeta,
      geometrySource: fakeSource,
      survey: null,
    });
    if (!plan) throw new Error("Plan null — test setup fejl");
    const model = buildDrawingModel(plan, readiness);
    return renderSvg(model);
  }

  it("SVG indeholder matrikelnummer for parcel", async () => {
    expect(await generateSvg()).toContain("1a");
  });

  it("SVG indeholder vejnavn", async () => {
    expect(await generateSvg()).toContain("Testvej");
  });

  it("SVG indeholder skel-afstandsmål (m-annotation i rød)", async () => {
    const svg = await generateSvg();
    expect(svg).toContain(" m</text>");
    expect(svg).toContain("#b00");
  });

  it("SVG indeholder nordpil", async () => {
    expect(await generateSvg()).toContain(">N<");
  });

  it("SVG indeholder skalatav", async () => {
    expect(await generateSvg()).toContain("1:");
  });

  it("SVG indeholder DVR90 kotedatum-annotation", async () => {
    expect(await generateSvg()).toContain("DVR90");
  });

  it("SVG indeholder bygherre i titelblok", async () => {
    expect(await generateSvg()).toContain("Test Bygherre");
  });

  it("SVG indeholder adresse i titelblok", async () => {
    expect(await generateSvg()).toContain("Testvej 1");
  });

  it("readiness er AUTO_REVIEW når DHM koter og eksisterende bygningsgeometri er tilgængeligt", async () => {
    const existing: ExistingFeaturesLayer = {
      buildings: [
        {
          bbrId: "bbr-1",
          footprint25832: {
            type: "Polygon",
            crs: "EPSG:25832",
            coordinates: [
              [
                [720001, 6170001],
                [720006, 6170001],
                [720006, 6170006],
                [720001, 6170006],
                [720001, 6170001],
              ],
            ],
          },
          usageCode: "120",
          areaM2: 25,
          sokkelKoteM: null,
          nedrives: false,
          source: registrySourceMeta(now),
        },
      ],
      fences: [],
      source: registrySourceMeta(now),
    };
    const sourceWithBuildings: DrawingGeometrySourcePort = {
      ...fakeSource,
      fetchNeighborBuildings: async (_bbox: BBox25832) => existing,
    };
    const { readiness } = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: centeredFootprint,
      projectId: "proj-1",
      sokkelKoteM: 18.65,
      heightM: 8.0,
      metadata: baseMeta,
      geometrySource: sourceWithBuildings,
      survey: null,
    });
    expect(readiness.status).toBe("AUTO_REVIEW");
  });
});
