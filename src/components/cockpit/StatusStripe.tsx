import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertOctagon, AlertTriangle, CheckCircle2, Sparkles, ChevronRight } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { cn } from "@/lib/utils";

/**
 * Full-bredde compact severity-stribe.
 * Erstatter HardStopBanner + giver brugeren én linje at orientere sig efter.
 */
export function StatusStripe({
  onOpenDetails,
  onRecompute,
  isRecomputing,
}: {
  onOpenDetails: () => void;
  onRecompute: () => void;
  isRecomputing: boolean;
}) {
  const { complianceFlags, hard_stop, hard_stop_reason } = useProject();

  const counts = useMemo(() => {
    const c = { blocker: 0, advarsel: 0, ok: 0 };
    for (const f of complianceFlags) c[f.status]++;
    return c;
  }, [complianceFlags]);

  const total = counts.blocker + counts.advarsel + counts.ok;
  const dominant =
    counts.blocker > 0 ? "blocker" : counts.advarsel > 0 ? "advarsel" : "ok";

  const accentBorder = {
    blocker: "border-danger/40 bg-danger/5",
    advarsel: "border-amber-500/30 bg-amber-500/5",
    ok: "border-emerald-500/20 bg-emerald-500/5",
  }[dominant];

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3",
        accentBorder,
      )}
    >
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground shrink-0">
          STATUS
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Pill kind="blocker" label="Hard Stop" count={counts.blocker} />
          <Pill kind="advarsel" label="Advarsler" count={counts.advarsel} />
          <Pill kind="ok" label="OK" count={counts.ok} />
        </div>
        {hard_stop && hard_stop_reason && (
          <span className="text-xs text-danger/90 truncate min-w-0">
            <span className="font-mono mr-1.5">·</span>
            {hard_stop_reason}
          </span>
        )}
        {!hard_stop && total === 0 && (
          <span className="text-xs text-muted-foreground">Analyserer…</span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onRecompute}
          disabled={isRecomputing}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground hover:border-accent/40 disabled:opacity-50"
          title="Kør AI-analyse igen"
        >
          <Sparkles size={11} className={cn(isRecomputing && "animate-pulse text-accent")} />
          {isRecomputing ? "BEREGNER" : "OPDATÉR"}
        </button>
        <button
          type="button"
          onClick={onOpenDetails}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-[#111] px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground hover:border-accent/40"
        >
          DETALJER
          <ChevronRight size={11} />
        </button>
      </div>
    </motion.div>
  );
}

function Pill({
  kind,
  label,
  count,
}: {
  kind: "blocker" | "advarsel" | "ok";
  label: string;
  count: number;
}) {
  const cfg = {
    blocker: { Icon: AlertOctagon, cls: "text-danger border-danger/40 bg-danger/10" },
    advarsel: { Icon: AlertTriangle, cls: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
    ok: { Icon: CheckCircle2, cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  }[kind];
  const dim = count === 0 ? "opacity-40" : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono tracking-[0.05em]",
        cfg.cls,
        dim,
      )}
    >
      <cfg.Icon size={10} strokeWidth={2.5} />
      <span className="tabular-nums">{count}</span>
      <span className="hidden sm:inline opacity-80">{label}</span>
    </span>
  );
}
