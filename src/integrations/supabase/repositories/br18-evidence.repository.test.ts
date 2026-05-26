import { describe, expect, it } from "bun:test";
import {
  upsertEvidenceItem,
  getEvidenceForProject,
  updateEvidenceStatus,
} from "./br18-evidence.repository";

const LIVE = process.env.RUN_LIVE_SUPABASE_TESTS === "true";

if (!LIVE) {
  describe("br18-evidence.repository (type-check)", () => {
    it("eksporterer forventede funktioner", () => {
      expect(typeof upsertEvidenceItem).toBe("function");
      expect(typeof getEvidenceForProject).toBe("function");
      expect(typeof updateEvidenceStatus).toBe("function");
    });
  });
}
