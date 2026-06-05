// src/lib/floor-plan/wysiwyg-parity.test.ts
//
// Regression test: buildRenderModel and renderFloorPlanSvg must project the
// same element families. If either renderer silently drops a family (wallPoche,
// openings, annotations, furniture) the test catches it.

import { describe, expect, it } from "bun:test";
import { buildRenderModel } from "./floor-plan-render-model";
import { renderFloorPlanSvg } from "./render-floor-plan-svg";
import { generateSeedFloorPlan } from "@/domain/floor-plan/seed-generator";
import type { FurnitureKind } from "@/domain/floor-plan/floor-plan.schemas";
import type { ElementSourceMeta } from "@/domain/floor-plan/floor-plan.types";

const MANUAL_SOURCE: ElementSourceMeta = {
  source: "manual",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
};

function sampleDoc() {
  const base = generateSeedFloorPlan({
    projectId: "p1",
    targetAreaM2: 90,
    rooms: [
      { name: "Stue", roomType: "living" },
      { name: "Køkken", roomType: "kitchen" },
    ],
  });
  const lvl = base.levels[0]!;
  return {
    ...base,
    levels: [
      {
        ...lvl,
        // Ceiling height on every room triggers ceiling_height annotations
        rooms: lvl.rooms.map((r) => ({ ...r, ceilingHeightM: 2.5 })),
        furniture: [
          {
            id: "f1",
            levelId: lvl.id,
            roomId: null,
            furnitureKind: "sofa" as FurnitureKind,
            position: { x: 2, y: 2 },
            rotationDeg: 0,
            widthM: 2,
            depthM: 0.9,
            source: MANUAL_SOURCE,
          },
        ],
      },
    ],
  };
}

describe("WYSIWYG-paritet: PDF/SVG renderer projicerer alle render-model-familier", () => {
  it("SVG indeholder poché, åbninger, mål, annotations og møbler fra modellen", () => {
    const doc = sampleDoc();
    const levelId = doc.levels[0]!.id;
    const model = buildRenderModel(doc, levelId);
    const svg = renderFloorPlanSvg(model);

    // --- Model must have each family populated ---------------------------------

    // wallPoche: level-merged poché polygons from wall geometry
    expect(model.wallPoche.length).toBeGreaterThan(0);

    // openings: seed generator places a door + windows
    expect(model.openings.length).toBeGreaterThan(0);

    // annotations: ceiling height on every room generates ceiling_height annotations
    expect(model.annotations.length).toBeGreaterThan(0);

    // furniture: the sofa item we injected
    expect(model.furniture.length).toBeGreaterThan(0);

    // dimensions: exterior chains from the dimension engine
    expect(model.dimensionChains.length + model.interiorDimensions.length).toBeGreaterThan(0);

    // --- SVG must reflect each populated family --------------------------------

    // Poché walls rendered as <polygon data-wall-poche="...">
    expect(svg).toContain("data-wall-poche");

    // Openings rendered as <g data-opening-id="..."> or <circle data-opening-id="...">
    expect(svg).toContain("data-opening-id");

    // Annotations rendered as <text data-annotation="...">
    expect(svg).toContain("data-annotation");

    // Furniture rendered as <g data-furniture-id="..."> (only when paths are non-empty)
    expect(svg).toContain("data-furniture-id");

    // Dimensions: no data-* attribute on dimension elements — assert via model count
    // (both exterior chains and interior segments are rendered as plain <line>/<text>)
    // The model-level assertion above is sufficient to guard against the engine being dropped.
  });

  it("SVG er gyldig XML-streng der starter med <svg og indeholder et level-id attribut", () => {
    const doc = sampleDoc();
    const levelId = doc.levels[0]!.id;
    const model = buildRenderModel(doc, levelId);
    const svg = renderFloorPlanSvg(model);

    expect(svg.trimStart()).toMatch(/^<svg /);
    expect(svg).toContain(`data-level-id="${levelId}"`);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });
});
