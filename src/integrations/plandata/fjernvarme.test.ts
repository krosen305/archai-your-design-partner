import { beforeEach, describe, expect, it, mock } from "bun:test";
import { FjernvarmeService } from "./fjernvarme";

describe("FjernvarmeService.getDaekning", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("returns true when one feature is found", async () => {
    globalThis.fetch = mock(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ totalFeatures: 1 }),
      } as Response;
    }) as any;

    const result = await FjernvarmeService.getDaekning({ lat: 55.7, lng: 12.5 });
    expect(result).toEqual({ fjernvarmeDaekket: true, fejl: null });
  });

  it("returns null and error on request failure", async () => {
    globalThis.fetch = mock(async () => {
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    }) as any;

    const result = await FjernvarmeService.getDaekning({ lat: 55.7, lng: 12.5 });
    expect(result.fjernvarmeDaekket).toBeNull();
    expect(result.fejl).toContain("HTTP 500");
  });
});
