// src/integrations/supabase/repositories/floor-plan-iteration.codec.ts
//
// Pure boundary codec for floor_plan_iterations: validates stored JSONB against
// the canonical schema (Rule 1) and derives the typed columns from a document
// (Rule 6, spec §24.2). No Supabase here — DB-free and unit-tested.

import { FloorPlanDocumentSchema } from "@/domain/floor-plan/floor-plan.schemas";
import { hashCanonical } from "@/domain/floor-plan/canonical-hash";
import { deriveMaterialBasisSummary } from "@/domain/floor-plan/material-basis";
import { runVerification } from "@/domain/floor-plan/verification-engine";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";
import type { FloorPlanVerificationStatus } from "@/domain/floor-plan/verification-engine";
import type { MaterialBasisSummary } from "@/domain/floor-plan/material-basis";

/** Decode and validate a stored floor_plan_json payload. Throws if malformed. */
export function decodeFloorPlanJson(json: unknown): FloorPlanDocument {
  return FloorPlanDocumentSchema.parse(json);
}

export type IterationColumns = {
  schemaVersion: string;
  modelHash: string;
  verificationStatus: FloorPlanVerificationStatus;
  grossAreaM2: number | null;
  netAreaM2: number | null;
  footprintAreaM2: number | null;
  levelsCount: number;
  roomsCount: number;
  wallLengthTotalM: number;
  exteriorWallLengthM: number;
  openingsCount: number;
  materialBasisReadiness: MaterialBasisSummary["readiness"];
};

/** Derive the typed columns persisted alongside the JSONB snapshot. */
export async function deriveIterationColumns(doc: FloorPlanDocument): Promise<IterationColumns> {
  const report = runVerification(doc);
  const material = deriveMaterialBasisSummary(doc);
  const modelHash = await hashCanonical(doc);

  return {
    schemaVersion: doc.schemaVersion,
    modelHash,
    verificationStatus: report.status,
    grossAreaM2: report.metrics.grossAreaM2,
    netAreaM2: report.metrics.netAreaM2,
    footprintAreaM2: report.metrics.grossAreaM2,
    levelsCount: report.metrics.levelsCount,
    roomsCount: report.metrics.roomsCount,
    wallLengthTotalM: material.wallLengthTotalM,
    exteriorWallLengthM: material.exteriorWallLengthM,
    openingsCount: report.metrics.openingsCount,
    materialBasisReadiness: material.readiness,
  };
}
