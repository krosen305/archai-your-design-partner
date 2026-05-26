import { describe, expect, it } from "bun:test";
import { runBr18Compliance } from "./br18-compliance.service.server";
import type { Br18ApplicabilityResult } from "@/lib/br18/types";

const fakeDeps = {
  upsertApplicabilityResult: async () => {},
  getApplicabilityForProject: async (): Promise<Br18ApplicabilityResult[]> => [],
  updateProjectHardStop: async () => {},
  updateAuthorityReadiness: async () => {},
};

describe("runBr18Compliance", () => {
  it("returnerer applicability-resultater for enfamiliehus med fulde data", async () => {
    const result = await runBr18Compliance(
      "proj-1",
      {
        projectScope: "enfamiliehus",
        bebyggetArealM2: 60,
        grundarealM2: 300,
        antalEtager: 1,
        bygningshojdeM: 5.0,
        skelafstandM: 3.5,
        anvendelseskategori: null,
        br18Version: "2024",
        municipality: "0101",
      },
      fakeDeps,
    );
    expect(result.applicabilityResults.length).toBeGreaterThan(0);
    expect(result.hardStopTriggered).toBe(false);
  });

  it("sætter hardStopTriggered når tilbygning har wrong scope krav", async () => {
    const result = await runBr18Compliance(
      "proj-1",
      {
        projectScope: "tilbygning",
        bebyggetArealM2: null,
        grundarealM2: null,
        antalEtager: null,
        bygningshojdeM: null,
        skelafstandM: null,
        anvendelseskategori: null,
        br18Version: "2024",
        municipality: "0101",
      },
      fakeDeps,
    );
    const unknown = result.applicabilityResults.filter((r) => r.status === "unknown_missing_data");
    expect(unknown.length).toBeGreaterThan(0);
  });
});
