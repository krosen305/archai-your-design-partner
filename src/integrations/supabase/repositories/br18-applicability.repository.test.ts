import { describe, expect, it } from "bun:test";
import {
  upsertApplicabilityResult,
  getApplicabilityForProject,
} from "./br18-applicability.repository";

const LIVE = process.env.RUN_LIVE_SUPABASE_TESTS === "true";

if (!LIVE) {
  describe("br18-applicability.repository (type-check)", () => {
    it("eksporterer forventede funktioner", () => {
      expect(typeof upsertApplicabilityResult).toBe("function");
      expect(typeof getApplicabilityForProject).toBe("function");
    });
  });
}
