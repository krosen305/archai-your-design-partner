import { describe, expect, it } from "bun:test";
import { getCachedSourceResult, setCachedSourceResult } from "@/integrations/cache/client";
import { makeMockResult } from "@/lib/source-result";

// Live integration tests — require a real Supabase connection.
// Run with: RUN_LIVE_SUPABASE_TESTS=true bun test tests/live

const LIVE =
  process.env.RUN_LIVE_SUPABASE_TESTS === "true" &&
  !!process.env.SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!LIVE)("live Supabase cache integration — getCachedJordstykkePolygon", () => {
  it("returnerer null for ukendt adresseid", async () => {
    const { getCachedJordstykkePolygon } = await import("@/integrations/cache/client");
    const result = await getCachedJordstykkePolygon("non-existent-id-12345");
    expect(result).toBeNull();
  });
});

describe.skipIf(!LIVE)("live Supabase cache integration — getCachedSourceResult", () => {
  it("returns null for unknown address", async () => {
    const cached = await getCachedSourceResult("unknown-address-xyz-arch239", "dkjord");
    expect(cached).toBeNull();
  });
});

describe.skipIf(!LIVE)(
  "live Supabase cache integration — setCachedSourceResult + getCachedSourceResult roundtrip",
  () => {
    it("roundtrips a source result through address_source_results", async () => {
      const testAddress = `test-cache-${crypto.randomUUID()}`;

      const result = makeMockResult(
        { v1Kortlagt: false, v2Kortlagt: null },
        { kilde: "dkjord", sourceUrl: "https://dkjord.mst.dk/wfs", rawFeatureCount: 0 },
      );

      await setCachedSourceResult(testAddress, "dkjord", result, 1);

      const cached = await getCachedSourceResult<{
        v1Kortlagt: boolean | null;
        v2Kortlagt: boolean | null;
      }>(testAddress, "dkjord");

      expect(cached).not.toBeNull();
      expect(cached?.status).toBe("mock");
      expect(cached?.isMock).toBe(true);
      expect(cached?.data?.v1Kortlagt).toBe(false);
      expect(cached?.data?.v2Kortlagt).toBeNull();
    });
  },
);
