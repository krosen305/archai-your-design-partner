import { describe, it, expect } from "bun:test";
import {
  evaluateHardStop,
  isSaveDispensationRequired,
  isSaveWarning,
  SAVE_HARD_STOP_MAX,
  SAVE_WARNING_VALUE,
} from "@/lib/rule-engine/hard-stop-adapter";

describe("evaluateHardStop", () => {
  it("returns hardStop=false for clean plot", () => {
    const r = evaluateHardStop({
      saveValue: null,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(r.hardStop).toBe(false);
    expect(r.hardStopReason).toBeNull();
    expect(r.violations).toHaveLength(0);
  });

  it("SAVE 1 triggers dispensation_required", () => {
    const r = evaluateHardStop({
      saveValue: 1,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(r.hardStop).toBe(true);
    expect(r.violations.some((v) => v.rule === "save_1_3_demolition")).toBe(true);
  });

  it("SAVE 2 triggers dispensation_required", () => {
    const r = evaluateHardStop({
      saveValue: 2,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(r.hardStop).toBe(true);
    expect(r.violations.some((v) => v.rule === "save_1_3_demolition")).toBe(true);
  });

  it("SAVE 3 triggers dispensation_required", () => {
    const r = evaluateHardStop({
      saveValue: 3,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(r.hardStop).toBe(true);
    expect(r.violations.some((v) => v.rule === "save_1_3_demolition")).toBe(true);
  });

  it("SAVE 4 is a warning, not a hard stop", () => {
    const r = evaluateHardStop({
      saveValue: 4,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(r.hardStop).toBe(false); // warning severity does NOT set hardStop
    expect(r.violations.some((v) => v.rule === "save_4_paragraph14_risk")).toBe(true);
  });

  it("SAVE 5 produces no violation", () => {
    const r = evaluateHardStop({
      saveValue: 5,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(r.hardStop).toBe(false);
    expect(r.violations).toHaveLength(0);
  });

  it("SAVE 9 produces no violation", () => {
    const r = evaluateHardStop({
      saveValue: 9,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(r.hardStop).toBe(false);
    expect(r.violations).toHaveLength(0);
  });

  it("is_fredet=true triggers illegal violation", () => {
    const r = evaluateHardStop({
      saveValue: null,
      isFredet: true,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(r.hardStop).toBe(true);
    expect(r.violations.some((v) => v.rule === "listed_building_demolition")).toBe(true);
    expect(r.violations.find((v) => v.rule === "listed_building_demolition")?.severity).toBe(
      "illegal",
    );
  });

  it("strandbeskyttelse=true triggers dispensation_required", () => {
    const r = evaluateHardStop({
      saveValue: null,
      isFredet: null,
      strandbeskyttelse: true,
      fredskov: null,
      klitfredning: null,
    });
    expect(r.hardStop).toBe(true);
    expect(r.violations.some((v) => v.rule === "protection_line_coastal")).toBe(true);
  });

  it("fredskov=true triggers dispensation_required", () => {
    const r = evaluateHardStop({
      saveValue: null,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: true,
      klitfredning: null,
    });
    expect(r.hardStop).toBe(true);
    expect(r.violations.some((v) => v.rule === "protection_line_forest")).toBe(true);
  });

  it("klitfredning=true triggers dispensation_required", () => {
    const r = evaluateHardStop({
      saveValue: null,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: true,
    });
    expect(r.hardStop).toBe(true);
    expect(r.violations.some((v) => v.rule === "protection_line_clitFredning")).toBe(true);
  });

  it("hardStopReason is null when no hard stops", () => {
    const r = evaluateHardStop({
      saveValue: null,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(r.hardStopReason).toBeNull();
  });

  it("hardStopReason is non-null string when hard stops exist", () => {
    const r = evaluateHardStop({
      saveValue: null,
      isFredet: true,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(r.hardStopReason).not.toBeNull();
    expect(typeof r.hardStopReason).toBe("string");
    expect((r.hardStopReason ?? "").length).toBeGreaterThan(0);
  });
});

describe("isSaveDispensationRequired", () => {
  it("returns true for SAVE 1", () => {
    expect(isSaveDispensationRequired(1)).toBe(true);
  });

  it("returns true for SAVE 2", () => {
    expect(isSaveDispensationRequired(2)).toBe(true);
  });

  it("returns true for SAVE 3", () => {
    expect(isSaveDispensationRequired(3)).toBe(true);
  });

  it("returns false for SAVE 4", () => {
    expect(isSaveDispensationRequired(4)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isSaveDispensationRequired(null)).toBe(false);
  });

  it("returns false for SAVE 5", () => {
    expect(isSaveDispensationRequired(5)).toBe(false);
  });

  it("returns false for SAVE 9", () => {
    expect(isSaveDispensationRequired(9)).toBe(false);
  });

  it("threshold constant SAVE_HARD_STOP_MAX equals 3", () => {
    expect(SAVE_HARD_STOP_MAX).toBe(3);
  });
});

describe("isSaveWarning", () => {
  it("returns true for SAVE 4", () => {
    expect(isSaveWarning(4)).toBe(true);
  });

  it("returns false for SAVE 3", () => {
    expect(isSaveWarning(3)).toBe(false);
  });

  it("returns false for SAVE 5", () => {
    expect(isSaveWarning(5)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isSaveWarning(null)).toBe(false);
  });

  it("threshold constant SAVE_WARNING_VALUE equals 4", () => {
    expect(SAVE_WARNING_VALUE).toBe(4);
  });
});

describe("Consistency: hard_stop derivation matches pre-check flag logic", () => {
  it("SAVE 3 is consistent across persistence and pre-check paths", () => {
    const { hardStop } = evaluateHardStop({
      saveValue: 3,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(hardStop).toBe(true);
    expect(isSaveDispensationRequired(3)).toBe(true);
    expect(isSaveWarning(3)).toBe(false);
  });

  it("SAVE 4 is consistent across persistence and pre-check paths", () => {
    const { hardStop } = evaluateHardStop({
      saveValue: 4,
      isFredet: null,
      strandbeskyttelse: null,
      fredskov: null,
      klitfredning: null,
    });
    expect(hardStop).toBe(false); // SAVE 4 is warning, not blocker
    expect(isSaveDispensationRequired(4)).toBe(false);
    expect(isSaveWarning(4)).toBe(true);
  });
});
