import { describe, expect, it } from "bun:test";
import {
  deriveActiveDesignIterationUpdate,
  hasDesignIterationFields,
} from "./design-iterations.repository";

describe("hasDesignIterationFields", () => {
  it("returns false for empty patch", () => {
    expect(hasDesignIterationFields({})).toBe(false);
  });

  it("returns true for byggeoenske, husDna or budget", () => {
    expect(hasDesignIterationFields({ byggeoenske: {} })).toBe(true);
    expect(hasDesignIterationFields({ husDna: null })).toBe(true);
    expect(hasDesignIterationFields({ budget_estimate: 4_200_000 })).toBe(true);
    expect(
      hasDesignIterationFields({
        designPlacement: {
          footprintGeojson: null,
          footprintAreaM2: 90,
          centroid: { lat: 55.7, lng: 12.5 },
          rotationDeg: 0,
          floors: 1,
          heightM: null,
          minDistanceToBoundaryM: 2,
          outsideParcelAreaM2: 0,
          source: "user",
        },
      }),
    ).toBe(true);
  });
});

describe("deriveActiveDesignIterationUpdate", () => {
  it("returns null when merged design payload is empty", () => {
    expect(deriveActiveDesignIterationUpdate({}, null)).toBeNull();
  });

  it("maps byggeoenske into typed scalar fields", () => {
    const update = deriveActiveDesignIterationUpdate(
      {
        byggeoenske: {
          oensketAreal: 184,
          antalEtager: 2,
          designDroem: "Lys atriumvilla",
          inspirationsbilleder: ["a", "b"],
        },
      },
      null,
    );

    expect(update?.area_m2).toBe(184);
    expect(update?.floors).toBe(2);
    expect(update?.description).toBe("Lys atriumvilla");
    expect(update?.inspirations).toEqual(["a", "b"]);
  });

  it("keeps fractional floors in JSON but not in the smallint column", () => {
    const update = deriveActiveDesignIterationUpdate(
      {
        byggeoenske: {
          antalEtager: 1.5,
        },
      },
      null,
    );

    expect(update?.floors).toBeNull();
    expect(update?.byggeoenske).toEqual({ antalEtager: 1.5 });
  });

  it("preserves existing values when patch omits them", () => {
    const update = deriveActiveDesignIterationUpdate(
      { budget_estimate: 5_000_000 },
      {
        budget_estimate: null,
        byggeoenske: { designDroem: "Eksisterende" },
        hus_dna: { stil: "nordisk" },
        designPlacement: null,
      },
    );

    expect(update?.budget_estimate).toBe(5_000_000);
    expect(update?.description).toBe("Eksisterende");
    expect(update?.hus_dna).toEqual({ stil: "nordisk" });
  });

  it("maps designPlacement into placement columns", () => {
    const update = deriveActiveDesignIterationUpdate(
      {
        designPlacement: {
          footprintGeojson: {
            type: "Polygon",
            coordinates: [
              [
                [12.5, 55.7],
                [12.5001, 55.7],
                [12.5001, 55.7001],
                [12.5, 55.7001],
                [12.5, 55.7],
              ],
            ],
          },
          footprintAreaM2: 102,
          centroid: { lat: 55.70005, lng: 12.50005 },
          rotationDeg: 22,
          floors: 2,
          heightM: 6.5,
          minDistanceToBoundaryM: 2.8,
          outsideParcelAreaM2: 0,
          source: "user",
        },
      },
      null,
    );

    expect(update?.placement_footprint_area_m2).toBe(102);
    expect(update?.placement_centroid_lat).toBe(55.70005);
    expect(update?.placement_centroid_lng).toBe(12.50005);
    expect(update?.placement_rotation_deg).toBe(22);
    expect(update?.placement_floors).toBe(2);
    expect(update?.placement_height_m).toBe(6.5);
    expect(update?.placement_min_distance_to_boundary_m).toBe(2.8);
    expect(update?.placement_source).toBe("user");
    expect(update?.placement_footprint_geojson).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [12.5, 55.7],
          [12.5001, 55.7],
          [12.5001, 55.7001],
          [12.5, 55.7001],
          [12.5, 55.7],
        ],
      ],
    });
  });
});
