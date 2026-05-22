// Unit tests for pure derivation functions.
// No Supabase client, no env vars required.

import { describe, it, expect } from "bun:test";
import {
  deriveSoilContaminationStatus,
  deriveSiteConstraintsPatch,
} from "./site-constraints.derivation";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";

// ---------------------------------------------------------------------------
// deriveSoilContaminationStatus
// ---------------------------------------------------------------------------

describe("deriveSoilContaminationStatus", () => {
  it("returns null for undefined", () => {
    expect(deriveSoilContaminationStatus(undefined)).toBe(null);
  });

  it("returns null for null", () => {
    expect(deriveSoilContaminationStatus(null)).toBe(null);
  });

  it("returns 'clean' when v1Kortlagt=false and v2Kortlagt=false", () => {
    const dkjord: DkJordResultat = {
      v1Kortlagt: false,
      v2Kortlagt: false,
      olietank: { eksisterer: false, driftsstatus: null },
      omraadeklassificering: null,
      nuancering: null,
      lokalitetsId: null,
      kilde: "dkjord",
    };
    expect(deriveSoilContaminationStatus(dkjord)).toBe("clean");
  });

  it("returns 'registered' when v1Kortlagt=true and v2Kortlagt=false", () => {
    const dkjord: DkJordResultat = {
      v1Kortlagt: true,
      v2Kortlagt: false,
      olietank: { eksisterer: false, driftsstatus: null },
      omraadeklassificering: null,
      nuancering: null,
      lokalitetsId: null,
      kilde: "dkjord",
    };
    expect(deriveSoilContaminationStatus(dkjord)).toBe("registered");
  });

  it("returns 'contaminated' when v2Kortlagt=true", () => {
    const dkjord: DkJordResultat = {
      v1Kortlagt: false,
      v2Kortlagt: true,
      olietank: { eksisterer: false, driftsstatus: null },
      omraadeklassificering: null,
      nuancering: null,
      lokalitetsId: null,
      kilde: "dkjord",
    };
    expect(deriveSoilContaminationStatus(dkjord)).toBe("contaminated");
  });

  it("returns 'unknown' when v1Kortlagt=null", () => {
    const dkjord: DkJordResultat = {
      v1Kortlagt: null,
      v2Kortlagt: false,
      olietank: { eksisterer: false, driftsstatus: null },
      omraadeklassificering: null,
      nuancering: null,
      lokalitetsId: null,
      kilde: "dkjord",
    };
    expect(deriveSoilContaminationStatus(dkjord)).toBe("unknown");
  });

  it("returns 'unknown' when v2Kortlagt=null", () => {
    const dkjord: DkJordResultat = {
      v1Kortlagt: false,
      v2Kortlagt: null,
      olietank: { eksisterer: false, driftsstatus: null },
      omraadeklassificering: null,
      nuancering: null,
      lokalitetsId: null,
      kilde: "dkjord",
    };
    expect(deriveSoilContaminationStatus(dkjord)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// deriveSiteConstraintsPatch
// ---------------------------------------------------------------------------

const emptyUpdate = {};

describe("deriveSiteConstraintsPatch", () => {
  it("returns null when addressId is null", () => {
    const result = deriveSiteConstraintsPatch(null, {}, emptyUpdate);
    expect(result).toBe(null);
  });

  it("returns null when patch has no known constraint fields", () => {
    // An empty patch has no recognizable fields — hasConstraintField stays false
    const result = deriveSiteConstraintsPatch("addr-1", {}, emptyUpdate);
    expect(result).toBe(null);
  });

  it("maps kommuneplanramme fields correctly", () => {
    const patch: ProjectPatch = {
      kommuneplanramme: {
        planid: "kp-001",
        plannavn: "Ramme A",
        plannr: null,
        kommunenavn: null,
        komnr: null,
        bebygpct: 30,
        maxetager: 2,
        maxbygnhjd: 8.5,
        anvgen: null,
        anvendelseGenerel: null,
        fremtidigzonestatus: null,
        sforhold: null,
        planstatus: "V",
        datoIkraft: null,
        plandokumentLink: null,
      },
    };
    const result = deriveSiteConstraintsPatch("addr-1", patch, emptyUpdate);
    expect(result).not.toBe(null);
    expect(result!.max_bebyggelsesprocent).toBe(30);
    expect(result!.max_etager).toBe(2);
    expect(result!.max_height_m).toBe(8.5);
    expect(result!.source_kommuneplan_id).toBe("kp-001");
  });

  it("maps kommuneplanramme=null to null fields", () => {
    const patch: ProjectPatch = { kommuneplanramme: null };
    const result = deriveSiteConstraintsPatch("addr-1", patch, emptyUpdate);
    expect(result).not.toBe(null);
    expect(result!.max_bebyggelsesprocent).toBe(null);
    expect(result!.max_etager).toBe(null);
    expect(result!.max_height_m).toBe(null);
    expect(result!.source_kommuneplan_id).toBe(null);
  });

  it("maps fbbData bevaringsvaerdi to save_value when >= 1", () => {
    const patch: ProjectPatch = {
      fbbData: {
        fbb_bygninger: [],
        fbb_bedste_bygning: {
          bygningsid: 1,
          bevaringsvaerdi: 3,
          fredningsstatus: null,
        },
        fbb_er_fredet: false,
        kilde: "fbb-wfs",
      },
    };
    const result = deriveSiteConstraintsPatch("addr-1", patch, emptyUpdate);
    expect(result).not.toBe(null);
    expect(result!.save_value).toBe(3);
  });

  it("maps fbbData bevaringsvaerdi=0 to save_value=null (below valid SAVE range)", () => {
    const patch: ProjectPatch = {
      fbbData: {
        fbb_bygninger: [],
        fbb_bedste_bygning: {
          bygningsid: 1,
          bevaringsvaerdi: 0,
          fredningsstatus: null,
        },
        fbb_er_fredet: false,
        kilde: "fbb-wfs",
      },
    };
    const result = deriveSiteConstraintsPatch("addr-1", patch, emptyUpdate);
    expect(result).not.toBe(null);
    expect(result!.save_value).toBe(null);
  });

  it("maps fbbData=null to save_value=null and reads is_fredet from update", () => {
    const patch: ProjectPatch = { fbbData: null };
    const update = { is_fredet: true };
    const result = deriveSiteConstraintsPatch("addr-1", patch, update);
    expect(result).not.toBe(null);
    expect(result!.save_value).toBe(null);
    expect(result!.is_fredet).toBe(true);
  });

  it("maps bbrData strandbeskyttelse/fredskov/klitfredning fields", () => {
    const patch: ProjectPatch = {
      bbrData: {
        byggeaar: null,
        bebygget_areal: null,
        samlet_areal: null,
        antal_etager: null,
        anvendelseskode: null,
        anvendelse_tekst: null,
        grundareal: null,
        bebyggelsesprocent: null,
        beregning_mulig: false,
        fejl: null,
        varmeinstallation: null,
        opvarmningsmiddel: null,
        ydervaegs_materiale: null,
        tagdaekning: null,
        fredet: null,
        mat_strandbeskyttelse: true,
        mat_fredskov: false,
        mat_klitfredning: true,
        bygning_lokal_id: null,
        fbb_reference: null,
        alle_bygning_lokal_ids: [],
        jordstykke_lokal_id: null,
        canonical_building_lokal_id: null,
        canonical_selection_reason: null,
        canonical_candidates_count: 0,
        aggregated_bebygget_areal_all_primary: null,
        bygning_samlet_boligareal: null,
      },
    };
    const result = deriveSiteConstraintsPatch("addr-1", patch, emptyUpdate);
    expect(result).not.toBe(null);
    expect(result!.strandbeskyttelse).toBe(true);
    expect(result!.fredskov).toBe(false);
    expect(result!.klitfredning).toBe(true);
  });

  it("maps dkjord fields including soil_contamination_status", () => {
    const dkjord: DkJordResultat = {
      v1Kortlagt: false,
      v2Kortlagt: true,
      olietank: { eksisterer: true, driftsstatus: "Nedlagt" },
      omraadeklassificering: "Klasse A",
      nuancering: "Kraftig",
      lokalitetsId: "lok-99",
      kilde: "dkjord",
    };
    const patch: ProjectPatch = { dkjord };
    const result = deriveSiteConstraintsPatch("addr-1", patch, emptyUpdate);
    expect(result).not.toBe(null);
    expect(result!.soil_contamination_status).toBe("contaminated");
    expect(result!.jordforurening_v1).toBe(false);
    expect(result!.jordforurening_v2).toBe(true);
    expect(result!.jordforurening_olietank).toBe(true);
    expect(result!.omraadeklassificering).toBe("Klasse A");
    expect(result!.jordforurening_nuancering).toBe("Kraftig");
    expect(result!.jordforurening_lokalitet_id).toBe("lok-99");
  });

  it("sets address_id and confidence on result", () => {
    const patch: ProjectPatch = { kommuneplanramme: null };
    const result = deriveSiteConstraintsPatch("my-addr", patch, emptyUpdate);
    expect(result).not.toBe(null);
    expect(result!.address_id).toBe("my-addr");
    expect(result!.confidence).toBe("confirmed");
  });
});
