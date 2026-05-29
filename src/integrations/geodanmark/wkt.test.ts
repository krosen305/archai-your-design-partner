import { describe, expect, it } from "bun:test";
import { bboxToPolygonWkt25832, parseGeoDanmarkGeometryWkt } from "./wkt";

describe("parseGeoDanmarkGeometryWkt", () => {
  it("parser Polygon Z og fjerner z-koordinat", () => {
    const geometry = parseGeoDanmarkGeometryWkt(
      "POLYGON Z ((720000 6175000 0, 720010 6175000 0, 720010 6175010 0, 720000 6175010 0, 720000 6175000 0))",
    );

    expect(geometry.type).toBe("Polygon");
    if (geometry.type !== "Polygon") throw new Error("Expected Polygon");
    expect(geometry.coordinates[0]?.[0]).toEqual([720000, 6175000]);
  });

  it("lukker polygon-ringe hvis kilden ikke har gentaget startpunktet", () => {
    const geometry = parseGeoDanmarkGeometryWkt("POLYGON ((0 0, 10 0, 10 10, 0 10))");

    expect(geometry.type).toBe("Polygon");
    if (geometry.type !== "Polygon") throw new Error("Expected Polygon");
    expect(geometry.coordinates[0]?.at(-1)).toEqual([0, 0]);
  });

  it("parser MultiPolygon Z", () => {
    const geometry = parseGeoDanmarkGeometryWkt(
      "MULTIPOLYGON Z (((0 0 1, 1 0 1, 1 1 1, 0 0 1)), ((10 10 1, 11 10 1, 11 11 1, 10 10 1)))",
    );

    expect(geometry.type).toBe("MultiPolygon");
    if (geometry.type !== "MultiPolygon") throw new Error("Expected MultiPolygon");
    expect(geometry.coordinates).toHaveLength(2);
  });

  it("parser LineString Z", () => {
    const geometry = parseGeoDanmarkGeometryWkt("LINESTRING Z (0 0 4, 10 0 4)");

    expect(geometry.type).toBe("LineString");
    if (geometry.type !== "LineString") throw new Error("Expected LineString");
    expect(geometry.coordinates).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it("parser MultiLineString", () => {
    const geometry = parseGeoDanmarkGeometryWkt("MULTILINESTRING ((0 0, 1 1), (2 2, 3 3))");

    expect(geometry.type).toBe("MultiLineString");
    if (geometry.type !== "MultiLineString") throw new Error("Expected MultiLineString");
    expect(geometry.coordinates).toHaveLength(2);
  });
});

describe("bboxToPolygonWkt25832", () => {
  it("bygger WKT polygon til spatial GraphQL filter", () => {
    expect(bboxToPolygonWkt25832([0, 1, 2, 3])).toBe("POLYGON((0 1, 2 1, 2 3, 0 3, 0 1))");
  });
});
