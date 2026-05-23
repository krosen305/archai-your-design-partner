import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { PersistedProject, ProjectPatch } from "@/integrations/supabase/project-persistence";
import { logger } from "@/lib/logger";
import { withAuth } from "@/lib/server-auth";
import { useProject } from "@/lib/project-store";
import {
  createProjectSchema,
  deleteProjectSchema,
  loadProjectSchema,
  projectPatchSchema,
  saveProjectSchema,
} from "@/types/project-sync.schemas";

export { projectPatchSchema, saveProjectSchema } from "@/types/project-sync.schemas";

// ---------------------------------------------------------------------------
// Server functions — auth validated via withAuth before delegating to persistence
// ---------------------------------------------------------------------------

export const serverCreateProject = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createProjectSchema.parse(data))
  .handler(async ({ data }): Promise<string | null> => {
    return withAuth(data.accessToken, async () => {
      const { createProject } = await import("@/integrations/supabase/project-persistence");
      return createProject(data.accessToken);
    });
  });

export const serverSaveProject = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveProjectSchema.parse(data))
  .handler(async ({ data }): Promise<void> => {
    return withAuth(data.accessToken, async () => {
      const { saveProject } = await import("@/integrations/supabase/project-persistence");
      // Zod-validated above — shape matches ProjectPatch contract
      await saveProject(data.accessToken, data.patch as ProjectPatch, data.projectId);
    });
  });

export const serverLoadProject = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loadProjectSchema.parse(data))
  .handler(async ({ data }): Promise<PersistedProject | null> => {
    return withAuth(data.accessToken, async () => {
      const { loadProject } = await import("@/integrations/supabase/project-persistence");
      return loadProject(data.accessToken, data.projectId, data.addressId);
    });
  });

export const serverDeleteProject = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteProjectSchema.parse(data))
  .handler(async ({ data }): Promise<void> => {
    return withAuth(data.accessToken, async () => {
      const { deleteProject } = await import("@/integrations/supabase/project-persistence");
      await deleteProject(data.accessToken, data.projectId);
    });
  });

// ---------------------------------------------------------------------------
// Client-side helpers
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

// Mutation policy: fire-and-forget / last-write-wins.
// syncPatch is called from UI event handlers and is not awaited by callers.
// Concurrent saves for the same project are possible — the last write wins.
// Critical writes (e.g., project creation) use serverCreateProject directly and are awaited by callers.
export async function syncPatch(patch: ProjectPatch): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) return;
  const projectId = useProject.getState().currentProjectId;
  try {
    await serverSaveProject({ data: { accessToken, patch, projectId } });
  } catch (e) {
    logger.warn("[ProjectSync] gem fejlede (ikke kritisk):", (e as Error).message);
  }
}

// In-flight + short-lived cache for restoreProject — undgår dobbeltkald når både
// __root.tsx (app-mount) og cockpit-route restorer samme projekt indenfor få sekunder.
const RESTORE_CACHE_TTL_MS = 5000;
const restoreCache = new Map<string, { promise: Promise<PersistedProject | null>; ts: number }>();

export async function restoreProject(
  projectId?: string | null,
  addressId?: string | null,
): Promise<PersistedProject | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  const cacheKey = `${accessToken}::${projectId ?? ""}::${addressId ?? ""}`;
  const cached = restoreCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < RESTORE_CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = (async () => {
    try {
      return await serverLoadProject({ data: { accessToken, projectId, addressId } });
    } catch (e) {
      logger.warn("[ProjectSync] gendan fejlede:", (e as Error).message);
      return null;
    }
  })();
  restoreCache.set(cacheKey, { promise, ts: Date.now() });
  return promise;
}
