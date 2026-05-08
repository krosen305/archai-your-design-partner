import { describe, it, expect, mock, beforeEach } from "bun:test";
import { SaveService } from "./client";

// DAI WFS er live (IS_MOCK=false) — tests mocker fetch-kaldet

function mockFetch(features: unknown[] = []) {
  globalThis.fetch = mock(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ totalFeatures: features.length, features }),
  })) as any;
}

describe("SaveService", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returnerer fredet=false når DAI WFS returnerer 0 features", async () => {
    mockFetch([]);
    const result = await SaveService.getBevaringsdata({ lat: 55.676, lng: 12.568 });
    expect(result.fredet).toBe(false);
    expect(result.saveBevaringsvaerdi).toBeNull();
    expect(result.kilde).toBe("dai_wfs");
  });

  it("returnerer fredet=true når DAI WFS returnerer features", async () => {
    mockFetch([{ id: "mock-fredet" }]);
    const result = await SaveService.getBevaringsdata({ lat: 55.676, lng: 12.568 });
    expect(result.fredet).toBe(true);
    expect(result.kilde).toBe("dai_wfs");
  });

  it("returnerer fredet=false og kilde=null ved fetch-fejl (fail-open)", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("netværksfejl");
    }) as any;
    const result = await SaveService.getBevaringsdata({ lat: 55.676, lng: 12.568 });
    expect(result.fredet).toBe(false);
    expect(result.kilde).toBeNull();
  });

  it("saveBevaringsvaerdi er altid null (kræver separat Kulturmiljøregisteret-endpoint)", async () => {
    mockFetch([{ id: "fredet" }]);
    const result = await SaveService.getBevaringsdata({ lat: 55.0, lng: 10.0 });
    expect(result.saveBevaringsvaerdi).toBeNull();
  });
});
