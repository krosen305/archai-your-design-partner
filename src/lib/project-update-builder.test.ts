import { describe, it, expect } from "bun:test";
import { buildProjectUpdate } from "./project-update-builder";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { BbrKompliantData } from "@/integrations/bbr/client";

const minimalFbb = (bevaringsvaerdi: number, erFredet = false): FbbResultat => ({
  fbb_bygninger: [],
  fbb_bedste_bygning: { bygningsid: 1, bevaringsvaerdi, fredningsstatus: null },
  fbb_er_fredet: erFredet,
});

const minimalBbr = (overrides: Partial<BbrKompliantData> = {}): BbrKompliantData => ({
  byggeaar: null,
  bebygget_areal: 100,
  samlet_areal: 200,
  antal_etager: 1,
  anvendelseskode: "120",
  anvendelse_tekst: "Parcelhus",
  grundareal: 800,
  bebyggelsesprocent: 12.5,
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
  bygning_lokal_id: null,
  fbb_reference: null,
  alle_bygning_lokal_ids: [],
  alle_bbr_public_ids: [],
  jordstykke_lokal_id: null,
  canonical_building_lokal_id: null,
  canonical_selection_reason: null,
  canonical_candidates_count: 0,
  aggregated_bebygget_areal_all_primary: null,
  bygning_samlet_boligareal: null,
  ...overrides,
});

describe("buildProjectUpdate", () => {
  it("returns empty update for empty patch", () => {
    const update = buildProjectUpdate({}, {});
    expect(Object.keys(update)).toHaveLength(0);
  });

  it("maps address fields", () => {
    const update = buildProjectUpdate(
      {
        address: {
          adresseid: "adr-uuid-1",
          adresse: "Hasselvej 48, 2800 Lyngby",
          postnr: "2800",
          postnrnavn: "Kongens Lyngby",
          kommune: "Lyngby-Taarbæk",
          kommunekode: "0173",
          matrikel: "5a Lyngby By, Lyngby",
          adgangsadresseid: "adr-uuid-0",
          koordinater: { lat: 55.77, lng: 12.5 },
          bbrId: null,
          ejerlavskode: 168951,
          matrikelnummer: "5a",
          grundareal: null,
        },
      },
      {},
    );
    expect(update.address_full).toBe("Hasselvej 48, 2800 Lyngby");
    expect(update.address_adresseid).toBe("adr-uuid-1");
    expect(update.adresse_dar_id).toBe("adr-uuid-1");
    expect(update.address_ejerlavskode).toBe(168951);
  });

  it("sets hard_stop=true for SAVE 3", () => {
    const update = buildProjectUpdate({ fbbData: minimalFbb(3) }, {});
    expect(update.hard_stop).toBe(true);
    expect(update.heritage_save_value).toBe(3);
    expect(typeof update.hard_stop_reason).toBe("string");
  });

  it("sets hard_stop=false for SAVE 4 (warning only)", () => {
    const update = buildProjectUpdate({ fbbData: minimalFbb(4) }, {});
    expect(update.hard_stop).toBe(false);
    expect(update.heritage_save_value).toBe(4);
    expect(update.hard_stop_reason).toBeNull();
  });

  it("sets hard_stop=true for fredet building", () => {
    const update = buildProjectUpdate({ fbbData: minimalFbb(9, true) }, {});
    expect(update.hard_stop).toBe(true);
    expect(update.is_fredet).toBe(true);
  });

  it("sets hard_stop=true for strandbeskyttelse", () => {
    const update = buildProjectUpdate({ bbrData: minimalBbr({ mat_strandbeskyttelse: true }) }, {});
    expect(update.hard_stop).toBe(true);
  });

  it("does NOT set hard_stop when only byggeanalyseResultat changes", () => {
    const update = buildProjectUpdate(
      { byggeanalyseResultat: { analyseId: "x", summary: "ok" } as any },
      {},
    );
    expect(update.hard_stop).toBeUndefined();
  });

  it("merges prevCompliance: preserves existing keys not in patch", () => {
    const prev = { bbr: { existing: true }, flags: [{ id: "x" }] };
    const update = buildProjectUpdate(
      {
        vurderingData: {
          ejendomsvaerdi: 3_000_000,
          grundvaerdi: 1_500_000,
        } as any,
      },
      prev,
    );
    const merged = update.compliance_data as Record<string, unknown>;
    expect(merged["bbr"]).toEqual({ existing: true });
    expect((merged["vurderingData"] as any).ejendomsvaerdi).toBe(3_000_000);
  });

  it("overwrites compliance key when same key present in patch", () => {
    const prev = { bbr: { old: true } };
    const update = buildProjectUpdate({ bbrData: minimalBbr() }, prev);
    const merged = update.compliance_data as Record<string, unknown>;
    expect((merged["bbr"] as any).grundareal).toBe(800);
    expect((merged["bbr"] as any).old).toBeUndefined();
  });

  it("derives is_fredet from bbrData when fbbData not in patch", () => {
    const update = buildProjectUpdate({ bbrData: minimalBbr({ fredet: true }) }, {});
    expect(update.is_fredet).toBe(true);
  });

  it("fbbData.fbb_er_fredet takes precedence over bbrData.fredet", () => {
    const update = buildProjectUpdate(
      { fbbData: minimalFbb(9, false), bbrData: minimalBbr({ fredet: true }) },
      {},
    );
    expect(update.is_fredet).toBe(false); // fbb wins
  });

  it("maps complianceDone, currentStep, budget_estimate", () => {
    const update = buildProjectUpdate(
      { complianceDone: true, currentStep: "cockpit", budget_estimate: 5_000_000 },
      {},
    );
    expect(update.compliance_done).toBe(true);
    expect(update.current_step).toBe("cockpit");
    expect(update.budget_estimate).toBe(5_000_000);
  });

  it("sets hus_dna without cast", () => {
    const hna = { stil: "nordisk", areal: 180 };
    const update = buildProjectUpdate({ husDna: hna as any }, {});
    expect(update.hus_dna).toEqual(hna);
  });

  it("sets hus_dna=null when patch.husDna is null", () => {
    const update = buildProjectUpdate({ husDna: null }, {});
    expect(update.hus_dna).toBeNull();
  });

  it("skips heritage_save_value when fbbData.fbb_bedste_bygning is null", () => {
    const update = buildProjectUpdate(
      { fbbData: { fbb_bygninger: [], fbb_bedste_bygning: null, fbb_er_fredet: false } },
      {},
    );
    expect(update.heritage_save_value).toBeNull();
  });
});
