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
  MILJOEUNDERSOEGELSE: "miljoeundersoegelse",
  SAVE_4_PARAGRAPH14: "save_4_paragraph14", // SAVE 4 → §14-forbud risk
  // Sandkassen phase
  INSPIRATIONSARK: "inspirationsark",
  DEFINER_BUDGET: "definer_budget",
  // Maskinrummet phase
  ARKITEKTTEGNINGER: "arkitekttegninger",
  STATIK: "statik",
  LCA_BEREGNING: "lca_beregning",
  // Myndighed phase — auto-generated from Hard Stop data
  SAVE_DISPENSATION: "save_dispensation", // SAVE 1–3
  FREDNING_JURIDISK: "fredning_juridisk", // is_fredet = true
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
  // Strandbeskyttelse, fredskov, klitfredning are absolute stops for new construction
  if (sc.strandbeskyttelse || sc.fredskov || sc.klitfredning) return true;
  // Listed building (is_fredet) combined with demolition intent is illegal
  if (sc.is_fredet === true) return true;
  return false;
}

/**
 * Returns the SAVE-driven Hard Stop severity for demolition projects.
 * Returns null if no heritage constraint applies.
 *
 * ARCH-159: SAVE 4 adds warning level (missing in stop-rules.ts prior to that fix).
 */
export function getSaveHardStop(sc: SiteConstraints): HardStopViolation | null {
  if (sc.save_value === null) return null;

  if (sc.save_value <= 3) {
    return {
      rule: "save_1_3_demolition",
      severity: "dispensation_required",
      reason: `Bygningen har høj bevaringsværdi (SAVE ${sc.save_value}) — nedrivning kræver tilladelse fra Slots- og Kulturstyrelsen.`,
      constraintField: "save_value",
      constraintValue: sc.save_value,
      dispensationMulig: true,
      dispensationMyndighed: "Slots- og Kulturstyrelsen",
    };
  }

  if (sc.save_value === 4) {
    return {
      rule: "save_4_demolition_warning",
      severity: "warning",
      reason: `Bygningen har bevaringsværdi SAVE 4 — kommunen kan nedlægge §14-forbud mod nedrivning.`,
      constraintField: "save_value",
      constraintValue: sc.save_value,
      dispensationMulig: true,
      dispensationMyndighed: "Kommunens tekniske forvaltning",
    };
  }

  return null;
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
  const boe = di.byggeoenske as Record<string, unknown> | null;
  if (boe && typeof boe["bruttoAreal"] === "number") return boe["bruttoAreal"];
  if (boe && typeof boe["bruttoareal"] === "number") return boe["bruttoareal"];
  return null;
}

/**
 * Returns the number of storeys from a design iteration.
 */
export function getDesignFloors(di: DesignIteration): number | null {
  if (di.floors !== null) return di.floors;
  const boe = di.byggeoenske as Record<string, unknown> | null;
  if (boe && typeof boe["etager"] === "number") return boe["etager"];
  return null;
}
