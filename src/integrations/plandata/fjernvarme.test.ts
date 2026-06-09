import { beforeEach, describe, expect, it, mock } from "bun:test";
import { FjernvarmeService } from "./fjernvarme";

const originalFetch = globalThis.fetch;

function response(features: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify({ type: "FeatureCollection", features }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function feature(properties: Record<string, unknown>) {
  return { type: "Feature", id: "feature-1", properties };
}

function mockPlandataFetch(handler: (url: string) => Response) {
  globalThis.fetch = mock(async (input: RequestInfo | URL, _init?: RequestInit) =>
    handler(String(input)),
  ) as typeof fetch;
}

describe("FjernvarmeService.getDaekning", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("separates planned district heating from confirmed supply coverage", async () => {
    mockPlandataFetch((url) => {
      if (url.includes("varmeplansomraade")) {
        return response([
          feature({
            type1207: 1,
            vaerdi1207: "Fjernvarme",
            konvstartaar: 2026,
            virknavn: "Test Varme",
          }),
        ]);
      }
      return response([]);
    });

    const result = await FjernvarmeService.getDaekning({ lat: 55.7, lng: 12.5 });

    expect(result.fjernvarmeDaekket).toBe(false);
    expect(result.fjernvarmePlanlagt).toBe(true);
    expect(result.confidence).toBe("estimated");
    expect(result.konverteringStartAar).toBe(2026);
    expect(result.forsyningsselskabNavn).toBe("Test Varme");
  });

  it("does not treat individual heat-plan areas as district heating", async () => {
    mockPlandataFetch((url) => {
      if (url.includes("varmeplansomraade")) {
        return response([feature({ type1207: 2, vaerdi1207: "Individuel varmeforsyning" })]);
      }
      return response([]);
    });

    const result = await FjernvarmeService.getDaekning({ lat: 55.7, lng: 12.5 });

    expect(result.fjernvarmeDaekket).toBe(false);
    expect(result.fjernvarmePlanlagt).toBe(false);
    expect(result.confidence).toBe("missing");
  });

  it("returns confirmed when a district-heating supply area is found", async () => {
    mockPlandataFetch((url) => {
      if (url.includes("forsyningomraade")) {
        return response([feature({ vaerdi1203: "Fjernvarme", virkcvr: "12345678" })]);
      }
      if (url.includes("tilslutningspligtomraade")) {
        return response([feature({ type1204b: 1 })]);
      }
      return response([]);
    });

    const result = await FjernvarmeService.getDaekning({ lat: 55.7, lng: 12.5 });

    expect(result.fjernvarmeDaekket).toBe(true);
    expect(result.tilslutningspligt).toBe(true);
    expect(result.confidence).toBe("confirmed");
    expect(result.forsyningsselskabCvr).toBe("12345678");
  });

  it("keeps non-district-heating supply bans in hits without setting fjernvarme forbud", async () => {
    mockPlandataFetch((url) => {
      if (url.includes("forsyningsforbudomraade")) {
        return response([feature({ type1205: 1, vaerdi1205: "El", navn1205: "Elvarmeforbud" })]);
      }
      return response([]);
    });

    const result = await FjernvarmeService.getDaekning({ lat: 55.7, lng: 12.5 });

    expect(result.forsyningsforbud).toBe(false);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.typeLabel).toBe("El");
  });

  it("returns null coverage and error when every WFS layer fails", async () => {
    globalThis.fetch = mock(
      async () => new Response("server error", { status: 500 }),
    ) as typeof fetch;

    const result = await FjernvarmeService.getDaekning({ lat: 55.7, lng: 12.5 });

    expect(result.fjernvarmeDaekket).toBeNull();
    expect(result.confidence).toBe("unknown");
    expect(result.fejl).toContain("HTTP 500");
  });
});
