import { describe, it, expect } from "bun:test";
import { renderPdf } from "./render-pdf";
import type { DrawingModel } from "@/domain/drawing/drawing-model";

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
      address: "Testvej 1",
      matrikel: "1a Testby By, Testby",
      bygherre: null,
      sagNr: null,
      scale: "1:250",
      paperSize: "A3",
      date: "2026-05-28",
      revision: "A",
      disclaimer: "UDKAST",
      sourceList: ["MAT WFS"],
    },
    legend: [],
    northArrowRotationDeg: 0,
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
});
