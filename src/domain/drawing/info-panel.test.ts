// src/domain/drawing/info-panel.test.ts
import { describe, it, expect } from "bun:test";
import { buildInfoPanel } from "./info-panel";
import { computeDrawingCompleteness } from "./completeness-engine";
import type {
  BeliggenhedsplanInput,
  GeoJsonPolygon25832,
  LayerSourceMeta,
} from "./beliggenhedsplan.types";

const sourceMeta: LayerSourceMeta = {
  source: "registry",
  confidence: "high",
  fetchedAt: "2026-06-01T00:00:00Z",
  requiresReview: false,
};

const square = (x: number, y: number, s: number): GeoJsonPolygon25832 => ({
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [x, y],
      [x + s, y],
      [x + s, y + s],
      [x, y + s],
      [x, y],
    ],
  ],
});

const basePlan: BeliggenhedsplanInput = {
  crs: "EPSG:25832",
  parcel: {
    idLokalId: "p1",
    bfeNr: "999",
    matrikelnummer: "2ac",
    ejerlavskode: 1,
    ejerlavsnavn: "Gentofte",
    polygon25832: square(720000, 6170000, 33),
    areaRegisteredM2: 1086,
    areaGeometryM2: 1086,
    areaDiscrepancyM2: 0,
    boundarySegments: [],
    neighborParcels: [],
    labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [720016, 6170016] },
    roadName: "Byledet",
    source: sourceMeta,
  },
  survey: null,
  existing: { buildings: [], fences: [], source: sourceMeta },
  proposed: {
    footprint25832: square(720008, 6170008, 12),
    rotationDeg: 0,
    footprintAreaM2: 140.57,
    storeys: 2,
    heightM: null,
    sokkelKoteM: null,
    finishedFloorKoteM: null,
    terrainOffsetM: null,
    dimensions: [],
    tagform: null,
    taghaldningGrad: null,
    rygningsKoteM: null,
    source: { source: "generated", confidence: "medium", fetchedAt: null, requiresReview: true },
  },
  constraints: [],
  utilities: [],
  siteUse: [],
  terrain: null,
  metadata: {
    title: "Beliggenhedsplan",
    address: "Byledet 3, 2820 Gentofte",
    matrikel: "2ac",
    bfeNr: "999",
    bygherre: null,
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
  vej: null,
  naturbeskyttelse: [],
  lerLedninger: [],
  kloakoplandType: null,
};

function panelFor(plan: BeliggenhedsplanInput) {
  const completeness = computeDrawingCompleteness({
    hasParcelPolygon: true,
    proposedFootprintSource: plan.proposed.source.source,
    sokkelKoteM: plan.proposed.sokkelKoteM,
    sokkelSource: plan.proposed.source.source,
    tagform: plan.proposed.tagform,
    taghaldningGrad: plan.proposed.taghaldningGrad,
    rygningsKoteM: plan.proposed.rygningsKoteM,
    vejLayer: plan.vej,
    terrainLayer: plan.terrain,
    surveyTerrainPointCount: plan.survey?.terrainPoints.length ?? 0,
    kloakoplandType: plan.kloakoplandType,
    siteUseLayers: plan.siteUse,
    naturbeskyttelseFetchedAt: null,
  });
  return buildInfoPanel({ plan, completeness });
}

describe("buildInfoPanel — siteMetrics", () => {
  it("derives grundareal, bebygget areal, etageareal and bebyggelsesprocent from areaTable", () => {
    const panel = panelFor(basePlan);
    expect(panel.siteMetrics.grundarealM2).toBe(1086);
    expect(panel.siteMetrics.bebyggetArealM2).toBe(140.57);
    expect(panel.siteMetrics.etagearealM2).toBe(271.24);
    expect(panel.siteMetrics.bebyggelsesprocent).toBeCloseTo(24.98, 2);
  });

  it("formats values in Danish notation in the render rows", () => {
    const panel = panelFor(basePlan);
    const grund = panel.siteMetrics.rows.find((r) => r.label.startsWith("Grundareal"));
    expect(grund?.display).toBe("1.086 m²");
    const coverage = panel.siteMetrics.rows.find((r) => r.label.startsWith("Bebyggelsesprocent"));
    expect(coverage?.display).toBe("24,98 %");
  });

  it("marks metrics as 'ikke dokumenteret' when no area data is available", () => {
    const plan: BeliggenhedsplanInput = {
      ...basePlan,
      parcel: { ...basePlan.parcel, areaRegisteredM2: 0 },
      proposed: { ...basePlan.proposed, footprintAreaM2: 0 },
      metadata: { ...basePlan.metadata, areaTable: null },
    };
    const panel = panelFor(plan);
    const etage = panel.siteMetrics.rows.find((r) => r.label.toLowerCase().includes("etageareal"));
    expect(etage?.documented).toBe(false);
    expect(etage?.display).toBe("ikke dokumenteret");
  });
});

describe("buildInfoPanel — sourceRegister (datagrundlag)", () => {
  it("lists the matrikel source that was actually used", () => {
    const panel = panelFor(basePlan);
    const matrikel = panel.sourceRegister.find((e) => e.label.includes("Matrikel"));
    expect(matrikel).toBeDefined();
    expect(matrikel?.source).toBe("registry");
    expect(matrikel?.fetchedAt).toBe("2026-06-01T00:00:00Z");
  });

  it("does not list layers that were not loaded", () => {
    const panel = panelFor(basePlan);
    // no vej, no terrain, no naturbeskyttelse, no LER in basePlan
    expect(panel.sourceRegister.some((e) => e.label.includes("Terræn"))).toBe(false);
    expect(panel.sourceRegister.some((e) => e.label.includes("Naturbeskyttelse"))).toBe(false);
  });
});

describe("buildInfoPanel — terrain / koter (no invented values)", () => {
  it("emits an explicit note when no kote data exists", () => {
    const panel = panelFor(basePlan);
    expect(panel.terrain.documented).toBe(false);
    expect(panel.terrain.note).toBe("Koter ikke dokumenteret i tilgængelige datakilder");
    expect(panel.terrain.sokkelKoteDisplay).not.toMatch(/\d/); // no fabricated number
  });

  it("does not fabricate a sokkelkote when sokkelKoteM is null", () => {
    const panel = panelFor(basePlan);
    expect(panel.terrain.sokkelKoteDisplay).toContain("kloakmester");
  });
});

describe("buildInfoPanel — missing data warnings (concrete & visible)", () => {
  it("surfaces placeholder fields with responsible party", () => {
    const panel = panelFor(basePlan);
    const sokkel = panel.missingDataWarnings.find((w) => w.label.includes("Sokkelkote"));
    expect(sokkel).toBeDefined();
    expect(sokkel?.responsibleParty).toBe("kloakmester");
    expect(sokkel?.severity).toBe("placeholder");
  });

  it("flags a missing proposed footprint as blocking", () => {
    const plan: BeliggenhedsplanInput = {
      ...basePlan,
      proposed: {
        ...basePlan.proposed,
        source: {
          source: "generated",
          confidence: "medium",
          fetchedAt: null,
          requiresReview: true,
        },
      },
    };
    const completeness = computeDrawingCompleteness({
      hasParcelPolygon: true,
      proposedFootprintSource: null, // simulate missing
      sokkelKoteM: null,
      sokkelSource: null,
      tagform: null,
      taghaldningGrad: null,
      rygningsKoteM: null,
      vejLayer: null,
      terrainLayer: null,
      surveyTerrainPointCount: 0,
      kloakoplandType: null,
      siteUseLayers: [],
      naturbeskyttelseFetchedAt: null,
    });
    const panel = buildInfoPanel({ plan, completeness });
    const blocking = panel.missingDataWarnings.find((w) => w.severity === "blocking");
    expect(blocking).toBeDefined();
    expect(blocking?.blocksSubmission).toBe(true);
  });

  it("sets a draft completeness status with a concrete count", () => {
    const panel = panelFor(basePlan);
    expect(panel.completenessStatus).toMatch(/UDKAST/);
    expect(panel.completenessStatus).toMatch(/punkter mangler/);
  });
});

describe("buildInfoPanel — technical notes", () => {
  it("notes that utility lines are a principforslag when no LER data is present", () => {
    const panel = panelFor(basePlan);
    const ledning = panel.technicalNotes.find((n) => n.category === "ledning");
    expect(ledning).toBeDefined();
    expect(ledning?.text.toLowerCase()).toContain("principforslag");
  });

  it("includes the kote datum note from mandatory annotations", () => {
    const panel = panelFor(basePlan);
    expect(panel.technicalNotes.some((n) => n.category === "kote")).toBe(true);
  });
});
