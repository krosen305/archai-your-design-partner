// SERVER-SIDE ONLY.
// Auto-task derivation from compliance triggers + Supabase upsert.
// Pure functions are defined in building-tasks.derivation.ts and re-exported here.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { logServerEvent } from "@/lib/server-logger";
import { recordAnalysisEvent, type AnalysisTraceContext } from "@/lib/analysis-tracing";
import {
  deriveAutoTasks,
  type ComplianceTriggers,
} from "@/integrations/supabase/repositories/building-tasks.derivation";
export {
  deriveAutoTasks,
  type ComplianceTriggers,
} from "@/integrations/supabase/repositories/building-tasks.derivation";

type BuildingTaskInsert = Database["public"]["Tables"]["building_tasks"]["Insert"];

export async function syncBuildingTasks(
  triggers: ComplianceTriggers,
  trace: AnalysisTraceContext | null,
): Promise<void> {
  const tasks = deriveAutoTasks(triggers);
  if (tasks.length === 0) return;

  const readStartedAt = Date.now();
  const { data: existing, error: readError } = await supabaseAdmin
    .from("building_tasks")
    .select("task_key, status")
    .eq("project_id", triggers.projectId)
    .eq("is_auto_generated", true)
    .not("task_key", "is", null);

  await recordAnalysisEvent(trace, {
    eventType: "db_read",
    phase: "persistence",
    service: "Supabase",
    operation: "building_tasks.select_existing",
    status: readError ? "error" : "ok",
    durationMs: Date.now() - readStartedAt,
    errorMessage: readError?.message,
    metadata: { table: "building_tasks" },
  });

  if (readError) {
    logServerEvent({
      module: "building-tasks.repository",
      operation: "syncBuildingTasks.select_existing",
      severity: "degraded",
      message: "building_tasks select fejlede",
      error: readError.message,
      trace,
    });
    return;
  }

  const preservedKeys = new Set(
    (existing ?? [])
      .filter((t) => t.status === "done" || t.status === "not_applicable")
      .map((t) => t.task_key as string),
  );

  const toUpsert = tasks.filter((t) => !preservedKeys.has(t.task_key!));
  if (toUpsert.length === 0) return;

  const writeStartedAt = Date.now();
  const { error } = await supabaseAdmin
    .from("building_tasks")
    .upsert(toUpsert, { onConflict: "project_id,task_key" });

  await recordAnalysisEvent(trace, {
    eventType: "db_write",
    phase: "persistence",
    service: "Supabase",
    operation: "building_tasks.upsert",
    status: error ? "error" : "ok",
    durationMs: Date.now() - writeStartedAt,
    errorMessage: error?.message,
    metadata: {
      table: "building_tasks",
      upsert_count: toUpsert.length,
      task_keys: toUpsert.map((task) => task.task_key),
    },
  });

  if (error) {
    logServerEvent({
      module: "building-tasks.repository",
      operation: "syncBuildingTasks.upsert",
      severity: "degraded",
      message: "building_tasks sync fejlede",
      error: error.message,
      trace,
    });
  }
}
