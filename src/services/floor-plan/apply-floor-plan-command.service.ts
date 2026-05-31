// src/services/floor-plan/apply-floor-plan-command.service.ts
//
// Application service for editing a floor plan (spec §17.2). Loads the active
// document, applies the command deterministically in the domain, and — only on
// accept — persists the new canonical snapshot and appends the audit command.
// Drag and AI commands enter through the same path (spec §8.2). 0 AI tokens.

import { applyCommand } from "@/domain/floor-plan/apply-command";
import { hashCanonical } from "@/domain/floor-plan/canonical-hash";
import type { LiveFinding } from "@/domain/floor-plan/apply-command";
import type { FloorPlanCommand, CommandRejectionCode } from "@/domain/floor-plan/commands";
import type { FloorPlanReadPort, FloorPlanWritePort } from "@/domain/floor-plan/ports";
import { assertCanEdit, type FloorPlanPrincipal } from "./principal";

export type { FloorPlanPrincipal } from "./principal";

export type ApplyFloorPlanCommandDeps = {
  read: FloorPlanReadPort;
  write: FloorPlanWritePort;
};

export type ApplyFloorPlanCommandInput = {
  projectId: string;
  floorPlanIterationId: string;
  command: FloorPlanCommand;
  source: "drag" | "keyboard" | "ai" | "system";
};

export type ApplyFloorPlanCommandResult =
  | {
      accepted: true;
      floorPlanIterationId: string;
      changedElementIds: string[];
      liveFindings: LiveFinding[];
    }
  | {
      accepted: false;
      reasonCode: CommandRejectionCode;
      message: string;
      suggestedCommands: FloorPlanCommand[];
    };

export async function applyFloorPlanCommand(
  input: ApplyFloorPlanCommandInput,
  principal: FloorPlanPrincipal,
  deps: ApplyFloorPlanCommandDeps,
): Promise<ApplyFloorPlanCommandResult> {
  assertCanEdit(principal);

  const doc = await deps.read.loadActiveDocument(input.projectId, input.floorPlanIterationId);
  if (!doc) {
    throw new Error(
      `applyFloorPlanCommand: ingen aktiv plantegning for ${input.projectId}/${input.floorPlanIterationId}.`,
    );
  }

  const outcome = applyCommand(doc, input.command);
  if (!outcome.accepted) {
    return {
      accepted: false,
      reasonCode: outcome.reasonCode,
      message: outcome.message,
      suggestedCommands: outcome.suggestedCommands,
    };
  }

  const floorPlanIterationId = await deps.write.saveIteration({
    projectId: input.projectId,
    designIterationId: doc.designIterationId,
    document: outcome.document,
    createdBy: principal.subjectId,
  });

  await deps.write.appendCommand({
    projectId: input.projectId,
    floorPlanIterationId,
    command: input.command,
    commandHash: await hashCanonical(input.command),
    source: input.source,
    createdBy: principal.subjectId,
  });

  return {
    accepted: true,
    floorPlanIterationId,
    changedElementIds: outcome.changedElementIds,
    liveFindings: outcome.liveFindings,
  };
}
