import { describe, it, expect } from "bun:test";
import { getCachedJordstykkePolygon } from "./client";

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
