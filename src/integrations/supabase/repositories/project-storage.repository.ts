// SERVER-SIDE ONLY.
// Supabase Storage operations for project assets (inspirationsbilleder).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logServerEvent } from "@/lib/server-logger";

const BUCKET = "inspirationsbilleder";

export async function cleanupProjectStorage(userId: string, projectId: string): Promise<void> {
  const folder = `${userId}/${projectId}`;
  try {
    const { data: files } = await supabaseAdmin.storage.from(BUCKET).list(folder);
    if (files && files.length > 0) {
      const paths = files.map((f) => `${folder}/${f.name}`);
      await supabaseAdmin.storage.from(BUCKET).remove(paths);
    }
  } catch (e) {
    logServerEvent({
      module: "project-storage.repository",
      operation: "cleanupProjectStorage",
      severity: "degraded",
      message: "storage cleanup fejlede (ikke kritisk)",
      error: e,
      trace: null,
      metadata: { projectId },
    });
  }
}

export async function uploadProjectStorageObject(params: {
  path: string;
  body: ArrayBuffer;
  contentType: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(params.path, params.body, {
    contentType: params.contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Upload fejlede: ${error.message}`);
  }
}

export async function createProjectStorageSignedUrl(
  path: string,
  expiresInSeconds: number,
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Kunne ikke generere signed URL: ${error?.message ?? "ukendt fejl"}`);
  }

  return data.signedUrl;
}
