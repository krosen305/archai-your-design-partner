import { describe, it, expect } from "bun:test";
import { deriveComplianceFlags } from "./compliance-flags";
import type {
  RuleEngineBbrData,
  RuleEngineKommuneplanramme,
} from "@/domain/contracts/rule-engine.types";

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

describe("deriveComplianceFlags", () => {
  it("returns empty array when bbr is null", () => {
    const flags = deriveComplianceFlags(null, null);
    expect(flags).toEqual([]);
  });

  it("returns ok bebyggelsesprocent flag when within limit", () => {
    const flags = deriveComplianceFlags(baseBbr, baseRamme);
    const flag = flags.find((f) => f.id === "bebyggelsesprocent");
    expect(flag).toBeDefined();
    expect(flag?.status).toBe("ok");
  });

  it("returns blocker for strandbeskyttelse from MAT", () => {
    const bbr: RuleEngineBbrData = { ...baseBbr, mat_strandbeskyttelse: true };
    const flags = deriveComplianceFlags(bbr, null);
    const flag = flags.find((f) => f.id === "mat-strandbeskyttelse");
    expect(flag).toBeDefined();
    expect(flag?.status).toBe("blocker");
  });

  it("returns blocker for fredskov from MAT", () => {
    const bbr: RuleEngineBbrData = { ...baseBbr, mat_fredskov: true };
    const flags = deriveComplianceFlags(bbr, null);
    const flag = flags.find((f) => f.id === "mat-fredskov");
    expect(flag).toBeDefined();
    expect(flag?.status).toBe("blocker");
  });

  it("returns blocker for fredet building", () => {
    const bbr: RuleEngineBbrData = { ...baseBbr, fredet: true };
    const flags = deriveComplianceFlags(bbr, null);
    const flag = flags.find((f) => f.id === "bbr-fredet");
    expect(flag).toBeDefined();
    expect(flag?.status).toBe("blocker");
    expect(flag?.dispensationMyndighed).toBe("Slots- og Kulturstyrelsen");
  });

  it("returns blocker when bebyggelsesprocent exceeds limit", () => {
    const bbr: RuleEngineBbrData = { ...baseBbr, bebyggelsesprocent: 40 };
    const ramme: RuleEngineKommuneplanramme = { ...baseRamme, bebygpct: 30 };
    const flags = deriveComplianceFlags(bbr, ramme);
    const flag = flags.find((f) => f.id === "bebyggelsesprocent");
    expect(flag).toBeDefined();
    expect(flag?.status).toBe("blocker");
  });

  it("returns advarsel when no kommuneplanramme available", () => {
    const flags = deriveComplianceFlags(baseBbr, null);
    const flag = flags.find((f) => f.id === "bebyggelsesprocent");
    expect(flag).toBeDefined();
    expect(flag?.status).toBe("advarsel");
  });
});
