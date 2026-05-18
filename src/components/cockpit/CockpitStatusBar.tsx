import { RefreshCw, AlertCircle } from "lucide-react";
import { useProject, DATA_SOURCE_LABELS } from "@/lib/project-store";
import type { DataSourceKind } from "@/lib/project-store";
import { cn } from "@/lib/utils";

function formatRelative(iso: string | null): string {
  if (!iso) return "ukendt tidspunkt";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min siden`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} t siden`;
  const d = Math.round(h / 24);
  return `${d} dage siden`;
}

/**
 * Banner i toppen af cockpittet. Viser hvornår data sidst blev hentet,
 * lister manglende/forældede kilder, og giver brugeren én knap til at
 * genindlæse alt fra Datafordeler + AI-pipelinen.
 */
export function CockpitStatusBar({
  onRefreshAll,
  isRefreshing,
}: {
  onRefreshAll: () => void;
  isRefreshing: boolean;
}) {
  const dataStatus = useProject((s) => s.dataStatus);
  const lastFetchedAt = useProject((s) => s.dataLastFetchedAt);

  const kinds = Object.keys(dataStatus) as DataSourceKind[];
  const missing = kinds.filter((k) => dataStatus[k] === "missing");
  const stale = kinds.filter((k) => dataStatus[k] === "stale");
  const allFresh = missing.length === 0 && stale.length === 0;

  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3",
        allFresh
          ? "border-accent/30 bg-accent/5"
          : missing.length > 0
            ? "border-warning/40 bg-warning/5"
            : "border-border/60 bg-muted/20",
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <AlertCircle
          size={14}
          className={cn(
            "mt-0.5 shrink-0",
            allFresh ? "text-accent" : missing.length > 0 ? "text-warning" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
            Datakilder · sidst opdateret {formatRelative(lastFetchedAt)}
          </div>
          {allFresh ? (
            <div className="mt-1 text-xs text-foreground/80">
              Alle kilder er friske — ingen genindlæsning nødvendig.
            </div>
          ) : (
            <div className="mt-1 text-xs text-foreground/80 truncate">
              {missing.length > 0 && (
                <span>
                  <span className="text-warning font-medium">{missing.length} mangler:</span>{" "}
                  {missing.map((k) => DATA_SOURCE_LABELS[k]).join(", ")}
                </span>
              )}
              {missing.length > 0 && stale.length > 0 && " · "}
              {stale.length > 0 && (
                <span>
                  <span className="text-warning font-medium">{stale.length} forældet:</span>{" "}
                  {stale.map((k) => DATA_SOURCE_LABELS[k]).join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRefreshAll}
        disabled={isRefreshing}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[11px] tracking-[0.1em] uppercase transition-colors shrink-0",
          isRefreshing
            ? "border-border/40 text-muted-foreground cursor-wait"
            : "border-accent/40 text-accent hover:bg-accent/10",
        )}
      >
        <RefreshCw size={12} className={cn(isRefreshing && "animate-spin")} />
        {isRefreshing ? "Henter…" : "Genindlæs alt"}
      </button>
    </div>
  );
}
