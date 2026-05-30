import { describe, it, expect } from "bun:test";
import { byggefeltWgs84ToConstraintLayers } from "./drawing-constraints";
import type { BBox25832 } from "@/domain/drawing/beliggenhedsplan.types";

describe("byggefeltWgs84ToConstraintLayers", () => {
  it("konverterer WGS84 byggefelt-feature til ConstraintLayer i EPSG:25832", () => {
    const mockFeatures = [
      {
        id: "byggefelt.123",
        properties: { planid: "plan-abc", status: "V", datoikraft: "2020-01-01" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [10.0360, 56.4600],
              [10.0380, 56.4600],
              [10.0380, 56.4615],
              [10.0360, 56.4615],
              [10.0360, 56.4600],
            ],
          ],
        },
      },
    ];

    const bbox25832: BBox25832 = [573500, 6227500, 574500, 6228500];
    const result = byggefeltWgs84ToConstraintLayers(mockFeatures, bbox25832);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("building_field");
    expect(result[0]!.geometry25832.type).toBe("Polygon");
    const coords = (result[0]!.geometry25832 as { type: "Polygon"; coordinates: number[][][] }).coordinates[0]!;
    expect(coords[0]![0]).toBeGreaterThan(560000);
    expect(coords[0]![0]).toBeLessThan(580000);
    expect(result[0]!.label).toBe("Byggefelt (lokalplan)");
    expect(result[0]!.source.source).toBe("registry");
  });

  it("springer features over uden geometry", () => {
    const mockFeatures = [
      { id: "byggefelt.no-geom", properties: { status: "V" }, geometry: null },
    ];
    const bbox25832: BBox25832 = [573500, 6227500, 574500, 6228500];
    const result = byggefeltWgs84ToConstraintLayers(mockFeatures, bbox25832);
    expect(result).toHaveLength(0);
  });
});
