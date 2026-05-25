// src/services/drawing/export-drawing.service.ts
import type { BeliggenhedsplanInput } from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingExportStorePort } from "@/domain/drawing/ports";
import type { DrawingReadinessDecision, DrawingReadinessStatus } from "@/domain/drawing/decision-engine";
import { renderSvg } from "@/lib/drawing/render-svg";
import { buildDrawingModel } from "@/lib/drawing/drawing-model-builder";
import { createHash } from "crypto";

type ExportInput = {
  plan: BeliggenhedsplanInput;
  readiness: DrawingReadinessDecision;
  projectId: string;
  store: DrawingExportStorePort & {
    saveExportRecord(params: {
      projectId: string;
      svgPath: string | null;
      pdfPath: string | null;
      readinessStatus: string;
      inputHash: string;
    }): Promise<string>;
  };
};

export type ExportResult = {
  exportId: string;
  svgPath: string;
  readinessStatus: DrawingReadinessStatus;
  blockedFromPdf: boolean;
};

export async function exportDrawing(input: ExportInput): Promise<ExportResult> {
  const { plan, readiness, projectId, store } = input;

  if (readiness.status === "BLOCKED_MISSING_CORE_DATA") {
    throw new Error("Eksport blokeret: manglende kerndata. Se readiness.missingDataPoints.");
  }

  const model = buildDrawingModel(plan, readiness);
  const svg = renderSvg(model);
  const svgPath = await store.saveSvg(projectId, svg);
  const inputHash = createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 16);
  const blockedFromPdf = readiness.status !== "AUTO_REVIEW";

  const exportId = await store.saveExportRecord({
    projectId,
    svgPath,
    pdfPath: null,
    readinessStatus: readiness.status,
    inputHash,
  });

  return { exportId, svgPath, readinessStatus: readiness.status, blockedFromPdf };
}
