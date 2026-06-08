import {
  DATA_SOURCE_LABELS,
  type DataSourceKind,
  type DataSourceStatus,
} from "@/types/project-state";
import type { ComplianceFlag } from "@/types/project-state";

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

type ReadinessDetailProps = {
  dataStatus: Record<DataSourceKind, DataSourceStatus>;
  complianceFlags: ComplianceFlag[];
};

export function ReadinessDetail({ dataStatus, complianceFlags }: ReadinessDetailProps) {
  const flagBlockers = complianceFlags
    .filter((f) => f.status === "blocker" || f.status === "advarsel")
    .slice(0, 2)
    .map((f) => ({ label: f.label, type: f.status as "blocker" | "advarsel" }));

  const missingData = HANDLINGSBARE_KILDER.filter(
    (k) => dataStatus[k] === "missing" || dataStatus[k] === "error",
  )
    .slice(0, 3 - flagBlockers.length)
    .map((k) => ({ label: `${DATA_SOURCE_LABELS[k]} mangler`, type: "data" as const }));

  const items = [...flagBlockers, ...missingData].slice(0, 3);

  if (items.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.label}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
            item.type === "blocker"
              ? "border-danger/40 text-danger/90"
              : item.type === "advarsel"
                ? "border-amber-500/40 text-amber-400/90"
                : "border-border/50 text-muted-foreground"
          }`}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}
