import { describe, it, expect } from "bun:test";
import { buildPreCheckFlags } from "./pre-check-flags";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { FbbResultat } from "@/integrations/fbb/client";

const baseBbr: BbrKompliantData = {
  byggeaar: "1985",
  bebygget_areal: 136,
  samlet_areal: 200,
  antal_etager: 1,
  anvendelseskode: "120",
  anvendelse_tekst: "Fritliggende enfamilieshus",
  grundareal: 800,
  bebyggelsesprocent: 17,
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
  alle_bbr_public_ids: ["aabbcc-1234"],
  jordstykke_lokal_id: null,
  canonical_building_lokal_id: "aabbcc-1234",
  canonical_selection_reason: "only_candidate",
  canonical_candidates_count: 1,
  aggregated_bebygget_areal_all_primary: 136,
  bygning_samlet_boligareal: 200,
};

const baseFbb: FbbResultat = {
  fbb_bygninger: [],
  fbb_bedste_bygning: null,
  fbb_er_fredet: false,
  kilde: "fbb-wfs",
};

describe("buildPreCheckFlags", () => {
  it("returns empty array when bbr is null", () => {
    const flags = buildPreCheckFlags(null, null, null, null);
    expect(flags).toEqual([]);
  });

  it("returns blocker for SAVE 3 (dispensation required)", () => {
    const fbb: FbbResultat = {
      ...baseFbb,
      fbb_bedste_bygning: { bygningsid: 1, bevaringsvaerdi: 3, fredningsstatus: null },
    };
    const flags = buildPreCheckFlags(baseBbr, null, null, fbb);
    const flag = flags.find((f) => f.id === "save-bevaringsvaerdi");
    expect(flag).toBeDefined();
    expect(flag?.status).toBe("blocker");
  });

  it("returns advarsel for SAVE 4 (§14-risk)", () => {
    const fbb: FbbResultat = {
      ...baseFbb,
      fbb_bedste_bygning: { bygningsid: 1, bevaringsvaerdi: 4, fredningsstatus: null },
    };
    const flags = buildPreCheckFlags(baseBbr, null, null, fbb);
    const flag = flags.find((f) => f.id === "save-4-paragraph14");
    expect(flag).toBeDefined();
    expect(flag?.status).toBe("advarsel");
  });

  it("returns blocker for fredet building with Slots- og Kulturstyrelsen", () => {
    const bbr: BbrKompliantData = { ...baseBbr, fredet: true };
    const flags = buildPreCheckFlags(bbr, null, null, null);
    const flag = flags.find((f) => f.id === "fredet");
    expect(flag).toBeDefined();
    expect(flag?.status).toBe("blocker");
    expect(flag?.dispensationMyndighed).toBe("Slots- og Kulturstyrelsen");
  });

  it("returns blocker for MAT strandbeskyttelse", () => {
    const bbr: BbrKompliantData = { ...baseBbr, mat_strandbeskyttelse: true };
    const flags = buildPreCheckFlags(bbr, null, null, null);
    const flag = flags.find((f) => f.id === "mat-strandbeskyttelse");
    expect(flag).toBeDefined();
    expect(flag?.status).toBe("blocker");
  });

  it("produces no naturbeskyttelse-derived flags when naturbeskyttelse is null", () => {
    const flags = buildPreCheckFlags(baseBbr, null, null, null);
    const natFlags = flags.filter((f) => f.id.startsWith("naturbeskyttelse-"));
    expect(natFlags).toHaveLength(0);
  });
});
