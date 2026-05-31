import { describe, it, expect } from "bun:test";
import {
  polygonAreaM2,
  distanceToNearestBoundaryM,
  generateBuffer25832,
  splitPolygonIntoBoundarySegments,
  polygonOverlapAreaM2,
  distanceToBoundarySegments,
  buildSetbackAnnotations,
} from "./geometry-engine";
import type { GeoJsonPolygon25832 } from "./beliggenhedsplan.types";

// 20x20m parcel i EPSG:25832 koordinater (Koebenhavn-omraadet)
const parcel20x20: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [720000, 6170000],
      [720020, 6170000],
      [720020, 6170020],
      [720000, 6170020],
      [720000, 6170000],
    ],
  ],
};

// 4x4m bygning placeret 3m fra vest og 3m fra syd
const building4x4: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [720003, 6170003],
      [720007, 6170003],
      [720007, 6170007],
      [720003, 6170007],
      [720003, 6170003],
    ],
  ],
};

// Polygon helt udenfor parcellen
const outsidePolygon: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [720100, 6170100],
      [720110, 6170100],
      [720110, 6170110],
      [720100, 6170110],
      [720100, 6170100],
    ],
  ],
};

describe("polygonAreaM2", () => {
  it("beregner areal af 20x20m parcel som ~400 m2", () => {
    expect(polygonAreaM2(parcel20x20)).toBeCloseTo(400, 0);
  });
  it("beregner areal af 4x4m bygning som ~16 m2", () => {
    expect(polygonAreaM2(building4x4)).toBeCloseTo(16, 0);
  });
});

describe("distanceToNearestBoundaryM", () => {
  it("returnerer 3m naar bygning er 3m fra naermeste skel", () => {
    expect(distanceToNearestBoundaryM(building4x4, parcel20x20)).toBeCloseTo(3, 1);
  });
});

describe("generateBuffer25832", () => {
  it("buffer-polygon er stoerre end input-polygon", () => {
    const buffered = generateBuffer25832(building4x4, 2.5);
    expect(polygonAreaM2(buffered)).toBeGreaterThan(polygonAreaM2(building4x4));
  });
});

describe("polygonOverlapAreaM2", () => {
  it("returnerer 0 for ikke-overlappende polygoner", () => {
    expect(polygonOverlapAreaM2(building4x4, outsidePolygon)).toBe(0);
  });
  it("returnerer ~16 for bygning der er fuldt inden i parcel", () => {
    expect(polygonOverlapAreaM2(building4x4, parcel20x20)).toBeCloseTo(16, 0);
  });
});

describe("splitPolygonIntoBoundarySegments", () => {
  it("returnerer 4 segmenter for rektangulaer parcel", () => {
    expect(splitPolygonIntoBoundarySegments(parcel20x20)).toHaveLength(4);
  });
});

describe("distanceToBoundarySegments", () => {
  it("returnerer afstand for hvert segment", () => {
    const result = distanceToBoundarySegments(building4x4, parcel20x20);
    expect(result).toHaveLength(4);
    expect(result.every((r) => r.distanceM >= 0)).toBe(true);
  });
});

// Fixtures for buildSetbackAnnotations — simple unit-coordinate space (no real UTM needed)
const parcelSimple: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ],
  ],
};

// Building centered 5m inside all boundaries
const buildingSimple: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [5, 5],
      [15, 5],
      [15, 15],
      [5, 15],
      [5, 5],
    ],
  ],
};

describe("buildSetbackAnnotations", () => {
  it("returnerer én annotation per bygningskant", () => {
    const anns = buildSetbackAnnotations(buildingSimple, parcelSimple);
    // ring has 5 coords (closing coord = first), so 4 edges
    expect(anns.length).toBe(4);
  });

  it("afstand fra centreret 10x10 bygning i 20x20 parcel er 5m", () => {
    const anns = buildSetbackAnnotations(buildingSimple, parcelSimple);
    for (const ann of anns) {
      expect(ann.distanceM).toBeCloseTo(5, 0);
    }
  });

  it("buildingPt er midtpunkt af bygningskant", () => {
    const anns = buildSetbackAnnotations(buildingSimple, parcelSimple);
    // South edge: (5,5)→(15,5), midpoint = (10,5)
    const south = anns.find((a) => Math.abs(a.buildingPt[1] - 5) < 0.1);
    expect(south).toBeDefined();
    expect(south!.buildingPt[0]).toBeCloseTo(10, 0);
  });
});
