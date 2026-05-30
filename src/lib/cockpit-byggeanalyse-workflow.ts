import type { Session } from "@supabase/supabase-js";
import { runByggeanalyse } from "@/lib/cockpit.functions";
import type { ByggeanalyseGatedResult, ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
import type { Byggeoenske } from "@/types/project-state";

export type CockpitByggeanalyseWorkflowDeps = {
  getSession: () => Promise<Session | null>;
  runByggeanalyse: typeof runByggeanalyse;
};

export type CockpitByggeanalyseWorkflowResult =
  | { status: "ok"; analyse: ByggeanalyseResultat }
  | { status: "auth_error" }
  | { status: "no_project" }
  | Extract<ByggeanalyseGatedResult, { status: "blocked" | "missing_data" }>;

export async function runCockpitByggeanalyseWorkflow(
  params: {
    projectId?: string | null;
    byggeoenske: Partial<Byggeoenske>;
  },
  deps: CockpitByggeanalyseWorkflowDeps,
): Promise<CockpitByggeanalyseWorkflowResult> {
  const session = await deps.getSession();
  if (!session) return { status: "auth_error" };
  if (!params.projectId) return { status: "no_project" };

  const result = await deps.runByggeanalyse({
    data: {
      projectId: params.projectId,
      accessToken: session.access_token,
      byggeoenske: params.byggeoenske,
    },
  });

  if (result.status !== "ok") return result;

  const { status: _status, ...analyse } = result;
  return { status: "ok", analyse };
}
