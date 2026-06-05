import { motion } from "framer-motion";
import { useProject } from "@/lib/project-store";
import { beregnProjektReadiness } from "@/lib/projekt-readiness";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

type VerdiktSectionProps = {
  metrics: ComplianceMetrics | null;
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

export function VerdiktSection({ metrics, registerSection }: VerdiktSectionProps) {
  const { hard_stop, hard_stop_reason, complianceFlags, dataStatus } = useProject();

  const readiness = beregnProjektReadiness(dataStatus, complianceFlags);
  const kanBygge = !hard_stop;
  const maxAreal = metrics?.maxBygningsareal ?? null;
  const maxEtager = metrics?.maxEtager ?? null;

  const metrikLinje = [
    maxAreal != null ? `Op til ${maxAreal} m²` : null,
    maxEtager != null ? `${maxEtager} etage${maxEtager !== 1 ? "r" : ""}` : null,
    kanBygge ? "ingen hard stops" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section ref={(el) => registerSection("verdict", el)} aria-label="Verdict">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-8">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className={`text-[2.5rem] font-bold leading-tight tracking-tight ${
            kanBygge ? "text-foreground" : "text-danger"
          }`}
        >
          {kanBygge ? "Du kan bygge her." : "Du kan ikke bygge her."}
        </motion.h1>

        <div
          className={`mt-2 h-[3px] w-16 rounded-full ${kanBygge ? "bg-[#c8ff00]" : "bg-danger"}`}
        />

        {metrikLinje && <p className="mt-4 text-base text-muted-foreground">{metrikLinje}</p>}

        {!kanBygge && hard_stop_reason && (
          <p className="mt-3 text-sm text-danger/90 leading-relaxed">{hard_stop_reason}</p>
        )}

        <div className="mt-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-muted-foreground">Projekt-readiness {readiness}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#222]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${readiness}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-[#c8ff00]"
            />
          </div>
        </div>

        {kanBygge && (
          <div className="mt-6">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-[#c8ff00] px-5 py-2.5 font-medium text-sm text-black hover:brightness-95 transition-all"
              onClick={() => {
                // Navigation håndteres af CockpitHeader-knappen
                // Denne knap er et visuelt anker — routenavigation kobles på i Task 10
              }}
            >
              Åbn plantegning →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
