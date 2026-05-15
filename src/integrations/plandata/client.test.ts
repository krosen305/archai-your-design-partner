import { beforeEach, describe, expect, it, mock } from "bun:test";
import { PlandataService } from "./client";

describe("PlandataService", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returns validation error when coordinates are missing", async () => {
    const result = await PlandataService.getLokalplanerForKoordinat(0, 0);
    expect(result.fejl).toContain("Koordinater mangler");
  });

  it("maps lokalplan features", async () => {
    globalThis.fetch = mock(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            {
              id: "lp1",
              properties: { planid: "1", plannavn: "Plan A", komnr: 101, datovedt: 20200101 },
            },
          ],
        }),
      } as Response;
    }) as any;

    const result = await PlandataService.getLokalplanerForKoordinat(12.5, 55.7);
    expect(result.lokalplaner).toHaveLength(1);
    expect(result.lokalplaner[0]?.plannavn).toBe("Plan A");
    expect(result.fejl).toBeNull();
  });
});
