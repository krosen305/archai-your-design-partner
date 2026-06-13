import { useProject } from "@/lib/project-store";
import { beregnProjektReadiness } from "@/lib/projekt-readiness";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

type NaesteStepSectionProps = {
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
  scrollTo: (id: SidebarSection) => void;
};

type NaesteTrin = {
  nummer: string;
  titel: string;
  beskrivelse: string;
  target?: SidebarSection;
  kommerSnart: boolean;
};

const NAESTE_TRIN: ReadonlyArray<NaesteTrin> = [
  {
    nummer: "01",
    titel: "Gennemgå kildegrundlag",
    beskrivelse:
      "Se hvilke offentlige kilder der er kontrolleret, deres status og confidence, samt hvad der mangler.",
    target: "datakilder",
    kommerSnart: false,
  },
  {
    nummer: "02",
    titel: "Gennemgå risici og manuelle kontroller",
    beskrivelse:
      "Se blokeringer, dispensationer, omkostningsrisici og forhold der kræver manuel professionel kontrol.",
    target: "opmærksomhed",
    kommerSnart: false,
  },
  {
    nummer: "03",
    titel: "Forbered screeningsrapport",
    beskrivelse:
      "Saml den foreløbige byggescreening til en dokumenteret rapport med kilder, forbehold og næste kontroller.",
    kommerSnart: true,
  },
];

export function NaesteStepSection({ registerSection, scrollTo }: NaesteStepSectionProps) {
  const { dataStatus, complianceFlags, hard_stop } = useProject();
  const readiness = beregnProjektReadiness(dataStatus, complianceFlags);

  if (readiness < 20) return null;

  return (
    <section ref={(el) => registerSection("næste", el)} aria-label="Næste skridt">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6">
        <h2 className="text-lg font-medium text-foreground mb-6">Næste kontroller</h2>

        <ol className="space-y-5">
          {NAESTE_TRIN.map((trin) => (
            <li key={trin.nummer} className="flex gap-4">
              <span className="font-mono text-[11px] tracking-[0.15em] text-[#c8ff00]/70 shrink-0 mt-0.5">
                {trin.nummer}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  {trin.target && !trin.kommerSnart ? (
                    <button
                      type="button"
                      onClick={() => scrollTo(trin.target!)}
                      className="text-sm font-medium text-foreground hover:text-[#c8ff00] transition-colors"
                    >
                      {trin.titel} →
                    </button>
                  ) : (
                    <p className="text-sm font-medium text-foreground">{trin.titel}</p>
                  )}
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
            Screening-readiness: <span className="text-foreground font-medium">{readiness}%</span> —
            de kontrollerede kilder viser ingen kritisk blokering. Resterende kontroller er
            manuelle.
          </div>
        )}
      </div>
    </section>
  );
}
