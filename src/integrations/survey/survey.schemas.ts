// src/integrations/survey/survey.schemas.ts
import { z } from "zod";

export const SurveyPointRowSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  label: z.string().optional().default(""),
  type: z.enum(["terrain", "boundary", "building_corner"]).optional().default("terrain"),
});

export const SurveyUploadPayloadSchema = z.object({
  surveyDate: z.string().optional().nullable(),
  surveyorName: z.string().optional().nullable(),
  surveyorLicenseNr: z.string().optional().nullable(),
  crs: z.literal("EPSG:25832"),
  points: z.array(SurveyPointRowSchema).min(1),
  notes: z.array(z.string()).optional().default([]),
});
