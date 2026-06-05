import { useProject } from "@/lib/project-store";
import { KommerSnartCard } from "@/components/cockpit/KommerSnart";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

function formatKr(n: number | null): string {
  if (n == null) return "–";
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMio(n: number | null): string {
  if (n == null) return "–";
  return `${(n / 1_000_000).toFixed(1)} mio. kr.`;
}

type OkonomiSectionProps = {
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

export function OkonomiSection({ registerSection }: OkonomiSectionProps) {
  const { vurderingData, grundareal_m2, bbrData } = useProject();

  const grundareal = grundareal_m2 ?? bbrData?.grundareal ?? null;
  const e = vurderingData?.ejendomsvaerdi ?? null;
  const g = vurderingData?.grundvaerdi ?? null;
  const samlet = e != null || g != null ? (e ?? 0) + (g ?? 0) : null;

  return (
    <section ref={(el) => registerSection("økonomi", el)} aria-label="Økonomi">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6 space-y-6">
        <h2 className="text-lg font-medium text-foreground">Økonomi</h2>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide text-[11px]">
            Ejendomsvurdering (SKAT / VUR)
          </h3>
          {vurderingData && !vurderingData.fejl ? (
            <div className="space-y-3">
              {samlet != null && (
                <div className="rounded-lg border border-border/40 bg-[#111] p-4">
                  <p className="text-xs text-muted-foreground mb-1">Samlet vurdering</p>
                  <p className="text-2xl font-semibold text-foreground tabular-nums">
                    {formatMio(samlet)}
                  </p>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>Ejendomsværdi: {formatKr(e)}</span>
                    <span>Grundværdi: {formatKr(g)}</span>
                  </div>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                {vurderingData.vurderetAreal != null && (
                  <div className="flex justify-between border-b border-border/20 py-1.5 col-span-1">
                    <dt className="text-muted-foreground">Vurderet areal</dt>
                    <dd className="text-foreground">{vurderingData.vurderetAreal} m²</dd>
                  </div>
                )}
                {vurderingData.vurderingsaar != null && (
                  <div className="flex justify-between border-b border-border/20 py-1.5 col-span-1">
                    <dt className="text-muted-foreground">Vurderingsår</dt>
                    <dd className="text-foreground">{vurderingData.vurderingsaar}</dd>
                  </div>
                )}
                {grundareal != null && g != null && (
                  <div className="flex justify-between border-b border-border/20 py-1.5 col-span-2">
                    <dt className="text-muted-foreground">Grundværdi pr. m²</dt>
                    <dd className="text-foreground">{formatKr(Math.round(g / grundareal))}/m²</dd>
                  </div>
                )}
              </dl>
            </div>
          ) : vurderingData?.fejl ? (
            <p className="text-sm text-warning">{vurderingData.fejl}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Hentes automatisk under analysen.</p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide text-[11px]">
            Energimærke
          </h3>
          <KommerSnartCard
            title="Energimærke fra EMOData"
            beskrivelse="Energimærkeklasse, gyldighedsdato og rapportlink vil vises her."
          />
        </div>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide text-[11px]">
            Finansiering & lånedokumentation
          </h3>
          <KommerSnartCard
            title="Bank-klar lånedokumentation"
            beskrivelse="Omkostningsestimering, lånedokumentation og entrepriseforsikring baseret på dit byggeønske."
          />
        </div>
      </div>
    </section>
  );
}
