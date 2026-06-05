import { useState } from "react";
import { ChevronDown } from "lucide-react";
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

const STATUS_LABEL: Record<ComplianceFlag["status"], string> = {
  blocker: "Blokerer",
  advarsel: "Advarsel",
  ok: "OK",
};

type OpmærksomhedSectionProps = {
  onOpenDetails: (flagId: string) => void;
  registerSection: (id: SidebarSection, el: HTMLElement | null) => void;
};

function FlagRow({ flag }: { flag: ComplianceFlag }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetalje = !!(flag.detalje || flag.aktuelVærdi || flag.tilladt || flag.dispensationMulig);

  return (
    <li className="py-3 border-b border-border/30 last:border-0">
      <button
        type="button"
        onClick={() => hasDetalje && setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-3 text-left",
          hasDetalje ? "cursor-pointer" : "cursor-default",
        )}
        aria-expanded={hasDetalje ? expanded : undefined}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={cn("size-2 shrink-0 rounded-full", DOT_COLOR[flag.status])}
            aria-label={STATUS_LABEL[flag.status]}
          />
          <span className="text-sm text-foreground truncate">{flag.label}</span>
        </div>
        {hasDetalje && (
          <ChevronDown
            size={14}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        )}
      </button>

      {expanded && hasDetalje && (
        <div className="mt-3 ml-5 space-y-2 text-sm">
          {flag.detalje && <p className="text-muted-foreground leading-relaxed">{flag.detalje}</p>}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            {flag.aktuelVærdi != null && (
              <>
                <dt className="text-muted-foreground">Aktuel værdi</dt>
                <dd className="text-foreground">{flag.aktuelVærdi}</dd>
              </>
            )}
            {flag.tilladt != null && (
              <>
                <dt className="text-muted-foreground">Tilladt</dt>
                <dd className="text-foreground">{flag.tilladt}</dd>
              </>
            )}
          </dl>
          {flag.dispensationMulig && (
            <p className="text-xs text-amber-400/80">
              Dispensation mulig
              {flag.dispensationMyndighed ? ` via ${flag.dispensationMyndighed}` : ""}.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function OpmærksomhedSection({
  onOpenDetails: _onOpenDetails,
  registerSection,
}: OpmærksomhedSectionProps) {
  const { complianceFlags } = useProject();
  const [visAlle, setVisAlle] = useState(false);

  const attentionFlags = complianceFlags.filter((flag) => flag.status !== "ok");
  const sorted = [...attentionFlags].sort(
    (a, b) => SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status],
  );

  const visibleFlags = visAlle ? sorted : sorted.slice(0, 3);
  const skjulteAntal = sorted.length - 3;
  const harSkjulte = !visAlle && skjulteAntal > 0;

  if (attentionFlags.length === 0) return null;

  const aktiveFejl = sorted.length;

  return (
    <section ref={(el) => registerSection("opmærksomhed", el)} aria-label="Opmærksomhed">
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-6">
        <h2 className="text-lg font-medium text-foreground mb-4">
          {aktiveFejl > 0
            ? `${aktiveFejl} ting kræver din opmærksomhed`
            : "Ingen opmærksomhedspunkter"}
        </h2>

        <ul>
          {visibleFlags.map((flag) => (
            <FlagRow key={flag.id} flag={flag} />
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
