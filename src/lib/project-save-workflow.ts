import type { Session } from "@supabase/supabase-js";
import { saveProjectPatch } from "@/lib/project-sync";
import type { ProjectPatch } from "@/integrations/supabase/project-persistence";

export type ProjectSaveWorkflowDeps = {
  getSession: () => Promise<Session | null>;
  saveProjectPatch: typeof saveProjectPatch;
};

export async function runProjectSaveWorkflow(
  params: {
    patch: ProjectPatch;
    projectId?: string | null;
  },
  deps: ProjectSaveWorkflowDeps,
): Promise<void> {
  const session = await deps.getSession();
  const accessToken = session?.access_token ?? null;
  if (!accessToken) return;

  await deps.saveProjectPatch(params.patch, {
    accessToken,
    projectId: params.projectId,
  });
}
