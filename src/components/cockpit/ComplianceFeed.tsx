import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useProject, type ComplianceFlag } from "@/lib/project-store";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// ComplianceFeed — én samlet, prioriteret tidslinje over alle compliance-forhold
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<ComplianceFlag["status"], number> = {
  blocker: 0,
  advarsel: 1,
  ok: 2,
};

const KILDE_LABEL: Record<ComplianceFlag["kilde"], string> = {
  bbr: "BBR",
  plandata: "Plandata",
  servitut: "Servitut",
  beregnet: "Beregnet",
  sdfi: "SDFI",
  dkjord: "DK-Jord",
  geus: "GEUS",
  regelkerne: "Regelkerne",
};

export function ComplianceFeed() {
  const { complianceFlags, hard_stop, hard_stop_reason } = useProject();
  const [expanded, setExpanded] = useState(true);

  const sorted = useMemo(
    () =>
      [...complianceFlags].sort(
        (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
      ),
    [complianceFlags],
  );

  const counts = useMemo(() => {
    const c = { blocker: 0, advarsel: 0, ok: 0 };
    for (const f of complianceFlags) c[f.status]++;
    return c;
  }, [complianceFlags]);

  if (complianceFlags.length === 0 && !hard_stop) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mb-6 overflow-hidden rounded-md border border-border/60 bg-[#0c0c0c]/60"
    >
      {/* Header — altid synlig */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-[#1a1a1a]/40"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            COMPLIANCE-FEED
          </span>
          <div className="flex items-center gap-1.5">
            <CountPill icon="blocker" count={counts.blocker} />
            <CountPill icon="advarsel" count={counts.advarsel} />
            <CountPill icon="ok" count={counts.ok} />
          </div>
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          className="text-muted-foreground"
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>

      {/* Hard Stop highlight */}
      {hard_stop && (
        <div className="flex items-start gap-2.5 border-t border-danger/30 bg-danger/5 px-4 py-3">
          <AlertOctagon size={14} className="mt-0.5 shrink-0 text-danger" />
          <div className="text-xs leading-relaxed">
            <span className="font-mono tracking-[0.1em] text-danger">HARD STOP</span>
            <span className="ml-2 text-danger/90">
              {hard_stop_reason ?? "Matriklen har et blokerende forhold."}
            </span>
          </div>
        </div>
      )}

      {/* Tidslinje */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ol
            key="feed"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative border-t border-border/40"
          >
            <div className="relative pl-4 pr-4 py-2">
              {/* vertikal akse */}
              <span
                aria-hidden
                className="absolute left-[26px] top-3 bottom-3 w-px bg-border/40"
              />
              {sorted.map((flag, idx) => (
                <FeedItem key={flag.id ?? `${flag.label}-${idx}`} flag={flag} />
              ))}
              {sorted.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  Ingen registrerede forhold endnu.
                </div>
              )}
            </div>
          </motion.ol>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CountPill({ icon, count }: { icon: "blocker" | "advarsel" | "ok"; count: number }) {
  if (count === 0) return null;
  const cfg = {
    blocker: { Icon: AlertOctagon, cls: "text-danger border-danger/30 bg-danger/10" },
    advarsel: { Icon: AlertTriangle, cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
    ok: { Icon: CheckCircle2, cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  }[icon];
  const { Icon, cls } = cfg;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono tracking-[0.05em]",
        cls,
      )}
    >
      <Icon size={10} strokeWidth={2.5} />
      {count}
    </span>
  );
}

function FeedItem({ flag }: { flag: ComplianceFlag }) {
  const [open, setOpen] = useState(false);
  const hasDetalje = Boolean(flag.detalje);

  const dot = {
    blocker: "bg-danger",
    advarsel: "bg-amber-400",
    ok: "bg-emerald-500",
  }[flag.status];

  const Icon = {
    blocker: AlertOctagon,
    advarsel: AlertTriangle,
    ok: CheckCircle2,
  }[flag.status];

  const iconColor = {
    blocker: "text-danger",
    advarsel: "text-amber-400",
    ok: "text-emerald-400",
  }[flag.status];

  return (
    <li className="relative pl-7 py-2.5 group">
      {/* dot på tidslinjen */}
      <span
        aria-hidden
        className={cn(
          "absolute left-[7px] top-3.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#0c0c0c]",
          dot,
        )}
      />

      <button
        type="button"
        onClick={() => hasDetalje && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-2.5 text-left rounded-sm",
          hasDetalje && "cursor-pointer",
          !hasDetalje && "cursor-default",
        )}
        disabled={!hasDetalje}
      >
        <Icon size={13} strokeWidth={2.5} className={cn("mt-0.5 shrink-0", iconColor)} />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm text-foreground leading-snug">{flag.label}</span>
            <KildeTag kilde={flag.kilde} />
            {flag.dispensationMulig && (
              <span className="font-mono text-[9px] tracking-[0.1em] text-amber-400/80">
                DISPENSATION MULIG
              </span>
            )}
          </div>

          {(flag.aktuelVærdi || flag.tilladt) && (
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
              {flag.aktuelVærdi && (
                <span>
                  Aktuel: <span className="text-foreground/80">{flag.aktuelVærdi}</span>
                </span>
              )}
              {flag.tilladt && (
                <span>
                  Tilladt: <span className="text-foreground/80">{flag.tilladt}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {hasDetalje && (
          <ChevronDown
            size={12}
            className={cn(
              "mt-1 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && hasDetalje && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-6 flex gap-2 rounded-md border border-border/40 bg-[#141414] px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              <Info size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p>{flag.detalje}</p>
                {flag.dispensationMyndighed && (
                  <p className="mt-1.5 font-mono text-[10px] tracking-[0.08em] text-amber-400/70">
                    Myndighed: {flag.dispensationMyndighed}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function KildeTag({ kilde }: { kilde: ComplianceFlag["kilde"] }) {
  return (
    <span className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground/70">
      {KILDE_LABEL[kilde]}
    </span>
  );
}
