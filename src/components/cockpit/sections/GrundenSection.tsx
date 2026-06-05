import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { MatrikelMap } from "@/components/cockpit/MatrikelMap";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { RuleEngineBbrData } from "@/domain/contracts/rule-engine.types";
import type { NeighborBuildingData } from "@/domain/contracts/analysis.types";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

type GrundenSectionProps = {
  bbr: RuleEngineBbrData | null;
  metrics: ComplianceMetrics | null;
  naboer: NeighborBuildingData | null;
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

function Måletal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-3xl font-semibold text-foreground tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function GrundenSection({ bbr, metrics, naboer, registerSection }: GrundenSectionProps) {
  const { grundareal_m2, bebygget_areal_m2, plandataContext } = useProject();
  const [visAlle, setVisAlle] = useState(false);

  const grundareal = grundareal_m2 ?? bbr?.grundareal ?? null;
  const bebygget = bebygget_areal_m2 ?? bbr?.bebygget_areal ?? null;
  const maksAreal = metrics?.maxBygningsareal ?? null;
  const zone = plandataContext?.zoneType ?? null;
  const jordstykkeId = bbr?.jordstykke_lokal_id ?? null;

  const ekstraFelter = bbr
    ? [
        { label: "Byggeår", value: bbr.byggeaar?.toString() },
        { label: "Ombygningsår", value: bbr.ombygningsaar?.toString() },
        {
          label: "Samlet areal",
          value: bbr.samlet_areal != null ? `${bbr.samlet_areal} m²` : undefined,
        },
        { label: "Antal etager", value: bbr.antal_etager?.toString() },
        { label: "Anvendelse", value: bbr.anvendelse_tekst ?? undefined },
        { label: "Varmeinstallation", value: bbr.varmeinstallation ?? undefined },
        { label: "Ydervæg", value: bbr.ydervaegs_materiale ?? undefined },
        { label: "Tag", value: bbr.tagdaekning ?? undefined },
        { label: "Vandforsyning", value: bbr.vandforsyning ?? undefined },
        { label: "Afløb", value: bbr.afloebsforhold ?? undefined },
      ].filter((r) => r.value != null)
    : [];

  return (
    <section ref={(el) => registerSection("grunden", el)} aria-label="Grunden">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6 space-y-6">
        <h2 className="text-lg font-medium text-foreground">Grunden</h2>

        <div className="grid grid-cols-[1fr_auto] gap-6 items-start">
          <div className="rounded-lg overflow-hidden" style={{ minHeight: 180 }}>
            <MatrikelMap
              bbr={bbr}
              metrics={metrics}
              naboer={naboer}
              jordstykkeLokalId={jordstykkeId}
            />
          </div>

          <div className="space-y-5 min-w-[140px]">
            {grundareal != null && <Måletal label="Grundareal" value={`${grundareal} m²`} />}
            {zone && <Måletal label="Zone" value={zone} />}
            {bebygget != null && <Måletal label="Bebygget i dag" value={`${bebygget} m²`} />}
            {maksAreal != null && <Måletal label="Maks tilladt" value={`${maksAreal} m²`} />}
          </div>
        </div>

        {ekstraFelter.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setVisAlle((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Vis alle felter
              <ChevronDown
                size={14}
                className={`transition-transform ${visAlle ? "rotate-180" : ""}`}
              />
            </button>

            {visAlle && (
              <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                {ekstraFelter.map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex justify-between border-b border-border/20 py-1.5"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
