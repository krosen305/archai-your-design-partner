import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Upload, X, ShoppingCart, Home, AlertTriangle, Flame, Info } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/wizard-ui";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProject, type Byggeoenske } from "@/lib/project-store";
import {
  STEPS,
  STEP_GROUPS,
  estimerTotalpris,
  type Step,
  type Option,
} from "@/lib/byggeoenske-steps";
import { syncPatch } from "@/lib/project-sync";
import { supabase } from "@/integrations/supabase/client";
import { uploadInspirationsbillede } from "@/lib/projekt-service";
import type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { VurData } from "@/integrations/vur/client";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import { computePartialUpdate } from "@/lib/reactive-compliance";
import { cn } from "@/lib/utils";
import { MatrikelMap } from "@/components/cockpit/MatrikelMap";

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
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  /** True når debounced re-analyse kører — viser kun skeletons på højre panel */
  isRecomputing: boolean;
};

export function Cockpit({
  bbr,
  metrics,
  byggeanalyse,
  fbbData,
  vurderingData,
  geusRisk,
  naboer,
  servitutter,
  terrain,
  naturbeskyttelse,
  isRecomputing,
}: CockpitProps) {
  const reactiveContext = useMemo(
    () => ({ geusRisk, servitutter, terrain, fbbData, naturbeskyttelse }),
    [geusRisk, servitutter, terrain, fbbData, naturbeskyttelse],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr_minmax(300px,360px)]">
      <div className="min-w-0">
        <ProjektDnaPanel reactiveContext={reactiveContext} />
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

function ProjektDnaPanel({
  reactiveContext,
}: {
  reactiveContext: {
    geusRisk: GeusRiskData | null;
    servitutter: TinglysningResult | null;
    terrain: TerrainData | null;
    fbbData: FbbResultat | null;
    naturbeskyttelse: NaturbeskyttelsesResultat | null;
  };
}) {
  return (
    <div className="space-y-3">
      <ModeToggle />
      <ByggeoenskeAccordion reactiveContext={reactiveContext} />
    </div>
  );
}

function ModeToggle() {
  const { cockpitMode, setCockpitMode } = useProject();
  const modes: Array<{
    value: "kob" | "design";
    label: string;
    icon: typeof ShoppingCart;
    hint: string;
  }> = [
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

function ByggeoenskeAccordion({
  reactiveContext,
}: {
  reactiveContext: {
    geusRisk: GeusRiskData | null;
    servitutter: TinglysningResult | null;
    terrain: TerrainData | null;
    fbbData: FbbResultat | null;
    naturbeskyttelse: NaturbeskyttelsesResultat | null;
  };
}) {
  const { byggeoenske, setByggeoenske } = useProject();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dispensationFor, setDispensationFor] = useState<"etager" | "areal" | null>(null);

  // Debounced patch: opdater store straks (UI reaktiv) — vent 500ms før sync + re-analyse.
  // computePartialUpdate kører øjeblikkeligt client-side (ingen API-kald) så Gauge-felterne
  // opdateres i realtid mens brugeren justerer byggeønsker.
  const patch = (partial: Partial<Byggeoenske>) => {
    setByggeoenske(partial);

    const state = useProject.getState();
    if (state.bbrData) {
      const { complianceMetrics: cm, complianceFlags } = computePartialUpdate({
        bbr: state.bbrData,
        ramme: state.kommuneplanramme,
        lokalplanExtract: state.lokalplanExtract,
        lokalplaner: state.lokalplaner,
        naturbeskyttelse: reactiveContext.naturbeskyttelse,
        geusRisk: reactiveContext.geusRisk,
        servitutter: reactiveContext.servitutter,
        terrain: reactiveContext.terrain,
        fbbData: reactiveContext.fbbData,
        byggeoenske: { ...state.byggeoenske, ...partial },
        municipality: state.address?.kommune ?? "",
        kommunekode: state.address?.kommunekode ?? "",
      });
      state.setComplianceMetrics(cm);
      state.setComplianceFlags(complianceFlags);
    }

    // Beregn boligoenske-validering (etager + areal) mod plangrænser
    const k = state.adressePreCheck?.kontekst;
    const merged = { ...state.byggeoenske, ...partial };
    const valgtEtager = typeof merged.antalEtager === "number" ? merged.antalEtager : null;
    const valgtAreal = typeof merged.oensketAreal === "number" ? merged.oensketAreal : null;
    const eksAreal = state.bbrData?.bebygget_areal ?? 0;
    const grundareal = k?.grundareal ?? state.complianceMetrics?.grundareal ?? null;
    const samletAreal =
      merged.byggetype === "tilbyg" ? eksAreal + (valgtAreal ?? 0) : (valgtAreal ?? eksAreal);
    const beregnetPct =
      grundareal && grundareal > 0 ? (samletAreal / grundareal) * 100 : null;
    const maxPct = k?.maxBebyggelsesprocent ?? state.complianceMetrics?.maxBebyggelsesprocent ?? null;
    const maxEtager = k?.maxEtager ?? state.complianceMetrics?.maxEtager ?? null;
    const etagerStatus: "ok" | "dispensation" | "ingen_data" =
      valgtEtager == null || maxEtager == null
        ? "ingen_data"
        : valgtEtager > maxEtager
          ? "dispensation"
          : "ok";
    const arealStatus: "ok" | "dispensation" | "ingen_data" =
      valgtAreal == null || maxPct == null || beregnetPct == null
        ? "ingen_data"
        : beregnetPct > maxPct
          ? "dispensation"
          : "ok";
    const prev = state.boligoenskeValidering;
    state.setBoligoenskeValidering({
      etagerStatus,
      arealStatus,
      beregnetBebyggelsespct: beregnetPct,
      etagerDispensationAcknowledged:
        etagerStatus === "dispensation" ? (prev?.etagerDispensationAcknowledged ?? false) : false,
      arealDispensationAcknowledged:
        arealStatus === "dispensation" ? (prev?.arealDispensationAcknowledged ?? false) : false,
    });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = { ...useProject.getState().byggeoenske };
      syncPatch({ byggeoenske: next });
    }, 500);
  };

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

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
                      onOpenDispensation={(t) => setDispensationFor(t)}
                      onClearField={() =>
                        patch({ [step.key]: undefined } as Partial<Byggeoenske>)
                      }
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      <DispensationModal
        type={dispensationFor}
        onClose={() => setDispensationFor(null)}
      />
    </Card>
  );
}

// ===========================================================================
// StepExtras — kontekst-chips + inline blocker per spørgsmål (ARCH-127/128)
// ===========================================================================

function StepExtras({
  stepKey,
  value,
  onOpenDispensation,
  onClearField,
}: {
  stepKey: keyof Byggeoenske;
  value: unknown;
  onOpenDispensation: (t: "etager" | "areal") => void;
  onClearField: () => void;
}) {
  const { adressePreCheck, complianceFlags, boligoenskeValidering } = useProject();
  const k = adressePreCheck?.kontekst;

  if (stepKey === "antalEtager") {
    const status = boligoenskeValidering?.etagerStatus;
    const ack = boligoenskeValidering?.etagerDispensationAcknowledged;
    return (
      <div className="mt-1.5 space-y-1.5">
        {k?.maxEtager != null && (
          <div className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-2 py-1 font-mono text-[10px] text-muted-foreground">
            <Info size={10} /> Kommuneplanen tillader: maks {k.maxEtager} etager
          </div>
        )}
        {status === "dispensation" && !ack && (
          <div className="rounded-md border border-danger/40 bg-danger/5 p-2.5 text-xs">
            <div className="flex items-start gap-1.5 text-danger">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">
                  {String(value)} etager er ikke tilladt her
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Kommuneplanen tillader maks {k?.maxEtager} etager. Du kan søge dispensation hos
                  kommunen.
                </div>
              </div>
            </div>
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={onClearField}
                className="rounded border border-border/60 px-2 py-1 font-mono text-[10px] hover:bg-[#1a1a1a]"
              >
                Vælg andet
              </button>
              <button
                onClick={() => onOpenDispensation("etager")}
                className="rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2 py-1 font-mono text-[10px] hover:bg-amber-500/30"
              >
                Fortsæt med dispensation
              </button>
            </div>
          </div>
        )}
        {status === "dispensation" && ack && (
          <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-300">
            <AlertTriangle size={10} /> Dispensation nødvendig — accepteret
          </div>
        )}
      </div>
    );
  }

  if (stepKey === "oensketAreal") {
    const status = boligoenskeValidering?.arealStatus;
    const ack = boligoenskeValidering?.arealDispensationAcknowledged;
    const beregnet = boligoenskeValidering?.beregnetBebyggelsespct;
    return (
      <div className="mt-1.5 space-y-1.5">
        {k?.restBygningsareal != null && (
          <div className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-2 py-1 font-mono text-[10px] text-muted-foreground">
            <Info size={10} /> Dit byggepotentiale: {k.restBygningsareal} m²
          </div>
        )}
        {beregnet != null && k?.maxBebyggelsesprocent != null && (
          <div className="font-mono text-[10px] text-muted-foreground">
            Samlet bebyggelsesprocent:{" "}
            <span
              className={
                beregnet > k.maxBebyggelsesprocent ? "text-danger" : "text-emerald-400"
              }
            >
              {beregnet.toFixed(0)}%
            </span>{" "}
            af maks {k.maxBebyggelsesprocent}%
          </div>
        )}
        {status === "dispensation" && !ack && (
          <div className="rounded-md border border-danger/40 bg-danger/5 p-2.5 text-xs">
            <div className="flex items-start gap-1.5 text-danger">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">{String(value)} m² overstiger dit byggepotentiale</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Samlet: {beregnet?.toFixed(0)}% (maks {k?.maxBebyggelsesprocent}%). Max tilladt:{" "}
                  {k?.restBygningsareal} m² tilbygning.
                </div>
              </div>
            </div>
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={onClearField}
                className="rounded border border-border/60 px-2 py-1 font-mono text-[10px] hover:bg-[#1a1a1a]"
              >
                Juster areal
              </button>
              <button
                onClick={() => onOpenDispensation("areal")}
                className="rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2 py-1 font-mono text-[10px] hover:bg-amber-500/30"
              >
                Fortsæt med dispensation
              </button>
            </div>
          </div>
        )}
        {status === "dispensation" && ack && (
          <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-300">
            <AlertTriangle size={10} /> Dispensation nødvendig — accepteret
          </div>
        )}
      </div>
    );
  }

  if (stepKey === "varmekilde") {
    const tilslutning = complianceFlags.find((f) => f.id === "fjernvarme-tilslutningspligt");
    const mismatch = complianceFlags.find((f) => f.id === "fjernvarme-mismatch-ingen-daekning");
    const cls = tilslutning
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : mismatch
        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
        : "border-border/60 bg-[#111] text-muted-foreground";
    const txt = tilslutning
      ? "Fjernvarme tilgængeligt (mulig tilslutningspligt)"
      : mismatch
        ? "Fjernvarme: Ikke bekræftet på adressen"
        : "Fjernvarme: Status ukendt";
    return (
      <div
        className={`mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] ${cls}`}
      >
        <Flame size={10} /> {txt}
      </div>
    );
  }

  if (stepKey === "tagform" || stepKey === "facademateriale") {
    const hint = complianceFlags.find(
      (f) =>
        f.kilde === "plandata" &&
        f.label.toLowerCase().includes(stepKey === "tagform" ? "tag" : "facade"),
    );
    if (!hint) return null;
    return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-300">
        📋 Lokalplanen specificerer: {hint.detalje ?? hint.label}
      </div>
    );
  }

  return null;
}

function DispensationModal({
  type,
  onClose,
}: {
  type: "etager" | "areal" | null;
  onClose: () => void;
}) {
  const { boligoenskeValidering, setBoligoenskeValidering, adressePreCheck, byggeoenske } =
    useProject();
  const k = adressePreCheck?.kontekst;
  const open = type !== null;

  let kontekstTekst = "";
  let graense = "";
  if (type === "etager") {
    kontekstTekst = `${byggeoenske.antalEtager ?? "—"} etager`;
    graense = `${k?.maxEtager ?? "—"} etager`;
  } else if (type === "areal") {
    kontekstTekst = `${byggeoenske.oensketAreal ?? "—"} m² (${
      boligoenskeValidering?.beregnetBebyggelsespct?.toFixed(0) ?? "—"
    }%)`;
    graense = `${k?.maxBebyggelsesprocent ?? "—"}% bebyggelse`;
  }

  const handleAcknowledge = () => {
    if (!boligoenskeValidering || !type) return onClose();
    setBoligoenskeValidering({
      ...boligoenskeValidering,
      etagerDispensationAcknowledged:
        type === "etager" ? true : boligoenskeValidering.etagerDispensationAcknowledged,
      arealDispensationAcknowledged:
        type === "areal" ? true : boligoenskeValidering.arealDispensationAcknowledged,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-400" /> Dette kræver dispensation
          </DialogTitle>
          <DialogDescription>
            Du har valgt <span className="text-foreground">{kontekstTekst}</span> som overstiger
            kommuneplanens grænse på <span className="text-foreground">{graense}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-foreground">
          <div className="font-medium mb-1.5">En dispensation kræver:</div>
          <ul className="space-y-1 text-muted-foreground list-disc pl-4">
            <li>Ansøgning til kommunen</li>
            <li>Typisk 4–12 ugers behandlingstid</li>
            <li>Ingen garanti for godkendelse</li>
          </ul>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <button
            onClick={onClose}
            className="w-full rounded-md border border-border bg-[#111] px-4 py-2 font-mono text-xs text-foreground hover:bg-[#1a1a1a]"
          >
            Annuller — vælg anderledes
          </button>
          <button
            onClick={handleAcknowledge}
            className="w-full rounded-md bg-amber-500/20 border border-amber-500/50 px-4 py-2 font-mono text-xs text-amber-300 hover:bg-amber-500/30"
          >
            Jeg forstår risikoen — fortsæt
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldEditor({
  step,
  value,
  onChange,
  onOpenDispensation,
  onClearField,
}: {
  step: Step;
  value: unknown;
  onChange: (v: unknown) => void;
  onOpenDispensation: (t: "etager" | "areal") => void;
  onClearField: () => void;
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
      <StepExtras
        stepKey={step.key}
        value={value}
        onOpenDispensation={onOpenDispensation}
        onClearField={onClearField}
      />
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
      {selected?.hint && <p className="mt-1 text-[10px] text-muted-foreground">{selected.hint}</p>}
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
  const { currentProjectId, byggeoenske, setByggeoenske } = useProject();

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      const uploadedUrls: string[] = [];
      const uploadedPaths: string[] = [];
      for (const file of Array.from(files).slice(0, 8 - value.length)) {
        if (userId) {
          if (!currentProjectId) continue;
          try {
            // ARCH-174: gem path (til URL-fornyelse) + signedUrl (til visning)
            const { path, signedUrl } = await uploadInspirationsbillede(currentProjectId, file);
            uploadedUrls.push(signedUrl);
            uploadedPaths.push(path);
          } catch {
            continue;
          }
        } else {
          const reader = new FileReader();
          const b64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          uploadedUrls.push(b64);
        }
      }
      onChange([...value, ...uploadedUrls]);
      if (uploadedPaths.length > 0) {
        setByggeoenske({
          inspirationsbilledePaths: [
            ...(byggeoenske.inspirationsbilledePaths ?? []),
            ...uploadedPaths,
          ],
        });
      }
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
  naboer,
}: {
  bbr: BbrKompliantData | null;
  metrics: ComplianceMetrics | null;
  naboer: NeighborBuildingData | null;
}) {
  return <MatrikelMap bbr={bbr} metrics={metrics} naboer={naboer} />;
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
  geusRisk,
  isRecomputing,
}: {
  bbr: BbrKompliantData | null;
  metrics: ComplianceMetrics | null;
  byggeanalyse: ByggeanalyseResultat | null;
  fbbData: FbbResultat | null;
  vurderingData: VurData | null;
  geusRisk: GeusRiskData | null;
  isRecomputing: boolean;
}) {
  const { byggeoenske, complianceFlags, cockpitMode, heritage_save_value, is_fredet } =
    useProject();

  const grundareal = metrics?.grundareal ?? bbr?.grundareal ?? null;
  const eksisterende = bbr?.bebygget_areal ?? 0;
  const oensket = byggeoenske.oensketAreal ?? 0;
  const samlet =
    byggeoenske.byggetype === "nybyg"
      ? oensket
      : eksisterende + (byggeoenske.byggetype === "tilbyg" ? oensket : 0);
  const beregnetPct = grundareal && samlet > 0 ? (samlet / grundareal) * 100 : null;
  const maxPct = metrics?.maxBebyggelsesprocent ?? null;
  const pctOver = maxPct !== null && beregnetPct !== null && beregnetPct > maxPct;
  const pctValue =
    beregnetPct !== null && maxPct !== null ? Math.min(100, (beregnetPct / maxPct) * 100) : 0;

  const etager = (byggeoenske.antalEtager as number | undefined) ?? null;
  const maxEtager = metrics?.maxEtager ?? null;
  const etagerOver = etager !== null && maxEtager !== null && etager > maxEtager;
  const etagerValue = etager !== null && maxEtager ? Math.min(100, (etager / maxEtager) * 100) : 0;

  const estHoejde = etager ? etager * 3 : null;
  const maxHoejde = metrics?.maxBygningshoejde ?? null;
  const hoejdeOver = maxHoejde !== null && estHoejde !== null && estHoejde > maxHoejde;
  const hoejdeValue =
    estHoejde !== null && maxHoejde !== null ? Math.min(100, (estHoejde / maxHoejde) * 100) : 0;

  const totalpris = useMemo(() => estimerTotalpris(byggeoenske), [byggeoenske]);
  const animatedPris = useAnimatedNumber(totalpris ?? 0, 600);

  const konflikter = byggeanalyse?.konflikt.length ?? 0;
  const dispensationer = byggeanalyse?.kraever_dispensation.length ?? 0;

  // Usynlige Budgetrisici — afledt fra complianceFlags (ARCH-176).
  // Ingen direkte fbbData/bbr-checks — single source of truth er store.
  const RISICI_FLAG_IDS = new Set([
    "save-bevaringsvaerdi",
    "bbr-fredet",
    "fredet",
    "geus-radon",
    "geus-grundvand",
    "mat-fredskov",
    "mat-strandbeskyttelse",
    "mat-klitfredning",
    "naturbeskyttelse-strandbeskyttelse",
    "dkjord-v2",
    "dkjord-v1",
  ]);
  const flagRisici = complianceFlags
    .filter((f) => RISICI_FLAG_IDS.has(f.id) || f.kilde === "geus" || f.kilde === "dkjord")
    .map((f) => ({
      key: f.id,
      label: f.label,
      severity: f.status === "blocker" ? ("high" as const) : ("med" as const),
      detalje: f.detalje ?? "",
    }));

  // ARCH-162: augment med typede store-felter — vises selv ved page refresh (ingen pipeline re-run)
  const flagKeys = new Set(flagRisici.map((r) => r.key));
  const storeRisici: typeof flagRisici = [];
  if (
    heritage_save_value !== null &&
    heritage_save_value <= 3 &&
    !flagKeys.has("save-bevaringsvaerdi") &&
    !flagKeys.has("regelkerne-save_1_3_demolition")
  ) {
    storeRisici.push({
      key: "save",
      label: `SAVE ${heritage_save_value}/9 — Høj bevaringsværdi`,
      severity: "high",
      detalje: "Nedrivning/ombygning kræver kommunens tilladelse (Planlovens §14).",
    });
  }
  if (heritage_save_value === 4 && !flagKeys.has("regelkerne-save_4_paragraph14_risk")) {
    storeRisici.push({
      key: "save-4",
      label: "SAVE 4/9 — §14-forbud risiko",
      severity: "med",
      detalje: "Kommunen kan nedlægge §14-forbud mod nedrivning. Kontakt teknisk forvaltning.",
    });
  }
  if (
    is_fredet === true &&
    !flagKeys.has("bbr-fredet") &&
    !flagKeys.has("regelkerne-listed_building_demolition")
  ) {
    storeRisici.push({
      key: "fredet",
      label: "Fredet bygning",
      severity: "high",
      detalje: "Alle ændringer kræver tilladelse fra Slots- og Kulturstyrelsen.",
    });
  }
  const risici = [...storeRisici, ...flagRisici];

  const inKobMode = cockpitMode === "kob";

  return (
    <div className="space-y-4">
      {/* TOTALPRIS — øverst, store fede typer */}
      <Card className={cn("p-0 overflow-hidden", inKobMode ? "" : "ring-1 ring-emerald-500/20")}>
        <div className="px-4 py-2.5 border-b border-border/40 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
          ESTIMERET TOTALPRIS
        </div>
        <div className="p-4">
          {totalpris === null ? (
            <div className="text-sm text-muted-foreground">Vælg areal for at estimere</div>
          ) : (
            <>
              <div className="font-mono text-[34px] leading-none font-bold text-accent tabular-nums">
                {formatDKK(animatedPris)}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                ~{Math.round(totalpris / (byggeoenske.oensketAreal ?? 1)).toLocaleString("da-DK")}{" "}
                kr/m² · ekskl. grundkøb
              </div>
              <BudgetBreakdown />
            </>
          )}
        </div>
      </Card>

      {/* USYNLIGE BUDGETRISICI */}
      <Card className={cn("p-0 overflow-hidden", inKobMode ? "ring-1 ring-yellow-500/40" : "")}>
        <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between">
          <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
            USYNLIGE BUDGETRISICI
          </div>
          {inKobMode && risici.length > 0 && (
            <span className="font-mono text-[10px] text-yellow-400">{risici.length} fundet</span>
          )}
        </div>
        <div className="p-4 space-y-2">
          {risici.length === 0 ? (
            <div className="text-xs text-emerald-400 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Ingen kendte skjulte risici
            </div>
          ) : (
            risici.map((r) => (
              <div
                key={r.key}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs",
                  r.severity === "high"
                    ? "border-danger/40 bg-danger/5 text-danger"
                    : "border-yellow-500/40 bg-yellow-500/5 text-yellow-300",
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium">{r.label}</div>
                    <div className="opacity-80 mt-0.5">{r.detalje}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* COMPLIANCE GAUGES */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between">
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

      {vurderingData && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/40 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
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
