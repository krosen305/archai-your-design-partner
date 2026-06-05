import { ExternalLink } from "lucide-react";
import { KommerSnartCard } from "@/components/cockpit/KommerSnart";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";
import type {
  RuleEngineLokalplan,
  RuleEngineTinglysningResult,
} from "@/domain/contracts/rule-engine.types";

type PlanRegularingSectionProps = {
  lokalplaner: RuleEngineLokalplan[];
  servitutter: RuleEngineTinglysningResult | null;
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

export function PlanReguleringSection({
  lokalplaner,
  servitutter,
  registerSection,
}: PlanRegularingSectionProps) {
  const harServitutter =
    servitutter && servitutter.kilde !== "mock" && servitutter.servitutter.length > 0;

  return (
    <section ref={(el) => registerSection("plan", el)} aria-label="Plan og regulering">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6 space-y-6">
        <h2 className="text-lg font-medium text-foreground">Plan & regulering</h2>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide text-[11px]">
            Lokalplaner ({lokalplaner.length})
          </h3>
          {lokalplaner.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingen lokalplan — ejendommen reguleres af kommuneplanen.
            </p>
          ) : (
            <ul className="space-y-3">
              {lokalplaner.map((lp) => (
                <li
                  key={lp.planid}
                  className="flex items-start justify-between gap-4 border-b border-border/20 pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground font-medium truncate">
                      {lp.plannr ? `${lp.plannr} – ` : ""}
                      {lp.plannavn || "Ukendt lokalplan"}
                      {lp.status === "forslag" && (
                        <span className="ml-2 text-[10px] font-mono text-amber-400 border border-amber-500/40 rounded px-1">
                          FORSLAG
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lp.datoVedtaget ? `Vedtaget ${lp.datoVedtaget.slice(0, 10)}` : "Vedtaget"}
                      {lp.kommunenavn ? ` · ${lp.kommunenavn}` : ""}
                    </p>
                  </div>
                  {lp.plandokumentLink && (
                    <a
                      href={lp.plandokumentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      PDF <ExternalLink size={10} />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide text-[11px]">
            Tinglyste servitutter
          </h3>
          {harServitutter ? (
            <ul className="space-y-2">
              {servitutter.servitutter.map((s) => (
                <li
                  key={s.dokumentId}
                  className="text-sm text-foreground border-b border-border/20 pb-2 last:border-0"
                >
                  {s.tekst || s.type}
                </li>
              ))}
            </ul>
          ) : (
            <KommerSnartCard
              title="Servitutter fra Tinglysningsregisteret"
              beskrivelse="Vi arbejder på at hente tinglyste servitutter direkte fra Tinglysning.dk."
            />
          )}
        </div>
      </div>
    </section>
  );
}
