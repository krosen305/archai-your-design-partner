// src/lib/drawing/byledet3.acceptance.test.ts
//
// Acceptance/smoke test for the Byledet 3, 2820 Gentofte reference case.
// Builds a deterministic BeliggenhedsplanInput fixture (no invented compliance,
// no network), renders SVG + PDF, and asserts the drawing carries the
// authority-grade information layers: title block, scale, north arrow,
// grundareal, bebyggelsesprocent, skelafstande, signaturforklaring and
// explicit missing-data notes.

import { describe, it, expect } from "bun:test";
import { buildDrawingModel } from "./drawing-model-builder";
import { renderSvg } from "./render-svg";
import { renderPdf } from "./render-pdf";
import type {
  BeliggenhedsplanInput,
  GeoJsonLineString25832,
  GeoJsonPolygon25832,
  LayerSourceMeta,
} from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingReadinessDecision } from "@/domain/drawing/decision-engine";

// Plausible UTM32N coordinates near Gentofte; only the relative geometry matters.
const E0 = 725000;
const N0 = 6180000;

const registry: LayerSourceMeta = {
  source: "registry",
  confidence: "high",
  fetchedAt: "2026-06-09T00:00:00Z",
  requiresReview: false,
};
const generated: LayerSourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: true,
};

function ring(coords: [number, number][]): GeoJsonPolygon25832 {
  return { type: "Polygon", crs: "EPSG:25832", coordinates: [coords] };
}
function line(coords: [number, number][]): GeoJsonLineString25832 {
  return { type: "LineString", crs: "EPSG:25832", coordinates: coords };
}

// Parcel ≈ 1086 m² (33 × 33). Building 15.23 × 9.23 ≈ 140.57 m² near the road.
const parcelPolygon = ring([
  [E0, N0],
  [E0 + 33, N0],
  [E0 + 33, N0 + 33],
  [E0, N0 + 33],
  [E0, N0],
]);

const proposedFootprint = ring([
  [E0 + 9, N0 + 21],
  [E0 + 24.23, N0 + 21],
  [E0 + 24.23, N0 + 30.23],
  [E0 + 9, N0 + 30.23],
  [E0 + 9, N0 + 21],
]);

const garageFootprint = ring([
  [E0 + 25, N0 + 3],
  [E0 + 30, N0 + 3],
  [E0 + 30, N0 + 8],
  [E0 + 25, N0 + 8],
  [E0 + 25, N0 + 3],
]);

const br18Setback = ring([
  [E0 + 2.5, N0 + 2.5],
  [E0 + 30.5, N0 + 2.5],
  [E0 + 30.5, N0 + 30.5],
  [E0 + 2.5, N0 + 30.5],
  [E0 + 2.5, N0 + 2.5],
]);

const byledet3: BeliggenhedsplanInput = {
  crs: "EPSG:25832",
  parcel: {
    idLokalId: "byledet3-id",
    bfeNr: "703036",
    matrikelnummer: "2ac",
    ejerlavskode: 100000,
    ejerlavsnavn: "Gentofte",
    polygon25832: parcelPolygon,
    areaRegisteredM2: 1086,
    areaGeometryM2: 1089,
    areaDiscrepancyM2: 3,
    boundarySegments: [],
    neighborParcels: [
      {
        matrikelnummer: "2cd",
        polygon25832: ring([
          [E0 - 33, N0],
          [E0, N0],
          [E0, N0 + 33],
          [E0 - 33, N0 + 33],
          [E0 - 33, N0],
        ]),
        labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [E0 - 16, N0 + 16] },
      },
      {
        matrikelnummer: "2dz",
        polygon25832: ring([
          [E0 + 33, N0],
          [E0 + 66, N0],
          [E0 + 66, N0 + 33],
          [E0 + 33, N0 + 33],
          [E0 + 33, N0],
        ]),
        labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [E0 + 49, N0 + 16] },
      },
    ],
    labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [E0 + 16, N0 + 16] },
    roadName: "Byledet",
    source: registry,
  },
  survey: null,
  existing: {
    buildings: [
      {
        bbrId: null,
        footprint25832: garageFootprint,
        usageCode: null,
        areaM2: 25,
        sokkelKoteM: null,
        nedrives: false,
        source: registry,
      },
    ],
    fences: [],
    source: registry,
  },
  proposed: {
    footprint25832: proposedFootprint,
    rotationDeg: 0,
    footprintAreaM2: 140.57,
    storeys: 2,
    heightM: null,
    sokkelKoteM: null, // honest: not surveyed
    finishedFloorKoteM: null,
    terrainOffsetM: null,
    dimensions: [],
    tagform: null,
    taghaldningGrad: null,
    rygningsKoteM: null,
    source: generated,
  },
  constraints: [
    {
      type: "br18_setback",
      geometry25832: br18Setback,
      label: "Byggelinje 2,5 m fra skel jf. BR18",
      ruleText: "BR18 §185 stk. 1",
      ruleReference: "BR18",
      source: generated,
    },
  ],
  utilities: [],
  siteUse: [],
  terrain: null,
  metadata: {
    title: "Beliggenhedsplan",
    address: "Byledet 3, 2820 Gentofte",
    matrikel: "2ac",
    bfeNr: "703036",
    bygherre: "Michelle og Thomas Lykke Mølmer",
    sagNr: "703036",
    buildingCode: "BR18",
    draughtsman: null,
    responsibleFirm: null,
    revisions: [],
    areaTable: {
      grundarealM2: 1086,
      groundFloorM2: 140.57,
      firstFloorM2: 130.67,
      doubleHeightDeductionM2: 9.9,
      totalResidentialM2: 271.24,
      coveragePercent: 24.98,
      calculationBasis: "BR18 §452",
    },
    date: "2026-06-09",
    scale: 250,
    paperSize: "A3",
  },
  mandatoryAnnotations: {
    koteDatum: "Alle koter er faktiske DVR90 i meter målt fra midte vej",
    terrainSurveyedBy: null,
    sewerResponsibility: null,
    ratBarrierNote: null,
  },
  vej: {
    vejnavn: "Byledet",
    centerline25832: line([
      [E0 - 5, N0 + 35],
      [E0 + 38, N0 + 35],
    ]),
    vejkant25832: [
      line([
        [E0 - 5, N0 + 34],
        [E0 + 38, N0 + 34],
      ]),
    ],
    vejbreddeM: 6,
    source: registry,
  },
  naturbeskyttelse: [],
  lerLedninger: [],
  kloakoplandType: null,
  fjernvarme: null,
};

const autoDraft: DrawingReadinessDecision = {
  status: "AUTO_DRAFT",
  reasons: [],
  missingDataPoints: [],
  reviewRequiredBy: [],
};

describe("Byledet 3 — beliggenhedsplan acceptance", () => {
  const model = buildDrawingModel(byledet3, autoDraft);
  const svg = renderSvg(model);

  it("renders a title block (drawing type, address, matrikel)", () => {
    expect(svg).toContain("Beliggenhedsplan");
    expect(svg).toContain("Byledet 3");
    expect(svg).toContain("2ac");
  });

  it("renders a north arrow", () => {
    expect(svg).toContain(">N<");
  });

  it("renders a scale and scale bar", () => {
    expect(svg).toMatch(/1:\d+/);
    expect(svg).toContain("1:250");
  });

  it("renders grundareal in the site-metrics field", () => {
    expect(svg).toContain("1.086 m²");
  });

  it("renders a bebyggelsesprocent field", () => {
    expect(svg).toContain("24,98 %");
  });

  it("renders skelafstande (setback distance annotations)", () => {
    const setbacks = model.features.filter((f) => f.id.startsWith("setback-ann"));
    expect(setbacks.length).toBeGreaterThan(0);
    // setback annotations are drawn in the authority red
    expect(svg).toContain("#b00");
  });

  it("renders a BR18 byggelinje constraint + legend entry", () => {
    expect(model.features.some((f) => f.kind === "setback_lines")).toBe(true);
    expect(model.legend.some((l) => l.label === "Byggelinje BR18")).toBe(true);
  });

  it("renders a signaturforklaring (legend)", () => {
    expect(svg).toMatch(/signaturforklaring/i);
    expect(svg).toContain("Matrikelskel");
  });

  it("shows concrete missing-data notes instead of inventing values", () => {
    expect(svg).toMatch(/manglende/i);
    expect(svg).toContain("Koter ikke dokumenteret");
    // no fabricated sokkelkote number — it is delegated, not invented
    expect(model.infoPanel.terrain.sokkelKoteDisplay).toContain("kloakmester");
    expect(model.infoPanel.siteMetrics.bebyggelsesprocent).toBeCloseTo(24.98, 2);
  });

  it("renders road name and neighbour parcels", () => {
    expect(svg).toContain("Byledet");
    expect(svg).toContain("2cd");
    expect(svg).toContain("2dz");
  });

  it("keeps a sane scale (parcel-driven, not road-driven)", () => {
    expect(Number(model.titleBlock.scale.replace("1:", ""))).toBeLessThan(500);
  });

  it("generates a valid PDF", async () => {
    const pdf = await renderPdf(model);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});
