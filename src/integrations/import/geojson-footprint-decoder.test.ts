// src/integrations/import/geojson-footprint-decoder.test.ts
import { describe, it, expect } from "bun:test";
import { decodeGeoJsonFootprint } from "./geojson-footprint-decoder";

const rawPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [720005, 6170005],
      [720015, 6170005],
      [720015, 6170015],
      [720005, 6170015],
      [720005, 6170005],
    ],
  ],
};

describe("decodeGeoJsonFootprint", () => {
  it("accepterer rå Polygon", () => {
    const result = decodeGeoJsonFootprint({
      ...rawPolygon,
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::25832" } },
    });
    expect(result.type).toBe("Polygon");
    expect(result.crs).toBe("EPSG:25832");
  });

  it("accepterer Feature med Polygon-geometri", () => {
    const result = decodeGeoJsonFootprint({
      type: "Feature",
      geometry: rawPolygon,
      properties: null,
    });
    expect(result.crs).toBe("EPSG:25832");
  });

  it("accepterer FeatureCollection og tager første Polygon", () => {
    const result = decodeGeoJsonFootprint({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: rawPolygon, properties: null }],
    });
    expect(result.crs).toBe("EPSG:25832");
  });

  it("kaster fejl for ikke-polygon geometri", () => {
    expect(() => decodeGeoJsonFootprint({ type: "Point", coordinates: [0, 0] })).toThrow();
  });

  it("kaster fejl for ugyldig struktur", () => {
    expect(() => decodeGeoJsonFootprint("ikke geojson")).toThrow();
  });
});
