// src/lib/drawing/render-svg.test.ts
import { describe, it, expect } from "bun:test";
import { renderSvg } from "./render-svg";
import type { DrawingModel, InfoPanel } from "@/domain/drawing/drawing-model";

const infoPanel: InfoPanel = {
  siteMetrics: {
    grundarealM2: 1086,
    bebyggetArealM2: 140.57,
    etagearealM2: 271.24,
    bebyggelsesprocent: 24.98,
    calculationBasis: "BR18",
    rows: [
      { label: "Grundareal", value: 1086, display: "1.086 m²", documented: true },
      {
        label: "Bebygget areal (fodaftryk)",
        value: 140.57,
        display: "140,57 m²",
        documented: true,
      },
      { label: "Samlet etageareal", value: 271.24, display: "271,24 m²", documented: true },
      { label: "Bebyggelsesprocent", value: 24.98, display: "24,98 %", documented: true },
    ],
  },
  sourceRegister: [
    {
      label: "Matrikel (MAT WFS)",
      source: "registry",
      confidence: "high",
      fetchedAt: "2026-05-25T00:00:00Z",
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
  technicalNotes: [
    {
      category: "ledning",
      text: "Ledningsdata ikke hentet (LER). Regnvand/spildevand vist som principforslag.",
    },
  ],
  missingDataWarnings: [
    {
      label: "Sokkelkote DVR90",
      responsibleParty: "kloakmester",
      blocksSubmission: false,
      severity: "placeholder",
    },
  ],
  completenessStatus: "UDKAST — 4 punkter mangler",
};

const model: DrawingModel = {
  page: { size: "A3", orientation: "landscape", scale: 250, widthMm: 420, heightMm: 297 },
  viewport: { bbox25832: [720000, 6170000, 720100, 6170070], metersPerMm: 0.25 },
  features: [
    {
      id: "parcel-1",
      kind: "parcel_boundary",
      svgElement:
        '<polygon points="0,0 100,0 100,70 0,70" fill="none" stroke="#000" stroke-width="1"/>',
      label: null,
      labelX: null,
      labelY: null,
      zIndex: 10,
    },
  ],
  titleBlock: {
    title: "Beliggenhedsplan",
    drawingType: "Beliggenhedsplan",
    tegnNr: "1",
    address: "Testvej 1, 2000 Frederiksberg",
    matrikel: "1a Frederiksberg",
    bfeNr: null,
    bygherre: null,
    sagNr: null,
    buildingCode: "BR18",
    scale: "1:250",
    paperSize: "A3",
    date: "2026-05-25",
    revision: "A",
    disclaimer: "FORELØBIG — ikke til myndighedsbrug",
  },
  infoPanel,
  legend: [],
  northArrowRotationDeg: 0,
  projectionRotationDeg: 0,
  readinessStatus: "AUTO_DRAFT",
};

describe("renderSvg", () => {
  it("starter med <svg", () => {
    expect(renderSvg(model)).toStartWith("<svg");
  });
  it("indeholder parcel-feature id", () => {
    expect(renderSvg(model)).toContain("parcel-1");
  });
  it("indeholder adresse i titelblok", () => {
    expect(renderSvg(model)).toContain("Testvej 1");
  });
  it("indeholder nordpil (N)", () => {
    expect(renderSvg(model)).toContain(">N<");
  });
  it("nordpil honorerer northArrowRotationDeg", () => {
    expect(renderSvg({ ...model, northArrowRotationDeg: 30 })).toContain("rotate(30.0)");
    expect(renderSvg({ ...model, northArrowRotationDeg: 0 })).toContain(">N<");
  });
  it("viser projektionsnote (geografisk nord) fra technicalNotes", () => {
    const withNote: DrawingModel = {
      ...model,
      infoPanel: {
        ...model.infoPanel,
        technicalNotes: [
          ...model.infoPanel.technicalNotes,
          {
            category: "generel",
            text: "Tegningen er orienteret mod geografisk nord (EPSG:25832 drejet 2.9° for meridiankonvergens).",
          },
        ],
      },
    };
    expect(renderSvg(withNote)).toMatch(/geografisk nord/i);
  });
  it("indeholder FORELØBIG disclaimer for AUTO_DRAFT", () => {
    expect(renderSvg(model)).toContain("FORELØBIG");
  });
  it("indeholder datagrundlag-kilde fra sourceRegister", () => {
    const svg = renderSvg(model);
    expect(svg).toMatch(/datagrundlag/i);
    expect(svg).toContain("Matrikel (MAT WFS)");
  });

  it("indeholder bebyggelsesprocent fra siteMetrics", () => {
    expect(renderSvg(model)).toContain("24,98 %");
  });

  it("indeholder grundareal fra siteMetrics", () => {
    expect(renderSvg(model)).toContain("1.086 m²");
  });

  it("indeholder manglende-data-note om koter", () => {
    expect(renderSvg(model)).toContain("Koter ikke dokumenteret");
  });

  it("indeholder completeness-status UDKAST", () => {
    expect(renderSvg(model)).toContain("UDKAST");
  });

  it("indeholder skalastav-tekst", () => {
    expect(renderSvg(model)).toContain("1:250");
  });

  it("indeholder BR18-byggelinje hvis constraints har br18_setback", () => {
    const modelWithConstraint: DrawingModel = {
      ...model,
      features: [
        ...model.features,
        {
          id: "br18-1",
          kind: "setback_lines",
          svgElement:
            '<polygon points="10,10 90,10 90,60 10,60" fill="none" stroke="red" stroke-width="0.5"/>',
          label: "Byggelinje 2,5 m fra skel",
          labelX: 50,
          labelY: 10,
          zIndex: 20,
        },
      ],
    };
    expect(renderSvg(modelWithConstraint)).toContain("br18-1");
  });

  it("indeholder legend-items (signaturforklaring) fra model.legend", () => {
    const modelWithLegend: DrawingModel = {
      ...model,
      legend: [
        {
          symbol: '<rect width="12" height="8" fill="none" stroke="#000" stroke-width="1.5"/>',
          label: "Matrikelskel",
        },
        {
          symbol: '<rect width="12" height="8" fill="#d4e8ff" stroke="#00f" stroke-width="1"/>',
          label: "Nyt byggeri",
        },
      ],
    };
    const svg = renderSvg(modelWithLegend);
    expect(svg).toMatch(/signaturforklaring/i);
    expect(svg).toContain("Matrikelskel");
    expect(svg).toContain("Nyt byggeri");
  });
});
