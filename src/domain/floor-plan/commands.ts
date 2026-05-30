// src/domain/floor-plan/commands.ts
//
// Inferred types for the command pipeline (commands + result contract).

import type { z } from "zod";
import type {
  CommandRejectionCodeSchema,
  CommandResultSchema,
  FloorPlanCommandSchema,
} from "./command.schemas";

export type FloorPlanCommand = z.infer<typeof FloorPlanCommandSchema>;
export type CommandRejectionCode = z.infer<typeof CommandRejectionCodeSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
