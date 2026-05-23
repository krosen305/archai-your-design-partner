import { describe, it, expect } from "bun:test";
import { z } from "zod";
import {
  decodeComplianceResult,
  decodeGeoJsonFeatureCollection,
  decodeLokalplanExtract,
  decodeSourceResultRow,
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

  it("returns null when payload schema does not match", () => {
    const raw = {
      status: "ok",
      confidence: "confirmed",
      is_mock: false,
      fetched_at: "2026-05-20T10:00:00Z",
      source_url: "https://dkjord.mst.dk/wfs",
      raw_feature_count: 3,
      payload: { v1Kortlagt: "nej" },
      source_kind: "dkjord",
    };
    const result = decodeSourceResultRow(raw, z.object({ v1Kortlagt: z.boolean().nullable() }));
    expect(result).toBeNull();
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

describe("decodeComplianceResult", () => {
  it("returns typed compliance result for valid cached payload", () => {
    const result = decodeComplianceResult({
      bbr: null,
      lokalplaner: [],
      kommuneplanramme: null,
      analysedAt: "2026-05-20T10:00:00Z",
      lokalplanExtract: null,
      naturbeskyttelse: null,
      dkjord: null,
      geusRisk: null,
      servitutter: null,
      terrain: null,
      naboer: null,
      fjernvarme: null,
      fbbData: null,
      matGeometri: null,
      vurderingData: null,
    });
    expect(result?.analysedAt).toBe("2026-05-20T10:00:00Z");
  });

  it("returns null for invalid payload", () => {
    expect(decodeComplianceResult({})).toBeNull();
  });
});

describe("decodeLokalplanExtract", () => {
  it("returns typed extract for valid payload", () => {
    const result = decodeLokalplanExtract({
      maxEtager: 2,
      maxBebyggelsespct: 30,
      tagform: null,
      materialer: [],
      byggelinjer: null,
      specialBestemmelser: [],
      kilde: "anthropic",
    });
    expect(result?.maxEtager).toBe(2);
  });

  it("returns null for invalid payload", () => {
    expect(decodeLokalplanExtract({})).toBeNull();
  });
});

describe("decodeGeoJsonFeatureCollection", () => {
  it("returns typed feature collection for valid payload", () => {
    const result = decodeGeoJsonFeatureCollection({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [] },
          properties: {},
        },
      ],
    });
    expect(result?.type).toBe("FeatureCollection");
  });

  it("returns null for invalid payload", () => {
    expect(
      decodeGeoJsonFeatureCollection({ type: "FeatureCollection", features: [null] }),
    ).toBeNull();
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
