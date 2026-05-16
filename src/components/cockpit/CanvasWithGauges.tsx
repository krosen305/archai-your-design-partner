import { useMemo } from "react";
import { MatrikelMap } from "@/components/cockpit/MatrikelMap";
import { useProject } from "@/lib/project-store";
import { estimerTotalpris } from "@/lib/byggeoenske-steps";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import { cn } from "@/lib/utils";

/**
 * MatrikelMap med overlejret mini-gauge-strip i bunden (4 kompakte indikatorer)
 * — erstatter behovet for separat metric-grid og 5-kategori-overview.
 * Pris-pill i toppen som visuel anker.
 */
export function CanvasWithGauges({
  bbr,
  metrics,
  naboer,
}: {
  bbr: BbrKompliantData | null;
  metrics: ComplianceMetrics | null;
  naboer: NeighborBuildingData | null;
}) {
  const { byggeoenske } = useProject();

  const grundareal = metrics?.grundareal ?? bbr?.grundareal ?? null;
  const eksisterende = bbr?.bebygget_areal ?? 0;
  const oensket = byggeoenske.oensketAreal ?? 0;
  const samlet =
    byggeoenske.byggetype === "nybyg"
      ? oensket
      : eksisterende + (byggeoenske.byggetype === "tilbyg" ? oensket : 0);
  const beregnetPct = grundareal && samlet > 0 ? (samlet / grundareal) * 100 : null;
  const maxPct = metrics?.maxBebyggelsesprocent ?? null;

  const etager = (byggeoenske.antalEtager as number | undefined) ?? null;
  const maxEtager = metrics?.maxEtager ?? null;

  const estHoejde = etager ? etager * 3 : null;
  const maxHoejde = metrics?.maxBygningshoejde ?? null;

  const totalpris = useMemo(() => estimerTotalpris(byggeoenske), [byggeoenske]);

  return (
    <div className="relative rounded-md border border-border/40 overflow-hidden bg-[#0c0c0c]">
      {/* Pris-pill — diskret øverste højre */}
      {totalpris !== null && (
        <div className="absolute top-3 right-3 z-10 rounded-md border border-accent/30 bg-[#0c0c0c]/85 backdrop-blur-sm px-3 py-1.5">
          <div className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">
            ESTIMAT
          </div>
          <div className="font-mono text-sm font-bold text-accent tabular-nums leading-tight">
            {formatDKK(totalpris)}
          </div>
        </div>
      )}

      <MatrikelMap bbr={bbr} metrics={metrics} naboer={naboer} />

      {/* Gauge-strip — bund-overlay */}
      <div className="border-t border-border/40 bg-[#0c0c0c] grid grid-cols-2 md:grid-cols-4 divide-x divide-border/40">
        <Gauge
          label="Bebyggelse"
          value={beregnetPct !== null ? `${beregnetPct.toFixed(0)}%` : "—"}
          limit={maxPct !== null ? `/${maxPct}%` : "—"}
          danger={maxPct !== null && beregnetPct !== null && beregnetPct > maxPct}
          near={maxPct !== null && beregnetPct !== null && beregnetPct / maxPct >= 0.8}
        />
        <Gauge
          label="Etager"
          value={etager !== null ? `${etager}` : "—"}
          limit={maxEtager !== null ? `/${maxEtager}` : "—"}
          danger={maxEtager !== null && etager !== null && etager > maxEtager}
          near={false}
        />
        <Gauge
          label="Højde"
          value={estHoejde !== null ? `${estHoejde.toFixed(1)}m` : "—"}
          limit={maxHoejde !== null ? `/${maxHoejde}m` : "—"}
          danger={maxHoejde !== null && estHoejde !== null && estHoejde > maxHoejde}
          near={false}
        />
        <Gauge
          label="Areal"
          value={`${samlet} m²`}
          limit={grundareal ? `på ${grundareal} m²` : ""}
          danger={false}
          near={false}
        />
      </div>
    </div>
  );
}

function Gauge({
  label,
  value,
  limit,
  danger,
  near,
}: {
  label: string;
  value: string;
  limit: string;
  danger: boolean;
  near: boolean;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span
          className={cn(
            "font-mono text-base font-semibold tabular-nums",
            danger ? "text-danger" : near ? "text-amber-400" : "text-foreground",
          )}
        >
          {value}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{limit}</span>
      </div>
    </div>
  );
}

function formatDKK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} mio.`;
  return `${Math.round(n / 1000)}k`;
}
