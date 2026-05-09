import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, ChevronLeft, ChevronRight, Zap, Check } from "lucide-react";
import {
  useProject,
  type Byggeoenske,
  type ComplianceFlag,
  type BoligoenskeValidering,
} from "@/lib/project-store";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import { syncPatch } from "@/lib/project-sync";
import { supabase } from "@/integrations/supabase/client";
import { MOCK_BYGGEOENSKE } from "@/lib/mock-data";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Validering (ARCH-124)
// ---------------------------------------------------------------------------

function validateEtager(
  valgt: number | undefined,
  maxEtager: number | null,
): BoligoenskeValidering["etagerStatus"] {
  if (!valgt || maxEtager === null) return "ingen_data";
  return valgt <= maxEtager ? "ok" : "dispensation";
}

function validateAreal(
  oensket: number | undefined,
  grundareal: number | null,
  maxPct: number | null,
  eksisterende: number | null,
): { status: BoligoenskeValidering["arealStatus"]; pct: number | null } {
  if (!oensket || !grundareal || !maxPct) return { status: "ingen_data", pct: null };
  const samlet = (eksisterende ?? 0) + oensket;
  const pct = (samlet / grundareal) * 100;
  return { status: pct <= maxPct ? "ok" : "dispensation", pct };
}

export const Route = createFileRoute("/projekt/boligoenske")({
  component: ByggeoenskeStep,
});

// ---------------------------------------------------------------------------
// 22-trins datamodel — labels, type og options pr. trin
// ---------------------------------------------------------------------------

type Option = { value: string | number | boolean; label: string; hint?: string };

type Step = {
  key: keyof Byggeoenske;
  title: string;
  subtitle?: string;
  type: "choice" | "number" | "toggle" | "upload";
  options?: Option[];
  min?: number;
  max?: number;
  unit?: string;
};

const STEPS: Step[] = [
  // Compliance-relevante spørgsmål først (ARCH-123)
  {
    key: "byggetype",
    title: "Hvilken type byggeri?",
    type: "choice",
    options: [
      { value: "nybyg", label: "Nybyg", hint: "Helt nyt hus fra bunden" },
      { value: "tilbyg", label: "Tilbyg", hint: "Udvid eksisterende bolig" },
      { value: "ombyg", label: "Ombyg", hint: "Renovér indvendigt" },
    ],
  },
  {
    key: "antalEtager",
    title: "Hvor mange etager?",
    type: "choice",
    options: [
      { value: 1, label: "1 etage" },
      { value: 1.5, label: "1½ etage" },
      { value: 2, label: "2 etager" },
      { value: 3, label: "3 etager" },
    ],
  },
  {
    key: "oensketAreal",
    title: "Hvor stort skal huset være?",
    subtitle: "Boligareal i kvadratmeter",
    type: "number",
    min: 60,
    max: 500,
    unit: "m²",
  },
  // Husstand
  {
    key: "husstandsstoerrelse",
    title: "Hvor mange skal bo i huset?",
    type: "number",
    min: 1,
    max: 12,
    unit: "personer",
  },
  { key: "voksne", title: "Hvor mange voksne?", type: "number", min: 1, max: 8, unit: "voksne" },
  { key: "boern", title: "Hvor mange børn?", type: "number", min: 0, max: 8, unit: "børn" },
  {
    key: "livsfase",
    title: "Hvor er I i livet?",
    type: "choice",
    options: [
      { value: "ung", label: "Ung familie", hint: "Børn på vej eller små børn" },
      { value: "etableret", label: "Etableret familie", hint: "Børn i skolealderen" },
      { value: "senior", label: "Senior", hint: "Voksne børn flyttet hjemmefra" },
    ],
  },
  {
    key: "antalSovevaerelser",
    title: "Hvor mange soveværelser?",
    type: "number",
    min: 1,
    max: 8,
    unit: "soveværelser",
  },
  {
    key: "antalBadevaerelser",
    title: "Hvor mange badeværelser?",
    type: "number",
    min: 1,
    max: 5,
    unit: "badeværelser",
  },
  { key: "hjemmekontor", title: "Skal der være hjemmekontor?", type: "toggle" },
  // Stil
  {
    key: "arkitektoniskStil",
    title: "Hvilken arkitektonisk stil?",
    type: "choice",
    options: [
      { value: "moderne", label: "Moderne", hint: "Rene linjer, store flader" },
      { value: "klassisk", label: "Klassisk", hint: "Symmetri og detaljer" },
      { value: "skandinavisk", label: "Skandinavisk", hint: "Lyst, enkelt, naturmaterialer" },
      { value: "industriel", label: "Industriel", hint: "Råt udtryk, beton & stål" },
      { value: "minimalistisk", label: "Minimalistisk", hint: "Fokus på det essentielle" },
    ],
  },
  {
    key: "tagform",
    title: "Hvilken tagform?",
    type: "choice",
    options: [
      { value: "fladt", label: "Fladt tag" },
      { value: "saddeltag", label: "Saddeltag" },
      { value: "valm", label: "Valmtag" },
      { value: "ensidig", label: "Ensidig taghældning" },
    ],
  },
  {
    key: "facademateriale",
    title: "Hvilket facademateriale?",
    type: "choice",
    options: [
      { value: "tegl", label: "Tegl" },
      { value: "trae", label: "Træ" },
      { value: "puds", label: "Puds" },
      { value: "metal", label: "Metal" },
      { value: "kombineret", label: "Kombineret" },
    ],
  },
  {
    key: "vinduesandel",
    title: "Hvor meget glas?",
    type: "choice",
    options: [
      { value: "lille", label: "Mindre vinduer", hint: "Hyggeligt og lunt" },
      { value: "mellem", label: "Almindelig glasandel" },
      { value: "stor", label: "Store glasflader", hint: "Lys og udsigt" },
    ],
  },
  {
    key: "udeomraade",
    title: "Vigtigste udeområde?",
    type: "choice",
    options: [
      { value: "terrasse", label: "Terrasse" },
      { value: "have", label: "Stor have" },
      { value: "altan", label: "Altan" },
      { value: "tagterrasse", label: "Tagterrasse" },
    ],
  },
  // Bæredygtighed
  {
    key: "energiklasse",
    title: "Hvilken energistandard?",
    type: "choice",
    options: [
      { value: "BR18", label: "BR18 (minimum)" },
      { value: "lavenergi", label: "Lavenergi" },
      { value: "passiv", label: "Passivhus" },
      { value: "plusenergi", label: "Plusenergihus" },
    ],
  },
  {
    key: "varmekilde",
    title: "Hvilken varmekilde?",
    type: "choice",
    options: [
      { value: "varmepumpe", label: "Luft/vand-varmepumpe" },
      { value: "fjernvarme", label: "Fjernvarme" },
      { value: "jordvarme", label: "Jordvarme" },
      { value: "solvarme", label: "Solvarme" },
    ],
  },
  { key: "solceller", title: "Skal der være solceller?", type: "toggle" },
  {
    key: "ventilation",
    title: "Hvilken ventilation?",
    type: "choice",
    options: [
      { value: "naturlig", label: "Naturlig" },
      { value: "mekanisk", label: "Mekanisk udsugning" },
      { value: "balanceret", label: "Balanceret med varmegenvinding" },
    ],
  },
  { key: "ladestander", title: "Skal der være ladestander til bil?", type: "toggle" },
  // Budget & inspiration
  {
    key: "budget",
    title: "Hvad er dit budget?",
    type: "choice",
    options: [
      { value: "under-3", label: "Under 3 mio. kr." },
      { value: "3-5", label: "3-5 mio. kr." },
      { value: "5-8", label: "5-8 mio. kr." },
      { value: "8-12", label: "8-12 mio. kr." },
      { value: "over-12", label: "Over 12 mio. kr." },
    ],
  },
  {
    key: "inspirationsbilleder",
    title: "Upload inspirationsbilleder",
    subtitle: "Op til 4 billeder (PNG/JPG, max 5 MB). Hjælper AI med at forstå din stil.",
    type: "upload",
  },
];

// ---------------------------------------------------------------------------
// Smart defaults — pre-fill based on earlier answers (ARCH-87)
// ---------------------------------------------------------------------------

function getSmartDefault(key: keyof Byggeoenske, current: Byggeoenske): unknown {
  switch (key) {
    case "boern":
      if (current.husstandsstoerrelse !== undefined && current.voksne !== undefined) {
        return Math.max(0, current.husstandsstoerrelse - current.voksne);
      }
      return undefined;
    case "antalSovevaerelser": {
      const total = current.husstandsstoerrelse ?? 2;
      const boern = current.boern ?? 0;
      // voksne each get their own room; children share if >1
      return Math.max(1, total - boern + Math.ceil(boern / 2));
    }
    case "oensketAreal":
      // Dansk gennemsnit for enfamilieshus ~150 m²
      return 150;
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Dynamisk kontekst pr. step — vises som hint under spørgsmålstitlen (ARCH-123)
// ---------------------------------------------------------------------------

function getDynamicSubtitle(
  key: keyof Byggeoenske,
  complianceMetrics: ComplianceMetrics | null,
  lokalplanExtract: LokalplanExtract | null,
  complianceFlags: ComplianceFlag[],
): string | null {
  switch (key) {
    case "antalEtager": {
      const maxEtager = complianceMetrics?.maxEtager ?? null;
      const lpMax = lokalplanExtract?.maxEtager ?? null;
      const effektivMax = [maxEtager, lpMax]
        .filter((v) => v !== null)
        .reduce<number | null>((min, v) => (min === null || v! < min ? v : min), null);
      if (effektivMax !== null) return `Kommuneplanen tillader max ${effektivMax} etager`;
      return null;
    }
    case "oensketAreal": {
      const rest = complianceMetrics?.remainingBygningsareal ?? null;
      if (rest !== null) return `Byggepotentiale på grunden: ca. ${Math.round(rest)} m²`;
      const max = complianceMetrics?.maxBygningsareal ?? null;
      if (max !== null) return `Max bygningsareal: ${Math.round(max)} m²`;
      return null;
    }
    case "tagform": {
      const krav = lokalplanExtract?.tagform ?? null;
      if (krav) return `Lokalplan krav: ${krav}`;
      return null;
    }
    case "facademateriale": {
      const materialer = lokalplanExtract?.materialer ?? [];
      if (materialer.length > 0) return `Lokalplan krav: ${materialer.join(", ")}`;
      return null;
    }
    case "varmekilde": {
      const flag = complianceFlags.find(
        (f) =>
          f.id === "fjernvarme-tilslutningspligt" || f.id === "fjernvarme-mismatch-ingen-daekning",
      );
      if (flag?.detalje) return flag.detalje;
      return null;
    }
    default:
      return null;
  }
}

// Number of non-upload fields answered — used for skip-flow threshold
function filledFieldCount(b: Byggeoenske): number {
  return STEPS.filter((s) => s.type !== "upload" && b[s.key] !== undefined).length;
}

// ---------------------------------------------------------------------------
// Summary view shown when returning to an already-completed flow (ARCH-87)
// ---------------------------------------------------------------------------

function SummaryView({
  byggeoenske,
  onSkip,
  onEdit,
}: {
  byggeoenske: Byggeoenske;
  onSkip: () => void;
  onEdit: () => void;
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Byggetype", value: byggeoenske.byggetype ?? "—" },
    {
      label: "Husstand",
      value: `${byggeoenske.husstandsstoerrelse ?? "?"} pers. (${byggeoenske.voksne ?? "?"} voksne, ${byggeoenske.boern ?? "?"} børn)`,
    },
    { label: "Areal", value: `${byggeoenske.oensketAreal ?? "?"} m²` },
    { label: "Etager", value: `${byggeoenske.antalEtager ?? "?"}` },
    { label: "Soveværelser", value: `${byggeoenske.antalSovevaerelser ?? "?"}` },
    { label: "Stil", value: byggeoenske.arkitektoniskStil ?? "—" },
    { label: "Energi", value: byggeoenske.energiklasse ?? "—" },
    { label: "Budget", value: byggeoenske.budget ?? "—" },
  ];

  return (
    <PageTransition>
      <div className="mx-auto max-w-[560px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/start" />
        </div>
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-2">
          DINE BYGGEØNSKER
        </div>
        <h1 className="text-2xl font-medium text-foreground mb-6">
          Du har allerede udfyldt dine ønsker
        </h1>

        <Card className="mb-4 divide-y divide-[#222]">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
            >
              <span className="text-xs text-muted-foreground font-mono">
                {r.label.toUpperCase()}
              </span>
              <span className="text-sm text-foreground capitalize">{r.value}</span>
            </div>
          ))}
        </Card>

        <button
          onClick={onSkip}
          className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 mb-3"
        >
          Spring direkte til analyse →
        </button>
        <button
          onClick={onEdit}
          className="w-full inline-flex items-center justify-center rounded-md border border-[#333] bg-[#111] px-6 py-3 font-mono text-sm text-muted-foreground transition-all hover:border-[#555] hover:text-foreground"
        >
          Rediger svar
        </button>
      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// Main step component
// ---------------------------------------------------------------------------

function ByggeoenskeStep() {
  const navigate = useNavigate();
  const {
    byggeoenske,
    setByggeoenske,
    complianceMetrics,
    lokalplanExtract,
    complianceFlags,
    boligoenskeValidering,
    setBoligoenskeValidering,
  } = useProject();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [showSummary, setShowSummary] = useState(() => filledFieldCount(byggeoenske) >= 20);
  const [dispensationOpen, setDispensationOpen] = useState<null | "etager" | "areal">(null);
  const [dispensationAcknowledged, setDispensationAcknowledged] = useState<{
    etager: boolean;
    areal: boolean;
  }>({ etager: false, areal: false });

  const step = STEPS[currentStep];
  const value = byggeoenske[step.key];
  const isLast = currentStep === STEPS.length - 1;
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const maxEtager = complianceMetrics?.maxEtager ?? null;
  const grundareal = complianceMetrics?.grundareal ?? null;
  const maxPct = complianceMetrics?.maxBebyggelsesprocent ?? null;
  const eksisterende = complianceMetrics?.currentBygningsareal ?? null;
  const remaining = complianceMetrics?.remainingBygningsareal ?? null;
  const maxBygningsareal = complianceMetrics?.maxBygningsareal ?? null;

  // Apply smart defaults when arriving at a step (ARCH-87)
  // Re-run validation when arriving at etager/areal steps med eksisterende værdier (ARCH-124)
  useEffect(() => {
    const key = STEPS[currentStep].key;
    if (byggeoenske[key] === undefined) {
      const def = getSmartDefault(key, byggeoenske);
      if (def !== undefined) {
        setByggeoenske({ [key]: def } as Partial<Byggeoenske>);
      }
    }
    if (key === "antalEtager" && byggeoenske.antalEtager !== undefined) {
      const arealRes = validateAreal(byggeoenske.oensketAreal, grundareal, maxPct, eksisterende);
      setBoligoenskeValidering({
        etagerStatus: validateEtager(byggeoenske.antalEtager, maxEtager),
        arealStatus: arealRes.status,
        beregnetBebyggelsespct: arealRes.pct,
        etagerDispensationAcknowledged: false,
        arealDispensationAcknowledged: boligoenskeValidering?.arealDispensationAcknowledged ?? false,
      });
    }
    if (key === "oensketAreal" && byggeoenske.oensketAreal !== undefined) {
      const arealRes = validateAreal(byggeoenske.oensketAreal, grundareal, maxPct, eksisterende);
      setBoligoenskeValidering({
        etagerStatus: boligoenskeValidering?.etagerStatus ?? "ingen_data",
        arealStatus: arealRes.status,
        beregnetBebyggelsespct: arealRes.pct,
        etagerDispensationAcknowledged: boligoenskeValidering?.etagerDispensationAcknowledged ?? false,
        arealDispensationAcknowledged: false,
      });
    }
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = () => {
    // Validation gate (ARCH-124) — etager + areal
    if (step.key === "antalEtager") {
      const status = validateEtager(byggeoenske.antalEtager as number | undefined, maxEtager);
      if (status === "dispensation" && !dispensationAcknowledged.etager) {
        setDispensationOpen("etager");
        return;
      }
    }
    if (step.key === "oensketAreal") {
      const { status } = validateAreal(byggeoenske.oensketAreal, grundareal, maxPct, eksisterende);
      if (status === "dispensation" && !dispensationAcknowledged.areal) {
        setDispensationOpen("areal");
        return;
      }
    }

    if (isLast) {
      syncPatch({ byggeoenske, currentStep: "ejendom" });
      navigate({ to: "/projekt/ejendom" });
      return;
    }
    setDirection(1);
    setCurrentStep((s) => s + 1);
  };

  const goBack = () => {
    if (currentStep === 0) {
      navigate({ to: "/projekt/start" });
      return;
    }
    setDirection(-1);
    setCurrentStep((s) => s - 1);
  };

  const setValue = (v: unknown) => {
    setByggeoenske({ [step.key]: v } as Partial<Byggeoenske>);

    // Live valideringsstatus i store (ARCH-124)
    if (step.key === "antalEtager") {
      const etagerStatus = validateEtager(v as number, maxEtager);
      const arealRes = validateAreal(byggeoenske.oensketAreal, grundareal, maxPct, eksisterende);
      setBoligoenskeValidering({
        etagerStatus,
        arealStatus: arealRes.status,
        beregnetBebyggelsespct: arealRes.pct,
        etagerDispensationAcknowledged: false,
        arealDispensationAcknowledged: boligoenskeValidering?.arealDispensationAcknowledged ?? false,
      });
    } else if (step.key === "oensketAreal") {
      const arealRes = validateAreal(v as number, grundareal, maxPct, eksisterende);
      const etagerStatus = validateEtager(byggeoenske.antalEtager as number, maxEtager);
      setBoligoenskeValidering({
        etagerStatus,
        arealStatus: arealRes.status,
        beregnetBebyggelsespct: arealRes.pct,
        etagerDispensationAcknowledged: boligoenskeValidering?.etagerDispensationAcknowledged ?? false,
        arealDispensationAcknowledged: false,
      });
    }
  };

  // Dispensation kræver aktiv anerkendelse (sættes af ARCH-128 modal)
  const etagerBlocked =
    step.key === "antalEtager" &&
    boligoenskeValidering?.etagerStatus === "dispensation" &&
    !boligoenskeValidering.etagerDispensationAcknowledged;

  const arealBlocked =
    step.key === "oensketAreal" &&
    boligoenskeValidering?.arealStatus === "dispensation" &&
    !boligoenskeValidering.arealDispensationAcknowledged;

  const canContinue =
    (step.type === "upload" || step.type === "toggle" || (value !== undefined && value !== null)) &&
    !etagerBlocked &&
    !arealBlocked;

  const devBypass = () => {
    setByggeoenske(MOCK_BYGGEOENSKE);
    syncPatch({ byggeoenske: MOCK_BYGGEOENSKE, currentStep: "ejendom" });
    navigate({ to: "/projekt/ejendom" });
  };

  if (showSummary) {
    return (
      <SummaryView
        byggeoenske={byggeoenske}
        onSkip={() => {
          syncPatch({ byggeoenske, currentStep: "ejendom" });
          navigate({ to: "/projekt/ejendom" });
        }}
        onEdit={() => setShowSummary(false)}
      />
    );
  }

  // ── Per-step UI hints (ARCH-127) ──────────────────────────────────────
  const stepHint = renderStepHint({
    key: step.key,
    value,
    maxEtager,
    grundareal,
    maxPct,
    eksisterende,
    remaining,
    maxBygningsareal,
    lokalplanExtract,
    complianceFlags,
  });

  // Dispensation modal text
  const dispensationContent =
    dispensationOpen === "etager"
      ? {
          title: "Dette kræver dispensation",
          body: `Du ønsker ${byggeoenske.antalEtager ?? "?"} etager — kommuneplanen tillader maks ${maxEtager ?? "?"}. Det kræver dispensation fra kommunen.`,
        }
      : dispensationOpen === "areal"
        ? (() => {
            const { pct } = validateAreal(
              byggeoenske.oensketAreal,
              grundareal,
              maxPct,
              eksisterende,
            );
            return {
              title: "Dette kræver dispensation",
              body: `Samlet bebyggelsesprocent bliver ${pct?.toFixed(0) ?? "?"}% — maks tilladt er ${maxPct ?? "?"}%. Det kræver dispensation fra kommunen.`,
            };
          })()
        : { title: "", body: "" };

  return (
    <PageTransition>
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <BackLink to="/projekt/start" />
          <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
            TRIN {currentStep + 1} AF {STEPS.length}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-8 h-1 w-full overflow-hidden rounded-full bg-[#1a1a1a]">
          <motion.div
            className="h-full bg-accent"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: direction * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -20 }}
            transition={{ duration: 0.2 }}
          >
            <h1 className="text-2xl md:text-3xl font-medium text-foreground mb-2">{step.title}</h1>
            {step.subtitle && <p className="text-sm text-muted-foreground mb-2">{step.subtitle}</p>}
            {getDynamicSubtitle(step.key, complianceMetrics, lokalplanExtract, complianceFlags) && (
              <p className="mb-4 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 font-mono text-[11px] text-accent">
                {getDynamicSubtitle(step.key, complianceMetrics, lokalplanExtract, complianceFlags)}
              </p>
            )}

            <div className="mt-6">
              {step.type === "choice" && (
                <ChoiceInput options={step.options!} value={value} onChange={(v) => setValue(v)} />
              )}
              {step.type === "number" && (
                <NumberInput
                  min={step.min!}
                  max={step.max!}
                  unit={step.unit}
                  value={value as number | undefined}
                  onChange={(v) => setValue(v)}
                />
              )}
              {step.type === "toggle" && (
                <ToggleInput value={value as boolean | undefined} onChange={(v) => setValue(v)} />
              )}
              {step.type === "upload" && (
                <UploadInput
                  value={(value as string[] | undefined) ?? []}
                  onChange={(v) => setValue(v)}
                />
              )}
            </div>

            {stepHint && <div className="mt-4">{stepHint}</div>}
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 flex items-center justify-between">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={14} /> Tilbage
          </button>
          <button
            onClick={goNext}
            disabled={!canContinue}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isLast ? "Færdiggør" : "Næste"} <ChevronRight size={14} />
          </button>
        </div>

        {import.meta.env.DEV && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={devBypass}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-accent/40 bg-accent/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-accent hover:bg-accent/10 transition-colors"
            >
              <Zap size={11} /> DEV: Udfyld med mock-data & spring frem
            </button>
          </div>
        )}

        {/* Dispensations-modal (ARCH-124) */}
        <Dialog
          open={dispensationOpen !== null}
          onOpenChange={(o) => !o && setDispensationOpen(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dispensationContent.title}</DialogTitle>
              <DialogDescription>{dispensationContent.body}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <button
                onClick={() => setDispensationOpen(null)}
                className="w-full rounded-md bg-accent px-4 py-2.5 font-mono text-sm text-accent-foreground hover:brightness-110"
              >
                Gå tilbage og juster
              </button>
              <button
                onClick={() => {
                  if (dispensationOpen) {
                    setDispensationAcknowledged((s) => ({ ...s, [dispensationOpen]: true }));
                  }
                  setDispensationOpen(null);
                  setDirection(1);
                  setCurrentStep((s) => s + 1);
                }}
                className="w-full rounded-md border border-yellow-500/40 bg-transparent px-4 py-2.5 font-mono text-xs text-yellow-400 hover:bg-yellow-500/5"
              >
                Jeg accepterer — fortsæt alligevel
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// Per-step hint UI (ARCH-127)
// ---------------------------------------------------------------------------

function renderStepHint(args: {
  key: keyof Byggeoenske;
  value: unknown;
  maxEtager: number | null;
  grundareal: number | null;
  maxPct: number | null;
  eksisterende: number | null;
  remaining: number | null;
  maxBygningsareal: number | null;
  lokalplanExtract: import("@/integrations/ai/pdf-extractor").LokalplanExtract | null;
  complianceFlags: import("@/lib/project-store").ComplianceFlag[];
}): React.ReactNode {
  const {
    key,
    value,
    maxEtager,
    grundareal,
    maxPct,
    eksisterende,
    remaining,
    maxBygningsareal,
    lokalplanExtract,
    complianceFlags,
  } = args;

  if (key === "antalEtager" && maxEtager !== null) {
    const valgt = value as number | undefined;
    const status: "ok" | "over" | "neutral" =
      valgt == null ? "neutral" : valgt <= maxEtager ? "ok" : "over";
    const cls =
      status === "ok"
        ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-400"
        : status === "over"
          ? "border-danger/40 bg-danger/5 text-danger"
          : "border-border bg-[#111] text-muted-foreground";
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[12px] ${cls}`}
      >
        Kommuneplanen tillader: maks {maxEtager} etager
      </div>
    );
  }

  if (key === "oensketAreal" && remaining !== null && maxBygningsareal && grundareal && maxPct) {
    const valgt = (value as number | undefined) ?? 0;
    const samlet = (eksisterende ?? 0) + valgt;
    const pctOfMax = Math.min(200, (samlet / maxBygningsareal) * 100);
    const samletPct = (samlet / grundareal) * 100;
    const over = samlet > maxBygningsareal;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-muted-foreground">Byggepotentiale: {remaining} m²</span>
          <span className={over ? "text-danger" : "text-emerald-400"}>
            Du ønsker: {valgt} m²
          </span>
        </div>
        <Progress
          value={Math.min(100, pctOfMax)}
          className={`h-2 ${over ? "[&>div]:bg-danger" : "[&>div]:bg-emerald-500"}`}
        />
        <div className="text-[11px] font-mono text-muted-foreground">
          Samlet bebyggelsesprocent: {samletPct.toFixed(0)}% af maks {maxPct}%
        </div>
      </div>
    );
  }

  if (key === "tagform" && lokalplanExtract?.tagform) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-yellow-500/40 bg-yellow-500/5 px-2.5 py-1.5 font-mono text-[12px] text-yellow-400">
        📋 Lokalplanen specificerer: {lokalplanExtract.tagform}
      </div>
    );
  }

  if (
    key === "facademateriale" &&
    lokalplanExtract?.materialer &&
    lokalplanExtract.materialer.length > 0
  ) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-yellow-500/40 bg-yellow-500/5 px-2.5 py-1.5 font-mono text-[12px] text-yellow-400">
        📋 Lokalplanen anbefaler: {lokalplanExtract.materialer.join(", ")}
      </div>
    );
  }

  if (key === "varmekilde") {
    const flag = complianceFlags.find(
      (f) =>
        f.id === "fjernvarme-tilslutningspligt" || f.id === "fjernvarme-mismatch-ingen-daekning",
    );
    if (flag?.detalje) {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-yellow-500/40 bg-yellow-500/5 px-2.5 py-1.5 font-mono text-[12px] text-yellow-400">
          {flag.detalje}
        </div>
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function ChoiceInput({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div className="grid gap-2.5">
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className={`group text-left rounded-md border px-4 py-3.5 transition-all ${
              selected
                ? "border-accent bg-accent/10"
                : "border-[#2a2a2a] bg-[#111] hover:border-[#444] hover:bg-[#161616]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div
                  className={`text-sm font-medium ${selected ? "text-accent" : "text-foreground"}`}
                >
                  {o.label}
                </div>
                {o.hint && <div className="mt-0.5 text-xs text-muted-foreground">{o.hint}</div>}
              </div>
              {selected && <Check size={16} className="text-accent shrink-0" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function NumberInput({
  min,
  max,
  unit,
  value,
  onChange,
}: {
  min: number;
  max: number;
  unit?: string;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  const v = value ?? min;
  return (
    <Card>
      <div className="flex items-baseline justify-center gap-3">
        <span className="font-mono text-5xl text-accent">{v}</span>
        {unit && <span className="font-mono text-sm text-muted-foreground">{unit}</span>}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-6 w-full accent-accent"
      />
      <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </Card>
  );
}

function ToggleInput({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {[
        { v: true, label: "Ja" },
        { v: false, label: "Nej" },
      ].map((o) => {
        const selected = value === o.v;
        return (
          <button
            key={String(o.v)}
            onClick={() => onChange(o.v)}
            className={`rounded-md border py-4 font-mono text-sm transition-all ${
              selected
                ? "border-accent bg-accent/10 text-accent"
                : "border-[#2a2a2a] bg-[#111] text-foreground hover:border-[#444]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const MAX_BILLEDER = 4;
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png"] as const;

function UploadInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    const candidates = Array.from(files).slice(0, MAX_BILLEDER - value.length);

    for (const file of candidates) {
      if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
        setError(`Filtypen "${file.type}" er ikke tilladt — kun PNG og JPG.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(
          `"${file.name}" er ${(file.size / 1024 / 1024).toFixed(1)} MB — max ${MAX_FILE_SIZE_MB} MB per billede.`,
        );
        return;
      }
    }

    setUploading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      const uploaded: string[] = [];
      for (const file of candidates) {
        if (userId) {
          const path = `${userId}/${Date.now()}-${file.name}`;
          const { error: upErr } = await supabase.storage
            .from("inspiration-images")
            .upload(path, file);
          if (upErr) throw upErr;
          const { data: signed } = await supabase.storage
            .from("inspiration-images")
            .createSignedUrl(path, 60 * 60 * 24 * 7);
          if (signed?.signedUrl) uploaded.push(signed.signedUrl);
        } else {
          // Gæst: in-memory base64
          const reader = new FileReader();
          const b64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          uploaded.push(b64);
        }
      }
      onChange([...value, ...uploaded]);
    } catch (e) {
      console.error("[Upload] fejl:", e);
      setError("Upload fejlede. Prøv igen.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={value.length >= MAX_BILLEDER || uploading}
        className="w-full rounded-md border border-dashed border-accent/40 bg-[#111] py-10 text-center hover:border-accent/70 hover:bg-[#161616] transition-colors disabled:opacity-50"
      >
        <Upload size={28} className="mx-auto text-accent" />
        <div className="mt-3 text-sm text-foreground">
          {uploading ? "Uploader..." : "Træk billeder hertil eller klik"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          PNG/JPG · max {MAX_FILE_SIZE_MB} MB · {value.length}/{MAX_BILLEDER} billeder
        </div>
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p className="mt-2 text-xs text-danger font-mono">{error}</p>}
      {value.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {value.map((src, i) => (
            <div
              key={i}
              className="relative group aspect-[3/2] rounded-md overflow-hidden border border-border"
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger"
                aria-label="Fjern"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
