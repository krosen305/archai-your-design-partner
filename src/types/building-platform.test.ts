// src/types/building-platform.test.ts
import { describe, test, expect } from "bun:test";
import {
  hasAbsoluteHardStop,
  getSaveHardStop,
  getDesignAreaM2,
  getDesignFloors,
} from "./building-platform";
import type { SiteConstraints, DesignIteration } from "./building-platform";
import type { Json } from "@/integrations/supabase/types";

function mockSC(overrides: Partial<SiteConstraints> = {}): SiteConstraints {
  return {
    id: "sc-1",
    created_at: new Date().toISOString(),
    extracted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    address_id: "adr-1",
    confidence: "confirmed",
    max_bebyggelsesprocent: 30,
    max_etager: 2,
    max_height_m: 8.5,
    min_distance_to_boundary_m: null,
    source_lokalplan_id: null,
    source_kommuneplan_id: null,
    save_value: null,
    is_fredet: null,
    strandbeskyttelse: false,
    fredskov: false,
    klitfredning: false,
    soil_contamination_status: null,
    jordforurening_v1: null,
    jordforurening_v2: null,
    jordforurening_lokalitet_id: null,
    jordforurening_nuancering: null,
    jordforurening_olietank: null,
    omraadeklassificering: null,
    ...overrides,
  } as SiteConstraints;
}

function mockDI(overrides: Partial<DesignIteration> = {}): DesignIteration {
  return {
    id: "di-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    project_id: "proj-1",
    is_active: true,
    version: 1,
    inspirations: [] as unknown as Json,
    area_m2: null,
    floors: null,
    byggeoenske: null,
    budget_estimate: null,
    compliance_snapshot: null,
    description: null,
    hus_dna: null,
    label: null,
    ...overrides,
  } as unknown as DesignIteration;
}

describe("hasAbsoluteHardStop", () => {
  test("SAVE 1 → true", () => {
    expect(hasAbsoluteHardStop(mockSC({ save_value: 1 }))).toBe(true);
  });
  test("SAVE 3 → true", () => {
    expect(hasAbsoluteHardStop(mockSC({ save_value: 3 }))).toBe(true);
  });
  test("SAVE 4 → false (warning only)", () => {
    expect(hasAbsoluteHardStop(mockSC({ save_value: 4 }))).toBe(false);
  });
  test("SAVE null → false", () => {
    expect(hasAbsoluteHardStop(mockSC({ save_value: null }))).toBe(false);
  });
  test("is_fredet true → true", () => {
    expect(hasAbsoluteHardStop(mockSC({ is_fredet: true }))).toBe(true);
  });
  test("strandbeskyttelse true → true", () => {
    expect(hasAbsoluteHardStop(mockSC({ strandbeskyttelse: true }))).toBe(true);
  });
  test("fredskov true → true", () => {
    expect(hasAbsoluteHardStop(mockSC({ fredskov: true }))).toBe(true);
  });
  test("klitfredning true → true", () => {
    expect(hasAbsoluteHardStop(mockSC({ klitfredning: true }))).toBe(true);
  });
  test("no constraints → false", () => {
    expect(hasAbsoluteHardStop(mockSC())).toBe(false);
  });
});

describe("getSaveHardStop", () => {
  test("SAVE 1 → dispensation_required", () => {
    const result = getSaveHardStop(mockSC({ save_value: 1 }));
    expect(result?.severity).toBe("dispensation_required");
  });
  test("SAVE 4 → warning", () => {
    const result = getSaveHardStop(mockSC({ save_value: 4 }));
    expect(result?.severity).toBe("warning");
  });
  test("SAVE 5 → null", () => {
    expect(getSaveHardStop(mockSC({ save_value: 5 }))).toBeNull();
  });
  test("SAVE null → null", () => {
    expect(getSaveHardStop(mockSC({ save_value: null }))).toBeNull();
  });
  test("result matches adapter: rule is save_1_3_demolition for SAVE 2", () => {
    const result = getSaveHardStop(mockSC({ save_value: 2 }));
    expect(result?.rule).toBe("save_1_3_demolition");
  });
});

describe("getDesignAreaM2", () => {
  test("prefers area_m2 typed column", () => {
    expect(getDesignAreaM2(mockDI({ area_m2: 150 }))).toBe(150);
  });
  test("falls back to byggeoenske.bruttoAreal", () => {
    expect(getDesignAreaM2(mockDI({ byggeoenske: { bruttoAreal: 120 } as Json }))).toBe(120);
  });
  test("falls back to byggeoenske.bruttoareal (lowercase)", () => {
    expect(getDesignAreaM2(mockDI({ byggeoenske: { bruttoareal: 130 } as Json }))).toBe(130);
  });
  test("returns null when both are missing", () => {
    expect(getDesignAreaM2(mockDI())).toBeNull();
  });
  test("returns null when byggeoenske is a string (non-object)", () => {
    expect(getDesignAreaM2(mockDI({ byggeoenske: "invalid" as unknown as Json }))).toBeNull();
  });
});

describe("getDesignFloors", () => {
  test("prefers floors typed column", () => {
    expect(getDesignFloors(mockDI({ floors: 2 }))).toBe(2);
  });
  test("falls back to byggeoenske.etager", () => {
    expect(getDesignFloors(mockDI({ byggeoenske: { etager: 1 } as Json }))).toBe(1);
  });
  test("returns null when both missing", () => {
    expect(getDesignFloors(mockDI())).toBeNull();
  });
});
