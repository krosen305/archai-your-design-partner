import { beforeEach, describe, expect, it, mock } from "bun:test";
import { EbrService } from "./client";

describe("EbrService.getBfeNr", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returns validation error for empty input", async () => {
    const result = await EbrService.getBfeNr("   ", {
      apiKey: "x",
      endpoint: "https://example.com",
    });
    expect(result.bfeNr).toBeNull();
    expect(result.fejl).toContain("påkrævet");
  });

  it("returns bfe number from first node", async () => {
    globalThis.fetch = mock(async () => {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "1234567" }] },
            },
          }),
      } as Response;
    }) as any;

    const result = await EbrService.getBfeNr("id-1", {
      apiKey: "x",
      endpoint: "https://example.com",
    });
    expect(result).toEqual({ bfeNr: "1234567", fejl: null });
  });
});
