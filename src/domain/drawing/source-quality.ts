import type { DataConfidence, DataSource, LayerSourceMeta } from "./beliggenhedsplan.types";

export type DrawingSourceQualityReport = {
  overallConfidence: DataConfidence;
  layerReports: LayerQualityReport[];
  missingDataPoints: string[];
  requiresReviewBy: Array<"landinspektoer" | "arkitekt" | "ingenioer" | "kloakmester" | "myndighed">;
};

export type LayerQualityReport = {
  layerName: string;
  path: string;
  source: DataSource;
  confidence: DataConfidence;
  requiresReview: boolean;
  missing: boolean;
};

export function registrySourceMeta(fetchedAt: string): LayerSourceMeta {
  return { source: "registry", confidence: "medium", fetchedAt, requiresReview: false };
}

export function surveySourceMeta(fetchedAt: string): LayerSourceMeta {
  return { source: "survey", confidence: "high", fetchedAt, requiresReview: false };
}

export function generatedSourceMeta(): LayerSourceMeta {
  return { source: "generated", confidence: "medium", fetchedAt: null, requiresReview: true };
}
