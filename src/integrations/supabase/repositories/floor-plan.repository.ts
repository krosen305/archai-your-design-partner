// src/integrations/supabase/repositories/floor-plan.repository.ts
//
// SERVER-SIDE ONLY. Supabase adapter for floor_plan_iterations + floor_plan_commands.
// Implements FloorPlanReadPort/FloorPlanWritePort. Snapshot (floor_plan_json) is
// canonical; typed columns are derived via the pure codec (§23.3.2, Rule 6).
//
// Note: floor_plan_* tables are not yet in the generated Database types — the
// generated types must be regenerated after deploy (jf. drawing_exports). Until
// then we use a narrow untyped handle plus Zod validation on read (Rule 1).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FloorPlanReadPort, FloorPlanWritePort } from "@/domain/floor-plan/ports";
import type { FloorPlanCommand } from "@/domain/floor-plan/commands";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";
import { decodeFloorPlanJson, deriveIterationColumns } from "./floor-plan-iteration.codec";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabase = { from: (table: string) => any };
const fpDb = supabaseAdmin as unknown as UntypedSupabase;

const ITERATIONS = "floor_plan_iterations";
const COMMANDS = "floor_plan_commands";

export class FloorPlanRepository implements FloorPlanReadPort, FloorPlanWritePort {
  async loadActiveDocument(
    projectId: string,
    iterationId: string,
  ): Promise<FloorPlanDocument | null> {
    const { data, error } = await fpDb
      .from(ITERATIONS)
      .select("floor_plan_json")
      .eq("id", iterationId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) throw new Error(`floor_plan_iterations load fejlede: ${error.message}`);
    if (!data) return null;
    // Rule 1: validate JSONB at the boundary.
    return decodeFloorPlanJson((data as { floor_plan_json: unknown }).floor_plan_json);
  }

  /** Load the single active plan for a project (UI bootstrap), or null. */
  async loadActiveByProject(
    projectId: string,
  ): Promise<{ iterationId: string; document: FloorPlanDocument } | null> {
    const { data, error } = await fpDb
      .from(ITERATIONS)
      .select("id, floor_plan_json")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(`floor_plan_iterations active load fejlede: ${error.message}`);
    if (!data) return null;
    const row = data as { id: string; floor_plan_json: unknown };
    return { iterationId: row.id, document: decodeFloorPlanJson(row.floor_plan_json) };
  }

  async saveIteration(params: {
    projectId: string;
    designIterationId: string | null;
    document: FloorPlanDocument;
    createdBy: string;
  }): Promise<string> {
    const cols = await deriveIterationColumns(params.document);

    const { data: existing, error: existingErr } = await fpDb
      .from(ITERATIONS)
      .select("version")
      .eq("project_id", params.projectId)
      .order("version", { ascending: false })
      .limit(1);
    if (existingErr)
      throw new Error(`floor_plan_iterations version-opslag fejlede: ${existingErr.message}`);
    const nextVersion = ((existing?.[0] as { version: number } | undefined)?.version ?? 0) + 1;

    // Deactivate the current active version first so the partial unique index
    // (one active per project, §23.3.5) is never violated.
    const { error: deactivateErr } = await fpDb
      .from(ITERATIONS)
      .update({ is_active: false })
      .eq("project_id", params.projectId)
      .eq("is_active", true);
    if (deactivateErr)
      throw new Error(`floor_plan_iterations deaktivering fejlede: ${deactivateErr.message}`);

    const insert = {
      project_id: params.projectId,
      design_iteration_id: params.designIterationId,
      version: nextVersion,
      is_active: true,
      schema_version: cols.schemaVersion,
      floor_plan_json: params.document,
      model_hash: cols.modelHash,
      verification_status: cols.verificationStatus,
      gross_area_m2: cols.grossAreaM2,
      net_area_m2: cols.netAreaM2,
      footprint_area_m2: cols.footprintAreaM2,
      levels_count: cols.levelsCount,
      rooms_count: cols.roomsCount,
      wall_length_total_m: cols.wallLengthTotalM,
      exterior_wall_length_m: cols.exteriorWallLengthM,
      openings_count: cols.openingsCount,
      material_basis_readiness: cols.materialBasisReadiness,
      created_by: params.createdBy,
    };
    const { data, error } = await fpDb.from(ITERATIONS).insert(insert).select("id").single();
    if (error || !data) {
      throw new Error(`floor_plan_iterations insert fejlede: ${error?.message}`);
    }
    return (data as { id: string }).id;
  }

  async appendCommand(params: {
    projectId: string;
    floorPlanIterationId: string;
    command: FloorPlanCommand;
    commandHash: string;
    source: "drag" | "keyboard" | "ai" | "system";
    createdBy: string;
  }): Promise<void> {
    const { data: last, error: lastErr } = await fpDb
      .from(COMMANDS)
      .select("command_index")
      .eq("floor_plan_iteration_id", params.floorPlanIterationId)
      .order("command_index", { ascending: false })
      .limit(1);
    if (lastErr) throw new Error(`floor_plan_commands index-opslag fejlede: ${lastErr.message}`);
    const nextIndex =
      ((last?.[0] as { command_index: number } | undefined)?.command_index ?? -1) + 1;

    const insert = {
      floor_plan_iteration_id: params.floorPlanIterationId,
      project_id: params.projectId,
      command_index: nextIndex,
      command_json: params.command,
      command_hash: params.commandHash,
      source: params.source,
      created_by: params.createdBy,
    };
    const { error } = await fpDb.from(COMMANDS).insert(insert);
    if (error) throw new Error(`floor_plan_commands insert fejlede: ${error.message}`);
  }
}
