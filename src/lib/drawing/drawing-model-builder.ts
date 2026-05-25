// src/lib/drawing/drawing-model-builder.ts
import type { BeliggenhedsplanInput } from "@/domain/drawing/beliggenhedsplan.types";
import type { DrawingReadinessDecision } from "@/domain/drawing/decision-engine";
import type { DrawingModel } from "@/domain/drawing/drawing-model";
import { PAGE_SIZES, computeViewport } from "@/domain/drawing/drawing-model";

export function buildDrawingModel(
  plan: BeliggenhedsplanInput,
  readiness: DrawingReadinessDecision,
): DrawingModel {
  const coords = plan.parcel.polygon25832.coordinates[0];
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const bbox: [number, number, number, number] = [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];
  const page = PAGE_SIZES[plan.metadata.paperSize];

  return {
    page: {
      size: plan.metadata.paperSize,
      orientation: "landscape",
      scale: plan.metadata.scale,
      ...page,
    },
    viewport: computeViewport(bbox, plan.metadata.scale),
    features: [],
    titleBlock: {
      title: plan.metadata.title,
      address: plan.metadata.address,
      matrikel: plan.metadata.matrikel,
      bygherre: plan.metadata.bygherre,
      sagNr: plan.metadata.sagNr,
      scale: `1:${plan.metadata.scale}`,
      paperSize: plan.metadata.paperSize,
      date: plan.metadata.date,
      revision: plan.metadata.revision,
      disclaimer:
        readiness.status === "AUTO_DRAFT"
          ? "FORELOEBIG — ikke til myndighedsbrug"
          : null,
      sourceList:
        readiness.reviewRequiredBy.length > 0
          ? [`Review kraevet: ${readiness.reviewRequiredBy.join(", ")}`]
          : [],
    },
    legend: [],
    northArrowRotationDeg: 0,
    readinessStatus: readiness.status,
  };
}
