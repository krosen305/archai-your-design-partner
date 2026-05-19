import { describe, it, expect } from "bun:test";
import { getCachedJordstykkePolygon, getCachedSourceResult, setCachedSourceResult } from "./client";
import { makeMockResult } from "@/lib/source-result";

// Integration test — kræver live Supabase-forbindelse (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
// Springes automatisk over i CI/lokal test uden env vars.
describe("getCachedJordstykkePolygon", () => {
  it("returnerer null for ukendt adresseid", async () => {
    if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      return; // skip gracefully
    }
    const result = await getCachedJordstykkePolygon("non-existent-id-12345");
    expect(result).toBeNull();
  });
});

describe("getCachedSourceResult", () => {
  it("returns null for unknown address", async () => {
    if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      return;
    }
    const cached = await getCachedSourceResult("unknown-address-xyz-arch239", "dkjord");
    expect(cached).toBeNull();
  });
});

describe("setCachedSourceResult + getCachedSourceResult", () => {
  it("roundtrips a mock result", async () => {
    if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      return;
    }
    const testAddress = `test-arch239-${Date.now()}`;
    const result = makeMockResult(
      { v1Kortlagt: false, v2Kortlagt: null },
      { kilde: "dkjord", sourceUrl: "https://dkjord.mst.dk/wfs", rawFeatureCount: 0 },
    );

    await setCachedSourceResult(testAddress, "dkjord", result, 1);
    const cached = await getCachedSourceResult<{ v1Kortlagt: boolean | null; v2Kortlagt: boolean | null }>(
      testAddress,
      "dkjord",
    );

    expect(cached).not.toBeNull();
    expect(cached?.status).toBe("mock");
    expect(cached?.isMock).toBe(true);
    expect(cached?.data?.v1Kortlagt).toBe(false);
    expect(cached?.data?.v2Kortlagt).toBeNull();
  });
});
