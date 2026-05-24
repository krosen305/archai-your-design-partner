/**
 * Domain types for the Building Platform schema.
 *
 * These are typed wrappers around the Supabase row types, with domain-specific
 * enums and utility types that make the Validation Engine easier to write.
 *
 * Import pattern:
 *   import type { SiteConstraints, DesignIteration, BuildingTask } from "@/types/building-platform";
 */

import type { Tables } from "@/integrations/supabase/types";
import { evaluateHardStop } from "@/lib/rule-engine/hard-stop-adapter";
import { parseByggeoenskePayload } from "@/lib/design-iteration-parsers";

// =============================================================================
// Re-exports with domain names
// =============================================================================

export type SiteConstraints = Tables<"site_constraints">;
export type DesignIteration = Tables<"design_iterations">;
export type BuildingTask = Tables<"building_tasks">;

// =============================================================================
// Enums
// =============================================================================

export type ConstraintConfidence = "confirmed" | "estimated" | "missing";

export type SoilContaminationStatus = "clean" | "registered" | "contaminated" | "unknown";

export type BuildingPhase = "sandkassen" | "matriklen" | "maskinrummet" | "myndighed";

export type BuildingTaskStatus = "pending" | "in_progress" | "done" | "blocked" | "not_applicable";

/**
 * Standard task_key values for the Building Timeline.
 * Use these constants when inserting auto-generated tasks from the compliance pipeline.
 */
export const BUILDING_TASK_KEYS = {
  // Matriklen phase
  JORDBUNDSPROVE: "jordbundsprove",
  KORTLAEG_FORSYNINGER: "kortlaeg_forsyninger",
  MILJOEUNDERSOEGELSE: "miljoeundersoegelse", // beholdes for unknown/error-case
  JORDFORURENING_V2_UNDERSOEGELSE: "jordforurening_v2_undersoegelse", // NY: V2-kortlagt
  JORDFORURENING_V1_SCREENING: "jordforurening_v1_screening", // NY: V1-kortlagt
  SAVE_4_PARAGRAPH14: "save_4_paragraph14",
  LANDZONE_TILLADELSE: "landzone_tilladelse",
  BYGGEFELT_DISPENSATION: "byggefelt_dispensation",
  // Maskinrummet phase
  JORDFLYTNING_ATTEST: "jordflytning_attest", // NY: omraadeklassificering
  KLOAK_NEDSIVNING_AFKLARING: "kloak_nedsivning_afklaring",
  ARKITEKTTEGNINGER: "arkitekttegninger",
  STATIK: "statik",
  LCA_BEREGNING: "lca_beregning",
  // Sandkassen phase
  INSPIRATIONSARK: "inspirationsark",
  DEFINER_BUDGET: "definer_budget",
  // Myndighed phase — auto-generated fra Hard Stop data
  SAVE_DISPENSATION: "save_dispensation",
  FREDNING_JURIDISK: "fredning_juridisk",
  STRANDBESKYTTELSE_DISPENSATION: "strandbeskyttelse_dispensation",
  FREDSKOV_DISPENSATION: "fredskov_dispensation",
  KLITFREDNING_DISPENSATION: "klitfredning_dispensation",
  // Myndighed phase — journey tasks
  NEDRIVNINGSANSOEGNING: "nedrivningsansoegning",
  BYGGESAGSANSOEGNING: "byggesagsansoegning",
  NABOHORING: "nabohoring",
  FINANSIERING: "finansiering",
} as const;

export type BuildingTaskKey = (typeof BUILDING_TASK_KEYS)[keyof typeof BUILDING_TASK_KEYS];

// =============================================================================
// Validation Engine types
// =============================================================================

export type HardStopSeverity = "illegal" | "dispensation_required" | "warning";

export type HardStopViolation = {
  rule: string;
  severity: HardStopSeverity;
  reason: string;
  constraintField: keyof SiteConstraints;
  constraintValue: number | boolean | string | null;
  designValue?: number | null;
  dispensationMulig: boolean;
  dispensationMyndighed?: string;
};

/**
 * The result of the Validation Engine comparing a DesignIteration against SiteConstraints.
 *
 * Query pattern to assemble inputs (call from a createServerFn):
 *
 * ```typescript
 * const { data: activeDesign } = await supabaseAdmin
 *   .from("design_iterations")
 *   .select("*")
 *   .eq("project_id", projectId)
 *   .eq("is_active", true)
 *   .single();
 *
 * const { data: constraints } = await supabaseAdmin
 *   .from("site_constraints")
 *   .select("*")
 *   .eq("address_id", project.address_adresseid)
 *   .single();
 *
 * const result = validateDesignAgainstConstraints(activeDesign, constraints);
 * ```
 *
 * The ValidationEngine NEVER reads compliance_data JSONB for constraint values.
 * It reads ONLY site_constraints (typed columns) and design_iterations (design intent).
 */
export type ValidationResult = {
  projectId: string;
  designIterationId: string;
  constraintsAddressId: string;
  constraintsConfidence: ConstraintConfidence;
  hardStops: HardStopViolation[]; // severity: illegal | dispensation_required
  warnings: HardStopViolation[]; // severity: warning
  metrics: {
    currentBebyggelsesprocent: number | null;
    maxBebyggelsesprocent: number | null;
    bebyggelsesprocentOk: boolean | null;
    currentEtager: number | null;
    maxEtager: number | null;
    etagerOk: boolean | null;
    currentHeightM: number | null;
    maxHeightM: number | null;
    heightOk: boolean | null;
  };
  isCompliant: boolean;
  evaluatedAt: string;
};

// =============================================================================
// Site Constraints with Hard Stop helpers
// =============================================================================

/**
 * Returns true if site_constraints contains any absolute build-stop condition
 * that cannot be dispensed (is_fredet with demolition intent, or certain
 * combinations of protection lines + project type).
 *
 * Used to set projects.hard_stop = true in the compliance pipeline.
 */
export function hasAbsoluteHardStop(sc: SiteConstraints): boolean {
  const { hardStop } = evaluateHardStop({
    saveValue: sc.save_value,
    isFredet: sc.is_fredet,
    strandbeskyttelse: sc.strandbeskyttelse,
    fredskov: sc.fredskov,
    klitfredning: sc.klitfredning,
    projectType: "demolition_and_new",
  });
  return hardStop;
}

/**
 * Returns the SAVE-driven Hard Stop severity for demolition projects.
 * Returns null if no heritage constraint applies.
 *
 * Thresholds are defined canonically in hard-stop-adapter.ts (SAVE_HARD_STOP_MAX / SAVE_WARNING_VALUE).
 */
export function getSaveHardStop(sc: SiteConstraints): HardStopViolation | null {
  if (sc.save_value === null) return null;

  const { violations } = evaluateHardStop({
    saveValue: sc.save_value,
    isFredet: null, // only care about SAVE here
    strandbeskyttelse: null,
    fredskov: null,
    klitfredning: null,
    projectType: "demolition_and_new",
  });

  const saveViolation = violations.find(
    (v) => v.rule === "save_1_3_demolition" || v.rule === "save_4_paragraph14_risk",
  );
  if (!saveViolation) return null;

  return {
    rule: saveViolation.rule,
    severity: saveViolation.severity,
    reason: saveViolation.reason,
    constraintField: "save_value" as keyof SiteConstraints,
    constraintValue: sc.save_value,
    dispensationMulig: saveViolation.severity !== "illegal",
    dispensationMyndighed: saveViolation.authority ?? undefined,
  };
}

// =============================================================================
// Design Iteration helpers
// =============================================================================

/**
 * Returns the area in m² from a design iteration.
 * Prefers the explicit area_m2 column; falls back to byggeoenske if present.
 */
export function getDesignAreaM2(di: DesignIteration): number | null {
  if (di.area_m2 !== null) return di.area_m2;
  const boe = parseByggeoenskePayload(di.byggeoenske);
  if (boe?.bruttoAreal !== undefined) return boe.bruttoAreal;
  if (boe?.bruttoareal !== undefined) return boe.bruttoareal;
  return null;
}

/**
 * Returns the number of storeys from a design iteration.
 */
export function getDesignFloors(di: DesignIteration): number | null {
  if (di.floors !== null) return di.floors;
  const boe = parseByggeoenskePayload(di.byggeoenske);
  if (boe?.etager !== undefined) return boe.etager;
  return null;
}
