import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import { Map as MapIcon } from "lucide-react";

/**
 * MatrikelMap — minimal placeholder.
 * TODO: erstat med faktisk SVG/leaflet-rendering af matrikel + nabobygninger.
 */
export function MatrikelMap({
  bbr,
  metrics,
  naboer: _naboer,
}: {
  bbr: BbrKompliantData | null;
  metrics: ComplianceMetrics | null;
  naboer: NeighborBuildingData | null;
}) {
  const grundareal = bbr?.grundareal_m2 ?? metrics?.grundareal ?? null;
  const bebygget = metrics?.bebyggetAreal ?? null;
  return (
    <div className="rounded-lg border border-border bg-[#111] p-6 min-h-[320px] flex flex-col items-center justify-center text-center">
      <MapIcon size={32} className="text-muted-foreground/40 mb-3" />
      <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-2">
        MATRIKEL
      </div>
      {grundareal != null && (
        <div className="text-sm text-foreground">
          Grundareal: <span className="font-mono">{Math.round(grundareal)} m²</span>
        </div>
      )}
      {bebygget != null && (
        <div className="text-xs text-muted-foreground mt-1">
          Bebygget: <span className="font-mono">{Math.round(bebygget)} m²</span>
        </div>
      )}
    </div>
  );
}
