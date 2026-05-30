import { createServerFn } from "@tanstack/react-start";
import type { PersistedProject, ProjectPatch } from "@/integrations/supabase/project-persistence";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { withAuth } from "@/lib/server-auth";
import {
  createProjectSchema,
  deleteProjectSchema,
  loadProjectSchema,
  projectPatchSchema,
  saveProjectSchema,
} from "@/types/project-sync.schemas";

export { projectPatchSchema, saveProjectSchema } from "@/types/project-sync.schemas";

export type ProjectSaveContext = {
  accessToken: string;
  projectId?: string | null;
};

export type ProjectRestoreContext = {
  accessToken: string;
  projectId?: string | null;
  addressId?: string | null;
};

// ---------------------------------------------------------------------------
// Server functions - auth validated via withAuth before delegating to persistence
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
      // Zod-validated above - shape matches ProjectPatch contract
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

export async function saveProjectPatch(
  patch: ProjectPatch,
  context: ProjectSaveContext,
): Promise<void> {
  try {
    await serverSaveProject({
      data: {
        accessToken: context.accessToken,
        patch,
        projectId: context.projectId,
      },
    });
  } catch (e) {
    logger.warn("[ProjectSync] gem fejlede (ikke kritisk):", (e as Error).message);
  }
}

// In-flight + short-lived cache for restoreProject - avoids duplicate requests
// when both __root.tsx (app mount) and cockpit-route restore ask for the same
// project within a few seconds.
const RESTORE_CACHE_TTL_MS = 5000;
const restoreCache = new Map<string, { promise: Promise<PersistedProject | null>; ts: number }>();

export async function loadProjectRestore(
  context: ProjectRestoreContext,
): Promise<PersistedProject | null> {
  const cacheKey = `${context.accessToken}::${context.projectId ?? ""}::${context.addressId ?? ""}`;
  const cached = restoreCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < RESTORE_CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = (async () => {
    try {
      return await serverLoadProject({
        data: {
          accessToken: context.accessToken,
          projectId: context.projectId,
          addressId: context.addressId,
        },
      });
    } catch (e) {
      logger.warn("[ProjectSync] gendan fejlede:", (e as Error).message);
      return null;
    }
  })();
  restoreCache.set(cacheKey, { promise, ts: Date.now() });
  return promise;
}

export async function restoreProject(
  projectId?: string | null,
  addressId?: string | null,
): Promise<PersistedProject | null> {
  const session = await getSession();
  const accessToken = session?.access_token ?? null;
  if (!accessToken) return null;
  return loadProjectRestore({ accessToken, projectId, addressId });
}
