import { motion } from "framer-motion";
import { useProject } from "@/lib/project-store";
import { beregnProjektReadiness } from "@/lib/projekt-readiness";
import { ReadinessDetail } from "@/components/cockpit/ReadinessDetail";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

type VerdiktSectionProps = {
  metrics: ComplianceMetrics | null;
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
  scrollTo: (id: SidebarSection) => void;
};

export function VerdiktSection({ metrics, registerSection, scrollTo }: VerdiktSectionProps) {
  const { hard_stop, hard_stop_reason, complianceFlags, dataStatus } = useProject();

  const readiness = beregnProjektReadiness(dataStatus, complianceFlags);
  // hard_stop er server-afledt; UI viser kun status, afgør ikke compliance.
  const ingenBlokering = !hard_stop;
  const maxAreal = metrics?.maxBygningsareal ?? null;
  const maxEtager = metrics?.maxEtager ?? null;

  const metrikLinje = [
    maxAreal != null ? `Vejledende op til ${maxAreal} m²` : null,
    maxEtager != null ? `${maxEtager} etage${maxEtager !== 1 ? "r" : ""}` : null,
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
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground/70 mb-3">
          FORELØBIG SCREENINGSSTATUS
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className={`text-[2rem] font-bold leading-tight tracking-tight ${
            ingenBlokering ? "text-foreground" : "text-danger"
          }`}
        >
          {ingenBlokering
            ? "Ingen kritisk blokering fundet i de kontrollerede kilder"
            : "Kritisk blokering fundet — kræver manuel kontrol"}
        </motion.h1>

        <div
          className={`mt-2 h-[3px] w-16 rounded-full ${ingenBlokering ? "bg-[#c8ff00]" : "bg-danger"}`}
        />

        {metrikLinje && <p className="mt-4 text-base text-muted-foreground">{metrikLinje}</p>}

        {!ingenBlokering && hard_stop_reason && (
          <p className="mt-3 text-sm text-danger/90 leading-relaxed">{hard_stop_reason}</p>
        )}

        <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground/80">
          Foreløbig screening baseret på de kontrollerede offentlige kilder. Ikke en juridisk
          afgørelse eller myndighedsafgørelse. Manglende kilder og forhold markeret til manuel
          kontrol skal afklares af en fagperson.
        </p>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Screening-readiness <span className="text-foreground font-medium">{readiness}%</span>
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

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => scrollTo("opmærksomhed")}
            className="inline-flex items-center gap-2 rounded-md bg-[#c8ff00] px-5 py-2.5 font-medium text-sm text-black hover:brightness-95 transition-all"
          >
            Se risici og næste kontroller →
          </button>
          <button
            type="button"
            onClick={() => scrollTo("datakilder")}
            className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-[#111] px-5 py-2.5 font-medium text-sm text-foreground hover:bg-[#1a1a1a] transition-all"
          >
            Se kildegrundlag →
          </button>
        </div>
      </div>
    </section>
  );
}
