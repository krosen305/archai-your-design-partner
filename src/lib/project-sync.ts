import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { PersistedProject, ProjectPatch } from "@/integrations/supabase/project-persistence";
import { logger } from "@/lib/logger";
import { useProject } from "@/lib/project-store";

export const serverCreateProject = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }): Promise<string | null> => {
    const { createProject } = await import("@/integrations/supabase/project-persistence");
    return createProject(data.accessToken);
  });

export const serverSaveProject = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { accessToken: string; patch: ProjectPatch; projectId?: string | null }) => data,
  )
  .handler(async ({ data }): Promise<void> => {
    const { saveProject } = await import("@/integrations/supabase/project-persistence");
    await saveProject(data.accessToken, data.patch, data.projectId);
  });

export const serverLoadProject = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; projectId?: string | null; addressId?: string | null }) => data)
  .handler(async ({ data }): Promise<PersistedProject | null> => {
    const { loadProject } = await import("@/integrations/supabase/project-persistence");
    return loadProject(data.accessToken, data.projectId, data.addressId);
  });

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

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
const restoreCache = new Map<
  string,
  { promise: Promise<PersistedProject | null>; ts: number }
>();

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
