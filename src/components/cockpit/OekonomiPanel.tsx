import { useProject } from "@/lib/project-store";
import { Card } from "@/components/wizard-ui";
import { Building2, TrendingUp, AreaChart, Clock } from "lucide-react";
import { BudgetKalkulator } from "@/components/cockpit/BudgetKalkulator";

function formatKr(beloeb: number | null): string {
  if (beloeb === null) return "–";
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(beloeb);
}

export function OekonomiPanel() {
  const { vurderingData, bbrData, address, grundareal_m2, bebygget_areal_m2 } = useProject();

  const grundareal = grundareal_m2 ?? bbrData?.grundareal ?? null;
  const bebyggetAreal = bebygget_areal_m2 ?? bbrData?.bebygget_areal ?? null;
  const bebyggelsespct =
    grundareal && bebyggetAreal && grundareal > 0
      ? ((bebyggetAreal / grundareal) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground mb-2">
          MODUL
        </div>
        <h2 className="text-xl font-medium text-foreground">Økonomi & Forsikring</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Finansieringsgrundlag baseret på officielle ejendomsvurderinger fra Datafordeler.
        </p>
      </div>

      <Card>
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-4">
          EJENDOMSVURDERING (SKAT / VUR)
        </div>

        {vurderingData && !vurderingData.fejl ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-md border border-border bg-[#111] p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Building2 size={14} />
                  <span className="font-mono text-[10px] tracking-[0.1em]">EJENDOMSVÆRDI</span>
                </div>
                <p className="text-xl font-medium text-foreground">
                  {formatKr(vurderingData.ejendomsvaerdi)}
                </p>
              </div>

              <div className="rounded-md border border-border bg-[#111] p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp size={14} />
                  <span className="font-mono text-[10px] tracking-[0.1em]">GRUNDVÆRDI</span>
                </div>
                <p className="text-xl font-medium text-foreground">
                  {formatKr(vurderingData.grundvaerdi)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {vurderingData.vurderetAreal !== null && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AreaChart size={13} className="shrink-0" />
                  <span className="text-sm">
                    Vurderet areal:{" "}
                    <span className="text-foreground">{vurderingData.vurderetAreal} m²</span>
                  </span>
                </div>
              )}
              {vurderingData.vurderingsaar !== null && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock size={13} className="shrink-0" />
                  <span className="text-sm">
                    Vurderingsår:{" "}
                    <span className="text-foreground">{vurderingData.vurderingsaar}</span>
                  </span>
                </div>
              )}
            </div>

            {bbrData?.grundareal && vurderingData.grundvaerdi !== null && (
              <div className="text-xs text-muted-foreground border-t border-border pt-3">
                Grundværdi pr. m²:{" "}
                <span className="text-foreground">
                  {formatKr(Math.round(vurderingData.grundvaerdi / bbrData.grundareal))}/m²
                </span>
                {address?.adresse && ` · ${address.adresse}`}
              </div>
            )}
          </div>
        ) : vurderingData?.fejl ? (
          <p className="text-sm text-warning bg-warning/10 rounded-md border border-warning/30 p-3">
            Ejendomsvurdering ikke tilgængelig: {vurderingData.fejl}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ejendomsvurdering hentes automatisk under analysen.
          </p>
        )}
      </Card>

      <Card>
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
          FINANSIERING & LÅNEDOKUMENTATION
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Vi genererer automatisk bank-klar lånedokumentation og indhenter tilbud på
          entrepriseforsikring baseret på dit byggeønske og ejendomsvurdering.
        </p>
        <ul className="mt-3 space-y-1.5">
          {[
            "Omkostningsestimering baseret på dit byggeønske",
            "Bank-ready lånedokumentation",
            "Udbud på entrepriseforsikring",
          ].map((b) => (
            <li key={b} className="flex gap-2 text-sm text-muted-foreground">
              <span className="text-accent shrink-0">·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <span className="mt-4 inline-block font-mono text-[10px] tracking-[0.2em] border border-accent/40 text-accent rounded px-2 py-1">
          KOMMER SNART
        </span>
      </Card>

      {bebyggelsespct != null && (
        <div className="rounded-md border border-border bg-[#111] p-3">
          <div className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground mb-1">
            BEBYGGELSESPROCENT (NUVÆRENDE)
          </div>
          <div className="text-sm text-foreground">
            {bebyggelsespct}%
            {grundareal != null && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({grundareal} m² grundareal)
              </span>
            )}
          </div>
        </div>
      )}

      <BudgetKalkulator />
    </div>
  );
}
