import { describe, it, expect } from "bun:test";
import { renderPdf } from "./render-pdf";
import type { DrawingModel, InfoPanel } from "@/domain/drawing/drawing-model";

function makeInfoPanel(): InfoPanel {
  return {
    siteMetrics: {
      grundarealM2: 1086,
      bebyggetArealM2: 140.57,
      etagearealM2: null,
      bebyggelsesprocent: 12.94,
      calculationBasis: "BR18",
      rows: [
        { label: "Grundareal", value: 1086, display: "1.086 m²", documented: true },
        {
          label: "Samlet etageareal",
          value: null,
          display: "ikke dokumenteret",
          documented: false,
        },
      ],
    },
    sourceRegister: [
      {
        label: "Matrikel (MAT WFS)",
        source: "registry",
        confidence: "high",
        fetchedAt: "2026-05-28T00:00:00Z",
        documented: true,
      },
    ],
    terrain: {
      koteDatum: "DVR90",
      sokkelKoteDisplay: "angives af kloakmester",
      gulvKoteDisplay: "ikke dokumenteret",
      rygningsKoteDisplay: "angives af arkitekt",
      terrainPointCount: 0,
      documented: false,
      note: "Koter ikke dokumenteret i tilgængelige datakilder",
    },
    technicalNotes: [{ category: "kote", text: "DVR90" }],
    missingDataWarnings: [
      {
        label: "Sokkelkote DVR90",
        responsibleParty: "kloakmester",
        blocksSubmission: false,
        severity: "placeholder",
      },
    ],
    completenessStatus: "UDKAST — 5 punkter mangler",
  };
}

function makeMinimalModel(): DrawingModel {
  return {
    page: { size: "A3", orientation: "landscape", scale: 250, widthMm: 420, heightMm: 297 },
    viewport: { bbox25832: [720000, 6175000, 720100, 6175100], metersPerMm: 0.25 },
    features: [
      {
        id: "parcel",
        kind: "parcel_boundary",
        svgElement:
          '<polygon points="10,10 110,10 110,110 10,110" fill="none" stroke="#000" stroke-width="1.5"/>',
        label: "1a",
        labelX: 60,
        labelY: 60,
        zIndex: 30,
      },
    ],
    titleBlock: {
      title: "Beliggenhedsplan",
      drawingType: "Beliggenhedsplan",
      tegnNr: "1",
      address: "Testvej 1",
      matrikel: "1a Testby By, Testby",
      bfeNr: null,
      bygherre: null,
      sagNr: null,
      buildingCode: "BR18",
      scale: "1:250",
      paperSize: "A3",
      date: "2026-05-28",
      revision: "A",
      disclaimer: "UDKAST",
    },
    infoPanel: makeInfoPanel(),
    legend: [
      {
        symbol: '<rect width="12" height="8" fill="none" stroke="#000" stroke-width="1.5"/>',
        label: "Matrikelskel",
      },
    ],
    northArrowRotationDeg: 0,
    projectionRotationDeg: 0,
    readinessStatus: "AUTO_DRAFT",
  };
}

describe("renderPdf", () => {
  it("returnerer Uint8Array for en minimal model", async () => {
    const result = await renderPdf(makeMinimalModel());
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(100);
  });

  it("starter med PDF-magic bytes %PDF", async () => {
    const result = await renderPdf(makeMinimalModel());
    const header = new TextDecoder().decode(result.slice(0, 4));
    expect(header).toBe("%PDF");
  });

  it("inkluderer en model med labeler uden at kaste fejl", async () => {
    const model = makeMinimalModel();
    model.features.push({
      id: "label-1",
      kind: "labels",
      svgElement:
        '<text x="60" y="60" font-family="Arial" font-size="7" fill="#000">Testvej 1</text>',
      label: "Testvej 1",
      labelX: 60,
      labelY: 60,
      zIndex: 45,
    });
    await expect(renderPdf(model)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("renderer info-kolonne og legend uden at kaste fejl", async () => {
    await expect(renderPdf(makeMinimalModel())).resolves.toBeInstanceOf(Uint8Array);
  });
});
