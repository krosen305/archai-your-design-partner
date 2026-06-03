// src/lib/floor-plan/compliance-overlay.ts
//
// Pure helper: derives a compliance overlay (room-level findings + area summary)
// from a FloorLevel and a set of VerificationFindings. No AI, no network.
// Direction: src/lib/ imports from src/domain/ (correct one-way dependency).

import type { VerificationFinding } from "@/domain/floor-plan/verification-engine";
import type { FloorLevel } from "@/domain/floor-plan/floor-plan.types";

export type RoomCompliance = {
  roomId: string;
  findings: Array<{
    id: string;
    severity: "info" | "warning" | "review_required" | "blocking";
    category: string;
    message: string;
    /** ≤30 characters — rendered as a tooltip/badge label inside the floor plan. */
    shortLabel: string;
  }>;
};

export type AreaTableRow = {
  label: string;
  areaM2: number;
  /** Pre-formatted string, e.g. "24.0 m²" */
  areaFormatted: string;
  type: "heated_room" | "unheated_zone";
  /** Room type string, e.g. "living", "bedroom" — undefined for zones */
  roomType?: string;
};

export type AreaSummary = {
  rows: AreaTableRow[];
  totalHeatedM2: number;
  totalUnheatedM2: number;
  /** BBR-relevant bebygget areal — approx. sum of all heated room netAreaM2. */
  totalBbrM2: number;
};

export type ComplianceOverlay = {
  roomCompliance: RoomCompliance[];
  areaSummary: AreaSummary;
};

function formatArea(m2: number): string {
  return `${(Math.round(m2 * 10) / 10).toFixed(1)} m²`;
}

/**
 * Derive a compliance overlay from a floor level and verification findings.
 *
 * Pure function — no AI, no network, no side effects.
 *
 * Algorithm:
 * 1. areaSummary: collect room areas (heated) + zone areas (unheated) from the level.
 * 2. roomCompliance: for each room, filter findings whose affectedElementIds includes
 *    the room id, then attach a shortLabel (first 30 chars of message).
 * 3. totalBbrM2: sum of netAreaM2 for all rooms (simple approximation for now).
 */
export function buildComplianceOverlay(
  level: FloorLevel,
  findings: VerificationFinding[],
): ComplianceOverlay {
  // --- Area summary ----------------------------------------------------------

  const rows: AreaTableRow[] = [];

  let totalHeatedM2 = 0;
  let totalUnheatedM2 = 0;

  for (const room of level.rooms) {
    totalHeatedM2 += room.netAreaM2;
    rows.push({
      label: room.name,
      areaM2: room.netAreaM2,
      areaFormatted: formatArea(room.netAreaM2),
      type: "heated_room",
      roomType: room.roomType,
    });
  }

  for (const zone of level.zones ?? []) {
    if (!zone.heated) {
      totalUnheatedM2 += zone.areaM2;
      rows.push({
        label: zone.name,
        areaM2: zone.areaM2,
        areaFormatted: formatArea(zone.areaM2),
        type: "unheated_zone",
      });
    }
  }

  const areaSummary: AreaSummary = {
    rows,
    totalHeatedM2,
    totalUnheatedM2,
    // BBR-relevant bebygget areal: approximated as sum of heated room net areas.
    totalBbrM2: totalHeatedM2,
  };

  // --- Room compliance -------------------------------------------------------

  const roomCompliance: RoomCompliance[] = level.rooms.map((room) => {
    const roomFindings = findings.filter((f) => f.affectedElementIds.includes(room.id));
    return {
      roomId: room.id,
      findings: roomFindings.map((f) => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        message: f.message,
        shortLabel: f.message.slice(0, 30),
      })),
    };
  });

  return { roomCompliance, areaSummary };
}
