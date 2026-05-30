// SERVER-SIDE ONLY.
// DrawingRepository implementerer DrawingExportStorePort mod Supabase Storage og drawing_exports tabellen.
// Bemærk: drawing_exports er en planlagt migration og eksisterer ikke i de genererede Database-typer endnu.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DrawingExportStorePort, DrawingExportRecord } from "@/domain/drawing/ports";

type DrawingExportInsert = {
  project_id: string;
  svg_path: string | null;
  pdf_path: string | null;
  readiness_status: string;
  input_hash: string;
  generated_at: string;
  drawing_type: string;
  status: string;
};

type DrawingExportRow = DrawingExportInsert & {
  id: string;
  approved_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabase = { from: (table: string) => any };
const drawingDb = supabaseAdmin as unknown as UntypedSupabase;

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
    const { data, error } = await drawingDb
      .from("drawing_exports")
      .select("*")
      .eq("id", exportId)
      .single();
    if (error || !data) return null;
    const row = data as DrawingExportRow;
    return {
      id: row.id,
      projectId: row.project_id,
      svgPath: row.svg_path,
      pdfPath: row.pdf_path,
      readinessStatus: row.readiness_status,
      generatedAt: row.generated_at,
      approvedAt: row.approved_at,
    };
  }

  async saveExportRecord(params: {
    projectId: string;
    svgPath: string | null;
    pdfPath: string | null;
    readinessStatus: string;
    inputHash: string;
  }): Promise<string> {
    const insert: DrawingExportInsert = {
      project_id: params.projectId,
      svg_path: params.svgPath,
      pdf_path: params.pdfPath,
      readiness_status: params.readinessStatus,
      input_hash: params.inputHash,
      generated_at: new Date().toISOString(),
      drawing_type: "beliggenhedsplan",
      status: "draft",
    };
    const { data, error } = await drawingDb
      .from("drawing_exports")
      .insert(insert)
      .select("id")
      .single();
    if (error || !data) throw new Error(`Kunne ikke gemme export-record: ${error?.message}`);
    return data.id;
  }
}
