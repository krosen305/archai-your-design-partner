import { describe, it, expect } from "bun:test";
import { computePartialUpdate } from "./reactive-compliance";
import type {
  RuleEngineBbrData,
  RuleEngineKommuneplanramme,
} from "@/domain/contracts/rule-engine.types";
import type { PartialUpdateParams } from "./reactive-compliance";

// ---------------------------------------------------------------------------
// Fixtures — copied from compliance-flags.test.ts pattern
// ---------------------------------------------------------------------------

const baseBbr: RuleEngineBbrData = {
  byggeaar: "1985",
  bebygget_areal: 136,
  samlet_areal: 200,
  antal_etager: 1,
  anvendelseskode: "120",
  anvendelse_tekst: "Fritliggende enfamilieshus",
  grundareal: 800,
  bebyggelsesprocent: 17, // 136 / 800 * 100 ≈ 17%
  beregning_mulig: true,
  fejl: null,
  varmeinstallation: "Fjernvarme",
  opvarmningsmiddel: null,
  ydervaegs_materiale: "Tegl",
  tagdaekning: "Betontagsten",
  fredet: null,
  mat_strandbeskyttelse: null,
  mat_fredskov: null,
  mat_klitfredning: null,
  bygning_lokal_id: "aabbcc-1234",
  fbb_reference: null,
  alle_bygning_lokal_ids: ["aabbcc-1234"],
  jordstykke_lokal_id: null,
  canonical_building_lokal_id: "aabbcc-1234",
  canonical_selection_reason: "only_candidate",
  canonical_candidates_count: 1,
  aggregated_bebygget_areal_all_primary: 136,
  bygning_samlet_boligareal: 200,
};

const baseRamme: RuleEngineKommuneplanramme = {
  planid: "test-ramme-1",
  plannavn: "Testramme",
  plannr: "1.1.B",
  kommunenavn: "Testkommune",
  komnr: 101,
  bebygpct: 30,
  maxetager: 2,
  maxbygnhjd: 8.5,
  anvgen: 1,
  anvendelseGenerel: "Boligformål",
  fremtidigzonestatus: null,
  sforhold: null,
  planstatus: "V",
  datoIkraft: null,
  plandokumentLink: null,
};

const baseParams: PartialUpdateParams = {
  bbr: baseBbr,
  ramme: baseRamme,
  lokalplanExtract: null,
  lokalplaner: [],
  naturbeskyttelse: null,
  geusRisk: null,
  servitutter: null,
  terrain: null,
  fbbData: null,
  dkjord: null,
  byggeoenske: {},
  municipality: "Testkommune",
  kommunekode: "101",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computePartialUpdate", () => {
  it("returns result with complianceMetrics, complianceFlags, and ruleEngineResult fields", () => {
    const result = computePartialUpdate(baseParams);

    expect(result).toHaveProperty("complianceMetrics");
    expect(result).toHaveProperty("complianceFlags");
    expect(result).toHaveProperty("ruleEngineResult");
    expect(Array.isArray(result.complianceFlags)).toBe(true);
    expect(typeof result.complianceMetrics).toBe("object");
    expect(typeof result.ruleEngineResult).toBe("object");
  });

  it("bebyggelsesprocent within limit → flag status is ok", () => {
    const params: PartialUpdateParams = {
      ...baseParams,
      bbr: { ...baseBbr, bebyggelsesprocent: 17 },
      ramme: { ...baseRamme, bebygpct: 30 },
    };

    const result = computePartialUpdate(params);
    const flag = result.complianceFlags.find((f) => f.id === "bebyggelsesprocent");

    expect(flag).toBeDefined();
    expect(flag?.status).toBe("ok");
  });

  it("adds attention flag when desired storeys exceed the allowed value", () => {
    const result = computePartialUpdate({
      ...baseParams,
      byggeoenske: { byggetype: "nybyg", oensketAreal: 180, antalEtager: 3 },
    });

    const staticFlag = result.complianceFlags.find((f) => f.id === "etager");
    const desiredFlag = result.complianceFlags.find((f) => f.id === "regelkerne-etager");

    expect(staticFlag?.status).toBe("ok");
    expect(desiredFlag).toBeDefined();
    expect(desiredFlag?.status).toBe("blocker");
  });

  it("adds resource warnings for newer existing buildings and selective demolition", () => {
    const result = computePartialUpdate({
      ...baseParams,
      bbr: { ...baseBbr, byggeaar: "2022", samlet_areal: 271 },
      byggeoenske: { byggetype: "nybyg", oensketAreal: 180, antalEtager: 2 },
    });

    expect(
      result.complianceFlags.find((f) => f.id === "ressource-nyere-bygning-nybyg"),
    ).toBeDefined();
    expect(
      result.complianceFlags.find((f) => f.id === "ressource-selektiv-nedrivning"),
    ).toBeDefined();
  });

  it("bebyggelsesprocent over limit → flag status is blocker", () => {
    const params: PartialUpdateParams = {
      ...baseParams,
      bbr: { ...baseBbr, bebyggelsesprocent: 40 },
      ramme: { ...baseRamme, bebygpct: 30 },
    };

    const result = computePartialUpdate(params);
    const flag = result.complianceFlags.find((f) => f.id === "bebyggelsesprocent");

    expect(flag).toBeDefined();
    expect(flag?.status).toBe("blocker");
  });

  it("MAT strandbeskyttelse → mat-strandbeskyttelse flag is blocker", () => {
    const params: PartialUpdateParams = {
      ...baseParams,
      bbr: { ...baseBbr, mat_strandbeskyttelse: true },
      ramme: null,
    };

    const result = computePartialUpdate(params);
    const flag = result.complianceFlags.find((f) => f.id === "mat-strandbeskyttelse");

    expect(flag).toBeDefined();
    expect(flag?.status).toBe("blocker");
  });

  it("MAT fredskov → ruleEngineResult has violation and complianceFlags includes mat-fredskov blocker", () => {
    const params: PartialUpdateParams = {
      ...baseParams,
      bbr: { ...baseBbr, mat_fredskov: true },
      ramme: null,
    };

    const result = computePartialUpdate(params);

    // ruleEngineResult should have at least one violation (protection_line_forest)
    expect(result.ruleEngineResult.violations.length).toBeGreaterThan(0);

    // complianceFlags should include a mat-fredskov blocker
    const flag = result.complianceFlags.find((f) => f.id === "mat-fredskov");
    expect(flag).toBeDefined();
    expect(flag?.status).toBe("blocker");
  });

  it("runs without any Zustand/store setup — no import side-effects required", () => {
    // Implicitly proven by all tests passing, but we assert the function itself
    // is a plain synchronous function with no store dependencies.
    expect(typeof computePartialUpdate).toBe("function");

    // Calling it with fresh params produces a valid result without any store init
    const result = computePartialUpdate(baseParams);
    expect(result).toBeDefined();
    expect(Array.isArray(result.complianceFlags)).toBe(true);
  });
});
