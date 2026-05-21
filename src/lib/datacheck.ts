import { z } from "zod";
import {
  DATA_POINT_DEFS,
  HIGH_RISK_IDS,
  MEDIUM_RISK_IDS,
  PHASE_LABELS,
  SECTIONS,
  type DataPointDef,
  type DataPointId,
  type Phase,
  type ReadinessScore,
  type RiskFlag,
} from "@/lib/datacheck-config";

export { DATA_POINT_DEFS, PHASE_LABELS, SECTIONS };
export type { DataPointDef, DataPointId, Phase, ReadinessScore, RiskFlag };

export type DataPointStatus = "not_started" | "in_progress" | "done" | "not_applicable";

export type DataPointEntry = {
  fieldId: DataPointId;
  status: DataPointStatus;
  note?: string;
  updatedAt: string;
};

export type DataStatusMap = Partial<Record<DataPointId, DataPointEntry>>;

const statusSchema = z.enum(["not_started", "in_progress", "done", "not_applicable"]);
const dataPointIdSchema = z.enum(
  DATA_POINT_DEFS.map((def) => def.id) as [DataPointId, ...DataPointId[]],
);

export const dataPointEntrySchema = z.object({
  fieldId: dataPointIdSchema,
  status: statusSchema,
  note: z.string().optional(),
  updatedAt: z.string().datetime(),
});

const knownDataPointIds = new Set<DataPointId>(DATA_POINT_DEFS.map((def) => def.id));

export const dataStatusMapSchema = z
  .record(z.string(), dataPointEntrySchema)
  .transform((input) => parsePersistedDataStatusMap(input));

export function parsePersistedDataStatusMap(input: unknown): DataStatusMap {
  if (!input || typeof input !== "object") return {};

  const parsed: DataStatusMap = {};

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!knownDataPointIds.has(key as DataPointId)) continue;
    const result = dataPointEntrySchema.safeParse(value);
    if (!result.success) continue;
    parsed[key as DataPointId] = result.data;
  }

  return parsed;
}

export function getReadinessScores(statusMap: DataStatusMap): ReadinessScore[] {
  const phases: Phase[] = ["skitse", "myndighed", "udbud"];

  return phases.map((phase) => {
    const criticalByPhase = DATA_POINT_DEFS.filter((def) => def.phase === phase && def.kritisk);
    const done = criticalByPhase.filter((def) => {
      const status = statusMap[def.id]?.status;
      return status === "done" || status === "not_applicable";
    }).length;
    const total = criticalByPhase.length;

    return {
      phase,
      label: PHASE_LABELS[phase],
      done,
      total,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });
}

export function getRiskFlags(statusMap: DataStatusMap): RiskFlag[] {
  const flags: RiskFlag[] = [];

  for (const def of DATA_POINT_DEFS) {
    const status = statusMap[def.id]?.status ?? "not_started";
    if (status === "done" || status === "not_applicable") continue;

    if (HIGH_RISK_IDS.has(def.id)) {
      flags.push({
        fieldId: def.id,
        label: def.label,
        severity: "high",
        message: `${def.label} mangler - blokerer fremskridt i ${PHASE_LABELS[def.phase].toLowerCase()}`,
      });
      continue;
    }

    if (MEDIUM_RISK_IDS.has(def.id) && status === "not_started") {
      flags.push({
        fieldId: def.id,
        label: def.label,
        severity: "medium",
        message: `${def.label} er ikke igangsat`,
      });
    }
  }

  return flags;
}
