// SERVER-SIDE ONLY.
// BR18 Evidence repository — upsert, query, and update evidence items.
// NOTE: project_br18_evidence table exists in Supabase but is not yet in Database types.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { EvidenceItem, EvidenceStatus } from "@/lib/br18/types";
import { evidenceItemSchema } from "@/lib/br18/schemas";
import { logServerEvent } from "@/lib/server-logger";

type EvidenceItemRow = {
  id: string;
  project_id: string;
  requirement_id: string;
  evidence_type: string;
  status: string;
  source: string;
  file_id: string | null;
  structured_payload: Record<string, unknown> | null;
  validation_notes: string[];
  reviewed_by_role: string | null;
  reviewed_at: string | null;
};

function rowToEvidenceItem(row: EvidenceItemRow): EvidenceItem {
  return evidenceItemSchema.parse({
    id: row.id,
    projectId: row.project_id,
    requirementId: row.requirement_id,
    evidenceType: row.evidence_type,
    status: row.status,
    source: row.source,
    fileId: row.file_id,
    structuredPayload: row.structured_payload,
    validationNotes: row.validation_notes,
    reviewedByRole: row.reviewed_by_role,
    reviewedAt: row.reviewed_at,
  });
}

function evidenceItemToRow(item: EvidenceItem) {
  return {
    id: item.id,
    project_id: item.projectId,
    requirement_id: item.requirementId,
    evidence_type: item.evidenceType,
    status: item.status,
    source: item.source,
    file_id: item.fileId,
    structured_payload: item.structuredPayload,
    validation_notes: item.validationNotes,
    reviewed_by_role: item.reviewedByRole,
    reviewed_at: item.reviewedAt,
  };
}

export async function upsertEvidenceItem(item: EvidenceItem): Promise<void> {
  const row = evidenceItemToRow(item);

  // Use function signature to work around missing table in Database types
  const query = supabaseAdmin.from("project_br18_evidence" as unknown as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (query as any).upsert(row, { onConflict: "id" });

  if (error) {
    logServerEvent({
      module: "br18-evidence.repository",
      operation: "upsertEvidenceItem",
      severity: "degraded",
      message: "project_br18_evidence upsert fejlede",
      error: error.message,
      trace: null,
    });
    throw new Error(`Failed to upsert evidence item: ${error.message}`);
  }
}

export async function getEvidenceForProject(projectId: string): Promise<EvidenceItem[]> {
  const query = supabaseAdmin.from("project_br18_evidence" as unknown as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (query as any).select("*").eq("project_id", projectId);

  if (error) {
    logServerEvent({
      module: "br18-evidence.repository",
      operation: "getEvidenceForProject",
      severity: "degraded",
      message: "select project_br18_evidence fejlede",
      error: error.message,
      trace: null,
    });
    return [];
  }

  if (!data) return [];

  return data.map((row: unknown) => rowToEvidenceItem(row as EvidenceItemRow));
}

export async function updateEvidenceStatus(
  evidenceId: string,
  status: EvidenceStatus,
  validationNotes: string[],
): Promise<void> {
  const now = new Date().toISOString();

  const query = supabaseAdmin.from("project_br18_evidence" as unknown as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (query as any)
    .update({
      status,
      validation_notes: validationNotes,
      updated_at: now,
    })
    .eq("id", evidenceId);

  if (error) {
    logServerEvent({
      module: "br18-evidence.repository",
      operation: "updateEvidenceStatus",
      severity: "degraded",
      message: "project_br18_evidence update fejlede",
      error: error.message,
      trace: null,
    });
    throw new Error(`Failed to update evidence status: ${error.message}`);
  }
}
