import { beforeEach, describe, expect, it, mock } from "bun:test";
import { VurService } from "./client";

describe("VurService.getVurdering", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returns error on invalid bfe", async () => {
    const result = await VurService.getVurdering("abc", {
      apiKey: "x",
      endpoint: "https://example.com",
    });
    expect(result.fejl).toContain("Ugyldigt BFE");
  });

  it("fetches 3-step chain and returns newest year", async () => {
    let i = 0;
    const responses = [
      { data: { VUR_BFEKrydsreference: { nodes: [{ fkEjendomsvurderingID: 10 }] } } },
      { data: { VUR_Ejendomsvurdering: { nodes: [{ fkVurderingsejendomID: 20 }] } } },
      {
        data: {
          VUR_Ejendomsvurdering: {
            nodes: [
              {
                aar: 2020,
                ejendomvaerdiBeloeb: 2_000_000,
                grundvaerdiBeloeb: 800_000,
                vurderetAreal: 700,
              },
              {
                aar: 2024,
                ejendomvaerdiBeloeb: 3_000_000,
                grundvaerdiBeloeb: 1_200_000,
                vurderetAreal: 710,
              },
            ],
          },
        },
      },
    ];

    globalThis.fetch = mock(async () => {
      const body = responses[i++]!;
      return { ok: true, status: 200, text: async () => JSON.stringify(body) } as Response;
    }) as any;

    const result = await VurService.getVurdering("12345", {
      apiKey: "x",
      endpoint: "https://example.com",
    });

    expect(result.vurderingsaar).toBe(2024);
    expect(result.ejendomsvaerdi).toBe(3_000_000);
    expect(result.fejl).toBeNull();
  });
});
