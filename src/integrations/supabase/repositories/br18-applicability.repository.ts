// SERVER-SIDE ONLY.
// BR18 applicability results repository for project-specific requirement applicability.
// NOTE: Temporary in-memory cache implementation.
// TODO: Migrate to persistent project_br18_applicability table when available.

import { br18ApplicabilityResultSchema } from "@/lib/br18/schemas";
import type { Br18ApplicabilityResult } from "@/lib/br18/types";
import { logServerEvent } from "@/lib/server-logger";

// In-memory cache: projectId -> { br18Version -> { requirementId -> result } }
const applicabilityCache = new Map<string, Map<string, Map<string, Br18ApplicabilityResult>>>();

export async function upsertApplicabilityResult(
  projectId: string,
  result: Br18ApplicabilityResult,
  br18Version: string,
): Promise<void> {
  try {
    // Validate result before caching
    br18ApplicabilityResultSchema.parse(result);

    // Ensure cache structure exists
    if (!applicabilityCache.has(projectId)) {
      applicabilityCache.set(projectId, new Map());
    }
    const projectCache = applicabilityCache.get(projectId)!;

    if (!projectCache.has(br18Version)) {
      projectCache.set(br18Version, new Map());
    }
    const versionCache = projectCache.get(br18Version)!;

    // Store result
    versionCache.set(result.requirementId, result);
  } catch (error) {
    logServerEvent({
      module: "br18-applicability.repository",
      operation: "upsertApplicabilityResult",
      severity: "degraded",
      message: "BR18 applicability validation fejlede",
      error: error instanceof Error ? error.message : "Unknown error",
      trace: null,
    });
    throw new Error(
      `Failed to upsert BR18 applicability: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function getApplicabilityForProject(
  projectId: string,
): Promise<Br18ApplicabilityResult[]> {
  const projectCache = applicabilityCache.get(projectId);

  if (!projectCache || projectCache.size === 0) {
    return [];
  }

  const results: Br18ApplicabilityResult[] = [];

  // Flatten all results from all versions
  for (const versionCache of projectCache.values()) {
    for (const result of versionCache.values()) {
      results.push(result);
    }
  }

  return results;
}
