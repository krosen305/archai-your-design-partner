import type { Session } from "@supabase/supabase-js";
import { loadProjectRestore } from "@/lib/project-sync";
import type { PersistedProject } from "@/integrations/supabase/project-persistence";

export type ProjectRestoreWorkflowDeps = {
  getSession: () => Promise<Session | null>;
  loadProjectRestore: typeof loadProjectRestore;
};

export async function runProjectRestoreWorkflow(
  params: {
    projectId?: string | null;
    addressId?: string | null;
  },
  deps: ProjectRestoreWorkflowDeps,
): Promise<PersistedProject | null> {
  const session = await deps.getSession();
  const accessToken = session?.access_token ?? null;
  if (!accessToken) return null;

  return deps.loadProjectRestore({
    accessToken,
    projectId: params.projectId,
    addressId: params.addressId,
  });
}
