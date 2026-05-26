// src/domain/contracts/noise.types.ts
// Pure domain types — ingen imports fra adapters, SDK eller Supabase.
// Alle dB-tærskler bor i rule engine, ikke her.

export type NoiseSourceKind = "road" | "rail" | "air" | "industry";

export type NoiseCoverage =
  | "covered"
  | "outside_mapped_area"
  | "source_unavailable"
  | "unknown";

export type NoiseRisk = "ok" | "warning" | "review_required" | "unknown";

export type NoiseMetric = {
  source: NoiseSourceKind;
  ldenDb: number | null;
  lnightDb: number | null;
  heightM: 1.5 | 4 | null;
  model: "DK_NORD2000" | "EU_CNOSSOS" | "unknown";
  year: number | null;
  coverage: NoiseCoverage;
};

export type NoiseScreeningResult = {
  addressId: string;
  parcelIntersectionUsed: boolean;
  metrics: NoiseMetric[];
  highestRisk: NoiseRisk;
  requiresAcousticReview: boolean | null;
  sourceUrl: string;
  fetchedAt: string;
};
