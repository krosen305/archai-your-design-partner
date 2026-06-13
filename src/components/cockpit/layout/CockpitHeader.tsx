import { FileText, Share2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataSourceKind, DataSourceStatus } from "@/types/project-state";

const HANDLINGSBARE_HEADER_KILDER: readonly DataSourceKind[] = [
  "bbr",
  "lokalplaner",
  "kommuneplanramme",
  "fbb",
  "naturbeskyttelse",
  "arealdata",
  "dkjord",
  "geusRisk",
  "terrain",
  "naboer",
  "matGeometri",
  "vurdering",
];

type DataHealth = "fresh" | "stale" | "error";

function dataHealthSummary(
  dataStatus: Record<DataSourceKind, DataSourceStatus> | undefined,
): DataHealth {
  if (!dataStatus) return "stale";
  const hasError = HANDLINGSBARE_HEADER_KILDER.some((k) => dataStatus[k] === "error");
  if (hasError) return "error";
  const hasFresh = HANDLINGSBARE_HEADER_KILDER.some((k) => dataStatus[k] === "fresh");
  return hasFresh ? "fresh" : "stale";
}

const HEALTH_DOT: Record<DataHealth, string> = {
  fresh: "bg-emerald-400",
  stale: "bg-amber-400",
  error: "bg-danger",
};

const HEALTH_LABEL: Record<DataHealth, string> = {
  fresh: "Data opdateret",
  stale: "Data mangler",
  error: "Datafejl",
};

type CockpitHeaderProps = {
  adresse: string;
  dataStatus?: Record<DataSourceKind, DataSourceStatus>;
};

export function CockpitHeader({ adresse, dataStatus }: CockpitHeaderProps) {
  const health = dataHealthSummary(dataStatus);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-6">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm text-foreground truncate max-w-[40%]">{adresse}</span>
        <span
          title={HEALTH_LABEL[health]}
          aria-label={HEALTH_LABEL[health]}
          className={cn("size-2 shrink-0 rounded-full", HEALTH_DOT[health])}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Forbered screeningsrapport — kommer snart"
          aria-label="Screeningsrapport (kommer snart)"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5",
            "font-mono text-[11px] tracking-[0.1em] text-muted-foreground/50 cursor-not-allowed",
          )}
        >
          <FileText size={12} />
          Rapport
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Del projekt"
        >
          <Share2 size={12} />
          Del
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center size-8 rounded-md border border-border/60 bg-[#111] text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Flere handlinger"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    </header>
  );
}
