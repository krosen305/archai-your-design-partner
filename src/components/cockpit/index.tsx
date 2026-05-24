import { useMemo, useRef, useState } from "react";
import { useAnimatedNumber } from "@/hooks/use-animated-number";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Upload,
  X,
  ShoppingCart,
  Home,
  AlertTriangle,
  Flame,
  Info,
} from "lucide-react";
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
import { useProject } from "@/lib/project-store";
import type { Byggeoenske } from "@/types/project-state";
import {
  STEPS,
  STEP_GROUPS,
  estimerTotalpris,
  type Step,
  type Option,
} from "@/lib/byggeoenske-steps";
import { syncPatch } from "@/lib/project-sync";
import { useCockpitByggeoensker, type ReactiveContext } from "@/lib/use-cockpit-byggeoensker";
import { useCockpitUpload } from "@/lib/use-cockpit-upload";
import type { NeighborBuildingData, VurData } from "@/domain/contracts/analysis.types";
import type {
  RuleEngineBbrData,
  RuleEngineDkJordResultat,
  RuleEngineFbbResult,
  RuleEngineGeusRiskData,
  RuleEngineNaturbeskyttelsesResultat,
  RuleEngineTerrainData,
  RuleEngineTinglysningResult,
} from "@/domain/contracts/rule-engine.types";
import type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
import type { ComplianceMetrics } from "@/lib/compliance-engine";

import { useCockpitMode } from "@/lib/use-cockpit-mode";
import { buildInvisibleBudgetRisks } from "@/lib/compliance-view-model";
import { buildStepConstraintViewModel } from "@/lib/byggeoenske-constraint-view-model";
import { useDispensationFlow } from "@/hooks/useDispensationFlow";
import {
  calculateProjectedSamletAreal,
  calculateProjectedBebyggelsespct,
} from "@/lib/compliance-projection";
import { cn } from "@/lib/utils";
import { MatrikelMap } from "@/components/cockpit/MatrikelMap";

// ---------------------------------------------------------------------------
// Cockpit — 3-kolonne dashboard for byggeanalyse
// ---------------------------------------------------------------------------

export type CockpitProps = {
  bbr: RuleEngineBbrData | null;
  metrics: ComplianceMetrics | null;
  byggeanalyse: ByggeanalyseResultat | null;
  fbbData: RuleEngineFbbResult | null;
  vurderingData: VurData | null;
  geusRisk: RuleEngineGeusRiskData | null;
  naboer: NeighborBuildingData | null;
  servitutter: RuleEngineTinglysningResult | null;
  terrain: RuleEngineTerrainData | null;
  naturbeskyttelse: RuleEngineNaturbeskyttelsesResultat | null;
  dkjord: RuleEngineDkJordResultat | null;
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
  dkjord,
  isRecomputing,
}: CockpitProps) {
  const reactiveContext = useMemo(
    () => ({ geusRisk, servitutter, terrain, fbbData, naturbeskyttelse, dkjord }),
    [geusRisk, servitutter, terrain, fbbData, naturbeskyttelse, dkjord],
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

export function ProjektDnaPanel({
  reactiveContext,
}: {
  reactiveContext: {
    geusRisk: RuleEngineGeusRiskData | null;
    servitutter: RuleEngineTinglysningResult | null;
    terrain: RuleEngineTerrainData | null;
    fbbData: RuleEngineFbbResult | null;
    naturbeskyttelse: RuleEngineNaturbeskyttelsesResultat | null;
    dkjord: RuleEngineDkJordResultat | null;
  };
}) {
  return <ByggeoenskeAccordion reactiveContext={reactiveContext} />;
}

// ===========================================================================
// LEFT — Accordion med 22 byggeønsker + debounced patch
// ===========================================================================

function ByggeoenskeAccordion({ reactiveContext }: { reactiveContext: ReactiveContext }) {
  const { byggeoenske } = useProject();
  const { patch } = useCockpitByggeoensker(reactiveContext);
  const { dispensationFor, open: openDispensation, acknowledge, close: closeDispensation } = useDispensationFlow();

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
                      onOpenDispensation={(t) => openDispensation(t)}
                      onClearField={() => patch({ [step.key]: undefined } as Partial<Byggeoenske>)}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      <DispensationModal type={dispensationFor} onAcknowledge={acknowledge} onClose={closeDispensation} />
    </Card>
  );
}

// ===========================================================================
// StepExtras — kontekst-chips + inline blocker per spørgsmål
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
  const { complianceFlags, boligoenskeValidering } = useProject();

  const vm = buildStepConstraintViewModel(
    stepKey,
    value,
    boligoenskeValidering,
    null,
    complianceFlags,
  );

  if (!vm.contextChip && !vm.dispensation && !vm.fjernvarme && !vm.lokalplanHint) return null;

  return (
    <div className="mt-1.5 space-y-1.5">
      {vm.contextChip && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-2 py-1 font-mono text-[10px] text-muted-foreground">
          <Info size={10} /> {vm.contextChip}
        </div>
      )}

      {vm.dispensation?.needed && (
        <div className="rounded-md border border-danger/40 bg-danger/5 p-2.5 text-xs">
          <div className="flex items-start gap-1.5 text-danger">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">{vm.dispensation.kontekst}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Grænse: {vm.dispensation.graense}
                {vm.dispensation.beregnetPct != null &&
                  ` · Beregnet: ${vm.dispensation.beregnetPct.toFixed(0)}%`}
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
              onClick={() =>
                onOpenDispensation(stepKey === "antalEtager" ? "etager" : "areal")
              }
              className="rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2 py-1 font-mono text-[10px] hover:bg-amber-500/30"
            >
              Fortsæt med dispensation
            </button>
          </div>
        </div>
      )}

      {vm.dispensation?.acked && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-300">
          <AlertTriangle size={10} /> Dispensation nødvendig — accepteret
        </div>
      )}

      {vm.fjernvarme && (
        <div
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] ${
            vm.fjernvarme === "tilgaengelig"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : vm.fjernvarme === "mismatch"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-border/60 bg-[#111] text-muted-foreground"
          }`}
        >
          <Flame size={10} />
          {vm.fjernvarme === "tilgaengelig"
            ? "Fjernvarme tilgængeligt (mulig tilslutningspligt)"
            : vm.fjernvarme === "mismatch"
              ? "Fjernvarme: Ikke bekræftet på adressen"
              : "Fjernvarme: Status ukendt"}
        </div>
      )}

      {vm.lokalplanHint && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-300">
          📋 Lokalplanen specificerer: {vm.lokalplanHint}
        </div>
      )}
    </div>
  );
}

function DispensationModal({
  type,
  onAcknowledge,
  onClose,
}: {
  type: "etager" | "areal" | null;
  onAcknowledge: (type: "etager" | "areal") => void;
  onClose: () => void;
}) {
  const { boligoenskeValidering, byggeoenske, complianceMetrics } = useProject();
  const open = type !== null;

  let kontekstTekst = "";
  let graense = "";
  if (type === "etager") {
    kontekstTekst = `${byggeoenske.antalEtager ?? "—"} etager`;
    graense = `${complianceMetrics?.maxEtager ?? "—"} etager`;
  } else if (type === "areal") {
    kontekstTekst = `${byggeoenske.oensketAreal ?? "—"} m² (${
      boligoenskeValidering?.beregnetBebyggelsespct?.toFixed(0) ?? "—"
    }%)`;
    graense = `${complianceMetrics?.maxBebyggelsesprocent ?? "—"}% bebyggelse`;
  }

  const handleAcknowledge = () => {
    if (!type) return onClose();
    onAcknowledge(type);
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
  const { uploading, handleFiles: uploadFiles } = useCockpitUpload();

  const handleFiles = async (files: FileList | null) => {
    const newUrls = await uploadFiles(files, value);
    if (newUrls.length > 0) onChange([...value, ...newUrls]);
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
  bbr: RuleEngineBbrData | null;
  metrics: ComplianceMetrics | null;
  naboer: NeighborBuildingData | null;
}) {
  return (
    <MatrikelMap
      bbr={bbr}
      metrics={metrics}
      naboer={naboer}
      jordstykkeLokalId={bbr?.jordstykke_lokal_id ?? null}
    />
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
  geusRisk,
  isRecomputing,
}: {
  bbr: RuleEngineBbrData | null;
  metrics: ComplianceMetrics | null;
  byggeanalyse: ByggeanalyseResultat | null;
  fbbData: RuleEngineFbbResult | null;
  vurderingData: VurData | null;
  geusRisk: RuleEngineGeusRiskData | null;
  isRecomputing: boolean;
}) {
  const { byggeoenske, complianceFlags, heritage_save_value, is_fredet } = useProject();
  const [mode] = useCockpitMode();

  const grundareal = metrics?.grundareal ?? bbr?.grundareal ?? null;
  const eksisterende = bbr?.bebygget_areal ?? null;
  const nuvaerendePct = bbr?.bebyggelsesprocent ?? null;
  const nuvaerendeEtager = bbr?.antal_etager ?? null;
  const oensket = byggeoenske.oensketAreal ?? 0;
  const samlet = calculateProjectedSamletAreal(byggeoenske.byggetype, oensket, eksisterende);
  const beregnetPct = calculateProjectedBebyggelsespct(samlet, grundareal);
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

  const risici = useMemo(
    () =>
      buildInvisibleBudgetRisks({
        complianceFlags,
        heritageSaveValue: heritage_save_value,
        isFredet: is_fredet,
      }),
    [complianceFlags, heritage_save_value, is_fredet],
  );

  const inKobMode = mode === "due-diligence";

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
          {bbr && (
            <div className="rounded-md border border-border/50 bg-[#0f0f0f] p-3">
              <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                Nuværende bygning
              </div>
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Grundareal</span>
                  <span className="font-mono text-foreground tabular-nums">
                    {grundareal != null ? `${grundareal} m²` : "Ikke registreret"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Bebygget</span>
                  <span className="font-mono text-foreground tabular-nums">
                    {eksisterende != null
                      ? `${eksisterende} m²${nuvaerendePct != null ? ` (${nuvaerendePct}%)` : ""}`
                      : "Ikke registreret"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Etager</span>
                  <span className="font-mono text-foreground tabular-nums">
                    {nuvaerendeEtager != null ? `${nuvaerendeEtager}` : "Ikke registreret"}
                  </span>
                </div>
              </div>
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
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
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
