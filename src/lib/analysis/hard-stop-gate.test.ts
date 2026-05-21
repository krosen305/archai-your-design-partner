import { describe, test, expect } from "bun:test";
import { shouldSkipExpensiveLayer4 } from "./hard-stop-gate";
import type { BbrKompliantData } from "@/integrations/bbr/client";

function mockBbr(overrides: Partial<BbrKompliantData> = {}): BbrKompliantData {
  return {
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
    fredet: false,
    mat_strandbeskyttelse: false,
    mat_fredskov: false,
    mat_klitfredning: false,
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
  };
}

describe("shouldSkipExpensiveLayer4", () => {
  test("null bbr → false (no data, do not skip)", () => {
    expect(shouldSkipExpensiveLayer4(null)).toBe(false);
  });
  test("no hard stop → false", () => {
    expect(shouldSkipExpensiveLayer4(mockBbr())).toBe(false);
  });
  test("fredet → true", () => {
    expect(shouldSkipExpensiveLayer4(mockBbr({ fredet: true }))).toBe(true);
  });
  test("mat_strandbeskyttelse → true", () => {
    expect(shouldSkipExpensiveLayer4(mockBbr({ mat_strandbeskyttelse: true }))).toBe(true);
  });
  test("mat_fredskov → true", () => {
    expect(shouldSkipExpensiveLayer4(mockBbr({ mat_fredskov: true }))).toBe(true);
  });
  test("mat_klitfredning → true", () => {
    expect(shouldSkipExpensiveLayer4(mockBbr({ mat_klitfredning: true }))).toBe(true);
  });
});
