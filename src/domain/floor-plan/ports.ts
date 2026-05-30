// src/domain/floor-plan/ports.ts
//
// Typed ports for floor-plan persistence (spec §7 Ports). These reference only
// domain types so adapters can depend inward. The trusted-site/footprint port
// lives in the service layer because it carries drawing GeoJSON types (§23.3.4),
// keeping domain/floor-plan free of any domain/drawing import.

import type { FloorPlanCommand } from "./commands";
import type { FloorPlanDocument } from "./floor-plan.types";
import type { FloorPlanVerificationStatus, VerificationFinding } from "./verification-engine";

export interface FloorPlanReadPort {
  /** Load and validate the document for an iteration, or null if absent. */
  loadActiveDocument(projectId: string, iterationId: string): Promise<FloorPlanDocument | null>;
}

export interface FloorPlanWritePort {
  /**
   * Persist a new active version (deactivating the previous active one) and
   * return its id. Snapshot is canonical; typed columns are derived (§23.3.2).
   */
  saveIteration(params: {
    projectId: string;
    designIterationId: string | null;
    document: FloorPlanDocument;
    createdBy: string;
  }): Promise<string>;

  /**
   * Append an audit-trail command (never the restore source in v1). The
   * adapter assigns the next monotonic command_index for the iteration.
   */
  appendCommand(params: {
    projectId: string;
    floorPlanIterationId: string;
    command: FloorPlanCommand;
    commandHash: string;
    source: "drag" | "keyboard" | "ai" | "system";
    createdBy: string;
  }): Promise<void>;
}

export interface FloorPlanVerificationStorePort {
  saveVerification(snapshot: {
    projectId: string;
    floorPlanIterationId: string;
    inputHash: string;
    status: FloorPlanVerificationStatus;
    findingsJson: VerificationFinding[];
    missingDataPoints: string[];
    verifiedBy: string;
  }): Promise<string>;
}
