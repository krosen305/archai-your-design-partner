import { RefreshCw, Check, AlertTriangle, Circle, Loader2 } from "lucide-react";
import { useProject } from "@/lib/project-store";
import type { DataSourceKind, DataSourceStatus as Status } from "@/lib/project-store";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<Status, string> = {
  fresh: "Frisk",
  stale: "Forældet",
  missing: "Mangler",
  loading: "Henter…",
  error: "Fejl",
};

const STATUS_CLASS: Record<Status, string> = {
  fresh: "text-accent border-accent/40 bg-accent/5",
  stale: "text-warning border-warning/40 bg-warning/5",
  missing: "text-muted-foreground border-border/60 bg-muted/30",
  loading: "text-muted-foreground border-border/60 bg-muted/30",
  error: "text-danger border-danger/40 bg-danger/5",
};

function StatusIcon({ status, className }: { status: Status; className?: string }) {
  if (status === "loading") return <Loader2 size={11} className={cn("animate-spin", className)} />;
  if (status === "fresh") return <Check size={11} className={className} />;
  if (status === "error") return <AlertTriangle size={11} className={className} />;
  if (status === "stale") return <AlertTriangle size={11} className={className} />;
  return <Circle size={11} className={className} />;
}

/**
 * Lille statuspille til datakilde-headers. Viser kildens friskhed og giver
 * en kompakt refresh-knap når en `onRefresh` callback er sat.
 *
 * Brugen er inline i sektion-headers:
 *   <DataSourceStatus kind="lokalplaner" onRefresh={handleRefreshAll} />
 */
export function DataSourceStatus({
  kind,
  onRefresh,
  showLabel = true,
}: {
  kind: DataSourceKind;
  onRefresh?: () => void;
  showLabel?: boolean;
}) {
  const status = useProject((s) => s.dataStatus[kind]);
  const label = STATUS_LABEL[status];

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-[0.1em] uppercase",
          STATUS_CLASS[status],
        )}
      >
        <StatusIcon status={status} />
        {showLabel && label}
      </span>
      {onRefresh && status !== "loading" && (status === "missing" || status === "stale" || status === "error") && (
        <button
          type="button"
          onClick={onRefresh}
          aria-label={`Genindlæs ${kind}`}
          className="inline-flex items-center justify-center rounded-full border border-border/60 p-1 text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors"
        >
          <RefreshCw size={10} />
        </button>
      )}
    </span>
  );
}
