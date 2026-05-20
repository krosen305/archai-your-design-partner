// SERVER-SIDE ONLY.
// Auto-task derivation from compliance triggers + Supabase upsert.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";
import { BUILDING_TASK_KEYS } from "@/types/building-platform";
import { logServerEvent } from "@/lib/server-logger";
import { recordAnalysisEvent, type AnalysisTraceContext } from "@/lib/analysis-tracing";

type BuildingTaskInsert = Database["public"]["Tables"]["building_tasks"]["Insert"];

export type ComplianceTriggers = {
  projectId: string;
  saveValue: number | null;
  isFredet: boolean | null;
  strandbeskyttelse: boolean | null;
  fredskov: boolean | null;
  klitfredning: boolean | null;
  soilContamination: "clean" | "registered" | "contaminated" | "unknown" | null;
  jordforureningV1: boolean | null;
  jordforureningV2: boolean | null;
  omraadeklassificering: string | null;
};

export function deriveAutoTasks(t: ComplianceTriggers): BuildingTaskInsert[] {
  const tasks: BuildingTaskInsert[] = [];

  const { violations } = evaluateHardStop({
    saveValue: t.saveValue,
    isFredet: t.isFredet,
    strandbeskyttelse: t.strandbeskyttelse,
    fredskov: t.fredskov,
    klitfredning: t.klitfredning,
    projectType: "demolition_and_new",
  });
  const violationRules = new Set(violations.map((v) => v.rule));

  if (violationRules.has("listed_building_demolition")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.FREDNING_JURIDISK,
      title: "Fredningsstatus — juridisk afklaring påkrævet",
      description:
        "Bygningen er registreret som fredet (DAI WFS). Kontakt Slots- og Kulturstyrelsen inden nedrivning eller væsentlig ombygning.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "is_fredet",
      metadata: { kilde: "DAI WFS FREDEDE_BYGNINGER" },
    });
  }

  if (violationRules.has("save_1_3_demolition")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.SAVE_DISPENSATION,
      title: `Dispensation fra Slots- og Kulturstyrelsen krævet (SAVE ${t.saveValue})`,
      description: `Bygningen har høj bevaringsværdi (SAVE ${t.saveValue}/9). Nedrivning eller væsentlig ombygning kræver forudgående tilladelse fra Slots- og Kulturstyrelsen.`,
      phase: "myndighed",
      status: "blocked",
      priority: 1,
      is_auto_generated: true,
      blocked_by_constraint: "heritage_save_value",
      metadata: { save_value: t.saveValue, myndighed: "Slots- og Kulturstyrelsen" },
    });
  }

  if (violationRules.has("save_4_paragraph14_risk")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.SAVE_4_PARAGRAPH14,
      title: "Undersøg §14-forbud risiko (SAVE 4)",
      description:
        "Bygningen har bevaringsværdi SAVE 4. Kommunen kan nedlægge §14-forbud mod nedrivning. Kontakt kommunens tekniske forvaltning tidligt i processen — gerne inden budgetlåsning.",
      phase: "matriklen",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: "heritage_save_value",
      metadata: {
        save_value: 4,
        myndighed: "Kommunens tekniske forvaltning",
        lovgrundlag: "Planlovens §14",
      },
    });
  }

  if (violationRules.has("protection_line_coastal")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.STRANDBESKYTTELSE_DISPENSATION,
      title: "Strandbeskyttelse — dispensation påkrævet",
      description:
        "Grunden er inden for strandbeskyttelseslinjen (300 m fra kyst). Nybyggeri kræver dispensation fra Kystdirektoratet. Behandlingstid typisk 3–6 måneder.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "strandbeskyttelse",
      metadata: { myndighed: "Kystdirektoratet" },
    });
  }

  if (violationRules.has("protection_line_forest")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.FREDSKOV_DISPENSATION,
      title: "Fredskov — dispensation påkrævet",
      description:
        "Ejendommen er beliggende i fredskov (Skovloven). Byggeaktivitet kræver dispensation fra Miljøministeriet.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "fredskov",
      metadata: { myndighed: "Miljøministeriet" },
    });
  }

  if (violationRules.has("protection_line_clitFredning")) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.KLITFREDNING_DISPENSATION,
      title: "Klitfredning — dispensation påkrævet",
      description:
        "Grunden er inden for klitfredningslinjen. Byggeaktivitet kræver dispensation fra Kystdirektoratet.",
      phase: "myndighed",
      status: "blocked",
      priority: 0,
      is_auto_generated: true,
      blocked_by_constraint: "klitfredning",
      metadata: { myndighed: "Kystdirektoratet" },
    });
  }

  if (t.jordforureningV2 === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.JORDFORURENING_V2_UNDERSOEGELSE,
      title: "Miljøteknisk undersøgelse af V2-kortlagt grund",
      description:
        "Grunden er V2-kortlagt (dokumenteret forurening). Oprensning kan koste 500.000 kr+. " +
        "En miljøteknisk undersøgelse er påkrævet inden byggestart (Jordforureningslovens §72). " +
        "Budgettér undersøgelse + oprensning som en separat post.",
      phase: "matriklen",
      status: "blocked",
      priority: 1,
      is_auto_generated: true,
      blocked_by_constraint: "jordforurening_v2",
      metadata: { kortlaeggingsklasse: "V2", myndighed: "Miljøstyrelsen" },
    });
  }

  if (t.jordforureningV1 === true) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.JORDFORURENING_V1_SCREENING,
      title: "Miljøscreening af V1-kortlagt grund",
      description:
        "Grunden er V1-kortlagt (mulig forurening). En indledende miljøscreening anbefales " +
        "inden køb og er nødvendig inden nedrivningsansøgning.",
      phase: "matriklen",
      status: "pending",
      priority: 2,
      is_auto_generated: true,
      blocked_by_constraint: "jordforurening_v1",
      metadata: { kortlaeggingsklasse: "V1", myndighed: "Miljøstyrelsen" },
    });
  }

  if (t.omraadeklassificering !== null) {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.JORDFLYTNING_ATTEST,
      title: "Indhent jordsundhedsattest inden jordflytning",
      description:
        `Grunden er i et områdeklassificeret område (${t.omraadeklassificering}). ` +
        "Jordflytning fra grunden kræver jordsundhedsattest fra kommunen.",
      phase: "maskinrummet",
      status: "pending",
      priority: 3,
      is_auto_generated: true,
      blocked_by_constraint: "omraadeklassificering",
      metadata: { omraadeklassificering: t.omraadeklassificering, myndighed: "Kommunen" },
    });
  }

  if (t.soilContamination === "unknown") {
    tasks.push({
      project_id: t.projectId,
      task_key: BUILDING_TASK_KEYS.MILJOEUNDERSOEGELSE,
      title: "DkJord-data utilgængeligt — jordforureningskortlægning påkrævet",
      description:
        "DkJord-opslaget kunne ikke gennemføres. En miljøundersøgelse af grunden er nødvendig for at fastlægge status for jordforurening inden byggestart.",
      phase: "matriklen",
      status: "pending",
      priority: 3,
      is_auto_generated: true,
      blocked_by_constraint: "soil_contamination_status",
      metadata: { kortlaeggingsklasse: "unknown", reason: "dkjord_api_unavailable" },
    });
  }

  return tasks;
}

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
