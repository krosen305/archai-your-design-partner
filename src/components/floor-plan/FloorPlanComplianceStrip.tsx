import { cn } from "@/lib/utils";
import { useProject } from "@/lib/project-store";

type Props = {
  totalNetAreaM2: number;
  targetAreaM2: number;
};

export function FloorPlanComplianceStrip({ totalNetAreaM2, targetAreaM2 }: Props) {
  const { hard_stop, complianceFlags } = useProject();

  const blockers = complianceFlags.filter((f) => f.status === "blocker").length;
  const warnings = complianceFlags.filter((f) => f.status === "advarsel").length;
  const deltaM2 = totalNetAreaM2 - targetAreaM2;
  const overTarget = deltaM2 > 5;
  const nearTarget = deltaM2 > 0 && deltaM2 <= 5;

  return (
    <div className="flex items-center gap-6 border-b border-border/40 bg-surface px-4 py-1.5">
      {hard_stop && (
        <Chip label="Hard stop" value="Blokeret" danger />
      )}
      <Chip
        label="Netto areal"
        value={`${totalNetAreaM2.toFixed(1)} m²`}
        sub={`/ ${targetAreaM2} m²`}
        danger={overTarget}
        near={nearTarget}
      />
      {blockers > 0 && <Chip label="Blokkere" value={String(blockers)} danger />}
      {warnings > 0 && <Chip label="Advarsler" value={String(warnings)} near />}
      {blockers === 0 && warnings === 0 && !hard_stop && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-success">
          ● Ingen blokkere
        </span>
      )}
    </div>
  );
}

function Chip({
  label,
  value,
  sub,
  danger = false,
  near = false,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
  near?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          danger ? "text-danger" : near ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </span>
      {sub && (
        <span className="font-mono text-[10px] text-muted-foreground">{sub}</span>
      )}
    </div>
  );
}
