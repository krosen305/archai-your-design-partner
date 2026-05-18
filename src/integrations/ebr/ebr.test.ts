import { beforeEach, describe, expect, it, mock } from "bun:test";
import { EbrService } from "./client";

const MOCK_CONFIG = { apiKey: "x", endpoint: "https://example.com" };

function mockFetch(responses: { json: unknown }[]) {
  let callIndex = 0;
  globalThis.fetch = mock(async () => {
    const response = responses[callIndex++ % responses.length];
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(response.json),
    } as Response;
  }) as any;
}

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
    const fetchSpy = mock(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.variables.registreringstid).toBe(body.variables.virkningstid);
      expect(body.query).toContain("registreringstid");
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
    });
    globalThis.fetch = fetchSpy as any;

    const result = await EbrService.getBfeNr("id-1", {
      apiKey: "x",
      endpoint: "https://example.com",
    });
    expect(result).toEqual({ bfeNr: "1234567", fejl: null });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("EbrService.getBfeNrByAdresse (ARCH-225)", () => {
  it("finder BFE via adresseLokalId (ejerlejlighed)", async () => {
    mockFetch([
      {
        json: {
          data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "289814" }] } },
        },
      },
    ]);
    const result = await EbrService.getBfeNrByAdresse("some-adresse-id", MOCK_CONFIG);
    expect(result.bfeNr).toBe("289814");
    expect(result.fejl).toBeNull();
  });

  it("returnerer null + fejl når ingen EBR-node for adresseLokalId", async () => {
    mockFetch([{ json: { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } } }]);
    const result = await EbrService.getBfeNrByAdresse("ingen-id", MOCK_CONFIG);
    expect(result.bfeNr).toBeNull();
    expect(result.fejl).toBeTruthy();
  });
});
