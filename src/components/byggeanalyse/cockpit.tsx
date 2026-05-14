import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Upload, X, ShoppingCart, Home, AlertTriangle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/wizard-ui";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useProject, type Byggeoenske } from "@/lib/project-store";
import { STEPS, STEP_GROUPS, estimerTotalpris, type Step, type Option } from "@/lib/byggeoenske-steps";
import { syncPatch } from "@/lib/project-sync";
import { supabase } from "@/integrations/supabase/client";
import type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { VurData } from "@/integrations/vur/client";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import { computePartialUpdate } from "@/lib/reactive-compliance";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Cockpit — 3-kolonne dashboard for byggeanalyse
// ---------------------------------------------------------------------------

export type CockpitProps = {
  bbr: BbrKompliantData | null;
  metrics: ComplianceMetrics | null;
  byggeanalyse: ByggeanalyseResultat | null;
  fbbData: FbbResultat | null;
  vurderingData: VurData | null;
  geusRisk: GeusRiskData | null;
  naboer: NeighborBuildingData | null;
  /** True når debounced re-analyse kører — viser kun skeletons på højre panel */
  isRecomputing: boolean;
  /** Trigger debounced re-analyse efter en patch */
  onPatched: () => void;
};

export function Cockpit({
  bbr,
  metrics,
  byggeanalyse,
  fbbData,
  vurderingData,
  geusRisk,
  naboer,
  isRecomputing,
  onPatched,
}: CockpitProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr_minmax(300px,360px)]">
      <div className="min-w-0">
        <ProjektDnaPanel onPatched={onPatched} />
      </div>
      <div className="min-w-0">
        <MatrikelCanvas bbr={bbr} metrics={metrics} naboer={naboer} />
      </div>
      <div className="min-w-0">
        <CompliancePanel
          bbr={bbr}
          metrics={metrics}
          byggeanalyse={byggeanalyse}
          fbbData={fbbData}
          vurderingData={vurderingData}
          geusRisk={geusRisk}
          isRecomputing={isRecomputing}
        />
      </div>
    </div>
  );
}

// ===========================================================================
// LEFT — Projekt DNA: Mode-toggle + 22 byggeønsker accordion
// ===========================================================================

function ProjektDnaPanel({ onPatched }: { onPatched: () => void }) {
  return (
    <div className="space-y-3">
      <ModeToggle />
      <ByggeoenskeAccordion onPatched={onPatched} />
    </div>
  );
}

function ModeToggle() {
  const { cockpitMode, setCockpitMode } = useProject();
  const modes: Array<{ value: "kob" | "design"; label: string; icon: typeof ShoppingCart; hint: string }> = [
    { value: "kob", label: "Overvejer køb", icon: ShoppingCart, hint: "Fremhæv risici" },
    { value: "design", label: "Designer hjem", icon: Home, hint: "Fremhæv muligheder" },
  ];
  return (
    <Card className="p-2">
      <div className="grid grid-cols-2 gap-1">
        {modes.map((m) => {
          const sel = cockpitMode === m.value;
          const Icon = m.icon;
          return (
            <button
              key={m.value}
              onClick={() => setCockpitMode(m.value)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md px-2 py-2 transition-all",
                sel
                  ? m.value === "kob"
                    ? "bg-yellow-500/15 border border-yellow-500/50 text-yellow-300"
                    : "bg-emerald-500/15 border border-emerald-500/50 text-emerald-300"
                  : "border border-border/40 text-muted-foreground hover:text-foreground hover:border-border",
              )}
              aria-pressed={sel}
            >
              <div className="flex items-center gap-1.5">
                <Icon size={12} />
                <span className="font-mono text-[10px] tracking-[0.1em] uppercase">{m.label}</span>
              </div>
              <span className="text-[9px] opacity-70">{m.hint}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ===========================================================================
// LEFT — Accordion med 22 byggeønsker + debounced patch
// ===========================================================================

function ByggeoenskeAccordion({ onPatched }: { onPatched: () => void }) {
  const { byggeoenske, setByggeoenske } = useProject();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced patch: opdater store straks (UI reaktiv) — vent 500ms før sync + re-analyse.
  // computePartialUpdate kører øjeblikkeligt client-side (ingen API-kald) så Gauge-felterne
  // opdateres i realtid mens brugeren justerer byggeønsker.
  const patch = (partial: Partial<Byggeoenske>) => {
    setByggeoenske(partial);

    const state = useProject.getState();
    if (state.bbrData) {
      const { complianceMetrics: cm } = computePartialUpdate({
        bbr: state.bbrData,
        ramme: state.kommuneplanramme,
        lokalplanExtract: state.lokalplanExtract,
        lokalplaner: state.lokalplaner,
        naturbeskyttelse: null,
        geusRisk: null,
        servitutter: null,
        terrain: null,
        fbbData: null,
        byggeoenske: { ...state.byggeoenske, ...partial },
        municipality: state.address?.kommune ?? "",
        kommunekode: state.address?.kommunekode ?? "",
      });
      state.setComplianceMetrics(cm);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = { ...useProject.getState().byggeoenske };
      syncPatch({ byggeoenske: next });
      onPatched();
    }, 500);
  };

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const filledCount = STEPS.filter((s) => byggeoenske[s.key] !== undefined).length;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
          BYGGEØNSKER
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {filledCount}/{STEPS.length}
        </div>
      </div>
      <Accordion type="multiple" defaultValue={["Grundlæggende"]} className="px-2">
        {STEP_GROUPS.map((group) => {
          const groupSteps = STEPS.filter((s) => s.group === group);
          const groupFilled = groupSteps.filter((s) => byggeoenske[s.key] !== undefined).length;
          return (
            <AccordionItem key={group} value={group} className="border-border/40">
              <AccordionTrigger className="px-2 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-2">
                  <span className="text-sm font-medium">{group}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {groupFilled}/{groupSteps.length}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-3">
                <div className="space-y-4">
                  {groupSteps.map((step) => (
                    <FieldEditor
                      key={step.key}
                      step={step}
                      value={byggeoenske[step.key]}
                      onChange={(v) => patch({ [step.key]: v } as Partial<Byggeoenske>)}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </Card>
  );
}

function FieldEditor({
  step,
  value,
  onChange,
}: {
  step: Step;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-mono uppercase tracking-wide text-muted-foreground mb-1.5">
        {step.title}
      </label>
      {step.type === "choice" && (
        <ChoiceField options={step.options!} value={value} onChange={onChange} />
      )}
      {step.type === "number" && (
        <NumberField
          min={step.min!}
          max={step.max!}
          unit={step.unit}
          value={value as number | undefined}
          onChange={onChange}
        />
      )}
      {step.type === "toggle" && (
        <ToggleField value={value as boolean | undefined} onChange={onChange} />
      )}
      {step.type === "upload" && (
        <UploadField
          value={(value as string[] | undefined) ?? []}
          onChange={onChange as (v: string[]) => void}
        />
      )}
    </div>
  );
}

function ChoiceField({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  // Render as a compact native-style select so accordion stays scannable
  const selected = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <select
        value={value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const opt = options.find((o) => String(o.value) === raw);
          onChange(opt?.value);
        }}
        className="w-full appearance-none rounded-md border border-border/60 bg-[#111] px-3 py-2 pr-8 font-mono text-xs text-foreground hover:border-border focus:border-accent focus:outline-none"
      >
        <option value="" disabled>
          Vælg…
        </option>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
      />
      {selected?.hint && (
        <p className="mt-1 text-[10px] text-muted-foreground">{selected.hint}</p>
      )}
    </div>
  );
}

function NumberField({
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
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="font-mono text-lg text-accent">{v}</span>
        {unit && <span className="font-mono text-[10px] text-muted-foreground">{unit}</span>}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}

function ToggleField({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {[
        { v: true, label: "Ja" },
        { v: false, label: "Nej" },
      ].map((o) => {
        const sel = value === o.v;
        return (
          <button
            key={String(o.v)}
            onClick={() => onChange(o.v)}
            className={cn(
              "rounded-md border py-1.5 font-mono text-xs transition-all",
              sel
                ? "border-accent bg-accent/10 text-accent"
                : "border-border/60 bg-[#111] text-foreground hover:border-border",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function UploadField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, 8 - value.length)) {
        if (userId) {
          const path = `${userId}/${Date.now()}-${file.name}`;
          const { error } = await supabase.storage.from("inspiration-images").upload(path, file);
          if (error) continue;
          const { data: signed } = await supabase.storage
            .from("inspiration-images")
            .createSignedUrl(path, 60 * 60 * 24 * 7);
          if (signed?.signedUrl) uploaded.push(signed.signedUrl);
        } else {
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
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={value.length >= 8 || uploading}
        className="w-full rounded-md border border-dashed border-accent/40 bg-[#111] py-4 text-center hover:border-accent/70 transition-colors disabled:opacity-50"
      >
        <Upload size={16} className="mx-auto text-accent" />
        <div className="mt-1.5 text-[11px] text-foreground">
          {uploading ? "Uploader…" : "Tilføj billeder"}
        </div>
        <div className="text-[10px] text-muted-foreground">{value.length}/8</div>
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {value.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1">
          {value.map((src, i) => (
            <div
              key={i}
              className="relative group aspect-square rounded overflow-hidden border border-border/60"
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 rounded-full bg-black/70 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-danger"
                aria-label="Fjern"
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// CENTER — Matrikel-canvas (SVG)
// ===========================================================================

function MatrikelCanvas({
  bbr,
  metrics,
}: {
  bbr: BbrKompliantData | null;
  metrics: ComplianceMetrics | null;
}) {
  const { byggeoenske, address } = useProject();

  const grundareal = metrics?.grundareal ?? bbr?.grundareal ?? null;
  const eksisterende = bbr?.bebygget_areal ?? null;
  const oensket = byggeoenske.oensketAreal ?? null;
  const samlet = (eksisterende ?? 0) + (byggeoenske.byggetype === "tilbyg" ? (oensket ?? 0) : 0);
  const husAreal = byggeoenske.byggetype === "nybyg" ? (oensket ?? eksisterende ?? 0) : (samlet || eksisterende || 0);

  // Antag kvadratisk grund for visualisering
  const grundSide = grundareal ? Math.sqrt(grundareal) : 0;
  const husSide = husAreal ? Math.sqrt(husAreal) : 0;

  const canvasW = 480;
  const canvasH = 360;
  const padding = 40;
  const scale = grundSide > 0 ? Math.min(canvasW - padding * 2, canvasH - padding * 2) / grundSide : 1;

  const grundPx = grundSide * scale;
  const husPx = husSide * scale;
  const grundX = (canvasW - grundPx) / 2;
  const grundY = (canvasH - grundPx) / 2;
  const husX = grundX + (grundPx - husPx) / 2;
  const husY = grundY + (grundPx - husPx) / 2;

  const maxPct = metrics?.maxBebyggelsesprocent ?? null;
  const beregnetPct = grundareal ? (husAreal / grundareal) * 100 : null;
  const overskredet = maxPct !== null && beregnetPct !== null && beregnetPct > maxPct;

  return (
    <Card className="p-0 overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
          MATRIKEL & PLACERING
        </div>
        {address?.matrikel && (
          <div className="font-mono text-[10px] text-muted-foreground truncate ml-2">
            {address.matrikel}
          </div>
        )}
      </div>
      <div className="relative flex-1 bg-gradient-to-br from-[#0a0a0a] to-[#141414] flex items-center justify-center p-4">
        {grundareal === null ? (
          <div className="text-center text-xs text-muted-foreground">
            Ingen matrikeldata tilgængelig
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${canvasW} ${canvasH}`}
            className="w-full h-full max-h-[420px]"
            role="img"
            aria-label="Matrikel og husplacering"
          >
            {/* Grid baggrund */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1f1f1f" strokeWidth="0.5" />
              </pattern>
              <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={canvasW} height={canvasH} fill="url(#grid)" />

            {/* Matrikel */}
            <rect
              x={grundX}
              y={grundY}
              width={grundPx}
              height={grundPx}
              fill="hsl(var(--success) / 0.08)"
              stroke="hsl(var(--success) / 0.6)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text
              x={grundX + 4}
              y={grundY + 14}
              fontSize="10"
              fill="hsl(var(--success))"
              fontFamily="monospace"
            >
              GRUND {Math.round(grundareal)} m²
            </text>

            {/* Hus */}
            {husPx > 0 && (
              <motion.g
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <rect
                  x={husX}
                  y={husY}
                  width={husPx}
                  height={husPx}
                  fill={overskredet ? "hsl(var(--danger) / 0.2)" : "hsl(var(--accent) / 0.25)"}
                  stroke={overskredet ? "hsl(var(--danger))" : "hsl(var(--accent))"}
                  strokeWidth="2"
                />
                <text
                  x={husX + husPx / 2}
                  y={husY + husPx / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="11"
                  fill="hsl(var(--foreground))"
                  fontFamily="monospace"
                >
                  HUS {Math.round(husAreal)} m²
                </text>
              </motion.g>
            )}

            {/* Byggeret-zone (max bebyggelsesprocent ramme) */}
            {maxPct !== null && grundareal && (() => {
              const maxHusAreal = grundareal * (maxPct / 100);
              const maxHusSide = Math.sqrt(maxHusAreal);
              const maxHusPx = maxHusSide * scale;
              const mhX = grundX + (grundPx - maxHusPx) / 2;
              const mhY = grundY + (grundPx - maxHusPx) / 2;
              return (
                <rect
                  x={mhX}
                  y={mhY}
                  width={maxHusPx}
                  height={maxHusPx}
                  fill="none"
                  stroke="hsl(var(--warning) / 0.5)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
              );
            })()}
          </svg>
        )}
      </div>
      <div className="px-4 py-2.5 border-t border-border/40 grid grid-cols-3 gap-2 text-[10px] font-mono">
        <Legend swatch="bg-success/40 border-success/60" label="Grund" />
        <Legend swatch="bg-warning/40 border-warning/60" label="Max ramme" />
        <Legend
          swatch={overskredet ? "bg-danger/40 border-danger" : "bg-accent/40 border-accent"}
          label="Hus"
        />
      </div>
    </Card>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <div className={cn("w-3 h-3 rounded-sm border", swatch)} />
      <span>{label}</span>
    </div>
  );
}

// ===========================================================================
// RIGHT — Real-time Compliance & Budget panel
// ===========================================================================

function CompliancePanel({
  bbr,
  metrics,
  byggeanalyse,
  fbbData,
  vurderingData,
  isRecomputing,
}: {
  bbr: BbrKompliantData | null;
  metrics: ComplianceMetrics | null;
  byggeanalyse: ByggeanalyseResultat | null;
  fbbData: FbbResultat | null;
  vurderingData: VurData | null;
  isRecomputing: boolean;
}) {
  const { byggeoenske, complianceFlags } = useProject();

  // Bebyggelsesprocent (live: eksisterende + ønsket areal)
  const grundareal = metrics?.grundareal ?? bbr?.grundareal ?? null;
  const eksisterende = bbr?.bebygget_areal ?? 0;
  const oensket = byggeoenske.oensketAreal ?? 0;
  const samlet =
    byggeoenske.byggetype === "nybyg" ? oensket : eksisterende + (byggeoenske.byggetype === "tilbyg" ? oensket : 0);
  const beregnetPct = grundareal && samlet > 0 ? (samlet / grundareal) * 100 : null;
  const maxPct = metrics?.maxBebyggelsesprocent ?? null;
  const pctOver = maxPct !== null && beregnetPct !== null && beregnetPct > maxPct;
  const pctValue = beregnetPct !== null && maxPct !== null
    ? Math.min(100, (beregnetPct / maxPct) * 100)
    : 0;

  // Etager
  const etager = (byggeoenske.antalEtager as number | undefined) ?? null;
  const maxEtager = metrics?.maxEtager ?? null;
  const etagerOver = etager !== null && maxEtager !== null && etager > maxEtager;
  const etagerValue = etager !== null && maxEtager ? Math.min(100, (etager / maxEtager) * 100) : 0;

  // Højdegrænse: estimeret højde = etager * 3m
  const estHoejde = etager ? etager * 3 : null;
  const maxHoejde = metrics?.maxBygningshoejde ?? null;
  const hoejdeOver = maxHoejde !== null && estHoejde !== null && estHoejde > maxHoejde;
  const hoejdeValue = estHoejde !== null && maxHoejde !== null
    ? Math.min(100, (estHoejde / maxHoejde) * 100)
    : 0;

  // Animeret total-pris-tæller
  const totalpris = useMemo(() => estimerTotalpris(byggeoenske), [byggeoenske]);
  const animatedPris = useAnimatedNumber(totalpris ?? 0, 600);

  // Konflikt-tæller fra byggeanalyse
  const konflikter = byggeanalyse?.konflikt.length ?? 0;
  const dispensationer = byggeanalyse?.kraever_dispensation.length ?? 0;

  return (
    <div className="space-y-4">
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
            COMPLIANCE
          </div>
          {isRecomputing && (
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Genberegner…
            </div>
          )}
        </div>
        <div className="p-4 space-y-5">
          {/* Frednings- og SAVE-badges */}
          {bbr?.fredet && (
            <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              🏛️ Fredet bygning — kræver dispensation fra Slots- og Kulturstyrelsen
            </div>
          )}
          {fbbData?.fbb_bedste_bygning && fbbData.fbb_bedste_bygning.bevaringsvaerdi >= 1 && fbbData.fbb_bedste_bygning.bevaringsvaerdi <= 3 && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              🏛️ SAVE {fbbData.fbb_bedste_bygning.bevaringsvaerdi}/9 — Høj bevaringsværdi
            </div>
          )}

          <Gauge
            label="Bebyggelsesprocent"
            current={beregnetPct !== null ? `${beregnetPct.toFixed(0)}%` : "—"}
            limit={maxPct !== null ? `Maks ${maxPct}%` : "Ingen ramme"}
            value={pctValue}
            danger={pctOver}
          />
          <Gauge
            label="Etager"
            current={etager !== null ? `${etager}` : "—"}
            limit={maxEtager !== null ? `Maks ${maxEtager} etager` : "Ingen ramme"}
            value={etagerValue}
            danger={etagerOver}
          />
          <Gauge
            label="Bygningshøjde (est.)"
            current={estHoejde !== null ? `${estHoejde.toFixed(1)} m` : "—"}
            limit={maxHoejde !== null ? `Maks ${maxHoejde} m` : "Ingen ramme"}
            value={hoejdeValue}
            danger={hoejdeOver}
          />

          {/* Compliance flags fra preCheck + regelkerne */}
          {complianceFlags.length > 0 && (
            <div className="border-t border-border/40 pt-3 space-y-1.5">
              {complianceFlags
                .filter((f) => f.status === "blocker" || f.status === "advarsel")
                .map((f) => (
                  <div
                    key={f.id}
                    className={cn(
                      "flex items-start gap-2 text-xs",
                      f.status === "blocker" ? "text-danger" : "text-warning",
                    )}
                  >
                    <span>{f.status === "blocker" ? "🔴" : "🟡"}</span>
                    <span>{f.label}</span>
                  </div>
                ))}
            </div>
          )}

          {isRecomputing ? (
            <ConflictSkeleton />
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Stat
                label="Konflikter"
                value={konflikter}
                color={konflikter > 0 ? "text-danger" : "text-success"}
              />
              <Stat
                label="Dispensationer"
                value={dispensationer}
                color={dispensationer > 0 ? "text-warning" : "text-muted-foreground"}
              />
            </div>
          )}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
          ESTIMERET TOTALPRIS
        </div>
        <div className="p-4">
          {totalpris === null ? (
            <div className="text-xs text-muted-foreground">Vælg areal for at estimere</div>
          ) : (
            <>
              <div className="font-mono text-3xl text-accent tabular-nums">
                {formatDKK(animatedPris)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                ~{Math.round(totalpris / (byggeoenske.oensketAreal ?? 1)).toLocaleString("da-DK")} kr/m²
                · ekskl. grundkøb
              </div>
              <BudgetBreakdown />
            </>
          )}
        </div>
      </Card>

      {vurderingData && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
            EJENDOMSVURDERING
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                Ejendomsværdi
              </div>
              <div className="font-mono text-lg text-foreground tabular-nums">
                {vurderingData.ejendomsvaerdi != null
                  ? `${(vurderingData.ejendomsvaerdi / 1_000_000).toFixed(1)} mio.`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                Grundværdi
              </div>
              <div className="font-mono text-lg text-foreground tabular-nums">
                {vurderingData.grundvaerdi != null
                  ? `${(vurderingData.grundvaerdi / 1_000_000).toFixed(1)} mio.`
                  : "—"}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Gauge({
  label,
  current,
  limit,
  value,
  danger,
}: {
  label: string;
  current: string;
  limit: string;
  value: number;
  danger: boolean;
}) {
  const nearLimit = value >= 80 && !danger;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            danger ? "text-danger" : nearLimit ? "text-warning" : "text-foreground",
          )}
        >
          {current}
        </span>
      </div>
      <Progress
        value={Math.min(100, value)}
        className={cn(
          "h-2",
          danger
            ? "[&>div]:bg-danger"
            : nearLimit
              ? "[&>div]:bg-warning"
              : "[&>div]:bg-emerald-500",
        )}
      />
      <div className="mt-1 text-[10px] font-mono text-muted-foreground">{limit}</div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-[#0f0f0f] p-2.5">
      <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("font-mono text-xl tabular-nums mt-0.5", color)}>{value}</div>
    </div>
  );
}

function ConflictSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 pt-1">
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
    </div>
  );
}

function BudgetBreakdown() {
  const { byggeoenske } = useProject();
  const items = [
    byggeoenske.energiklasse && {
      label: "Energiklasse",
      value: byggeoenske.energiklasse,
    },
    byggeoenske.facademateriale && {
      label: "Facade",
      value: byggeoenske.facademateriale,
    },
    byggeoenske.solceller && { label: "Solceller", value: "ja" },
    byggeoenske.varmekilde && { label: "Varme", value: byggeoenske.varmekilde },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  if (items.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-mono text-foreground capitalize">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hjælpefunktioner
// ---------------------------------------------------------------------------

function formatDKK(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)} mio. kr`;
  }
  return `${n.toLocaleString("da-DK")} kr`;
}

function useAnimatedNumber(target: number, duration = 500): number {
  const [v, setV] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf: number;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}
