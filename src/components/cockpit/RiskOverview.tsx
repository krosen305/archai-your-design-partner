import { useMemo } from "react";
import { motion } from "framer-motion";
import { Layers, Plug, Users, Landmark, Waves, type LucideIcon } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { cn } from "@/lib/utils";
import {
  buildRiskOverviewCategories,
  hasProvisionalRiskSignals,
  type ComplianceRiskLevel,
  type ComplianceRiskOverviewKey,
  type RiskOverviewItem,
} from "@/lib/compliance-view-model";

// ---------------------------------------------------------------------------
// RiskOverview — visuel hierarki for de 5 kritiske risikokategorier
// ---------------------------------------------------------------------------

type RiskLevel = ComplianceRiskLevel;
type RiskCategory = RiskOverviewItem & { Icon: LucideIcon };

const LEVEL_STYLES: Record<RiskLevel, { ring: string; text: string; bg: string; dot: string }> = {
  ok: {
    ring: "ring-emerald-500/20",
    text: "text-emerald-400",
    bg: "bg-emerald-500/5",
    dot: "bg-emerald-500",
  },
  ukendt: {
    ring: "ring-border/40",
    text: "text-muted-foreground",
    bg: "bg-[#0c0c0c]/40",
    dot: "bg-[#444]",
  },
  advarsel: {
    ring: "ring-amber-500/30",
    text: "text-amber-400",
    bg: "bg-amber-500/5",
    dot: "bg-amber-400",
  },
  kritisk: {
    ring: "ring-danger/40",
    text: "text-danger",
    bg: "bg-danger/5",
    dot: "bg-danger",
  },
};

const LEVEL_LABEL: Record<RiskLevel, string> = {
  ok: "Klar",
  ukendt: "Ikke vurderet",
  advarsel: "Opmærksomhed",
  kritisk: "Kritisk",
};

const CATEGORY_ICONS: Record<ComplianceRiskOverviewKey, LucideIcon> = {
  geoteknik: Layers,
  forsyning: Plug,
  naboer: Users,
  fredning: Landmark,
  natur: Waves,
};

export function RiskOverview() {
  const { complianceFlags, heritage_save_value, is_fredet } = useProject();
  const hasMockRiskSignals = hasProvisionalRiskSignals(complianceFlags);

  const categories = useMemo<RiskCategory[]>(
    () =>
      buildRiskOverviewCategories({
        complianceFlags,
        heritageSaveValue: heritage_save_value,
        isFredet: is_fredet,
      }).map((category) => ({
        ...category,
        Icon: CATEGORY_ICONS[category.key],
      })),
    [complianceFlags, heritage_save_value, is_fredet],
  );

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
          KRITISKE RISIKOKATEGORIER
        </h3>
        <span className="text-[10px] text-muted-foreground/60">5 områder</span>
      </div>

      {hasMockRiskSignals && (
        <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          Geoteknik- og miljÃ¸signaler er forelÃ¸bige mock-data, ikke live-verificeret compliance.
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {categories.map((cat, i) => (
          <RiskCard key={cat.key} cat={cat} index={i} />
        ))}
      </div>
    </section>
  );
}

function RiskCard({ cat, index }: { cat: RiskCategory; index: number }) {
  const styles = LEVEL_STYLES[cat.level];
  const { Icon } = cat;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className={cn(
        "relative overflow-hidden rounded-md border border-border/40 ring-1 px-3 py-3",
        styles.bg,
        styles.ring,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon size={16} className={cn("shrink-0", styles.text)} />
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[9px] tracking-[0.05em]",
            styles.text,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", styles.dot)} />
          {LEVEL_LABEL[cat.level]}
        </span>
      </div>
      <div className="mt-2 text-[12px] font-medium text-foreground leading-tight">{cat.label}</div>
      <div className="mt-1 text-[10.5px] text-muted-foreground leading-snug">{cat.detail}</div>
    </motion.div>
  );
}
