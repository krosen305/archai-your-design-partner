// SERVER-SIDE ONLY.
// DrawingRepository implementerer DrawingExportStorePort mod Supabase Storage og drawing_exports tabellen.
// Bemærk: drawing_exports er en planlagt migration og eksisterer ikke i de genererede Database-typer endnu.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DrawingExportStorePort, DrawingExportRecord } from "@/domain/drawing/ports";

export class DrawingRepository implements DrawingExportStorePort {
  async saveSvg(projectId: string, svg: string): Promise<string> {
    const path = `drawings/${projectId}/${Date.now()}.svg`;
    const { error } = await supabaseAdmin.storage
      .from("project-files")
      .upload(path, new Blob([svg], { type: "image/svg+xml" }), { upsert: true });
    if (error) throw new Error(`SVG upload fejlede: ${error.message}`);
    return path;
  }

  async savePdf(projectId: string, pdf: Uint8Array): Promise<string> {
    const path = `drawings/${projectId}/${Date.now()}.pdf`;
    const { error } = await supabaseAdmin.storage
      .from("project-files")
      .upload(
        path,
        new Blob(
          [pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer],
          { type: "application/pdf" },
        ),
        {
          upsert: true,
        },
      );
    if (error) throw new Error(`PDF upload fejlede: ${error.message}`);
    return path;
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<string | null> {
    const { data, error } = await supabaseAdmin.storage
      .from("project-files")
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) return null;
    return data.signedUrl;
  }

  async getExport(exportId: string): Promise<DrawingExportRecord | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin as any)
      .from("drawing_exports")
      .select("*")
      .eq("id", exportId)
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      projectId: data.project_id,
      svgPath: data.svg_path,
      pdfPath: data.pdf_path,
      readinessStatus: data.readiness_status,
      generatedAt: data.generated_at,
      approvedAt: data.approved_at,
    };
  }

  async saveExportRecord(params: {
    projectId: string;
    svgPath: string | null;
    pdfPath: string | null;
    readinessStatus: string;
    inputHash: string;
  }): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin as any)
      .from("drawing_exports")
      .insert({
        project_id: params.projectId,
        svg_path: params.svgPath,
        pdf_path: params.pdfPath,
        readiness_status: params.readinessStatus,
        input_hash: params.inputHash,
        generated_at: new Date().toISOString(),
        drawing_type: "beliggenhedsplan",
        status: "draft",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Kunne ikke gemme export-record: ${error?.message}`);
    return data.id;
  }
}
