import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  Layers,
  Plug,
  Users,
  Landmark,
  Waves,
  Building2,
  Filter,
  type LucideIcon,
} from "lucide-react";
import { useProject, type ComplianceFlag } from "@/lib/project-store";
import { cn } from "@/lib/utils";

/**
 * RisikoFeed — sammensmeltning af tidligere ComplianceFeed + RiskOverview +
 * USYNLIGE BUDGETRISICI fra CompliancePanel. Én sorteret feed, kategori-filterpills
 * i toppen, OK-flag skjult bag toggle.
 */

type Kategori = "alle" | "plan" | "fredning" | "geoteknik" | "natur" | "naboer" | "forsyning";

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
  fbb: "FBB",
  dkjord: "DK-Jord",
  geus: "GEUS",
  regelkerne: "Regelkerne",
};

const KATEGORIER: Array<{ key: Kategori; label: string; Icon: LucideIcon }> = [
  { key: "alle", label: "Alle", Icon: Filter },
  { key: "plan", label: "Plan", Icon: Building2 },
  { key: "fredning", label: "Fredning", Icon: Landmark },
  { key: "geoteknik", label: "Geoteknik", Icon: Layers },
  { key: "natur", label: "Natur", Icon: Waves },
  { key: "naboer", label: "Naboer", Icon: Users },
  { key: "forsyning", label: "Forsyning", Icon: Plug },
];

function flagKategori(flag: ComplianceFlag): Kategori {
  const id = flag.id?.toLowerCase() ?? "";
  const label = flag.label?.toLowerCase() ?? "";
  if (flag.kilde === "geus" || /geo|jord|grund|radon/.test(id)) return "geoteknik";
  if (flag.kilde === "fbb" || /save|fredet|bevaringsvaerdi|fredning|listed/.test(id))
    return "fredning";
  if (/strand|fredskov|klitfredning|natur/.test(id)) return "natur";
  if (/nabo|skel|afstand/.test(id) || /nabo|skel/.test(label)) return "naboer";
  if (/fjernvarme|forsyning|tilslutning|varme/.test(id)) return "forsyning";
  return "plan";
}

export function RisikoFeed({ onOpenDetails }: { onOpenDetails: () => void }) {
  const { complianceFlags, hard_stop, hard_stop_reason } = useProject();
  const [kategori, setKategori] = useState<Kategori>("alle");
  const [visOk, setVisOk] = useState(false);

  const filtered = useMemo(() => {
    const base =
      kategori === "alle"
        ? complianceFlags
        : complianceFlags.filter((f) => flagKategori(f) === kategori);
    return [...base].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [complianceFlags, kategori]);

  const visible = visOk ? filtered : filtered.filter((f) => f.status !== "ok");
  const skjulteOk = filtered.length - visible.length;

  // Tæl pr. kategori for pill-badges
  const counts = useMemo(() => {
    const c = new Map<Kategori, { blocker: number; advarsel: number; ok: number; total: number }>();
    for (const k of KATEGORIER) c.set(k.key, { blocker: 0, advarsel: 0, ok: 0, total: 0 });
    for (const f of complianceFlags) {
      const k = flagKategori(f);
      const row = c.get(k)!;
      row[f.status]++;
      row.total++;
      const all = c.get("alle")!;
      all[f.status]++;
      all.total++;
    }
    return c;
  }, [complianceFlags]);

  if (complianceFlags.length === 0 && !hard_stop) {
    return (
      <div className="rounded-md border border-border/40 bg-[#0c0c0c]/60 p-6 text-center">
        <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-2">
          LIVE FEEDBACK
        </div>
        <p className="text-xs text-muted-foreground">
          Analysen kører — risici vises her, sorteret efter alvorlighed.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-md border border-border/40 bg-[#0c0c0c]/60 overflow-hidden">
      <header className="px-4 py-3 border-b border-border/40 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
          LIVE FEEDBACK
        </span>
        <button
          type="button"
          onClick={() => setVisOk((v) => !v)}
          className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground hover:text-foreground transition-colors"
        >
          {visOk ? "Skjul OK" : skjulteOk > 0 ? `Vis ${skjulteOk} OK` : "Vis OK"}
        </button>
      </header>

      {/* Hard Stop banner */}
      {hard_stop && (
        <div className="flex items-start gap-2.5 border-b border-danger/30 bg-danger/5 px-4 py-3">
          <AlertOctagon size={14} className="mt-0.5 shrink-0 text-danger" />
          <div className="text-xs leading-relaxed">
            <span className="font-mono tracking-[0.1em] text-danger">HARD STOP</span>
            <span className="ml-2 text-danger/90">
              {hard_stop_reason ?? "Matriklen har et blokerende forhold."}
            </span>
          </div>
        </div>
      )}

      {/* Kategori-filterpills */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border/40">
        {KATEGORIER.map((k) => {
          const c = counts.get(k.key)!;
          const active = kategori === k.key;
          const dim = c.total === 0 && k.key !== "alle";
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setKategori(k.key)}
              disabled={dim}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.05em] transition-colors",
                active
                  ? "bg-accent/15 text-accent border border-accent/40"
                  : "border border-border/40 text-muted-foreground hover:text-foreground hover:border-border",
                dim && "opacity-30 cursor-not-allowed",
              )}
            >
              <k.Icon size={10} />
              <span>{k.label}</span>
              {c.total > 0 && (
                <span
                  className={cn(
                    "tabular-nums px-1 rounded",
                    c.blocker > 0
                      ? "text-danger"
                      : c.advarsel > 0
                        ? "text-amber-400"
                        : "text-emerald-400/80",
                  )}
                >
                  {c.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      <ol className="relative">
        {visible.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">
            {skjulteOk > 0
              ? `Ingen kritiske forhold i ${kategori}. ${skjulteOk} OK skjult.`
              : "Ingen registrerede forhold."}
          </li>
        ) : (
          <div className="relative pl-4 pr-3 py-2">
            <span
              aria-hidden
              className="absolute left-[26px] top-3 bottom-3 w-px bg-border/40"
            />
            {visible.map((flag, idx) => (
              <FeedItem key={flag.id ?? `${flag.label}-${idx}`} flag={flag} />
            ))}
          </div>
        )}
      </ol>

      <footer className="border-t border-border/40 px-4 py-2.5 flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground/70">
          {visible.length} af {filtered.length} viste
        </span>
        <button
          type="button"
          onClick={onOpenDetails}
          className="font-mono text-[10px] tracking-[0.1em] text-accent hover:brightness-110 transition-all"
        >
          ÅBN DYBDEDATA →
        </button>
      </footer>
    </section>
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
    <li className="relative pl-7 py-2 group">
      <span
        aria-hidden
        className={cn(
          "absolute left-[7px] top-3 h-2.5 w-2.5 rounded-full ring-2 ring-[#0c0c0c]",
          dot,
        )}
      />
      <button
        type="button"
        onClick={() => hasDetalje && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-2.5 text-left",
          hasDetalje ? "cursor-pointer" : "cursor-default",
        )}
        disabled={!hasDetalje}
      >
        <Icon size={13} strokeWidth={2.5} className={cn("mt-0.5 shrink-0", iconColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm text-foreground leading-snug">{flag.label}</span>
            <span className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground/70">
              {KILDE_LABEL[flag.kilde]}
            </span>
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
