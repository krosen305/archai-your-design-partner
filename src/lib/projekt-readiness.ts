import type { DataSourceKind, DataSourceStatus } from "@/types/project-state";
import type { ComplianceFlag } from "@/types/project-state";

// Handlingsbare kilder — sekundære AI-pipeline-kilder tæller ikke med
const HANDLINGSBARE_KILDER: readonly DataSourceKind[] = [
  "bbr",
  "lokalplaner",
  "kommuneplanramme",
  "fbb",
  "naturbeskyttelse",
  "arealdata",
  "dkjord",
  "geusRisk",
  "servitutter",
  "terrain",
  "fjernvarme",
  "naboer",
  "matGeometri",
  "vurdering",
  "tjekditnet",
  "energimaerke",
];

const DATA_SCORE: Record<DataSourceStatus, number> = {
  fresh: 1,
  stale: 0.5,
  missing: 0,
  loading: 0,
  error: 0,
};

export function beregnProjektReadiness(
  dataStatus: Record<DataSourceKind, DataSourceStatus>,
  flags: ComplianceFlag[],
): number {
  const total = HANDLINGSBARE_KILDER.length;
  const dataSum = HANDLINGSBARE_KILDER.reduce(
    (acc, k) => acc + (DATA_SCORE[dataStatus[k]] ?? 0),
    0,
  );
  const dataPct = total > 0 ? dataSum / total : 1;

  const okCount = flags.filter((f) => f.status === "ok").length;
  const compliancePct = flags.length === 0 ? 1 : okCount / flags.length;

  return Math.round(dataPct * 0.6 * 100 + compliancePct * 0.4 * 100);
}
