import { beforeEach, describe, expect, it, mock } from "bun:test";
import { FbbService } from "./client";

describe("FbbService.getSaveData", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returns empty result for empty ids", async () => {
    const result = await FbbService.getSaveData([]);
    expect(result).toEqual({ fbb_bygninger: [], fbb_bedste_bygning: null });
  });

  it("maps JSON features and picks lowest save value >= 1", async () => {
    globalThis.fetch = mock(async () => {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () =>
          JSON.stringify({
            features: [
              { properties: { bygningsid: 1, bygningsnummer: 11, bevaringsvaerdi: 5 } },
              { properties: { bygningsid: 2, bygningsnummer: 22, bevaringsvaerdi: 3 } },
              { properties: { bygningsid: 3, bygningsnummer: 33, bevaringsvaerdi: -1 } },
            ],
          }),
      } as Response;
    }) as any;

    const result = await FbbService.getSaveData([1, 2, 3]);
    expect(result.fbb_bygninger).toHaveLength(3);
    expect(result.fbb_bedste_bygning?.bygningsid).toBe(2);
    expect(result.fbb_bedste_bygning?.bevaringsvaerdi).toBe(3);
  });
});
