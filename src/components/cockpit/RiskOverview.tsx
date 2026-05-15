import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Layers,
  Plug,
  Users,
  Landmark,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useProject } from "@/lib/project-store";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// RiskOverview — visuel hierarki for de 5 kritiske risikokategorier
// ---------------------------------------------------------------------------

type RiskLevel = "ok" | "ukendt" | "advarsel" | "kritisk";

type RiskCategory = {
  key: string;
  label: string;
  Icon: LucideIcon;
  level: RiskLevel;
  detail: string;
};

const LEVEL_STYLES: Record<RiskLevel, { ring: string; text: string; bg: string; dot: string }> = {
  ok: {
    ring: "ring-emerald-500/20",
    text: "text-emerald-400",
    bg: "bg-emerald-500/5",
    dot: "bg-emerald-500",
  },
  ukendt: {
    ring: "ring-border/40",
    text: "text-muted-foreground",
    bg: "bg-[#0c0c0c]/40",
    dot: "bg-[#444]",
  },
  advarsel: {
    ring: "ring-amber-500/30",
    text: "text-amber-400",
    bg: "bg-amber-500/5",
    dot: "bg-amber-400",
  },
  kritisk: {
    ring: "ring-danger/40",
    text: "text-danger",
    bg: "bg-danger/5",
    dot: "bg-danger",
  },
};

const LEVEL_LABEL: Record<RiskLevel, string> = {
  ok: "Klar",
  ukendt: "Ikke vurderet",
  advarsel: "Opmærksomhed",
  kritisk: "Kritisk",
};

export function RiskOverview() {
  const { complianceFlags, heritage_save_value, is_fredet } = useProject();

  const categories: RiskCategory[] = useMemo(() => {
    const findFlag = (pattern: RegExp) => complianceFlags.find((f) => pattern.test(f.id));

    // Geoteknik (GEUS / DK-Jord)
    const geoFlag = complianceFlags.find(
      (f) => f.kilde === "geus" || f.kilde === "dkjord" || /geo|jord|grund/.test(f.id),
    );
    const geo: RiskLevel = geoFlag
      ? geoFlag.status === "blocker"
        ? "kritisk"
        : geoFlag.status === "advarsel"
          ? "advarsel"
          : "ok"
      : "ukendt";

    // Forsyning (fjernvarme tilslutning)
    const forsyningFlag = findFlag(/fjernvarme|forsyning|tilslutning/);
    const forsyning: RiskLevel = forsyningFlag
      ? forsyningFlag.status === "blocker"
        ? "advarsel"
        : forsyningFlag.status === "advarsel"
          ? "advarsel"
          : "ok"
      : "ukendt";

    // Naboer (tæt på skel / nabopartshøring)
    const naboFlag = findFlag(/nabo|skel|afstand/);
    const naboer: RiskLevel = naboFlag
      ? naboFlag.status === "blocker"
        ? "kritisk"
        : "advarsel"
      : "ok";

    // Fredning / SAVE
    const fredningLevel: RiskLevel = is_fredet
      ? "kritisk"
      : heritage_save_value !== null && heritage_save_value !== undefined
        ? heritage_save_value <= 3
          ? "kritisk"
          : heritage_save_value === 4
            ? "advarsel"
            : "ok"
        : "ukendt";

    // Strandbeskyttelse / fredskov / klitfredning
    const naturFlag = findFlag(/strand|fredskov|klitfredning|natur/);
    const natur: RiskLevel = naturFlag
      ? naturFlag.status === "blocker"
        ? "kritisk"
        : "advarsel"
      : "ok";

    return [
      {
        key: "geoteknik",
        label: "Geoteknik",
        Icon: Layers,
        level: geo,
        detail:
          geo === "kritisk"
            ? "Risiko for dyre fundamentsløsninger"
            : geo === "advarsel"
              ? "Vurdering anbefales"
              : geo === "ok"
                ? "Ingen kendte risici"
                : "Geoteknisk vurdering mangler",
      },
      {
        key: "forsyning",
        label: "Forsyning",
        Icon: Plug,
        level: forsyning,
        detail:
          forsyning === "advarsel"
            ? "Tilslutningspligt eller -mangel"
            : forsyning === "ok"
              ? "Tilslutning afklaret"
              : "Status mangler",
      },
      {
        key: "naboer",
        label: "Naboer",
        Icon: Users,
        level: naboer,
        detail:
          naboer === "kritisk"
            ? "Nabopartshøring sandsynlig"
            : naboer === "advarsel"
              ? "Tæt på skel — vurder"
              : "Ingen kendte konflikter",
      },
      {
        key: "fredning",
        label: "Fredning / SAVE",
        Icon: Landmark,
        level: fredningLevel,
        detail: is_fredet
          ? "Bygning er fredet"
          : heritage_save_value !== null && heritage_save_value !== undefined
            ? `SAVE-værdi: ${heritage_save_value}`
            : "SAVE-værdi mangler",
      },
      {
        key: "natur",
        label: "Naturbeskyttelse",
        Icon: Waves,
        level: natur,
        detail:
          natur === "kritisk"
            ? "Strand-/fredskov/klit — dispensation kræves"
            : natur === "advarsel"
              ? "Beskyttelseslinje i nærheden"
              : "Ingen kendte beskyttelser",
      },
    ];
  }, [complianceFlags, heritage_save_value, is_fredet]);

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
          KRITISKE RISIKOKATEGORIER
        </h3>
        <span className="text-[10px] text-muted-foreground/60">5 områder</span>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {categories.map((cat, i) => (
          <RiskCard key={cat.key} cat={cat} index={i} />
        ))}
      </div>
    </section>
  );
}

function RiskCard({ cat, index }: { cat: RiskCategory; index: number }) {
  const styles = LEVEL_STYLES[cat.level];
  const { Icon } = cat;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className={cn(
        "relative overflow-hidden rounded-md border border-border/40 ring-1 px-3 py-3",
        styles.bg,
        styles.ring,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon size={16} className={cn("shrink-0", styles.text)} />
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[9px] tracking-[0.05em]",
            styles.text,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", styles.dot)} />
          {LEVEL_LABEL[cat.level]}
        </span>
      </div>
      <div className="mt-2 text-[12px] font-medium text-foreground leading-tight">
        {cat.label}
      </div>
      <div className="mt-1 text-[10.5px] text-muted-foreground leading-snug">{cat.detail}</div>
    </motion.div>
  );
}
