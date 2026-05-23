import { describe, it, expect } from "bun:test";
import { genererBbrVurdering } from "./bbr-assessment";
import type { RuleEngineBbrData } from "@/domain/contracts/rule-engine.types";

const baseBbr: RuleEngineBbrData = {
  grundareal: 800,
  bebygget_areal: 136,
  samlet_areal: 200,
  antal_etager: 1,
  byggeaar: "1985",
  anvendelseskode: "120",
  anvendelse_tekst: "Fritliggende enfamilieshus",
  bebyggelsesprocent: 17,
  beregning_mulig: true,
  fejl: null,
  varmeinstallation: null,
  opvarmningsmiddel: null,
  ydervaegs_materiale: null,
  tagdaekning: null,
  fredet: null,
  mat_strandbeskyttelse: null,
  mat_fredskov: null,
  mat_klitfredning: null,
  bygning_lokal_id: "abc-1",
  fbb_reference: null,
  alle_bygning_lokal_ids: ["abc-1"],
  jordstykke_lokal_id: null,
  canonical_building_lokal_id: "abc-1",
  canonical_selection_reason: "only_candidate",
  canonical_candidates_count: 1,
  aggregated_bebygget_areal_all_primary: 136,
  bygning_samlet_boligareal: 200,
};

describe("genererBbrVurdering", () => {
  it("returns degraded message when beregning_mulig is false", () => {
    const result = genererBbrVurdering(
      { ...baseBbr, beregning_mulig: false, fejl: "Mangler data" },
      "Testvej 1",
    );
    expect(result).toContain("Testvej 1");
    expect(result).toContain("Mangler data");
  });

  it("includes bebyggelsesprocent and grundareal when both are present", () => {
    const result = genererBbrVurdering(baseBbr, "Testvej 1");
    expect(result).toContain("17%");
    expect(result).toContain("800 m²");
  });

  it("includes bebygget_areal when present", () => {
    const result = genererBbrVurdering(baseBbr, "Testvej 1");
    expect(result).toContain("136 m²");
  });

  it("describes single-storey building as ét plan", () => {
    const result = genererBbrVurdering({ ...baseBbr, antal_etager: 1 }, "Testvej 1");
    expect(result).toContain("ét plan");
  });

  it("includes etage count for multi-storey buildings", () => {
    const result = genererBbrVurdering({ ...baseBbr, antal_etager: 3 }, "Testvej 1");
    expect(result).toContain("3 etager");
  });

  it("mentions liberalt erhverv for anvendelseskode 321", () => {
    const result = genererBbrVurdering({ ...baseBbr, anvendelseskode: "321" }, "Testvej 1");
    expect(result).toContain("liberalt erhverv");
  });

  it("mentions liberalt erhverv for anvendelseskode 322", () => {
    const result = genererBbrVurdering({ ...baseBbr, anvendelseskode: "322" }, "Testvej 1");
    expect(result).toContain("liberalt erhverv");
  });

  it("returns fallback when no data points are available", () => {
    const result = genererBbrVurdering(
      {
        ...baseBbr,
        bebyggelsesprocent: null,
        grundareal: null,
        bebygget_areal: null,
        antal_etager: null,
        anvendelseskode: null,
      },
      "Testvej 1",
    );
    expect(result).toContain("Testvej 1");
  });
});
