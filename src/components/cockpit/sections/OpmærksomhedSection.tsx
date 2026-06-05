import { useState } from "react";
import { useProject } from "@/lib/project-store";
import type { ComplianceFlag } from "@/types/project-state";
import { cn } from "@/lib/utils";
import type { SidebarSection } from "@/components/cockpit/layout/CockpitSidebar";

const SEVERITY_ORDER: Record<ComplianceFlag["status"], number> = {
  blocker: 0,
  advarsel: 1,
  ok: 2,
};

const DOT_COLOR: Record<ComplianceFlag["status"], string> = {
  blocker: "bg-danger",
  advarsel: "bg-amber-400",
  ok: "bg-emerald-400",
};

type OpmærksomhedSectionProps = {
  onOpenDetails: (flagId: string) => void;
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

export function OpmærksomhedSection({ onOpenDetails, registerSection }: OpmærksomhedSectionProps) {
  const { complianceFlags } = useProject();
  const [visAlle, setVisAlle] = useState(false);

  const sorted = [...complianceFlags].sort(
    (a, b) => SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status],
  );

  const visibleFlags = visAlle ? sorted : sorted.slice(0, 3);
  const skjulteAntal = sorted.length - 3;
  const harSkjulte = !visAlle && skjulteAntal > 0;

  if (complianceFlags.length === 0) return null;

  const aktiveFejl = sorted.filter((f) => f.status !== "ok").length;

  return (
    <section ref={(el) => registerSection("opmærksomhed", el)} aria-label="Opmærksomhed">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6">
        <h2 className="text-lg font-medium text-foreground mb-4">
          {aktiveFejl > 0
            ? `${aktiveFejl} ting kræver din opmærksomhed`
            : "Ingen opmærksomhedspunkter"}
        </h2>

        <ul className="divide-y divide-border/30">
          {visibleFlags.map((flag) => (
            <li key={flag.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={cn("size-2 shrink-0 rounded-full", DOT_COLOR[flag.status])}
                  aria-label={flag.status}
                />
                <span className="text-sm text-foreground truncate">{flag.label}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenDetails(flag.id)}
                className="shrink-0 ml-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Åbn →
              </button>
            </li>
          ))}
        </ul>

        {harSkjulte && (
          <button
            type="button"
            onClick={() => setVisAlle(true)}
            className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Vis alle ({sorted.length}) →
          </button>
        )}
        {visAlle && sorted.length > 3 && (
          <button
            type="button"
            onClick={() => setVisAlle(false)}
            className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Vis færre
          </button>
        )}
      </div>
    </section>
  );
}
