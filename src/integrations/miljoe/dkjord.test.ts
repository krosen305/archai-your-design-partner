import { describe, expect, it } from "bun:test";
import { DkJordService } from "./dkjord";

describe("DkJordService.getTilstand", () => {
  it("returns deterministic mock payload", async () => {
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.v1Kortlagt).toBe(false);
    expect(result.v2Kortlagt).toBe(false);
    expect(result.olietank.eksisterer).toBe(true);
  });
});
