import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { PersistedProject, ProjectPatch } from "@/integrations/supabase/project-persistence";
import { logger } from "@/lib/logger";
import { withAuth } from "@/lib/server-auth";
import { useProject } from "@/lib/project-store";

// ---------------------------------------------------------------------------
// Input schemas — runtime-validated (replaces TypeScript-only pass-through)
// ---------------------------------------------------------------------------

const tokenSchema = z.string().min(1);

const createProjectSchema = z.object({ accessToken: tokenSchema });

// Top-level shape of ProjectPatch validated with .strict() to reject unknown keys.
// Nested types (BbrKompliantData, FbbResultat, etc.) are complex — validated as
// opaque records/arrays at this layer. The TypeScript types enforce inner shape.
export const projectPatchSchema = z
  .object({
    address: z.record(z.string(), z.unknown()).optional(),
    bbrData: z.record(z.string(), z.unknown()).nullable().optional(),
    husDna: z.record(z.string(), z.unknown()).nullable().optional(),
    byggeoenske: z.record(z.string(), z.unknown()).optional(),
    complianceFlags: z.array(z.record(z.string(), z.unknown())).optional(),
    lokalplaner: z.array(z.record(z.string(), z.unknown())).optional(),
    kommuneplanramme: z.record(z.string(), z.unknown()).nullable().optional(),
    byggeanalyseResultat: z.record(z.string(), z.unknown()).nullable().optional(),
    vurderingData: z.record(z.string(), z.unknown()).nullable().optional(),
    naturbeskyttelse: z.record(z.string(), z.unknown()).nullable().optional(),
    dkjord: z.record(z.string(), z.unknown()).nullable().optional(),
    geusRisk: z.record(z.string(), z.unknown()).nullable().optional(),
    servitutter: z.record(z.string(), z.unknown()).nullable().optional(),
    terrain: z.record(z.string(), z.unknown()).nullable().optional(),
    naboer: z.record(z.string(), z.unknown()).nullable().optional(),
    fjernvarme: z.record(z.string(), z.unknown()).nullable().optional(),
    fbbData: z.record(z.string(), z.unknown()).nullable().optional(),
    billedanalyse: z.record(z.string(), z.unknown()).nullable().optional(),
    complianceDone: z.boolean().optional(),
    currentStep: z.string().optional(),
    projectDataStatus: z.unknown().nullable().optional(),
    analysisRunId: z.string().uuid().nullable().optional(),
    budget_estimate: z.number().nullable().optional(),
  })
  .strict();

export const saveProjectSchema = z.object({
  accessToken: tokenSchema,
  patch: projectPatchSchema,
  projectId: z.string().uuid().nullable().optional(),
});

const loadProjectSchema = z.object({
  accessToken: tokenSchema,
  projectId: z.string().uuid().nullable().optional(),
  addressId: z.string().optional().nullable(),
});

const deleteProjectSchema = z.object({
  accessToken: tokenSchema,
  projectId: z.string().uuid(),
});

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
