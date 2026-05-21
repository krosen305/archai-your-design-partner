import { describe, it, expect } from "bun:test";
import {
  decodeSourceResultRow,
  isValidComplianceResultShape,
  isValidLokalplanExtractShape,
} from "./decoders";
import { sourceResultTtlDays, daysToMs, CACHE_TTL_DAYS } from "@/lib/cache-policy";

describe("decodeSourceResultRow", () => {
  it("decodes a valid row", () => {
    const raw = {
      status: "ok",
      confidence: "confirmed",
      is_mock: false,
      fetched_at: "2026-05-20T10:00:00Z",
      source_url: "https://dkjord.mst.dk/wfs",
      raw_feature_count: 3,
      payload: { v1Kortlagt: false, v2Kortlagt: null },
      source_kind: "dkjord",
    };
    const result = decodeSourceResultRow<{ v1Kortlagt: boolean | null }>(raw);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("ok");
    expect(result?.confidence).toBe("confirmed");
    expect(result?.isMock).toBe(false);
    expect(result?.kilde).toBe("dkjord");
    expect(result?.data?.v1Kortlagt).toBe(false);
  });

  it("returns null for invalid status", () => {
    const raw = {
      status: "invalid_status",
      confidence: "confirmed",
      is_mock: false,
      fetched_at: "2026-05-20T10:00:00Z",
      source_url: null,
      raw_feature_count: null,
      payload: null,
      source_kind: "dkjord",
    };
    expect(decodeSourceResultRow(raw)).toBeNull();
  });

  it("returns null for missing required fields", () => {
    expect(decodeSourceResultRow({})).toBeNull();
    expect(decodeSourceResultRow(null)).toBeNull();
    expect(decodeSourceResultRow("string")).toBeNull();
  });

  it("decodes mock result", () => {
    const raw = {
      status: "mock",
      confidence: "estimated",
      is_mock: true,
      fetched_at: "2026-05-20T10:00:00Z",
      source_url: null,
      raw_feature_count: 0,
      payload: { area: 800 },
      source_kind: "geodanmark_mat",
    };
    const result = decodeSourceResultRow(raw);
    expect(result?.isMock).toBe(true);
    expect(result?.status).toBe("mock");
  });

  it("decodes null payload as null data", () => {
    const raw = {
      status: "error",
      confidence: "unknown",
      is_mock: false,
      fetched_at: "2026-05-20T10:00:00Z",
      source_url: null,
      raw_feature_count: null,
      payload: null,
      source_kind: "geus",
    };
    const result = decodeSourceResultRow(raw);
    expect(result?.data).toBeNull();
  });
});

describe("isValidComplianceResultShape", () => {
  it("returns true for object with analysedAt string", () => {
    expect(isValidComplianceResultShape({ analysedAt: "2026-05-20T10:00:00Z", bbr: null })).toBe(true);
  });

  it("returns false for empty object", () => {
    expect(isValidComplianceResultShape({})).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidComplianceResultShape(null)).toBe(false);
  });

  it("returns false for object with empty analysedAt", () => {
    expect(isValidComplianceResultShape({ analysedAt: "" })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isValidComplianceResultShape("string")).toBe(false);
    expect(isValidComplianceResultShape(42)).toBe(false);
  });
});

describe("isValidLokalplanExtractShape", () => {
  it("returns true for object with bebyggelsesprocent", () => {
    expect(isValidLokalplanExtractShape({ bebyggelsesprocent: { value: 30, source: "pdf_extracted", confidence: 0.8 } })).toBe(true);
  });

  it("returns true for object with maxEtager", () => {
    expect(isValidLokalplanExtractShape({ maxEtager: { value: 2, source: "pdf_extracted", confidence: 0.9 } })).toBe(true);
  });

  it("returns false for empty object", () => {
    expect(isValidLokalplanExtractShape({})).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidLokalplanExtractShape(null)).toBe(false);
  });
});

describe("cache-policy", () => {
  it("sourceResultTtlDays returns correct TTL for known kinds", () => {
    expect(sourceResultTtlDays("dkjord")).toBe(30);
    expect(sourceResultTtlDays("geodanmark_mat")).toBe(90);
    expect(sourceResultTtlDays("plandata_ext")).toBe(14);
  });

  it("sourceResultTtlDays returns 30 for unknown kind", () => {
    expect(sourceResultTtlDays("unknown_source")).toBe(30);
  });

  it("daysToMs converts correctly", () => {
    expect(daysToMs(1)).toBe(86_400_000);
    expect(daysToMs(30)).toBe(30 * 86_400_000);
  });

  it("CACHE_TTL_DAYS constants are correct", () => {
    expect(CACHE_TTL_DAYS.lokalplan).toBe(30);
    expect(CACHE_TTL_DAYS.servitut).toBe(7);
    expect(CACHE_TTL_DAYS.jordstykke).toBe(90);
  });
});
