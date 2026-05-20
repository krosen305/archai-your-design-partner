// Pure adapter — converts persistence/BBR field names to rule-engine input.
// Only import from rule-engine internals, never from project-store or routes.
//
// This is the SINGLE SOURCE OF TRUTH for hard-stop threshold evaluation.
// All callers (persistence, pre-check, UI) must use this adapter instead of
// hardcoding `saveValue <= 3` or `saveValue === 4` thresholds.

import { checkStopRules } from "@/lib/rule-engine/rules/stop-rules";
import type { RuleEngineInput, RuleViolation, ProjectType } from "@/lib/rule-engine/types";

// Canonical threshold constants — import these in UI/presentation code instead of hardcoding numbers.
export const SAVE_HARD_STOP_MAX = 3; // SAVE 1-3: dispensation required
export const SAVE_WARNING_VALUE = 4; // SAVE 4: §14-forbud risk

export type HardStopInput = {
  saveValue: number | null;
  isFredet: boolean | null;
  strandbeskyttelse: boolean | null; // mat_strandbeskyttelse
  fredskov: boolean | null; // mat_fredskov
  klitfredning: boolean | null; // mat_klitfredning
  projectType?: ProjectType; // defaults to "demolition_and_new"
};

export type HardStopResult = {
  hardStop: boolean;
  hardStopReason: string | null;
  violations: RuleViolation[];
};

export function evaluateHardStop(input: HardStopInput): HardStopResult {
  const projectType = input.projectType ?? "demolition_and_new";
  const ruleInput: RuleEngineInput = {
    project: { type: projectType, municipality: "", kommunekode: "" },
    plot: {
      areaM2: null,
      zone: "unknown",
      hasLocalplan: false,
      hasServitudes: false,
      localplanIds: [],
    },
    heritage: {
      listedBuilding: input.isFredet,
      saveValue: input.saveValue,
      preservationLocalplan: false,
      protectionLines: {
        coastal: input.strandbeskyttelse === true,
        forest: input.fredskov === true,
        lakeRiver: false,
        lake: false,
        clitFredning: input.klitfredning === true,
        churchSurroundings: false,
      },
    },
    localplan: null,
    municipalPlan: null,
    existingBuilding: null,
    newBuilding: null,
    geotechnical: {
      radonRisk: "unknown",
      groundwaterDepthM: null,
      slopePercent: null,
      jordforureningV1: null,
      jordforureningV2: null,
      omraadeklassificering: null,
    },
    servituts: { hasCritical: false, criticalTexts: [] },
  };

  const violations = checkStopRules(ruleInput);
  const blockers = violations.filter(
    (v) => v.severity === "illegal" || v.severity === "dispensation_required",
  );
  const hardStop = blockers.length > 0;
  const hardStopReason = hardStop ? blockers.map((v) => v.reason).join("; ") : null;

  return { hardStop, hardStopReason, violations };
}

// Convenience predicates — use these in pre-check flag generation instead of hardcoded thresholds.
export function isSaveDispensationRequired(saveValue: number | null): boolean {
  return saveValue !== null && saveValue <= SAVE_HARD_STOP_MAX;
}

export function isSaveWarning(saveValue: number | null): boolean {
  return saveValue === SAVE_WARNING_VALUE;
}
