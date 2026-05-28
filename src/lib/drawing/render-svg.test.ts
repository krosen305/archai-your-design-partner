// src/lib/drawing/render-svg.test.ts
import { describe, it, expect } from "bun:test";
import { renderSvg } from "./render-svg";
import type { DrawingModel } from "@/domain/drawing/drawing-model";

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
    address: "Testvej 1, 2000 Frederiksberg",
    matrikel: "1a Frederiksberg",
    bygherre: null,
    sagNr: null,
    scale: "1:250",
    paperSize: "A3",
    date: "2026-05-25",
    revision: "A",
    disclaimer: "FORELOEBIG - ikke til myndighedsbrug",
    sourceList: ["MAT WFS 2026-05-25"],
  },
  legend: [],
  northArrowRotationDeg: 0,
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
  it("indeholder FORELOEBIG disclaimer for AUTO_DRAFT", () => {
    expect(renderSvg(model)).toContain("FORELOEBIG");
  });
  it("indeholder kildeangivelse", () => {
    expect(renderSvg(model)).toContain("MAT WFS");
  });

  it("indeholder BR18-byggelinje hvis constraints har br18_setback", () => {
    const modelWithConstraint: DrawingModel = {
      ...model,
      features: [
        ...model.features,
        {
          id: "br18-1", kind: "setback_lines",
          svgElement: '<polygon points="10,10 90,10 90,60 10,60" fill="none" stroke="red" stroke-width="0.5"/>',
          label: "Byggelinje 2,5 m fra skel", labelX: 50, labelY: 10, zIndex: 20,
        },
      ],
    };
    expect(renderSvg(modelWithConstraint)).toContain("br18-1");
  });
});
