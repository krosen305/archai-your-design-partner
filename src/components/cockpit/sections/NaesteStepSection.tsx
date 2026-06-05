import { useProject } from "@/lib/project-store";
import { beregnProjektReadiness } from "@/lib/projekt-readiness";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

type NaesteStepSectionProps = {
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

const NAESTE_TRIN = [
  {
    nummer: "01",
    titel: "Byg på plantegning",
    beskrivelse: "Åbn plantegningsværktøjet og definer din bygnings præcise placering og form.",
    kommerSnart: false,
  },
  {
    nummer: "02",
    titel: "Indhent tilbud",
    beskrivelse: "Brug budgetestimatet som udgangspunkt for at indhente tilbud fra entreprenører.",
    kommerSnart: false,
  },
  {
    nummer: "03",
    titel: "Ansøg om byggetilladelse",
    beskrivelse:
      "Forbered ansøgningsmaterialet til kommunen. Vi hjælper dig med at samle dokumentation.",
    kommerSnart: true,
  },
];

export function NaesteStepSection({ registerSection }: NaesteStepSectionProps) {
  const { dataStatus, complianceFlags, hard_stop } = useProject();
  const readiness = beregnProjektReadiness(dataStatus, complianceFlags);

  if (readiness < 20) return null;

  return (
    <section ref={(el) => registerSection("næste", el)} aria-label="Næste skridt">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6">
        <h2 className="text-lg font-medium text-foreground mb-6">Næste skridt</h2>

        <ol className="space-y-5">
          {NAESTE_TRIN.map((trin) => (
            <li key={trin.nummer} className="flex gap-4">
              <span className="font-mono text-[11px] tracking-[0.15em] text-[#c8ff00]/70 shrink-0 mt-0.5">
                {trin.nummer}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{trin.titel}</p>
                  {trin.kommerSnart && (
                    <span className="font-mono text-[10px] text-muted-foreground/50 border border-border/40 rounded px-1">
                      KOMMER SNART
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {trin.beskrivelse}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {!hard_stop && (
          <div className="mt-6 rounded-lg border border-border/30 bg-[#111] px-4 py-3 text-sm text-muted-foreground">
            Analyse-readiness:{" "}
            <span className="text-foreground font-medium">{readiness}%</span> — du er godt på vej.
          </div>
        )}
      </div>
    </section>
  );
}
