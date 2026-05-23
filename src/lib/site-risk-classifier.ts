export type TerrainRiskLevel = "flat" | "sloping" | "steep";
export type GroundwaterRisk = "low" | "medium" | "high";

export function classifyTerrain(slopePercent: number): TerrainRiskLevel {
  if (slopePercent >= 15) return "steep";
  if (slopePercent >= 5) return "sloping";
  return "flat";
}

export function classifyGroundwater(depthM: number | null): GroundwaterRisk | null {
  if (depthM === null) return null;
  if (depthM < 1.0) return "high";
  if (depthM < 2.0) return "medium";
  return "low";
}

export function isNearNeighbor(nearestDistanceM: number | null): boolean | null {
  if (nearestDistanceM === null) return null;
  return nearestDistanceM < 2.5;
}
