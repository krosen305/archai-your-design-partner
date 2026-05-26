import { describe, it, expect } from "bun:test";
import { sourceResultTtlDays } from "./cache-policy";

describe("sourceResultTtlDays", () => {
  it("returnerer 90 dage for geodanmark_nabo", () => {
    expect(sourceResultTtlDays("geodanmark_nabo")).toBe(90);
  });

  it("returnerer 90 dage for mat_neighbor_parcels", () => {
    expect(sourceResultTtlDays("mat_neighbor_parcels")).toBe(90);
  });

  it("returnerer 30 dage for plandata_surroundings", () => {
    expect(sourceResultTtlDays("plandata_surroundings")).toBe(30);
  });

  it("returnerer 180 dage for mst_noise", () => {
    expect(sourceResultTtlDays("mst_noise")).toBe(180);
  });

  it("returnerer default 30 for ukendt source kind", () => {
    expect(sourceResultTtlDays("noget_ukendt")).toBe(30);
  });
});
