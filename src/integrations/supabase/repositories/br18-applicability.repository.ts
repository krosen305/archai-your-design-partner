// SERVER-SIDE ONLY.
// BR18 applicability results repository for project-specific requirement applicability.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { br18ApplicabilityResultSchema } from "@/lib/br18/schemas";
import type { Br18ApplicabilityResult } from "@/lib/br18/types";

export async function upsertApplicabilityResult(
  projectId: string,
  result: Br18ApplicabilityResult,
  br18Version: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin as any).from("project_br18_applicability").upsert(
    {
      project_id: projectId,
      requirement_id: result.requirementId,
      br18_version: br18Version,
      status: result.status,
      reasons: result.reasons,
      missing_inputs: result.missingInputs,
      evaluated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,requirement_id,br18_version" },
  );
  if (error) throw new Error(`br18-applicability upsert: ${error.message}`);
}

export async function getApplicabilityForProject(
  projectId: string,
): Promise<Br18ApplicabilityResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any)
    .from("project_br18_applicability")
    .select("*")
    .eq("project_id", projectId);

  if (error) throw new Error(`br18-applicability read: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) =>
    br18ApplicabilityResultSchema.parse({
      requirementId: row.requirement_id,
      status: row.status,
      reasons: row.reasons,
      missingInputs: row.missing_inputs,
      sourceFacts: [],
    }),
  );
}
