import type { NeighborBuildingData } from "@/domain/contracts/analysis.types";
import type { NeighborContextFacts } from "@/domain/contracts/surroundings.types";
import type { PipelineServiceState } from "@/types/project-state";

const TRUSTED_NEIGHBOR_STATES = new Set<PipelineServiceState>(["success", "cache_hit"]);

export function neighborContextFactsFromNeighborData(
  data: NeighborBuildingData | null,
  state: PipelineServiceState | null | undefined,
): NeighborContextFacts | null {
  if (!data || data.fejl) return null;
  if (!state || !TRUSTED_NEIGHBOR_STATES.has(state)) return null;

  return {
    buildingCount40m: data.count,
    nearestBuildingDistanceM: data.nearestDistanceM,
    nearestRoadCenterlineDistanceM: data.roadDistanceM,
    accessRoadNearby: data.accessRoadNearby,
    confidence: "covered",
  };
}
