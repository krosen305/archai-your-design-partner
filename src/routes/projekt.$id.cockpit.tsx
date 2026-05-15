import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  ScrollText,
  Cpu,
  Check,
  AlertTriangle,
  Info,
  ExternalLink,
  Map,
  Sparkles,
  Flame,
  Home as HomeIcon,
  XCircle,
} from "lucide-react";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useProject, deriveComplianceFlags } from "@/lib/project-store";
import { calculateComplianceMetrics } from "@/lib/compliance-engine";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan } from "@/integrations/plandata/client";
import type { ComplianceResult } from "@/lib/analysis-orchestrator";
import type { ByggeanalyseInput, ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { SaveData } from "@/integrations/save/client";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { syncPatch, restoreProject } from "@/lib/project-sync";
import { useCockpitMode } from "@/lib/use-cockpit-mode";
import { Cockpit } from "@/components/cockpit";
import { AiDesignHero } from "@/components/cockpit/AiDesignHero";
import { ComplianceFeed } from "@/components/cockpit/ComplianceFeed";
import { RiskOverview } from "@/components/cockpit/RiskOverview";
import { AnimatedNumber } from "@/components/cockpit/AnimatedNumber";
import { EjendomPanel } from "@/components/cockpit/EjendomPanel";
import { OekonomiPanel } from "@/components/cockpit/OekonomiPanel";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { estimerTotalpris, STEPS, STEP_GROUPS } from "@/lib/byggeoenske-steps";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const analysisInputSchema = z.object({
  addressId: z.string().min(1).max(64),
  adgangsadresseid: z.string().min(1).max(64),
  ejerlavskode: z.number().int().nullable(),
  matrikelnummer: z.string().max(32).nullable(),
  koordinater: z
    .object({
      lat: z.number().gte(-90).lte(90),
      lng: z.number().gte(-180).lte(180),
    })
    .nullable(),
  grundareal: z.number().positive().nullable().optional(),
  token: z.string().min(1),
});

const fetchCompliance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => analysisInputSchema.parse(data))
  .handler(async ({ data }): Promise<ComplianceResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(data.token);
    if (authError || !authData.user) throw new Response("Uautoriseret", { status: 401 });

    const { token: _token, ...analysisInput } = data;
    const { analyseAddress } = await import("@/lib/analysis-orchestrator");
    return analyseAddress(analysisInput);
  });

const runByggeanalyse = createServerFn({ method: "POST" })
  .inputValidator((data: ByggeanalyseInput & { token: string }) => {
    if (!data.token || typeof data.token !== "string") throw new Error("Token er påkrævet");
    return data;
  })
  .handler(async ({ data }): Promise<ByggeanalyseResultat> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(data.token);
    if (authError || !authData.user) throw new Response("Uautoriseret", { status: 401 });

    const { token: _token, ...analysisInput } = data;

    let ruleEngineResult: import("@/lib/rule-engine/types").RuleEngineResult | undefined;
    try {
      const { assembleRuleEngineInput } = await import("@/lib/rule-engine/input-assembler");
      const { runRuleEngine } = await import("@/lib/rule-engine/engine");
      const { input: ruleInput, missingFields } = assembleRuleEngineInput({
        bbr: analysisInput.bbr,
        kommuneplanramme: analysisInput.kommuneplanramme ?? null,
        lokalplaner: analysisInput.lokalplaner ?? [],
        lokalplanExtract: analysisInput.lokalplanExtract,
        naturbeskyttelse: analysisInput.naturbeskyttelse ?? null,
        geusRisk: analysisInput.geusRisk ?? null,
        servitutter: analysisInput.servitutter ?? null,
        terrain: analysisInput.terrain ?? null,
        fbbData: null,
        byggeoenske: analysisInput.byggeoenske,
        municipality: analysisInput.municipality ?? "",
        kommunekode: analysisInput.kommunekode ?? "",
      });
      ruleEngineResult = runRuleEngine(ruleInput, missingFields);
    } catch (e) {
      logger.warn("[ByggeanalyseService] Regelkerne fejlede (ikke kritisk):", (e as Error).message);
    }

    const { ByggeanalyseService } = await import("@/integrations/ai/byggeanalyse");
    return ByggeanalyseService.analyse({ ...analysisInput, ruleEngineResult });
  });

function HardStopBanner() {
  const { hard_stop, hard_stop_reason } = useProject();

  if (!hard_stop) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-3">
      <XCircle size={14} className="mt-0.5 shrink-0 text-danger" />
      <div className="text-xs leading-relaxed text-danger/90">
        <span className="font-mono tracking-[0.1em] text-danger">HARD STOP</span>
        <div className="mt-1">{hard_stop_reason ?? "Matriklen har et blokerende forhold."}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

type CockpitTab = "analyse" | "ejendom" | "oekonomi";

const VALID_TABS: readonly CockpitTab[] = ["analyse", "ejendom", "oekonomi"];

export const Route = createFileRoute("/projekt/$id/cockpit")({
  component: CockpitPage,
  validateSearch: (search: Record<string, unknown>) => {
    const tab = search.tab;
    return {
      tab: typeof tab === "string" && (VALID_TABS as readonly string[]).includes(tab)
        ? (tab as CockpitTab)
        : ("analyse" as CockpitTab),
    };
  },
});

const LOADING_ROWS = [
  { icon: FileText, label: "Henter BBR-data", durationMs: 800 },
  { icon: ScrollText, label: "Læser bygningsregister", durationMs: 1600 },
  { icon: Map, label: "Henter lokalplandata", durationMs: 2000 },
  { icon: Cpu, label: "Beregner compliance", durationMs: 2600 },
];

type Status = "loading" | "done" | "error";

// ---------------------------------------------------------------------------
// Auth wrapper
// ---------------------------------------------------------------------------

function CockpitPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getSession, isGuest } = await import("@/lib/auth");
      const session = await getSession();
      if (cancelled) return;
      setNeedsLogin(!session && !isGuest());
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (authChecked && needsLogin) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-[560px] px-6 py-16">
          <div className="mb-6">
            <BackLink to="/projekt/adresse" />
          </div>
          <Card className="text-center">
            <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
              LOGIN PÅKRÆVET
            </div>
            <h2 className="text-xl text-foreground mb-2">Cockpit kræver konto</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Vi henter data fra BBR og Plandata til din analyse. Opret en gratis konto for at
              fortsætte.
            </p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground hover:brightness-110 transition-all"
            >
              Log ind eller opret konto →
            </button>
            {import.meta.env.DEV && (
              <button
                onClick={() => setNeedsLogin(false)}
                className="mt-3 w-full inline-flex items-center justify-center rounded-md border border-dashed border-accent/40 bg-accent/5 px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-accent hover:bg-accent/10 transition-colors"
              >
                ⚡ DEV: Spring login over
              </button>
            )}
          </Card>
        </div>
      </PageTransition>
    );
  }

  if (!authChecked) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
          <div className="font-mono text-xs text-muted-foreground">Tjekker login...</div>
        </div>
      </PageTransition>
    );
  }

  if (id === "frit") return <FreeDesignCockpit />;
  return <CockpitContent adresseId={id} />;
}

// ---------------------------------------------------------------------------
// Frit design — uden grund/adresse. Slim cockpit: AI-hero + byggeønsker + estimat.
// ---------------------------------------------------------------------------

function FreeDesignCockpit() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <div className="mb-6">
          <BackLink to="/projekt/adresse" />
        </div>

        <div className="mb-6">
          <div className="font-mono text-[10px] tracking-[0.2em] text-accent mb-1">
            DESIGN UDEN GRUND
          </div>
          <h1 className="text-[24px] font-medium text-foreground">Drøm dit hjem</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Uden adresse viser vi ikke compliance-data. Tilføj en adresse senere for at se
            byggeretten på en konkret matrikel.
          </p>
        </div>

        <AiDesignHero />

        <div className="grid gap-6 lg:grid-cols-[minmax(280px,1fr)_minmax(280px,360px)]">
          <FreeByggeoenskeAccordion />
          <FreeBudgetEstimat />
        </div>
      </div>
    </PageTransition>
  );
}

function FreeByggeoenskeAccordion() {
  const { byggeoenske, setByggeoenske } = useProject();
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
        BYGGEØNSKER
      </div>
      <Accordion type="multiple" defaultValue={["Grundlæggende"]} className="px-2">
        {STEP_GROUPS.map((group) => {
          const groupSteps = STEPS.filter((s) => s.group === group);
          if (groupSteps.length === 0) return null;
          return (
            <AccordionItem key={group} value={group} className="border-border/40">
              <AccordionTrigger className="px-2 hover:no-underline">
                <span className="text-sm font-medium">{group}</span>
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-3">
                <div className="space-y-3">
                  {groupSteps.map((step) => {
                    const value = byggeoenske[step.key];
                    if (step.type === "choice") {
                      return (
                        <div key={step.key as string}>
                          <label className="block text-[11px] font-mono uppercase tracking-wide text-muted-foreground mb-1">
                            {step.title}
                          </label>
                          <select
                            value={value === undefined ? "" : String(value)}
                            onChange={(e) => {
                              const opt = step.options!.find(
                                (o) => String(o.value) === e.target.value,
                              );
                              if (opt) setByggeoenske({ [step.key]: opt.value } as never);
                            }}
                            className="w-full rounded-md border border-border/60 bg-[#111] px-3 py-2 font-mono text-xs text-foreground"
                          >
                            <option value="" disabled>
                              Vælg…
                            </option>
                            {step.options!.map((o) => (
                              <option key={String(o.value)} value={String(o.value)}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    if (step.type === "number") {
                      const v = (value as number) ?? step.min!;
                      return (
                        <div key={step.key as string}>
                          <div className="flex items-baseline justify-between mb-1">
                            <label className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                              {step.title}
                            </label>
                            <span className="font-mono text-sm text-accent">
                              {v}
                              {step.unit ? ` ${step.unit}` : ""}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={step.min}
                            max={step.max}
                            value={v}
                            onChange={(e) =>
                              setByggeoenske({
                                [step.key]: Number(e.target.value),
                              } as never)
                            }
                            className="w-full accent-accent"
                          />
                        </div>
                      );
                    }
                    if (step.type === "toggle") {
                      return (
                        <div key={step.key as string} className="flex items-center justify-between">
                          <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                            {step.title}
                          </span>
                          <div className="flex gap-1">
                            {[true, false].map((b) => (
                              <button
                                key={String(b)}
                                onClick={() => setByggeoenske({ [step.key]: b } as never)}
                                className={cn(
                                  "rounded-md border px-3 py-1 font-mono text-xs",
                                  value === b
                                    ? "border-accent bg-accent/10 text-accent"
                                    : "border-border/60 text-foreground",
                                )}
                              >
                                {b ? "Ja" : "Nej"}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </Card>
  );
}

function FreeBudgetEstimat() {
  const { byggeoenske } = useProject();
  const totalpris = estimerTotalpris(byggeoenske);
  return (
    <Card className="p-0 overflow-hidden h-fit">
      <div className="px-4 py-3 border-b border-border/40 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
        ESTIMERET TOTALPRIS
      </div>
      <div className="p-4">
        {totalpris === null ? (
          <div className="text-sm text-muted-foreground">Vælg areal for at estimere</div>
        ) : (
          <>
            <div className="font-mono text-[28px] leading-none font-bold text-accent tabular-nums">
              {totalpris >= 1_000_000
                ? `${(totalpris / 1_000_000).toFixed(2)} mio. kr`
                : `${totalpris.toLocaleString("da-DK")} kr`}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              ~{Math.round(totalpris / (byggeoenske.oensketAreal ?? 1)).toLocaleString("da-DK")}{" "}
              kr/m² · ekskl. grundkøb
            </div>
          </>
        )}
        <div className="mt-4 pt-4 border-t border-border/40 text-[11px] text-muted-foreground">
          Tilføj en adresse for at se compliance, lokalplan og ejendomsdata.
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main cockpit content
// ---------------------------------------------------------------------------

function CockpitContent({ adresseId }: { adresseId: string }) {
  const navigate = useNavigate();
  const { tab: activeTab } = Route.useSearch();
  const setActiveTab = useCallback(
    (next: CockpitTab) => {
      navigate({
        to: "/projekt/$id/cockpit",
        params: { id: adresseId },
        search: { tab: next },
        replace: false,
      });
    },
    [navigate, adresseId],
  );
  const [mode, setMode] = useCockpitMode();

  const {
    address,
    bbrData,
    byggeoenske,
    complianceMetrics,
    vurderingData,
    setBbrData,
    setComplianceDone,
    setComplianceFlags,
    setComplianceMetrics,
    setLokalplaner,
    setLokalplanExtract,
    setPhase,
    setKommuneplanramme,
    setVurderingData,
    setByggeanalyseResultat,
    byggeanalyseResultat,
  } = useProject();

  const [status, setStatus] = useState<Status>(bbrData ? "done" : "loading");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lokalplanerLocal, setLokalplanerLocal] = useState<Lokalplan[]>([]);
  const [geusRiskLocal, setGeusRiskLocal] = useState<GeusRiskData | null>(null);
  const [servitutterLocal, setServitutterLocal] = useState<TinglysningResult | null>(null);
  const [terrainLocal, setTerrainLocal] = useState<TerrainData | null>(null);
  const [saveLocal, setSaveLocal] = useState<SaveData | null>(null);
  const [fjernvarmeLocal, setFjernvarmeLocal] = useState<FjernvarmeResultat | null>(null);
  const [naboerLocal, setNaboerLocal] = useState<NeighborBuildingData | null>(null);
  const [fbbDataLocal, setFbbDataLocal] = useState<
    import("@/integrations/fbb/client").FbbResultat | null
  >(null);
  const [naturbeskyttelsesLocal, setNaturbeskyttelsesLocal] =
    useState<NaturbeskyttelsesResultat | null>(null);
  const [isRecomputing, setIsRecomputing] = useState(false);

  useEffect(() => {
    if (!bbrData) return;
    if (
      geusRiskLocal ||
      servitutterLocal ||
      terrainLocal ||
      saveLocal ||
      fjernvarmeLocal ||
      naboerLocal ||
      fbbDataLocal ||
      naturbeskyttelsesLocal
    ) {
      return;
    }

    (async () => {
      const currentProjectId = useProject.getState().currentProjectId;
      const persisted = await restoreProject(currentProjectId);
      if (!persisted) return;

      // ARCH-164: typede kolonner er ground truth — læses uafhængigt af JSONB
      const store = useProject.getState();
      if (persisted.heritage_save_value != null)
        store.setHeritageSaveValue(persisted.heritage_save_value);
      if (persisted.is_fredet != null) store.setIsFredet(persisted.is_fredet);
      store.setHardStop(persisted.hard_stop ?? false, persisted.hard_stop_reason ?? null);

      // JSONB fallback for felter uden typede kolonner (geusRisk, terrain, naboer, etc.)
      const complianceData =
        persisted.compliance_data && typeof persisted.compliance_data === "object"
          ? (persisted.compliance_data as Record<string, unknown>)
          : null;
      if (!complianceData) return;

      setGeusRiskLocal((complianceData.geusRisk as GeusRiskData | null) ?? null);
      setServitutterLocal((complianceData.servitutter as TinglysningResult | null) ?? null);
      setTerrainLocal((complianceData.terrain as TerrainData | null) ?? null);
      setSaveLocal((complianceData.save as SaveData | null) ?? null);
      setFjernvarmeLocal((complianceData.fjernvarme as FjernvarmeResultat | null) ?? null);
      setNaboerLocal((complianceData.naboer as NeighborBuildingData | null) ?? null);
      setFbbDataLocal(
        (complianceData.fbbData as import("@/integrations/fbb/client").FbbResultat | null) ?? null,
      );
      setNaturbeskyttelsesLocal(
        (complianceData.naturbeskyttelse as NaturbeskyttelsesResultat | null) ?? null,
      );
      // ARCH-148: restore byggeanalyseResultat efter reload
      if (complianceData.byggeanalyseResultat) {
        store.setByggeanalyseResultat(
          complianceData.byggeanalyseResultat as import("@/integrations/ai/byggeanalyse").ByggeanalyseResultat,
        );
      }
    })();
  }, [
    bbrData,
    geusRiskLocal,
    servitutterLocal,
    terrainLocal,
    saveLocal,
    fjernvarmeLocal,
    naboerLocal,
    fbbDataLocal,
    naturbeskyttelsesLocal,
  ]);

  const runManualAnalyse = useCallback(async () => {
    if (!bbrData || !address) return;
    setIsRecomputing(true);
    try {
      const { getSession } = await import("@/lib/auth");
      const session = await getSession();
      if (!session) {
        setIsRecomputing(false);
        return;
      }
      const state = useProject.getState();
      const lpNavn =
        state.lokalplaner[0]?.plannavn ?? state.lokalplaner[0]?.plannr ?? "Ukendt lokalplan";
      const analyse = await runByggeanalyse({
        data: {
          token: session.access_token,
          byggeoenske: state.byggeoenske,
          lokalplanExtract: state.lokalplanExtract,
          bbr: bbrData,
          lokalplanNavn: lpNavn,
          kommuneplanramme: state.kommuneplanramme,
          lokalplaner: state.lokalplaner,
          municipality: address.kommune ?? "",
          kommunekode: address.kommunekode ?? "",
        },
      });
      setByggeanalyseResultat(analyse);
      syncPatch({ byggeanalyseResultat: analyse });
    } catch (e) {
      logger.warn("[Cockpit] manuel AI-analyse fejlede:", e);
    } finally {
      setIsRecomputing(false);
    }
  }, [bbrData, address, setByggeanalyseResultat]);

  useEffect(() => {
    if (bbrData) {
      setStatus("done");
      return;
    }

    if (!address?.adresseid) {
      navigate({ to: "/projekt/adresse" });
      return;
    }

    const MIN_LOADING_MS = 2800;
    const startTime = Date.now();

    (async () => {
      const { getSession, isGuest } = await import("@/lib/auth");
      const session = await getSession();

      if (!session) {
        const guest = isGuest();
        const remaining = Math.max(0, MIN_LOADING_MS - (Date.now() - startTime));
        setTimeout(() => {
          setFetchError(
            guest
              ? "Start fra adresse-trinnet som gæst for at hente grunddata."
              : "Login krævet - log ind for at hente analyse.",
          );
          setStatus("error");
        }, remaining);
        return;
      }

      fetchCompliance({
        data: {
          addressId: address.adresseid,
          adgangsadresseid: address.adgangsadresseid,
          ejerlavskode: address.ejerlavskode ?? null,
          matrikelnummer: address.matrikelnummer ?? null,
          koordinater: address.koordinater ?? null,
          grundareal: address.grundareal ?? null,
          token: session.access_token,
        },
      })
        .then(async (result) => {
          setBbrData(result.bbr);
          setLokalplanerLocal(result.lokalplaner);
          setLokalplaner(result.lokalplaner);
          setLokalplanExtract(result.lokalplanExtract);
          setKommuneplanramme(result.kommuneplanramme);
          setGeusRiskLocal(result.geusRisk ?? null);
          setServitutterLocal(result.servitutter ?? null);
          setTerrainLocal(result.terrain ?? null);
          setSaveLocal(result.save ?? null);
          setFjernvarmeLocal(result.fjernvarme ?? null);
          setNaboerLocal(result.naboer ?? null);
          setFbbDataLocal(result.fbbData ?? null);
          setNaturbeskyttelsesLocal(result.naturbeskyttelse ?? null);
          setVurderingData(result.vurderingData ?? null);
          const flags = deriveComplianceFlags(
            result.bbr,
            result.kommuneplanramme,
            result.naturbeskyttelse,
            result.dkjord,
            result.geusRisk,
          );
          setComplianceFlags(flags);
          setComplianceMetrics(calculateComplianceMetrics(result.bbr, result.kommuneplanramme));
          setComplianceDone(true);
          setPhase("hus-dna", "complete");
          setPhase("match", "complete");
          syncPatch({
            bbrData: result.bbr,
            complianceFlags: flags,
            lokalplaner: result.lokalplaner,
            kommuneplanramme: result.kommuneplanramme,
            naturbeskyttelse: result.naturbeskyttelse,
            dkjord: result.dkjord,
            geusRisk: result.geusRisk,
            servitutter: result.servitutter,
            terrain: result.terrain,
            naboer: result.naboer,
            fjernvarme: result.fjernvarme,
            save: result.save,
            fbbData: result.fbbData,
            byggeanalyseResultat: byggeanalyseResultat,
            vurderingData: result.vurderingData,
            complianceDone: true,
            currentStep: "byggeanalyse",
          });

          const remaining = Math.max(0, MIN_LOADING_MS - (Date.now() - startTime));
          setTimeout(() => setStatus("done"), remaining);
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error("[Compliance] pipeline fejlede:", msg);
          const remaining = Math.max(0, MIN_LOADING_MS - (Date.now() - startTime));
          setTimeout(() => {
            setFetchError(
              msg.startsWith("ArchAI: manglende") ? msg : "BBR-data kunne ikke hentes. Prøv igen.",
            );
            setStatus("error");
          }, remaining);
        });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageTransition>
      <div
        className={`mx-auto px-6 py-10 ${status === "done" ? "max-w-[1400px]" : "max-w-[720px]"}`}
      >
        <div className="mb-6">
          <BackLink to="/projekt/adresse" />
        </div>

        {status === "loading" && <LoadingView />}

        {status === "error" && (
          <ErrorView
            message={fetchError ?? "Ukendt fejl."}
            onRetry={() => {
              setFetchError(null);
              setBbrData(null);
              setComplianceDone(false);
              setStatus("loading");
            }}
          />
        )}

        {status === "done" && bbrData && (
          <>
            {/* ARCH-162: Hard Stop banner — vises ved page refresh uden at pipeline kører */}
            <HardStopBanner />

            {/* Tab navigation med animeret underline */}
            <div className="flex gap-1 mb-6 border-b border-border/40">
              {(
                [
                  { id: "analyse", label: "ANALYSE" },
                  { id: "ejendom", label: "EJENDOM" },
                  { id: "oekonomi", label: "ØKONOMI" },
                ] as { id: CockpitTab; label: string }[]
              ).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "relative px-4 py-2 font-mono text-[11px] tracking-[0.15em] transition-colors -mb-px",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab.label}
                    {isActive && (
                      <motion.span
                        layoutId="cockpit-tab-underline"
                        className="absolute inset-x-0 -bottom-px h-[2px] bg-accent"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content med crossfade */}
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {activeTab === "analyse" && (
                <AnalyseTab
                  adresse={address?.adresse ?? ""}
                  data={bbrData}
                  lokalplaner={lokalplanerLocal}
                  byggeanalyse={byggeanalyseResultat}
                  metrics={complianceMetrics}
                  fbbData={fbbDataLocal}
                  vurderingData={vurderingData}
                  geusRisk={geusRiskLocal}
                  servitutter={servitutterLocal}
                  terrain={terrainLocal}
                  save={saveLocal}
                  fjernvarme={fjernvarmeLocal}
                  naboer={naboerLocal}
                  naturbeskyttelse={naturbeskyttelsesLocal}
                  isRecomputing={isRecomputing}
                  onRunAnalyse={runManualAnalyse}
                  onShowEjendom={() => setActiveTab("ejendom")}
                  onShowOekonomi={() => setActiveTab("oekonomi")}
                />
              )}
              {activeTab === "ejendom" && <EjendomPanel />}
              {activeTab === "oekonomi" && <OekonomiPanel />}
            </motion.div>
          </>
        )}
      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// Loading & error views
// ---------------------------------------------------------------------------

function LoadingView() {
  return (
    <div>
      <h1 className="font-mono text-[28px] mb-8">Analyserer adresse...</h1>
      <Card className="space-y-5">
        {LOADING_ROWS.map((r) => (
          <ProgressRow key={r.label} {...r} />
        ))}
      </Card>
    </div>
  );
}

function ProgressRow({
  icon: Icon,
  label,
  durationMs,
}: {
  icon: typeof FileText;
  label: string;
  durationMs: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <Icon size={16} className="text-muted-foreground" />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[#222222]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: durationMs / 1000, ease: "easeOut" }}
          className="h-full bg-accent"
        />
      </div>
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex gap-3 rounded-md border border-danger/40 bg-danger/10 p-4">
        <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
        <p className="text-sm text-foreground">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110"
      >
        Prøv igen
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Analyse tab
// ---------------------------------------------------------------------------

function AnalyseTab({
  adresse,
  data,
  lokalplaner,
  byggeanalyse,
  metrics,
  fbbData,
  vurderingData,
  geusRisk,
  servitutter,
  terrain,
  save,
  fjernvarme,
  naboer,
  naturbeskyttelse,
  isRecomputing,
  onRunAnalyse,
  onShowEjendom,
  onShowOekonomi,
}: {
  adresse: string;
  data: BbrKompliantData;
  lokalplaner: Lokalplan[];
  byggeanalyse: ByggeanalyseResultat | null;
  metrics: ComplianceMetrics | null;
  fbbData: import("@/integrations/fbb/client").FbbResultat | null;
  vurderingData: import("@/integrations/vur/client").VurData | null;
  geusRisk: GeusRiskData | null;
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  save: SaveData | null;
  fjernvarme: FjernvarmeResultat | null;
  naboer: NeighborBuildingData | null;
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  isRecomputing: boolean;
  onRunAnalyse: () => void;
  onShowEjendom: () => void;
  onShowOekonomi: () => void;
}) {
  const harData = data.beregning_mulig;
  const erBolig = data.anvendelseskode
    ? ["110", "120", "121", "122", "130", "131", "140", "190"].includes(data.anvendelseskode)
    : false;
  const harErhverv = data.anvendelseskode ? ["321", "322"].includes(data.anvendelseskode) : false;

  const vedtagne = lokalplaner.filter(
    (p) =>
      !p.status ||
      p.status.toLowerCase().includes("vedtaget") ||
      !p.status.toLowerCase().includes("forslag"),
  );
  const forslag = lokalplaner.filter((p) => p.status?.toLowerCase().includes("forslag"));

  const maxPct = metrics?.maxBebyggelsesprocent ?? null;
  const curPct = metrics?.currentBebyggelsesprocent ?? data.bebyggelsesprocent;
  const barFraction =
    curPct !== null && maxPct !== null && maxPct > 0 ? curPct / maxPct : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="text-xs text-muted-foreground mb-4 font-mono">{adresse}</p>

      {/* Workspace — 3-kolonne arbejdsrum: byggeønsker | matrikel | live feedback */}
      <div className="mb-6">
        <Cockpit
          bbr={data}
          metrics={metrics}
          byggeanalyse={byggeanalyse}
          fbbData={fbbData}
          vurderingData={vurderingData}
          geusRisk={geusRisk}
          servitutter={servitutter}
          terrain={terrain}
          naboer={naboer}
          naturbeskyttelse={naturbeskyttelse ?? null}
          isRecomputing={isRecomputing}
        />
      </div>

      {/* Samlet kronologisk compliance-feed + 5 risikokategorier */}
      <ComplianceFeed />
      <RiskOverview />

      {/* Manuel AI-genberegning */}
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
          AI-VURDERING
        </div>
        <button
          type="button"
          onClick={onRunAnalyse}
          disabled={isRecomputing}
          className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles size={12} />
          {isRecomputing ? "GENBEREGNER…" : "GENBEREGN"}
        </button>
      </div>

      {data.fejl && (
        <div className="flex gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 mb-4">
          <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">{data.fejl}</p>
        </div>
      )}

      {/* Dybdedata foldet ind i ét accordion — fokus forbliver på workspace + feed */}
      <DetailsAccordion
        sections={[
          {
            id: "ai-byggeanalyse",
            label: "AI BYGGEANALYSE",
            badge: byggeanalyse?.kilde === "mock" ? (
              <span className="text-[9px] border border-warning/40 text-warning rounded px-1 font-mono">
                MOCK
              </span>
            ) : null,
            content: byggeanalyse ? (
              <ByggeanalyseKort analyse={byggeanalyse} />
            ) : (
              <Card>
                <p className="text-sm leading-relaxed text-foreground/80">
                  {genererVurdering(data, adresse)}
                </p>
              </Card>
            ),
          },
          {
            id: "ai-design",
            label: "AI-DESIGN VISUALISERING",
            content: <AiDesignHero />,
          },
          {
            id: "lokalplaner",
            label: `LOKALPLANER (${lokalplaner.length})`,
            content:
              lokalplaner.length > 0 ? (
                <Card>
                  <div className="space-y-3">
                    {vedtagne.map((lp) => (
                      <div key={lp.planid} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-foreground font-medium truncate">
                            {lp.plannr ? `${lp.plannr} – ` : ""}
                            {lp.plannavn || "Ukendt lokalplan"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {lp.datoVedtaget
                              ? `Vedtaget ${lp.datoVedtaget.slice(0, 10)}`
                              : "Vedtaget"}
                            {lp.kommunenavn ? ` · ${lp.kommunenavn}` : ""}
                          </div>
                        </div>
                        {lp.plandokumentLink && (
                          <a
                            href={lp.plandokumentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/5 px-2 py-1 font-mono text-[11px] text-accent hover:bg-accent/10 transition-colors"
                          >
                            PDF <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    ))}
                    {forslag.map((lp) => (
                      <div
                        key={lp.planid}
                        className="flex items-start justify-between gap-3 opacity-70"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-foreground truncate">
                            {lp.plannr ? `${lp.plannr} – ` : ""}
                            {lp.plannavn || "Lokalplanforslag"}
                            <span className="ml-2 text-[10px] font-mono text-warning border border-warning/40 rounded px-1">
                              FORSLAG
                            </span>
                          </div>
                        </div>
                        {lp.plandokumentLink && (
                          <a
                            href={lp.plandokumentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            PDF <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              ) : (
                <div className="flex gap-3 rounded-md border border-[#333]/60 bg-[#1A1A1A] p-4">
                  <Info size={18} className="text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Ingen lokalplan fundet — ejendommen er reguleret af kommuneplanen.
                  </p>
                </div>
              ),
          },
          save && {
            id: "save",
            label: "FREDNING & BEVARELSE",
            content: <SaveSektion data={save} />,
          },
          geusRisk && {
            id: "geus",
            label: "GEOTEKNISK RISIKO",
            content: <GeusRisikoSektion data={geusRisk} />,
          },
          terrain && {
            id: "terrain",
            label: "TERRÆN & KOTER",
            content: <TerrainSektion data={terrain} />,
          },
          servitutter && servitutter.servitutter.length > 0 && {
            id: "servitutter",
            label: `SERVITUTTER (${servitutter.servitutter.length})`,
            content: <ServitutterSektion data={servitutter} />,
          },
          fjernvarme && {
            id: "fjernvarme",
            label: "FJERNVARMEDÆKNING",
            content: <FjernvarmeSektion data={fjernvarme} />,
          },
          naboer && naboer.count > 0 && {
            id: "naboer",
            label: `NABOBYGNINGER (${naboer.count})`,
            content: <NaboerSektion data={naboer} />,
          },
        ].filter((s): s is { id: string; label: string; badge?: React.ReactNode; content: React.ReactNode } => Boolean(s))}
      />

      {/* Slim navigation — én primær handling, sekundære som links */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
        <div className="flex flex-wrap gap-3 text-[11px] font-mono">
          <button
            onClick={onShowEjendom}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Ejendomsdetaljer →
          </button>
          <Link
            to="/projekt/datacheck"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Projektparathed →
          </Link>
        </div>
        <button
          data-testid="compliance-continue"
          onClick={onShowOekonomi}
          className="inline-flex items-center justify-center rounded-md bg-accent px-5 py-2 font-mono text-[11px] tracking-[0.12em] text-accent-foreground transition-all hover:brightness-110"
        >
          ØKONOMI →
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Detail section components
// ---------------------------------------------------------------------------

function FjernvarmeSektion({ data }: { data: FjernvarmeResultat }) {
  const badge =
    data.fjernvarmeDaekket === true
      ? { label: "FJERNVARME TILGÆNGELIGT", color: "text-success border-success/40 bg-success/10" }
      : data.fjernvarmeDaekket === false
        ? {
            label: "INGEN FJERNVARME",
            color: "text-muted-foreground border-border bg-[#1a1a1a]",
          }
        : { label: "UKENDT", color: "text-warning border-warning/40 bg-warning/10" };

  return (
    <Card className="mb-4">
      <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
        <Flame size={12} className="text-accent" />
        FJERNVARMEDÆKNING
        {FEATURE_FLAGS.fjernvarmeMock && (
          <span className="text-[9px] border border-warning/40 text-warning rounded px-1">
            MOCK
          </span>
        )}
      </div>
      <span
        className={`inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 ${badge.color}`}
      >
        {badge.label}
      </span>
      {data.fejl && <p className="text-xs text-muted-foreground mt-2">{data.fejl}</p>}
      {data.fjernvarmeDaekket === true && (
        <p className="text-sm text-foreground/80 mt-3">
          Adressen ligger inden for et vedtaget fjernvarmeforsyningsområde – tilslutningspligt kan
          være gældende.
        </p>
      )}
      {data.fjernvarmeDaekket === false && (
        <p className="text-sm text-foreground/80 mt-3">
          Ingen fjernvarmeforsyning på adressen – varmepumpe eller anden lokal løsning.
        </p>
      )}
    </Card>
  );
}

function NaboerSektion({ data }: { data: NeighborBuildingData }) {
  const naer = data.nearestDistanceM !== null && data.nearestDistanceM < 2.5;
  return (
    <Card className="mb-4">
      <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
        <HomeIcon size={12} className="text-accent" />
        NABOBYGNINGER
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-mono text-muted-foreground mb-1">NÆRMESTE NABO</div>
          <div className={`text-sm font-mono ${naer ? "text-warning" : "text-foreground"}`}>
            {data.nearestDistanceM !== null ? `${data.nearestDistanceM.toFixed(1)} m` : "—"}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-mono text-muted-foreground mb-1">INDEN FOR 40 M</div>
          <div className="text-sm font-mono text-foreground">{data.count} bygninger</div>
        </div>
      </div>
      {naer && (
        <p className="text-xs text-warning mt-3">
          Afstand under 2,5 m kræver byggetilladelse — brandkrav (BR18 §126) skal overholdes.
        </p>
      )}
      {data.fejl && <p className="text-xs text-muted-foreground mt-2">{data.fejl}</p>}
    </Card>
  );
}

function ByggeanalyseKort({ analyse }: { analyse: ByggeanalyseResultat }) {
  const sections: Array<{
    key: keyof ByggeanalyseResultat;
    label: string;
    color: string;
    icon: typeof Check;
  }> = [
    {
      key: "tilladt",
      label: "TILLADT",
      color: "text-success border-success/40 bg-success/5",
      icon: Check,
    },
    {
      key: "kraever_dispensation",
      label: "KRÆVER DISPENSATION",
      color: "text-warning border-warning/40 bg-warning/5",
      icon: AlertTriangle,
    },
    {
      key: "konflikt",
      label: "KONFLIKT",
      color: "text-danger border-danger/40 bg-danger/5",
      icon: AlertTriangle,
    },
    {
      key: "mangler_data",
      label: "MANGLER DATA",
      color: "text-muted-foreground border-border bg-[#1a1a1a]",
      icon: Info,
    },
  ];

  return (
    <Card className="mb-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-accent" />
        <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
          AI BYGGEANALYSE
          {analyse.kilde === "mock" && (
            <span className="ml-2 text-[9px] border border-warning/40 text-warning rounded px-1">
              MOCK
            </span>
          )}
        </div>
      </div>

      {analyse.stilOpsummering && (
        <p className="text-sm text-foreground/80 italic leading-relaxed border-l-2 border-accent/40 pl-3">
          {analyse.stilOpsummering}
        </p>
      )}

      {sections.map(({ key, label, color, icon: Icon }) => {
        const items = analyse[key] as Array<Record<string, string>>;
        if (!items || items.length === 0) return null;
        return (
          <div key={key}>
            <div
              className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] rounded-full border px-2 py-0.5 mb-2 ${color}`}
            >
              <Icon size={10} /> {label}
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-foreground">{item.emne}:</span>{" "}
                  <span className="text-foreground/80">
                    {item.begrundelse ?? item.konflikt ?? item.hvad_mangler}
                  </span>
                  {item.lovhjemmel && (
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                      ({item.lovhjemmel})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function TerrainSektion({ data }: { data: TerrainData }) {
  const erSkraanende = data.slopePercent >= 5;
  const erBrat = data.slopePercent >= 15;

  return (
    <Card className="mb-4">
      <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
        TERRÆN & KOTER
        {data.kilde === "mock" && (
          <span className="ml-2 text-[9px] border border-warning/40 text-warning rounded px-1">
            MOCK
          </span>
        )}
      </div>
      {erBrat && (
        <div className="mb-3 inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 text-warning border-warning/40 bg-warning/10">
          BRAT TERRÆN — kælder og fundamentering kræver geoteknisk undersøgelse
        </div>
      )}
      {erSkraanende && !erBrat && (
        <div className="mb-3 inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 text-warning border-warning/40 bg-warning/10">
          SKRÅNENDE TERRÆN — terræntilpasning nødvendig
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <div className="text-[11px] font-mono text-muted-foreground mb-1">HØJDESPÆND</div>
          <div className="text-sm text-foreground font-mono">
            {data.minElevationM.toFixed(1)} – {data.maxElevationM.toFixed(1)} m
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Avg {data.avgElevationM.toFixed(1)} m over havniveau
          </div>
        </div>
        <div>
          <div className="text-[11px] font-mono text-muted-foreground mb-1">HÆLDNING</div>
          <div
            className={`text-sm font-mono ${erBrat ? "text-warning" : erSkraanende ? "text-warning" : "text-foreground"}`}
          >
            {data.slopePercent.toFixed(1)} %
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {erBrat ? "Brat" : erSkraanende ? "Skrånende" : "Fladt"}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-mono text-muted-foreground mb-1">ORIENTERING</div>
          <div className="text-sm text-foreground font-mono">{data.northOrientation}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Primær facade</div>
        </div>
      </div>
    </Card>
  );
}

function SaveSektion({ data }: { data: SaveData }) {
  return (
    <Card className="mb-4">
      <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
        FREDNING & BEVARELSE
        {data.kilde === "mock" && (
          <span className="ml-2 text-[9px] border border-warning/40 text-warning rounded px-1">
            MOCK
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {data.fredet ? (
          <span className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 text-danger border-danger/40 bg-danger/10">
            FREDET BYGNING
          </span>
        ) : (
          <span className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 text-success border-success/40 bg-success/10">
            IKKE FREDET
          </span>
        )}
        {data.saveBevaringsvaerdi !== null && (
          <span
            className={`inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 ${
              data.saveBevaringsvaerdi <= 3
                ? "text-danger border-danger/40 bg-danger/10"
                : data.saveBevaringsvaerdi <= 6
                  ? "text-warning border-warning/40 bg-warning/10"
                  : "text-muted-foreground border-border bg-[#1a1a1a]"
            }`}
          >
            SAVE {data.saveBevaringsvaerdi}
          </span>
        )}
      </div>
      {data.fredet && (
        <p className="text-sm text-danger mt-2">
          Bygningen er fredet — nedrivning kræver dispensation fra Slots- og Kulturstyrelsen.
        </p>
      )}
      {data.saveBevaringsvaerdi !== null && data.saveBevaringsvaerdi <= 3 && (
        <p className="text-sm text-warning mt-2">
          Høj bevaringsværdi (SAVE {data.saveBevaringsvaerdi}) — nedrivning eller facadeændring kan
          kræve kommunal dispensation.
        </p>
      )}
    </Card>
  );
}

function ServitutterSektion({ data }: { data: TinglysningResult }) {
  const kritiske = data.servitutter.filter((s) => s.kritisk);
  const ikkeKritiske = data.servitutter.filter((s) => !s.kritisk);

  return (
    <Card className="mb-4">
      <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
        TINGLYSTE SERVITUTTER
        {data.kilde === "mock" && (
          <span className="ml-2 text-[9px] border border-warning/40 text-warning rounded px-1">
            MOCK
          </span>
        )}
        {data.pant > 0 && (
          <span className="ml-2 text-[9px] border border-border text-muted-foreground rounded px-1">
            {data.pant} PANTEHÆFTELSE{data.pant !== 1 ? "R" : ""}
          </span>
        )}
      </div>

      {kritiske.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] rounded-full border px-2 py-0.5 text-danger border-danger/40 bg-danger/10 mb-2">
            <AlertTriangle size={10} /> BYGGEKRITISK
          </div>
          {kritiske.map((s) => (
            <div key={s.dokumentId} className="rounded border border-danger/20 bg-danger/5 p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-mono text-[10px] text-danger uppercase">{s.type}</span>
                <span className="font-mono text-[9px] text-muted-foreground shrink-0">
                  {s.tinglystDato}
                </span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{s.tekst}</p>
            </div>
          ))}
        </div>
      )}

      {ikkeKritiske.length > 0 && (
        <div className="space-y-2">
          {kritiske.length > 0 && (
            <div className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground mb-2">
              ØVRIGE
            </div>
          )}
          {ikkeKritiske.map((s) => (
            <div key={s.dokumentId} className="rounded border border-border/60 bg-[#1a1a1a] p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-mono text-[10px] text-muted-foreground uppercase">
                  {s.type}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground shrink-0">
                  {s.tinglystDato}
                </span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{s.tekst}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function GeusRisikoSektion({ data }: { data: GeusRiskData }) {
  const radonBadge = {
    high: { label: "HØJ RADONRISIKO", color: "text-danger border-danger/40 bg-danger/10" },
    medium: { label: "MIDDEL RADONRISIKO", color: "text-warning border-warning/40 bg-warning/10" },
    low: { label: "LAV RADONRISIKO", color: "text-success border-success/40 bg-success/10" },
    unknown: { label: "RADON UKENDT", color: "text-muted-foreground border-border bg-[#1a1a1a]" },
  }[data.radonRisk];

  const vandHighRisk = data.groundwaterDepthM !== null && data.groundwaterDepthM < 1.0;
  const vandLowRisk =
    data.groundwaterDepthM !== null &&
    data.groundwaterDepthM >= 1.0 &&
    data.groundwaterDepthM < 2.0;

  return (
    <Card className="mb-4">
      <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
        GEOTEKNISK RISIKOPROFIL
        {data.kilde === "mock" && (
          <span className="ml-2 text-[9px] border border-warning/40 text-warning rounded px-1">
            MOCK
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <span
          className={`inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 ${radonBadge.color}`}
        >
          {radonBadge.label}
        </span>
        {(vandHighRisk || vandLowRisk) && (
          <span
            className={`inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 ${vandHighRisk ? "text-danger border-danger/40 bg-danger/10" : "text-warning border-warning/40 bg-warning/10"}`}
          >
            {vandHighRisk ? "KRITISK GRUNDVAND" : "LAVT GRUNDVAND"}
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-mono text-muted-foreground mb-1">RADON</div>
          <div className="text-sm text-foreground">
            {data.radonRisk === "high" && "Høj — radonafskærmning påkrævet (BR18 §301)"}
            {data.radonRisk === "medium" && "Middel — radonspærre anbefalet"}
            {data.radonRisk === "low" && "Lav — ingen særlige krav"}
            {data.radonRisk === "unknown" && "Ingen data tilgængeligt"}
          </div>
        </div>
        {data.groundwaterDepthM !== null && (
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">GRUNDVAND</div>
            <div className="text-sm text-foreground">
              {data.groundwaterDepthM.toFixed(1)} m under terræn
              {data.groundwaterDataSource && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({data.groundwaterDataSource})
                </span>
              )}
            </div>
            {vandHighRisk && (
              <div className="text-xs text-danger mt-0.5">Dræning + vandtæt kælder kræves</div>
            )}
            {vandLowRisk && (
              <div className="text-xs text-warning mt-0.5">Dræning anbefalet ved kælder</div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function MetricCard({
  title,
  value,
  sub,
  subClass = "text-muted-foreground",
  bar,
}: {
  title: string;
  value: string;
  sub: string;
  subClass?: string;
  bar?: number;
}) {
  // Forsøg at udtrække tal + suffix fra value-strengen for at animere det.
  const match = /^(-?\d+(?:[.,]\d+)?)(\D*)$/.exec(value.trim());
  const numericValue = match ? parseFloat(match[1].replace(",", ".")) : null;
  const suffix = match ? match[2] : "";
  const decimals = match && match[1].includes(".") ? 1 : 0;

  return (
    <Card>
      <div className="text-[11px] font-mono tracking-[0.1em] text-muted-foreground mb-2">
        {title.toUpperCase()}
      </div>
      <div className="font-mono text-2xl text-foreground">
        {numericValue !== null ? (
          <AnimatedNumber value={numericValue} decimals={decimals} suffix={suffix} />
        ) : (
          value
        )}
      </div>
      <div className={`text-xs mt-1 ${subClass}`}>{sub}</div>
      {bar !== undefined && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#222]">
          <motion.div
            className="h-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.max(0, bar * 100))}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      )}
    </Card>
  );
}

function genererVurdering(data: BbrKompliantData, adresse: string): string {
  if (!data.beregning_mulig) {
    return `Vi fandt en registrering på ${adresse}, men kunne ikke beregne alle compliance-parametre. ${data.fejl ?? ""} Vi anbefaler at kontakte din kommune for en præcis byggesagsvurdering.`;
  }

  const parts: string[] = [];
  if (data.bebyggelsesprocent !== null && data.grundareal !== null) {
    parts.push(
      `Nuværende bebyggelsesprocent er ${data.bebyggelsesprocent}% på en grund af ${data.grundareal} m².`,
    );
  }
  if (data.bebygget_areal !== null) {
    parts.push(`Det bebyggede areal udgør ${data.bebygget_areal} m².`);
  }
  if (data.antal_etager !== null) {
    parts.push(
      data.antal_etager <= 1
        ? "Eksisterende bebyggelse er i ét plan."
        : `Bygningen har ${data.antal_etager} etager.`,
    );
  }
  if (data.anvendelseskode && ["321", "322"].includes(data.anvendelseskode)) {
    parts.push(
      "Ejendommen er registreret til liberalt erhverv, hvilket muliggør en kombineret bolig/klinik-løsning.",
    );
  }

  return parts.length > 0
    ? parts.join(" ")
    : `Bygningsdata hentet for ${adresse}. Kontakt din kommune for fuld byggesagsvurdering.`;
}
