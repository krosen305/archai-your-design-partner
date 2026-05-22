// SERVER-SIDE ONLY — uses supabaseAdmin (service role).
// All Supabase queries against the `projects` table + auth helper.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";
import { logServerEvent } from "@/lib/server-logger";
import type { PersistedProject } from "@/integrations/supabase/project-persistence";
import { toJsonValue } from "@/lib/json-value";
import { loadActiveDesignIterationSnapshot } from "@/integrations/supabase/repositories/design-iterations.repository";
import {
  existingProjectSnapshotSchema,
  persistedProjectSchema,
} from "@/types/project-restore.schemas";

type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export type ExistingProjectSnapshot = {
  compliance_data: Record<string, unknown> | null;
  address_adresseid: string | null;
};

export async function getUserId(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export async function getOrCreateProject(userId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from("projects")
    .insert({ user_id: userId, current_step: "adresse" })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`[ProjectsRepository] opret projekt fejlede: ${error?.message}`);
  }
  return created.id;
}

export async function createNewProject(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .insert({ user_id: userId, current_step: "adresse" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`[ProjectsRepository] createNewProject fejlede: ${error?.message}`);
  }
  return data.id;
}

export async function getProjectComplianceSnapshot(
  id: string,
  userId: string,
): Promise<ExistingProjectSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("compliance_data,address_adresseid")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logServerEvent({
      module: "projects.repository",
      operation: "getProjectComplianceSnapshot",
      severity: "degraded",
      message: "select compliance snapshot fejlede",
      error: error.message,
      trace: null,
    });
    return null;
  }
  if (!data) return null;

  const parsed = existingProjectSnapshotSchema.safeParse(data);
  if (!parsed.success) {
    logServerEvent({
      module: "projects.repository",
      operation: "getProjectComplianceSnapshot",
      severity: "degraded",
      message: "snapshot payload matchede ikke forventet schema",
      error: parsed.error.message,
      trace: null,
      metadata: { projectId: id },
    });
    return null;
  }

  return parsed.data;
}

export async function updateProject(
  id: string,
  userId: string,
  update: ProjectUpdate,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("projects")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`[ProjectsRepository] update fejlede: ${error.message}`);
  }
}

export async function verifyProjectOwnership(id: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[ProjectsRepository] verifyOwnership: ${error.message}`);
  return !!data;
}

export async function loadProject(
  userId: string,
  projectId?: string | null,
  addressId?: string | null,
): Promise<PersistedProject | null> {
  let query = supabaseAdmin
    .from("projects")
    .select(
      "id, address_full, address_kommune, address_matrikel, address_bbr, address_adresseid, address_postnr, address_postnrnavn, address_koordinater, address_ejerlavskode, address_matrikelnummer, compliance_data, compliance_done, current_step, project_data_status, heritage_save_value, is_fredet, grundareal_m2, bebygget_areal_m2, hard_stop, hard_stop_reason, budget_estimate, bfe_nr, billedanalyse, updated_at",
    )
    .eq("user_id", userId);

  if (projectId?.trim()) {
    query = query.eq("id", projectId);
  } else if (addressId?.trim()) {
    query = query
      .eq("address_adresseid", addressId)
      .order("updated_at", { ascending: false })
      .limit(1);
  } else {
    query = query.order("updated_at", { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    logServerEvent({
      module: "projects.repository",
      operation: "loadProject",
      severity: "degraded",
      message: "loadProject fejlede",
      error: error.message,
      trace: null,
      metadata: { projectId: projectId ?? null, addressId: addressId ?? null },
    });
    return null;
  }
  if (!data) return null;

  const activeDesign = await loadActiveDesignIterationSnapshot(data.id);
  const rowWithDesignFallback = {
    ...data,
    design_byggeoenske: activeDesign?.design_byggeoenske ?? null,
    design_hus_dna: activeDesign?.design_hus_dna ?? null,
    design_placement: activeDesign?.design_placement ?? null,
    budget_estimate: activeDesign?.budget_estimate ?? data.budget_estimate,
  };

  const parsed = persistedProjectSchema.safeParse(rowWithDesignFallback);
  if (!parsed.success) {
    logServerEvent({
      module: "projects.repository",
      operation: "loadProject",
      severity: "degraded",
      message: "project row matchede ikke forventet schema",
      error: parsed.error.message,
      trace: null,
      metadata: { projectId: projectId ?? null, addressId: addressId ?? null },
    });
    return null;
  }

  return {
    ...parsed.data,
    address_koordinater: toJsonValue(parsed.data.address_koordinater) ?? null,
    compliance_data: toJsonValue(parsed.data.compliance_data) ?? null,
    design_byggeoenske: toJsonValue(parsed.data.design_byggeoenske) ?? null,
    project_data_status: toJsonValue(parsed.data.project_data_status) ?? null,
    billedanalyse: toJsonValue(parsed.data.billedanalyse) ?? null,
    design_hus_dna: toJsonValue(parsed.data.design_hus_dna) ?? null,
    design_placement: toJsonValue(parsed.data.design_placement) ?? null,
  };
}

export async function deleteProjectRow(id: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`[ProjectsRepository] deleteProjectRow: ${error.message}`);
}
