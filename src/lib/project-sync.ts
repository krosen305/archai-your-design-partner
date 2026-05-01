// Client-side hjælpefunktioner til at synkronisere wizard-state med Supabase.
// Alle kald er fire-and-forget — fejl logges men blokerer aldrig UI-flowet.
//
// Brug:
//   import { syncAddress, syncCompliance, syncHusDna } from '@/lib/project-sync';
//   await syncAddress(address);   // efter setAddress()
//   await syncCompliance(patch);  // efter compliance pipeline

import { createServerFn } from '@tanstack/react-start';
import type { ProjectPatch, PersistedProject } from '@/integrations/supabase/project-persistence';

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

export const serverSaveProject = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; patch: ProjectPatch }) => data)
  .handler(async ({ data }): Promise<void> => {
    const { saveProject } = await import('@/integrations/supabase/project-persistence');
    await saveProject(data.accessToken, data.patch);
  });

export const serverLoadProject = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }): Promise<PersistedProject | null> => {
    const { loadProject } = await import('@/integrations/supabase/project-persistence');
    return loadProject(data.accessToken);
  });

// ---------------------------------------------------------------------------
// Client-side helpers — henter access token og kalder server function
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string | null> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function syncPatch(patch: ProjectPatch): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) return; // Gæst — no-op
  try {
    await serverSaveProject({ data: { accessToken, patch } });
  } catch (e) {
    console.warn('[ProjectSync] gem fejlede (ikke kritisk):', (e as Error).message);
  }
}

export async function restoreProject(): Promise<PersistedProject | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  try {
    return await serverLoadProject({ data: { accessToken } });
  } catch (e) {
    console.warn('[ProjectSync] gendan fejlede:', (e as Error).message);
    return null;
  }
}
