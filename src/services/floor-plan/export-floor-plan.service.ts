// src/services/floor-plan/export-floor-plan.service.ts
//
// Application service for exporting a floor plan (spec §17.5). Builds the same
// render model the editor uses, renders SVG + PDF, stores them and records the
// export with its readiness status. Authority language only — never "godkendt".

import { buildRenderModel } from "@/lib/floor-plan/floor-plan-render-model";
import { renderFloorPlanSvg } from "@/lib/floor-plan/render-floor-plan-svg";
import { renderFloorPlanPdf } from "@/lib/floor-plan/render-floor-plan-pdf";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";
import type { FloorPlanVerificationStatus } from "@/domain/floor-plan/verification-engine";
import type { FloorPlanExportStorePort } from "@/domain/floor-plan/ports";
import { assertCanEdit, type FloorPlanPrincipal } from "./principal";

export type { FloorPlanPrincipal } from "./principal";

export type ExportFloorPlanDeps = { store: FloorPlanExportStorePort };

export type ExportFloorPlanInput = {
  projectId: string;
  floorPlanIterationId: string;
  document: FloorPlanDocument;
  levelId: string;
  verificationStatus: FloorPlanVerificationStatus;
  inputHash: string;
};

export type ExportFloorPlanResult = {
  exportId: string;
  svgPath: string;
  svgContent: string;
  pdfPath: string | null;
  pdfUrl: string | null;
  readinessStatus: FloorPlanVerificationStatus;
};

export async function exportFloorPlan(
  input: ExportFloorPlanInput,
  principal: FloorPlanPrincipal,
  deps: ExportFloorPlanDeps,
): Promise<ExportFloorPlanResult> {
  assertCanEdit(principal);

  const level = input.document.levels.find((l) => l.id === input.levelId);
  if (!level) throw new Error(`exportFloorPlan: ukendt level "${input.levelId}".`);

  const model = buildRenderModel(input.document, input.levelId);
  const svgContent = renderFloorPlanSvg(model);
  const svgPath = await deps.store.saveSvg(input.projectId, svgContent);

  let pdfPath: string | null = null;
  let pdfUrl: string | null = null;
  try {
    const pdfBytes = await renderFloorPlanPdf(model, {
      title: `${input.document.metadata.title} – ${level.name}`,
      statusLabel: input.verificationStatus,
    });
    pdfPath = await deps.store.savePdf(input.projectId, pdfBytes);
    pdfUrl = await deps.store.createSignedUrl(pdfPath, 3600);
  } catch (err) {
    // SVG export still succeeds; PDF is best-effort.
    console.error("[exportFloorPlan] PDF-generering fejlede:", err);
  }

  const exportId = await deps.store.saveExportRecord({
    projectId: input.projectId,
    floorPlanIterationId: input.floorPlanIterationId,
    drawingType: "floor_plan",
    readinessStatus: input.verificationStatus,
    svgPath,
    pdfPath,
    inputHash: input.inputHash,
  });

  return {
    exportId,
    svgPath,
    svgContent,
    pdfPath,
    pdfUrl,
    readinessStatus: input.verificationStatus,
  };
}
