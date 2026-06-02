// SERVER-SIDE ONLY.
// design_iterations is the canonical store for design state and placement.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";
import { toJsonValue } from "@/lib/json-value";
import { recordAnalysisEvent, type AnalysisTraceContext } from "@/lib/analysis-tracing";
import { logServerEvent } from "@/lib/server-logger";
import { byggeoenskeSchema, designPlacementSchema } from "@/types/project-restore.schemas";
import type { Byggeoenske, DesignPlacement, HusDna } from "@/types/project-state";

type DesignIterationInsert = Database["public"]["Tables"]["design_iterations"]["Insert"];
type DesignIterationUpdate = Database["public"]["Tables"]["design_iterations"]["Update"];

type DesignIterationSyncPatch = {
  byggeoenske?: Byggeoenske;
  husDna?: HusDna | null;
  budget_estimate?: number | null;
  designPlacement?: DesignPlacement | null;
};

type ActiveDesignIterationRow = {
  id: string;
  version: number;
  budget_estimate: number | null;
  byggeoenske: Json | null;
  hus_dna: Json | null;
  placement_footprint_area_m2: number | null;
  placement_centroid_lat: number | null;
  placement_centroid_lng: number | null;
  placement_rotation_deg: number | null;
  placement_min_distance_to_boundary_m: number | null;
  placement_outside_parcel_area_m2: number | null;
  placement_floors: number | null;
  placement_height_m: number | null;
  placement_source: string | null;
  placement_footprint_geojson: Json | null;
};

type ActiveDesignIterationSnapshot = {
  budget_estimate: number | null;
  byggeoenske: Json | null;
  hus_dna: Json | null;
  designPlacement: DesignPlacement | null;
};

export type ActiveDesignStateSnapshot = {
  budget_estimate: number | null;
  design_byggeoenske: Json | null;
  design_hus_dna: Json | null;
  design_placement: Json | null;
};

function decodeByggeoenske(value: Json | null): Byggeoenske | null {
  const parsed = byggeoenskeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function decodeDesignPlacement(value: unknown): DesignPlacement | null {
  const parsed = designPlacementSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function buildDesignPlacement(row: ActiveDesignIterationRow): DesignPlacement | null {
  const hasPlacement =
    row.placement_footprint_geojson !== null ||
    row.placement_footprint_area_m2 !== null ||
    row.placement_centroid_lat !== null ||
    row.placement_centroid_lng !== null ||
    row.placement_rotation_deg !== null ||
    row.placement_min_distance_to_boundary_m !== null ||
    row.placement_outside_parcel_area_m2 !== null ||
    row.placement_floors !== null ||
    row.placement_height_m !== null ||
    row.placement_source !== null;

  if (!hasPlacement) return null;

  return decodeDesignPlacement({
    footprintGeojson: row.placement_footprint_geojson,
    footprintAreaM2: row.placement_footprint_area_m2,
    centroid:
      row.placement_centroid_lat !== null && row.placement_centroid_lng !== null
        ? {
            lat: row.placement_centroid_lat,
            lng: row.placement_centroid_lng,
          }
        : null,
    rotationDeg: row.placement_rotation_deg ?? 0,
    floors: row.placement_floors,
    heightM: row.placement_height_m,
    minDistanceToBoundaryM: row.placement_min_distance_to_boundary_m,
    outsideParcelAreaM2: row.placement_outside_parcel_area_m2 ?? 0,
    source: row.placement_source ?? "generated",
  });
}

function deriveFloors(byggeoenske: Byggeoenske | null): number | null {
  const floors = byggeoenske?.antalEtager;
  return typeof floors === "number" && Number.isInteger(floors) ? floors : null;
}

function derivePlacementFloors(placement: DesignPlacement | null): number | null {
  const floors = placement?.floors;
  return typeof floors === "number" && Number.isInteger(floors) ? floors : null;
}

function deriveInspirations(byggeoenske: Byggeoenske | null): Json {
  const values = byggeoenske?.inspirationsbilledePaths ?? byggeoenske?.inspirationsbilleder ?? [];
  return toJsonValue(values) ?? [];
}

function toPlacementColumns(
  placement: DesignPlacement | null,
): Pick<
  DesignIterationUpdate,
  | "placement_footprint_area_m2"
  | "placement_centroid_lat"
  | "placement_centroid_lng"
  | "placement_rotation_deg"
  | "placement_min_distance_to_boundary_m"
  | "placement_outside_parcel_area_m2"
  | "placement_floors"
  | "placement_height_m"
  | "placement_source"
  | "placement_footprint_geojson"
> {
  return {
    placement_footprint_area_m2: placement?.footprintAreaM2 ?? null,
    placement_centroid_lat: placement?.centroid?.lat ?? null,
    placement_centroid_lng: placement?.centroid?.lng ?? null,
    placement_rotation_deg: placement?.rotationDeg ?? null,
    placement_min_distance_to_boundary_m: placement?.minDistanceToBoundaryM ?? null,
    placement_outside_parcel_area_m2: placement?.outsideParcelAreaM2 ?? 0,
    placement_floors: derivePlacementFloors(placement),
    placement_height_m: placement?.heightM ?? null,
    placement_source: placement?.source ?? null,
    placement_footprint_geojson: toJsonValue(placement?.footprintGeojson ?? null) ?? null,
  };
}

export function hasDesignIterationFields(patch: DesignIterationSyncPatch): boolean {
  return (
    patch.byggeoenske !== undefined ||
    patch.husDna !== undefined ||
    patch.budget_estimate !== undefined ||
    patch.designPlacement !== undefined
  );
}

export function deriveActiveDesignIterationUpdate(
  patch: DesignIterationSyncPatch,
  existing: ActiveDesignIterationSnapshot | null,
): DesignIterationUpdate | null {
  const mergedByggeoenske =
    patch.byggeoenske !== undefined
      ? (toJsonValue(patch.byggeoenske) ?? null)
      : (existing?.byggeoenske ?? null);
  const mergedHusDna =
    patch.husDna !== undefined ? (toJsonValue(patch.husDna) ?? null) : (existing?.hus_dna ?? null);
  const mergedBudgetEstimate =
    patch.budget_estimate !== undefined
      ? (patch.budget_estimate ?? null)
      : (existing?.budget_estimate ?? null);
  const mergedPlacement =
    patch.designPlacement !== undefined
      ? (patch.designPlacement ?? null)
      : (existing?.designPlacement ?? null);

  if (
    mergedByggeoenske === null &&
    mergedHusDna === null &&
    mergedBudgetEstimate === null &&
    mergedPlacement === null
  ) {
    return null;
  }

  const byggeoenskeObject = decodeByggeoenske(mergedByggeoenske);

  return {
    area_m2: byggeoenskeObject?.oensketAreal ?? null,
    floors: deriveFloors(byggeoenskeObject),
    description: byggeoenskeObject?.designDroem ?? null,
    inspirations: deriveInspirations(byggeoenskeObject),
    budget_estimate: mergedBudgetEstimate,
    byggeoenske: mergedByggeoenske,
    hus_dna: mergedHusDna,
    ...toPlacementColumns(mergedPlacement),
  };
}

async function getActiveDesignIteration(
  projectId: string,
): Promise<ActiveDesignIterationRow | null> {
  const { data, error } = await supabaseAdmin
    .from("design_iterations")
    .select(
      "id, version, budget_estimate, byggeoenske, hus_dna, placement_footprint_area_m2, placement_centroid_lat, placement_centroid_lng, placement_rotation_deg, placement_min_distance_to_boundary_m, placement_outside_parcel_area_m2, placement_floors, placement_height_m, placement_source, placement_footprint_geojson",
    )
    .eq("project_id", projectId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[DesignIterationsRepository] select active iteration fejlede: ${error.message}`,
    );
  }

  return data;
}

function toSnapshot(row: ActiveDesignIterationRow): ActiveDesignIterationSnapshot {
  return {
    budget_estimate: row.budget_estimate,
    byggeoenske: row.byggeoenske,
    hus_dna: row.hus_dna,
    designPlacement: buildDesignPlacement(row),
  };
}

export async function syncActiveDesignIteration(
  projectId: string,
  patch: DesignIterationSyncPatch,
  trace: AnalysisTraceContext | null,
): Promise<void> {
  if (!hasDesignIterationFields(patch)) return;

  const readStartedAt = Date.now();
  let existing: ActiveDesignIterationRow | null = null;

  try {
    existing = await getActiveDesignIteration(projectId);
  } catch (error) {
    await recordAnalysisEvent(trace, {
      eventType: "db_read",
      phase: "persistence",
      service: "Supabase",
      operation: "design_iterations.select_active",
      status: "error",
      durationMs: Date.now() - readStartedAt,
      errorMessage: (error as Error).message,
      metadata: { table: "design_iterations", project_id: projectId },
    });
    logServerEvent({
      module: "design-iterations.repository",
      operation: "syncActiveDesignIteration.select_active",
      severity: "degraded",
      message: "select aktiv design_iteration fejlede",
      error: (error as Error).message,
      trace,
    });
    return;
  }

  await recordAnalysisEvent(trace, {
    eventType: "db_read",
    phase: "persistence",
    service: "Supabase",
    operation: "design_iterations.select_active",
    status: "ok",
    durationMs: Date.now() - readStartedAt,
    metadata: { table: "design_iterations", project_id: projectId, found: Boolean(existing) },
  });

  const next = deriveActiveDesignIterationUpdate(patch, existing ? toSnapshot(existing) : null);
  if (!next) return;

  const writeStartedAt = Date.now();

  if (existing) {
    const { error } = await supabaseAdmin
      .from("design_iterations")
      .update(next)
      .eq("id", existing.id);

    await recordAnalysisEvent(trace, {
      eventType: "db_write",
      phase: "persistence",
      service: "Supabase",
      operation: "design_iterations.update_active",
      status: error ? "error" : "ok",
      durationMs: Date.now() - writeStartedAt,
      errorMessage: error?.message,
      metadata: { table: "design_iterations", project_id: projectId, fields: Object.keys(next) },
    });

    if (error) {
      logServerEvent({
        module: "design-iterations.repository",
        operation: "syncActiveDesignIteration.update_active",
        severity: "degraded",
        message: "update aktiv design_iteration fejlede",
        error: error.message,
        trace,
      });
    }
    return;
  }

  const insertRow: DesignIterationInsert = {
    project_id: projectId,
    version: 1,
    is_active: true,
    ...next,
  };

  const { error } = await supabaseAdmin.from("design_iterations").insert(insertRow);

  await recordAnalysisEvent(trace, {
    eventType: "db_write",
    phase: "persistence",
    service: "Supabase",
    operation: "design_iterations.insert_active",
    status: error ? "error" : "ok",
    durationMs: Date.now() - writeStartedAt,
    errorMessage: error?.message,
    metadata: {
      table: "design_iterations",
      project_id: projectId,
      fields: Object.keys(insertRow),
    },
  });

  if (error) {
    logServerEvent({
      module: "design-iterations.repository",
      operation: "syncActiveDesignIteration.insert_active",
      severity: "degraded",
      message: "insert aktiv design_iteration fejlede",
      error: error.message,
      trace,
    });
  }
}

export async function loadActiveDesignIterationSnapshot(
  projectId: string,
): Promise<ActiveDesignStateSnapshot | null> {
  try {
    const row = await getActiveDesignIteration(projectId);
    if (!row) return null;

    return {
      budget_estimate: row.budget_estimate,
      design_byggeoenske: row.byggeoenske,
      design_hus_dna: row.hus_dna,
      design_placement: toJsonValue(buildDesignPlacement(row)) ?? null,
    };
  } catch (error) {
    logServerEvent({
      module: "design-iterations.repository",
      operation: "loadActiveDesignIterationSnapshot",
      severity: "degraded",
      message: "load aktiv design_iteration fejlede",
      error: (error as Error).message,
      trace: null,
      metadata: { projectId },
    });
    return null;
  }
}
