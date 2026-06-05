// src/lib/floor-plan/add-opening-interaction.ts
//
// Pure helper that builds an add_opening command from a wall click in
// add_opening tool mode.  No React, no I/O — fully unit-testable.

import type { FloorPlanCommand } from "@/domain/floor-plan/commands";

export type OpeningPlacementKind = "door" | "window";

export function buildAddOpeningCommand(
  levelId: string,
  wallId: string,
  offsetAlongWallM: number,
  kind: OpeningPlacementKind,
): Extract<FloorPlanCommand, { type: "add_opening" }> {
  return kind === "door"
    ? {
        type: "add_opening",
        levelId,
        wallId,
        openingKind: "door",
        offsetAlongWallM,
        widthM: 0.9,
        heightM: 2.1,
        swing: "left",
      }
    : {
        type: "add_opening",
        levelId,
        wallId,
        openingKind: "window",
        offsetAlongWallM,
        widthM: 1.2,
        heightM: 1.4,
        swing: "none",
      };
}
