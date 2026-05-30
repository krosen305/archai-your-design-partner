// src/integrations/supabase/repositories/floor-plan-export.repository.ts
//
// SERVER-SIDE ONLY. Supabase Storage + floor_plan_exports adapter implementing
// FloorPlanExportStorePort. Mirrors DrawingRepository. floor_plan_exports is not
// yet in the generated Database types — regenerate after deploy.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FloorPlanExportStorePort } from "@/domain/floor-plan/ports";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabase = { from: (table: string) => any };
const fpDb = supabaseAdmin as unknown as UntypedSupabase;

const BUCKET = "project-files";
const EXPORTS = "floor_plan_exports";

export class FloorPlanExportRepository implements FloorPlanExportStorePort {
  async saveSvg(projectId: string, svg: string): Promise<string> {
    const path = `floor-plans/${projectId}/${Date.now()}.svg`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, new Blob([svg], { type: "image/svg+xml" }), { upsert: true });
    if (error) throw new Error(`SVG upload fejlede: ${error.message}`);
    return path;
  }

  async savePdf(projectId: string, pdf: Uint8Array): Promise<string> {
    const path = `floor-plans/${projectId}/${Date.now()}.pdf`;
    const body = new Blob(
      [pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer],
      { type: "application/pdf" },
    );
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, body, { upsert: true });
    if (error) throw new Error(`PDF upload fejlede: ${error.message}`);
    return path;
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<string | null> {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) return null;
    return data.signedUrl;
  }

  async saveExportRecord(params: {
    projectId: string;
    floorPlanIterationId: string;
    drawingType: string;
    readinessStatus: string;
    svgPath: string | null;
    pdfPath: string | null;
    inputHash: string;
  }): Promise<string> {
    const insert = {
      project_id: params.projectId,
      floor_plan_iteration_id: params.floorPlanIterationId,
      drawing_type: params.drawingType,
      readiness_status: params.readinessStatus,
      svg_path: params.svgPath,
      pdf_path: params.pdfPath,
      input_hash: params.inputHash,
    };
    const { data, error } = await fpDb.from(EXPORTS).insert(insert).select("id").single();
    if (error || !data) {
      throw new Error(`floor_plan_exports insert fejlede: ${error?.message}`);
    }
    return (data as { id: string }).id;
  }
}
