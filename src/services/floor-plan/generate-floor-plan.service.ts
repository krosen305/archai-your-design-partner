// src/services/floor-plan/generate-floor-plan.service.ts
//
// Application service for generating an initial floor plan (spec §17.1, UC-01).
// Enforces the AI Hard Stop gate BEFORE optimistic design output (§24.3): the
// server checks trusted Hard Stop status and returns blockers first. Geometry is
// built deterministically by the seed generator and Zod-validated before persist
// (FR-GEN-004/005). 0 AI tokens in this deterministic path.

import { FloorPlanDocumentSchema } from "@/domain/floor-plan/floor-plan.schemas";
import { generateSeedFloorPlan } from "@/domain/floor-plan/seed-generator";
import type { FloorPlanDocument, RoomZone } from "@/domain/floor-plan/floor-plan.types";
import type { FloorPlanWritePort } from "@/domain/floor-plan/ports";
import { assertCanEdit, type FloorPlanPrincipal } from "./principal";

export type { FloorPlanPrincipal } from "./principal";

export interface HardStopGatePort {
  /** Trusted, server-side Hard Stop status for the project (never client-provided). */
  check(projectId: string): Promise<{ blocked: boolean; reason: string | null }>;
}

export type GenerateFloorPlanDeps = {
  hardStop: HardStopGatePort;
  write: FloorPlanWritePort;
};

export type GenerateFloorPlanInput = {
  projectId: string;
  designIterationId: string | null;
  targetAreaM2: number;
  rooms: Array<{ name: string; roomType: RoomZone["roomType"] }>;
  footprint?: { widthM: number; depthM: number };
};

export type GenerateFloorPlanResult =
  | { generated: true; floorPlanIterationId: string; document: FloorPlanDocument }
  | { generated: false; blockers: string[] };

export async function generateFloorPlan(
  input: GenerateFloorPlanInput,
  principal: FloorPlanPrincipal,
  deps: GenerateFloorPlanDeps,
): Promise<GenerateFloorPlanResult> {
  assertCanEdit(principal);

  // §24.3 Hard Stop gate — verify trusted status before optimistic output.
  const hardStop = await deps.hardStop.check(input.projectId);
  if (hardStop.blocked) {
    return { generated: false, blockers: [hardStop.reason ?? "Projektet har en Hard Stop."] };
  }

  const candidate = generateSeedFloorPlan({
    projectId: input.projectId,
    targetAreaM2: input.targetAreaM2,
    rooms: input.rooms,
    footprint: input.footprint,
    createdAt: new Date().toISOString(),
  });

  // FR-GEN-004/005: validate before it becomes domain truth; degrade if invalid.
  const parsed = FloorPlanDocumentSchema.safeParse(candidate);
  if (!parsed.success) {
    return { generated: false, blockers: ["Genereret plan var ugyldig og blev ikke gemt."] };
  }

  const floorPlanIterationId = await deps.write.saveIteration({
    projectId: input.projectId,
    designIterationId: input.designIterationId,
    document: parsed.data,
    createdBy: principal.subjectId,
  });

  return { generated: true, floorPlanIterationId, document: parsed.data };
}
