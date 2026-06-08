import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useProject } from "@/lib/project-store";
import { beregnProjektReadiness } from "@/lib/projekt-readiness";
import { ReadinessDetail } from "@/components/cockpit/ReadinessDetail";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

type VerdiktSectionProps = {
  metrics: ComplianceMetrics | null;
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
  adresseId: string;
  projectId: string | undefined;
};

export function VerdiktSection({
  metrics,
  registerSection,
  adresseId,
  projectId,
}: VerdiktSectionProps) {
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
    <section ref={(el) => registerSection("verdict", el)} aria-label="Oversigt">
      <div
        className="relative overflow-hidden rounded-xl p-10"
        style={{
          background:
            "radial-gradient(ellipse at 15% 50%, rgba(200,255,0,0.05) 0%, transparent 65%), #0d0d0d",
        }}
      >
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

        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Projekt-readiness <span className="text-foreground font-medium">{readiness}%</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#222]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${readiness}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-[#c8ff00]"
            />
          </div>
          <ReadinessDetail dataStatus={dataStatus} complianceFlags={complianceFlags} />
        </div>

        {kanBygge && (
          <div className="mt-8">
            <Link
              to="/projekt/$id/plantegning"
              params={{ id: adresseId }}
              search={{ projectId }}
              className="inline-flex items-center gap-2 rounded-md bg-[#c8ff00] px-5 py-2.5 font-medium text-sm text-black hover:brightness-95 transition-all"
            >
              Åbn plantegning →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
