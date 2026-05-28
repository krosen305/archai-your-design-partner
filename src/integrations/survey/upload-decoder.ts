// src/integrations/survey/upload-decoder.ts
import type { SurveyUploadDecoderPort } from "@/domain/drawing/ports";
import type { SurveyLayer } from "@/domain/drawing/beliggenhedsplan.types";
import { SurveyLayerSchema } from "@/domain/drawing/beliggenhedsplan.schemas";
import { SurveyUploadPayloadSchema } from "./survey.schemas";
import { surveySourceMeta } from "@/domain/drawing/source-quality";

export class SurveyUploadDecoder implements SurveyUploadDecoderPort {
  async decode(raw: unknown): Promise<SurveyLayer> {
    const payload = SurveyUploadPayloadSchema.parse(raw);
    const now = new Date().toISOString();

    const layer: SurveyLayer = {
      uploadedAt: now,
      surveyDate: payload.surveyDate ?? null,
      surveyorName: payload.surveyorName ?? null,
      surveyorLicenseNr: payload.surveyorLicenseNr ?? null,
      terrainPoints: payload.points
        .filter((p) => p.type === "terrain")
        .map((p) => ({ x: p.x, y: p.y, z: p.z, label: p.label, source: "survey" as const })),
      boundaryPoints: payload.points
        .filter((p) => p.type === "boundary")
        .map((p) => ({
          type: "Point" as const,
          crs: "EPSG:25832" as const,
          coordinates: [p.x, p.y] as [number, number],
        })),
      notes: payload.notes,
      source: surveySourceMeta(now),
    };

    return SurveyLayerSchema.parse(layer);
  }
}
