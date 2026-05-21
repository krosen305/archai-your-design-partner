// SERVER-SIDE ONLY.
// Supabase Storage operations for project assets (inspirationsbilleder).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logServerEvent } from "@/lib/server-logger";

export async function cleanupProjectStorage(userId: string, projectId: string): Promise<void> {
  const folder = `${userId}/${projectId}`;
  try {
    const { data: files } = await supabaseAdmin.storage.from("inspirationsbilleder").list(folder);
    if (files && files.length > 0) {
      const paths = files.map((f) => `${folder}/${f.name}`);
      await supabaseAdmin.storage.from("inspirationsbilleder").remove(paths);
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
