import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Tables } from "@/integrations/supabase/types";
import { getEnvOptional } from "@/lib/env";

export type AnalysisEventRow = Tables<"analysis_events">;
export type AnalysisRunRow = Tables<"analysis_runs">;
export type AnalysisRunView = AnalysisRunRow & { events: AnalysisEventRow[] };
type AnalysisRunWithRelation = AnalysisRunRow & { analysis_events: AnalysisEventRow[] | null };

export type LoadDebugAnalysisRunsInput = {
  addressId: string | null;
  projectId: string | null;
  token: string;
};

export function canAccessDebugAnalysis(
  environment: string | undefined,
  _role?: string | null,
): boolean {
  return environment !== "production";
}

export async function loadDebugAnalysisRuns(
  input: LoadDebugAnalysisRunsInput,
): Promise<AnalysisRunView[]> {
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(input.token);
  if (authError || !authData.user) throw new Error("401: Ikke autentificeret");

  const role = String(authData.user.app_metadata?.role ?? "");
  if (!canAccessDebugAnalysis(getEnvOptional("ENVIRONMENT"))) {
    throw new Error("403: Debug analyse er ikke tilgaengelig i produktionsmiljoet");
  }

  let query = supabaseAdmin
    .from("analysis_runs")
    .select(
      `id, run_kind, address_id, project_id, user_id, source, status,
       started_at, completed_at, duration_ms, error_message, metadata,
       analysis_events (
         id, run_id, event_type, phase, service, operation, status,
         cache_hit, attempt, http_status, duration_ms, error_message,
         metadata, input_summary, output_summary, decision_summary, created_at
       )`,
    )
    .order("started_at", { ascending: false })
    .limit(20);

  if (input.addressId) query = query.eq("address_id", input.addressId);
  if (input.projectId) query = query.eq("project_id", input.projectId);

  const { data: runs, error } = await query.returns<AnalysisRunWithRelation[]>();
  if (error) throw new Error(`DB fejl: ${error.message}`);

  return (runs ?? []).map((run) => ({
    ...run,
    events: [...(run.analysis_events ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
  }));
}
