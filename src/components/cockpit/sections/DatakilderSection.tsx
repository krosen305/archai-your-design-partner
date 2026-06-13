import { RefreshCw } from "lucide-react";
import { useProject } from "@/lib/project-store";
import {
  DATA_SOURCE_LABELS,
  type DataSourceKind,
  type DataSourceStatus,
} from "@/types/project-state";
import { cn } from "@/lib/utils";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

const BLOKEREDE: readonly DataSourceKind[] = ["energimaerke", "servitutter"];

const DOT: Record<DataSourceStatus, string> = {
  fresh: "bg-emerald-400",
  stale: "bg-amber-400",
  missing: "bg-amber-400",
  loading: "bg-sky-400 animate-pulse",
  error: "bg-danger",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "–";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min siden`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} t siden`;
  return `${Math.round(h / 24)} dage siden`;
}

type DatakilderSectionProps = {
  onRefreshAll: () => void;
  isRefreshing: boolean;
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

export function DatakilderSection({
  onRefreshAll,
  isRefreshing,
  registerSection,
}: DatakilderSectionProps) {
  const dataStatus = useProject((s) => s.dataStatus);
  const lastFetchedAt = useProject((s) => s.dataLastFetchedAt);

  const kinds = Object.keys(dataStatus) as DataSourceKind[];

  return (
    <section ref={(el) => registerSection("datakilder", el)} aria-label="Datakilder">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-medium text-foreground">Datakilder</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/80">
              Kildegrundlag for screeningen — status og seneste opdatering pr. kilde.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastFetchedAt && (
              <span className="text-xs text-muted-foreground">
                Opdateret {formatRelative(lastFetchedAt)}
              </span>
            )}
            <button
              type="button"
              onClick={onRefreshAll}
              disabled={isRefreshing}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors",
                isRefreshing
                  ? "border-border/40 text-muted-foreground cursor-wait"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <RefreshCw size={11} className={cn(isRefreshing && "animate-spin")} />
              {isRefreshing ? "Henter…" : "Genindlæs"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {kinds.map((kind) => {
            const isBlokeret = BLOKEREDE.includes(kind);
            const status = dataStatus[kind];
            return (
              <div key={kind} className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 rounded-full shrink-0",
                    isBlokeret ? "bg-muted-foreground/30" : DOT[status],
                  )}
                />
                <span className="text-xs text-muted-foreground">{DATA_SOURCE_LABELS[kind]}</span>
                {isBlokeret && (
                  <span className="text-[10px] font-mono text-muted-foreground/50">
                    KOMMER SNART
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
