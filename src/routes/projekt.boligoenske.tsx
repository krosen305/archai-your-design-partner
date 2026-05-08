import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, ChevronLeft, ChevronRight, Zap, Check } from "lucide-react";
import { useProject, type Byggeoenske } from "@/lib/project-store";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import { syncPatch } from "@/lib/project-sync";
import { supabase } from "@/integrations/supabase/client";
import { MOCK_BYGGEOENSKE } from "@/lib/mock-data";

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
  // Grundlæggende
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
  // Areal & rum
  {
    key: "oensketAreal",
    title: "Hvor stort skal huset være?",
    subtitle: "Boligareal i kvadratmeter",
    type: "number",
    min: 60,
    max: 500,
    unit: "m²",
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
  const { byggeoenske, setByggeoenske } = useProject();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [showSummary, setShowSummary] = useState(() => filledFieldCount(byggeoenske) >= 20);

  const step = STEPS[currentStep];
  const value = byggeoenske[step.key];
  const isLast = currentStep === STEPS.length - 1;
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  // Apply smart defaults when arriving at a step (ARCH-87)
  useEffect(() => {
    const key = STEPS[currentStep].key;
    if (byggeoenske[key] === undefined) {
      const def = getSmartDefault(key, byggeoenske);
      if (def !== undefined) {
        setByggeoenske({ [key]: def } as Partial<Byggeoenske>);
      }
    }
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = () => {
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
  };

  const canContinue =
    step.type === "upload" || step.type === "toggle" || (value !== undefined && value !== null);

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
            {step.subtitle && <p className="text-sm text-muted-foreground mb-6">{step.subtitle}</p>}

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
      </div>
    </PageTransition>
  );
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
