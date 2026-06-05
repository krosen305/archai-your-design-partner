import { useState, useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card } from "@/components/wizard-ui";
import { DataSourceStatus } from "@/components/cockpit/DataSourceStatus";
import { useProject } from "@/lib/project-store";
import type { DataSourceKind } from "@/types/project-state";
import { cn } from "@/lib/utils";

/**
 * Animeret skeleton-blok — bruges når en datakilde har status "loading".
 * Pulserer subtilt med Tailwind `animate-pulse` + en framer-motion fade-in.
 */
function SkeletonLines({ rows = 3 }: { rows?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-2"
      aria-hidden
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-muted/40 animate-pulse"
          style={{ width: `${85 - i * 12}%` }}
        />
      ))}
    </motion.div>
  );
}

/**
 * Fælles shell for nye datakilde-cards. Viser:
 * - Skeleton mens status === "loading"
 * - Tydelig fejl + "Prøv igen"-knap når status === "error"
 * - Children (ægte indhold) når status === "fresh" | "stale"
 *
 * `kind` er den eneste kilde til status — komponenten læser direkte fra
 * `useProject().dataStatus[kind]`, så ingen prop-drilling er nødvendig.
 */
export function DatakildeCard({
  kind,
  icon: Icon,
  label,
  onRetry,
  emptyMessage,
  children,
}: {
  kind: DataSourceKind;
  icon: typeof AlertTriangle;
  label: string;
  onRetry?: () => void;
  /** Vises når status er "missing" og children er null. */
  emptyMessage?: string;
  children: ReactNode;
}) {
  const status = useProject((s) => s.dataStatus[kind]);

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
          <Icon size={12} className="text-accent" />
          {label}
        </div>
        <DataSourceStatus kind={kind} onRefresh={onRetry} showLabel={false} />
      </div>

      {status === "loading" && <SkeletonLines />}

      {status === "error" && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/5 p-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
            <div className="text-xs leading-relaxed text-foreground/90">
              <div className="font-mono tracking-[0.1em] text-danger mb-1">KILDE UTILGÆNGELIG</div>
              Vi kunne ikke hente {label.toLowerCase()} lige nu. Det kan skyldes et midlertidigt
              udfald hos datakilden — prøv igen om et øjeblik.
            </div>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 self-start rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5",
                "font-mono text-[10px] tracking-[0.15em] text-danger transition-colors hover:bg-danger/20",
              )}
            >
              <RefreshCw size={11} />
              PRØV IGEN
            </button>
          )}
        </motion.div>
      )}

      {(status === "fresh" || status === "stale") && (
        <motion.div
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          {children}
        </motion.div>
      )}

      {status === "missing" && emptyMessage && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </Card>
  );
}
