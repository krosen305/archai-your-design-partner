import { describe, it, expect } from "bun:test";
import {
  polygonAreaM2,
  distanceToNearestBoundaryM,
  generateBuffer25832,
  splitPolygonIntoBoundarySegments,
  polygonOverlapAreaM2,
  distanceToBoundarySegments,
  buildSetbackAnnotations,
  computeRygningsKote,
  polygonsIntersect,
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

describe("computeRygningsKote", () => {
  it("sadeltag 35 grader, 9m bred, sokkel 18.20, loft 2.40", () => {
    // taghøjde = (9/2) × tan(35°) = 4.5 × 0.7002 = 3.151
    // rygning = 18.20 + 2.40 + 3.151 = 23.751 → rounded to 2 decimals
    const result = computeRygningsKote({
      sokkelKoteM: 18.2,
      loftshøjdeM: 2.4,
      fodprintBreddeM: 9,
      tagform: "sadeltag",
      taghaldningGrad: 35,
    });
    expect(result).toBeCloseTo(23.75, 1);
  });

  it("fladt tag giver 0.15m taghøjde", () => {
    const result = computeRygningsKote({
      sokkelKoteM: 10.0,
      loftshøjdeM: 2.5,
      fodprintBreddeM: 8,
      tagform: "fladt",
      taghaldningGrad: 0,
    });
    expect(result).toBeCloseTo(12.65, 2);
  });

  it("mansard er 60% af sadeltag-taghøjde", () => {
    const sadel = computeRygningsKote({
      sokkelKoteM: 0,
      loftshøjdeM: 0,
      fodprintBreddeM: 10,
      tagform: "sadeltag",
      taghaldningGrad: 40,
    });
    const mansard = computeRygningsKote({
      sokkelKoteM: 0,
      loftshøjdeM: 0,
      fodprintBreddeM: 10,
      tagform: "mansard",
      taghaldningGrad: 40,
    });
    expect(mansard).toBeCloseTo(sadel * 0.6, 1);
  });
});

describe("polygonsIntersect", () => {
  const square: GeoJsonPolygon25832 = {
    type: "Polygon",
    crs: "EPSG:25832",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  };
  const overlapping: GeoJsonPolygon25832 = {
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
  const separate: GeoJsonPolygon25832 = {
    type: "Polygon",
    crs: "EPSG:25832",
    coordinates: [
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
        [20, 20],
      ],
    ],
  };

  it("overlapping polygons → true", () => {
    expect(polygonsIntersect(square, overlapping)).toBe(true);
  });
  it("separate polygons → false", () => {
    expect(polygonsIntersect(square, separate)).toBe(false);
  });
});
