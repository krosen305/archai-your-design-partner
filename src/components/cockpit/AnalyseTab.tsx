import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  ScrollText,
  Map,
  Cpu,
  Check,
  AlertTriangle,
  Info,
  ExternalLink,
  Sparkles,
  Flame,
  Home as HomeIcon,
  Wifi,
  Zap,
  TreePine,
  Droplets,
  Layers,
  Square,
} from "lucide-react";
import { useProject } from "@/lib/project-store";
import { DataSourceStatus } from "@/components/cockpit/DataSourceStatus";
import { DatakildeCard } from "@/components/cockpit/DatakildeCard";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/wizard-ui";
import { useCockpitMode } from "@/lib/use-cockpit-mode";
import { AiDesignHero } from "@/components/cockpit/AiDesignHero";
import { type DetailsSection } from "@/components/cockpit/DetailsAccordion";
import { RisikoFeed } from "@/components/cockpit/RisikoFeed";
import { CanvasWithGauges } from "@/components/cockpit/CanvasWithGauges";
import { DetailsDrawer } from "@/components/cockpit/DetailsDrawer";
import { StatusStripe } from "@/components/cockpit/StatusStripe";
import { ProjektDnaPanel } from "@/components/cockpit";
import { cn } from "@/lib/utils";
import { genererBbrVurdering } from "@/lib/bbr-assessment";
import { classifyLokalplaner } from "@/lib/lokalplan-classifier";
import { classifyTerrain, classifyGroundwater, isNearNeighbor } from "@/lib/site-risk-classifier";
import type {
  FjernvarmeResultat,
  NeighborBuildingData,
  VurData,
} from "@/domain/contracts/analysis.types";
import type {
  RuleEngineArealdataContext,
  RuleEngineBbrData,
  RuleEngineDkJordResultat,
  RuleEngineFbbResult,
  RuleEngineGeusRiskData,
  RuleEngineLokalplan,
  RuleEngineNaturbeskyttelsesResultat,
  RuleEnginePlandataContext,
  RuleEngineTerrainData,
  RuleEngineTinglysningResult,
} from "@/domain/contracts/rule-engine.types";
import type { MatParcelGeometryPayload } from "@/domain/contracts/analysis.types";
import type { TjekditnetCoverageData } from "@/integrations/tjekditnet/client";
import type { EnergyLabelData } from "@/integrations/energimaerke/client";
import type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
import type { ComplianceMetrics } from "@/lib/compliance-engine";

// ---------------------------------------------------------------------------
// Public prop types
// ---------------------------------------------------------------------------

export type AnalyseTabData = {
  data: RuleEngineBbrData;
  lokalplaner: RuleEngineLokalplan[];
  byggeanalyse: ByggeanalyseResultat | null;
  metrics: ComplianceMetrics | null;
  fbbData: RuleEngineFbbResult | null;
  vurderingData: VurData | null;
  geusRisk: RuleEngineGeusRiskData | null;
  servitutter: RuleEngineTinglysningResult | null;
  terrain: RuleEngineTerrainData | null;
  fjernvarme: FjernvarmeResultat | null;
  naboer: NeighborBuildingData | null;
  naturbeskyttelse: RuleEngineNaturbeskyttelsesResultat | null;
  dkjord: RuleEngineDkJordResultat | null;
};

export type AnalyseTabCallbacks = {
  onRunAnalyse: () => void;
  onShowEjendom: () => void;
  onShowOekonomi: () => void;
};

// ---------------------------------------------------------------------------
// Loading constants
// ---------------------------------------------------------------------------

const LOADING_ROWS = [
  { icon: FileText, label: "Henter BBR-data", durationMs: 800 },
  { icon: ScrollText, label: "Læser bygningsregister", durationMs: 1600 },
  { icon: Map, label: "Henter lokalplandata", durationMs: 2000 },
  { icon: Cpu, label: "Beregner compliance", durationMs: 2600 },
];

// ---------------------------------------------------------------------------
// LoadingView
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

// ---------------------------------------------------------------------------
// ErrorView
// ---------------------------------------------------------------------------

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
  analyseData: {
    data,
    lokalplaner,
    byggeanalyse,
    metrics,
    fbbData,
    vurderingData,
    geusRisk,
    servitutter,
    terrain,
    fjernvarme,
    naboer,
    naturbeskyttelse,
    dkjord,
  },
  callbacks: { onRunAnalyse, onShowEjendom, onShowOekonomi },
  isRecomputing,
}: {
  adresse: string;
  analyseData: AnalyseTabData;
  callbacks: AnalyseTabCallbacks;
  isRecomputing: boolean;
}) {
  const [mode] = useCockpitMode();
  const inKobMode = mode === "due-diligence";
  const [drawerSection, setDrawerSection] = useState<string | null>(null);
  const drawerOpen = drawerSection !== null;
  const openDrawer = useCallback((id?: string) => setDrawerSection(id ?? "lokalplaner"), []);
  const closeDrawer = useCallback(() => setDrawerSection(null), []);

  const tjekditnetCoverage = useProject((s) => s.tjekditnetCoverage);
  const energimaerke = useProject((s) => s.energimaerke);
  const plandataContext = useProject((s) => s.plandataContext);
  const arealdataContext = useProject((s) => s.arealdataContext);
  const matGeometri = useProject((s) => s.matGeometri);

  const reactiveContext = useMemo(
    () => ({ geusRisk, servitutter, terrain, fbbData, naturbeskyttelse, dkjord }),
    [geusRisk, servitutter, terrain, fbbData, naturbeskyttelse, dkjord],
  );

  const { vedtagne, forslag } = classifyLokalplaner(lokalplaner);

  const drawerSections: DetailsSection[] = [
    {
      id: "ai-byggeanalyse",
      label: "AI BYGGEANALYSE",
      badge: null,
      content: byggeanalyse ? (
        <ByggeanalyseKort analyse={byggeanalyse} />
      ) : (
        <Card>
          <p className="text-sm leading-relaxed text-foreground/80">
            {genererBbrVurdering(data, adresse)}
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
                      {lp.datoVedtaget ? `Vedtaget ${lp.datoVedtaget.slice(0, 10)}` : "Vedtaget"}
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
                <div key={lp.planid} className="flex items-start justify-between gap-3 opacity-70">
                  <div className="min-w-0">
                    <div className="text-sm text-foreground truncate">
                      {lp.plannr ? `${lp.plannr} – ` : ""}
                      {lp.plannavn || "Lokalplanforslag"}
                      <span className="ml-2 text-[10px] font-mono text-warning border border-warning/40 rounded px-1">
                        FORSLAG
                      </span>
                    </div>
                  </div>
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
    servitutter &&
      servitutter.servitutter.length > 0 && {
        id: "servitutter",
        label: `SERVITUTTER (${servitutter.servitutter.length})`,
        content: <ServitutterSektion data={servitutter} />,
      },
    fjernvarme && {
      id: "fjernvarme",
      label: "FJERNVARMEDÆKNING",
      content: <FjernvarmeSektion data={fjernvarme} />,
    },
    naboer &&
      naboer.count > 0 && {
        id: "naboer",
        label: `NABOBYGNINGER (${naboer.count})`,
        content: <NaboerSektion data={naboer} />,
      },
    vurderingData && {
      id: "vurdering",
      label: "EJENDOMSVURDERING",
      content: (
        <Card>
          <div className="grid grid-cols-2 gap-3">
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
      ),
    },
    {
      id: "dkjord",
      label: "JORDFORURENING",
      content: <DkJordSektion data={dkjord} onRetry={onRunAnalyse} />,
    },
    {
      id: "plandata",
      label: "PLANDATA-KONTEKST",
      content: <PlandataSektion data={plandataContext} onRetry={onRunAnalyse} />,
    },
    {
      id: "arealdata",
      label: "AREALDATA & MILJØ",
      content: <ArealdataSektion data={arealdataContext} onRetry={onRunAnalyse} />,
    },
    {
      id: "matGeometri",
      label: "PARCELGEOMETRI",
      content: <MatGeometriSektion data={matGeometri} onRetry={onRunAnalyse} />,
    },
    {
      id: "tjekditnet",
      label: "BREDBÅNDSDÆKNING",
      content: <TjekditnetSektion data={tjekditnetCoverage} onRetry={onRunAnalyse} />,
    },
    {
      id: "energimaerke",
      label: "ENERGIMÆRKE",
      content: <EnergimaerkeSektion data={energimaerke} onRetry={onRunAnalyse} />,
    },
  ].filter(Boolean) as DetailsSection[];

  // Mode-styret hierarki: i køb-mode er højre kolonne (feedback) den primære;
  // i design-mode er venstre (intent) ligeværdig. Begge dele synlige altid.
  const leftWidth = inKobMode ? "lg:w-[320px]" : "lg:w-[380px]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center justify-between mb-4 gap-3">
        <p className="text-xs text-muted-foreground font-mono truncate">{adresse}</p>
      </div>

      {/* STATUS-STRIBE — full bredde, første visuelle anker */}
      <StatusStripe
        onOpenDetails={() => openDrawer()}
        onRecompute={onRunAnalyse}
        isRecomputing={isRecomputing}
      />

      {data.fejl && (
        <div className="flex gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 mb-4">
          <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">{data.fejl}</p>
        </div>
      )}

      {/* 2-kolonne workspace: design-intent | live feedback */}
      <div className={cn("flex flex-col gap-4 lg:flex-row")}>
        <aside className={cn("w-full shrink-0", leftWidth)}>
          <ProjektDnaPanel reactiveContext={reactiveContext} />
        </aside>

        <section className="flex-1 min-w-0 space-y-4">
          <CanvasWithGauges
            bbr={data}
            metrics={metrics}
            naboer={naboer}
            jordstykkeLokalId={data.jordstykke_lokal_id ?? null}
          />
          <RisikoFeed onOpenDetails={() => openDrawer()} />
        </section>
      </div>

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

      <DetailsDrawer
        open={drawerOpen}
        onOpenChange={(o) => (o ? openDrawer(drawerSection ?? undefined) : closeDrawer())}
        sections={drawerSections}
      />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Detail section components
// ---------------------------------------------------------------------------

function FjernvarmeSektion({ data }: { data: FjernvarmeResultat }) {
  const isCovered = data.fjernvarmeDaekket === true;
  const isPlanned = !isCovered && data.fjernvarmePlanlagt === true;
  const badge = isCovered
    ? { label: "FJERNVARME TILGÆNGELIGT", color: "text-success border-success/40 bg-success/10" }
    : isPlanned
      ? { label: "FJERNVARME PLANLAGT", color: "text-warning border-warning/40 bg-warning/10" }
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
      </div>
      <span
        className={`inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 ${badge.color}`}
      >
        {badge.label}
      </span>
      {data.fejl && <p className="text-xs text-muted-foreground mt-2">{data.fejl}</p>}
      {isCovered && (
        <p className="text-sm text-foreground/80 mt-3">
          Adressen ligger inden for et vedtaget fjernvarmeforsyningsområde. Kontroller
          varmeforsyning og eventuel tilslutningspligt ved byggeansøgning.
        </p>
      )}
      {isPlanned && (
        <p className="text-sm text-foreground/80 mt-3">
          Plandata viser et varmeplansområde for fjernvarme, men ikke et bekræftet forsyningsområde
          endnu. Afklar tidsplan og gravearbejde med forsyningsselskabet.
        </p>
      )}
      {data.fjernvarmeDaekket === false && !isPlanned && (
        <p className="text-sm text-foreground/80 mt-3">
          Ingen bekræftet fjernvarmeforsyning på adressen i Plandata.
        </p>
      )}
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>Plan: {data.planNavn ?? "—"}</div>
        <div>Selskab: {data.forsyningsselskabNavn ?? "—"}</div>
        <div>Tilslutningspligt: {data.tilslutningspligt === true ? "Ja" : "Nej/ukendt"}</div>
        <div>Fjernvarmeforbud: {data.forsyningsforbud === true ? "Ja" : "Nej/ukendt"}</div>
        <div>Confidence: {data.confidence}</div>
        <div>Kilder: {data.sourceKinds.length > 0 ? data.sourceKinds.join(", ") : "—"}</div>
      </div>
      {data.dokumentUrl && (
        <a
          href={data.dokumentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/5 px-2 py-1 font-mono text-[11px] text-accent hover:bg-accent/10 transition-colors"
        >
          Plandokument <ExternalLink size={10} />
        </a>
      )}
    </Card>
  );
}

function NaboerSektion({ data }: { data: NeighborBuildingData }) {
  const naer = isNearNeighbor(data.nearestDistanceM) === true;
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

function TerrainSektion({ data }: { data: RuleEngineTerrainData }) {
  const terrainLevel = classifyTerrain(data.slopePercent);
  const erBrat = terrainLevel === "steep";
  const erSkraanende = terrainLevel === "sloping";

  return (
    <Card className="mb-4">
      <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
        TERRÆN & KOTER
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

function ServitutterSektion({ data }: { data: RuleEngineTinglysningResult }) {
  const kritiske = data.servitutter.filter((s) => s.kritisk);
  const ikkeKritiske = data.servitutter.filter((s) => !s.kritisk);

  return (
    <Card className="mb-4">
      <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
        TINGLYSTE SERVITUTTER
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

function GeusRisikoSektion({ data }: { data: RuleEngineGeusRiskData }) {
  const radonBadge = {
    high: { label: "HØJ RADONRISIKO", color: "text-danger border-danger/40 bg-danger/10" },
    medium: { label: "MIDDEL RADONRISIKO", color: "text-warning border-warning/40 bg-warning/10" },
    low: { label: "LAV RADONRISIKO", color: "text-success border-success/40 bg-success/10" },
    unknown: { label: "RADON UKENDT", color: "text-muted-foreground border-border bg-[#1a1a1a]" },
  }[data.radonRisk];

  const gwRisk = classifyGroundwater(data.groundwaterDepthM);
  const vandHighRisk = gwRisk === "high";
  const vandLowRisk = gwRisk === "medium";

  return (
    <Card className="mb-4">
      <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
        GEOTEKNISK RISIKOPROFIL
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

// ---------------------------------------------------------------------------
// New datakilde-sektioner (Phase 2)
// ---------------------------------------------------------------------------

function YesNoBadge({
  value,
  trueLabel,
  falseLabel,
}: {
  value: boolean | null;
  trueLabel: string;
  falseLabel?: string;
}) {
  if (value === null) {
    return (
      <span className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-2 py-0.5 text-muted-foreground border-border bg-[#1a1a1a]">
        UKENDT
      </span>
    );
  }
  if (value) {
    return (
      <span className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-2 py-0.5 text-warning border-warning/40 bg-warning/10">
        {trueLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-2 py-0.5 text-success border-success/40 bg-success/10">
      {falseLabel ?? "OK"}
    </span>
  );
}

function DkJordSektion({
  data,
  onRetry,
}: {
  data: RuleEngineDkJordResultat | null;
  onRetry: () => void;
}) {
  const v1 = data?.v1Kortlagt ?? null;
  const v2 = data?.v2Kortlagt ?? null;
  const olietank = data?.olietank?.eksisterer ?? null;
  return (
    <DatakildeCard
      kind="dkjord"
      icon={Droplets}
      label="JORDFORURENING (DKJORD)"
      onRetry={onRetry}
      emptyMessage="Ingen jordforureningsdata for adressen."
    >
      {data && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <YesNoBadge value={v1} trueLabel="V1 KORTLAGT" falseLabel="IKKE V1" />
            <YesNoBadge value={v2} trueLabel="V2 KORTLAGT" falseLabel="IKKE V2" />
            {olietank !== null && (
              <YesNoBadge value={olietank} trueLabel="OLIETANK" falseLabel="INGEN OLIETANK" />
            )}
          </div>
          {(v1 === true || v2 === true) && (
            <p className="text-xs text-warning">
              Jordforureningsattest og evt. § 8-tilladelse kan være påkrævet før
              bygge-/anlægsarbejde.
            </p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
            {data.omraadeklassificering && (
              <div>
                Områdeklassificering:{" "}
                <span className="text-foreground">{data.omraadeklassificering}</span>
              </div>
            )}
            {data.nuancering && (
              <div>
                Nuancering: <span className="text-foreground">{data.nuancering}</span>
              </div>
            )}
            {data.olietank?.driftsstatus && (
              <div>
                Olietank-status:{" "}
                <span className="text-foreground">{data.olietank.driftsstatus}</span>
              </div>
            )}
            {data.lokalitetsId && (
              <div>
                Lokalitet: <span className="font-mono text-foreground">{data.lokalitetsId}</span>
              </div>
            )}
          </div>
        </>
      )}
    </DatakildeCard>
  );
}

function PlandataSektion({
  data,
  onRetry,
}: {
  data: RuleEnginePlandataContext | null;
  onRetry: () => void;
}) {
  const zoneLabel = data?.zoneType ? data.zoneType.toUpperCase() : "UKENDT";
  return (
    <DatakildeCard
      kind="kommuneplanramme"
      icon={Layers}
      label="PLANDATA-KONTEKST"
      onRetry={onRetry}
      emptyMessage="Ingen plandata-kontekst tilgængelig."
    >
      {data && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 text-foreground border-border bg-[#1a1a1a]">
              ZONE: {zoneLabel}
            </span>
            {data.landzonePermitRequired === true && (
              <span className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 text-warning border-warning/40 bg-warning/10">
                LANDZONETILLADELSE
              </span>
            )}
            {data.lokalplanByggefeltPresent && (
              <YesNoBadge
                value={data.withinBuildingField === false}
                trueLabel="UDEN FOR BYGGEFELT"
                falseLabel="INDEN FOR BYGGEFELT"
              />
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
            {data.futureZoneType && data.futureZoneType !== data.zoneType && (
              <div>
                Fremtidig zone: <span className="text-foreground">{data.futureZoneType}</span>
              </div>
            )}
            {data.wastewaterPlanStatus && (
              <div>
                Spildevandsplan:{" "}
                <span className="text-foreground">{data.wastewaterPlanStatus}</span>
              </div>
            )}
            {data.sewerAreaType && (
              <div>
                Kloakopland: <span className="text-foreground">{data.sewerAreaType}</span>
              </div>
            )}
            {data.lokalplanDelomraadeId && (
              <div>
                Delområde:{" "}
                <span className="font-mono text-foreground">{data.lokalplanDelomraadeId}</span>
              </div>
            )}
          </div>
        </>
      )}
    </DatakildeCard>
  );
}

function ArealdataSektion({
  data,
  onRetry,
}: {
  data: RuleEngineArealdataContext | null;
  onRetry: () => void;
}) {
  const flags: Array<{ label: string; value: boolean | null }> = data
    ? [
        { label: "§3-natur", value: data.paragraph3Nature },
        { label: "Natura 2000", value: data.natura2000 },
        { label: "Beskyttet dige", value: data.protectedDige },
        { label: "Fortidsminde", value: data.fortidsminde },
        { label: "Fortidsminde-buffer", value: data.fortidsmindeBuffer },
        { label: "BNBO", value: data.bnbo },
        { label: "OSD (drikkevand)", value: data.osd },
        { label: "Råstofområde", value: data.rawMaterialArea },
      ]
    : [];
  const aktive = flags.filter((f) => f.value === true);
  return (
    <DatakildeCard
      kind="arealdata"
      icon={TreePine}
      label="AREALDATA & MILJØ"
      onRetry={onRetry}
      emptyMessage="Ingen areal- eller miljødata for adressen."
    >
      {data && (
        <>
          {aktive.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen registrerede miljø-/naturoverlap.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {aktive.map((f) => (
                <span
                  key={f.label}
                  className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 text-warning border-warning/40 bg-warning/10"
                >
                  {f.label.toUpperCase()}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground sm:grid-cols-4">
            {flags
              .filter((f) => f.value === false || f.value === null)
              .map((f) => (
                <div key={f.label} className="font-mono">
                  {f.label}: {f.value === false ? "nej" : "?"}
                </div>
              ))}
          </div>
        </>
      )}
    </DatakildeCard>
  );
}

function MatGeometriSektion({
  data,
  onRetry,
}: {
  data: MatParcelGeometryPayload | null;
  onRetry: () => void;
}) {
  const diskrepans = data?.areaDiscrepancyM2 ?? null;
  const stortAfvigelse = diskrepans !== null && Math.abs(diskrepans) > 25;
  return (
    <DatakildeCard
      kind="matGeometri"
      icon={Square}
      label="PARCELGEOMETRI (MAT)"
      onRetry={onRetry}
      emptyMessage="Ingen parcelgeometri tilgængelig."
    >
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-[11px] font-mono text-muted-foreground mb-1">POLYGON-AREAL</div>
              <div className="text-sm font-mono text-foreground tabular-nums">
                {data.polygonAreaM2 !== null ? `${Math.round(data.polygonAreaM2)} m²` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-mono text-muted-foreground mb-1">REGISTRERET</div>
              <div className="text-sm font-mono text-foreground tabular-nums">
                {data.registreretArealM2 !== null
                  ? `${Math.round(data.registreretArealM2)} m²`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-mono text-muted-foreground mb-1">DIFFERENCE</div>
              <div
                className={`text-sm font-mono tabular-nums ${stortAfvigelse ? "text-warning" : "text-foreground"}`}
              >
                {diskrepans !== null
                  ? `${diskrepans > 0 ? "+" : ""}${Math.round(diskrepans)} m²`
                  : "—"}
              </div>
            </div>
          </div>
          {stortAfvigelse && (
            <p className="text-xs text-warning mt-3">
              Polygon og registreret areal afviger med &gt; 25 m² — verificér matrikelkort før
              beregning.
            </p>
          )}
          {!data.hasCanonicalPolygon && (
            <p className="text-xs text-muted-foreground mt-2">
              Ingen kanonisk polygon — geometri kan være ufuldstændig.
            </p>
          )}
        </>
      )}
    </DatakildeCard>
  );
}

function TjekditnetSektion({
  data,
  onRetry,
}: {
  data: TjekditnetCoverageData | null;
  onRetry: () => void;
}) {
  const teknologier = data
    ? [
        { label: "Fiber", mbit: data.fiber_download_mbit, available: data.fiber_tilgaengelig },
        {
          label: "Kabel-TV",
          mbit: data.kabel_tv_download_mbit,
          available: data.kabel_tilgaengelig,
        },
        { label: "xDSL", mbit: data.xdsl_download_mbit, available: data.xdsl_tilgaengelig },
        {
          label: "Fast trådløst",
          mbit: data.fast_traadloes_download_mbit,
          available: data.fast_traadloes_tilgaengelig,
        },
        { label: "Mobil", mbit: data.mobil_download_mbit, available: data.mobil_tilgaengelig },
      ]
    : [];
  const maxFast = data?.max_fast_download_mbit ?? null;
  return (
    <DatakildeCard
      kind="tjekditnet"
      icon={Wifi}
      label="BREDBÅNDSDÆKNING"
      onRetry={onRetry}
      emptyMessage="Ingen bredbåndsdækningsdata for adressen."
    >
      {data && data.match_type === "no_hit" ? (
        <p className="text-sm text-muted-foreground">
          Ingen dækningsdata for denne adresse i tjekditnet-bulk.
        </p>
      ) : data ? (
        <>
          <div className="mb-3">
            <div className="text-[11px] font-mono text-muted-foreground mb-1">
              BEDSTE FASTE DOWNLOAD
            </div>
            <div className="text-lg font-mono text-foreground tabular-nums">
              {maxFast !== null ? `${maxFast} Mbit/s` : "—"}
            </div>
          </div>
          <div className="space-y-2">
            {teknologier.map((t) => (
              <div
                key={t.label}
                className="flex items-center justify-between border-t border-border/40 pt-2 text-sm"
              >
                <span className="text-foreground">{t.label}</span>
                <span
                  className={`font-mono tabular-nums ${
                    t.available ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {t.mbit !== null && t.mbit > 0 ? `${t.mbit} Mbit/s` : "ikke tilgængeligt"}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </DatakildeCard>
  );
}

function EnergimaerkeSektion({
  data,
  onRetry,
}: {
  data: EnergyLabelData | null;
  onRetry: () => void;
}) {
  const klasse = data?.energimaerke_klasse ?? null;
  const udloebet = data?.er_udloebet ?? null;
  const klasseColor = !klasse
    ? "text-muted-foreground border-border bg-[#1a1a1a]"
    : klasse.startsWith("A")
      ? "text-success border-success/40 bg-success/10"
      : ["B", "C"].includes(klasse)
        ? "text-foreground border-border bg-[#1a1a1a]"
        : "text-warning border-warning/40 bg-warning/10";
  return (
    <DatakildeCard
      kind="energimaerke"
      icon={Zap}
      label="ENERGIMÆRKE (EMODATA)"
      onRetry={onRetry}
      emptyMessage="Intet energimærke registreret for bygningen."
    >
      {data && data.match_type === "no_hit" ? (
        <p className="text-sm text-muted-foreground">
          Ingen registreret energimærke for bygningen.
        </p>
      ) : data && data.match_type === "skipped" ? (
        <p className="text-sm text-muted-foreground">
          EMOData-opslag sprunget over (manglende adgang) — kan tilføjes senere.
        </p>
      ) : data ? (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className={`inline-flex items-center font-mono text-sm tracking-[0.1em] rounded-full border px-3 py-1 ${klasseColor}`}
            >
              KLASSE {klasse ?? "—"}
            </span>
            {udloebet === true && (
              <span className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] rounded-full border px-3 py-1 text-warning border-warning/40 bg-warning/10">
                UDLØBET
              </span>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
            {data.rapportdato && (
              <div>
                Rapportdato:{" "}
                <span className="text-foreground font-mono">{data.rapportdato.slice(0, 10)}</span>
              </div>
            )}
            {data.gyldig_til && (
              <div>
                Gyldig til:{" "}
                <span className="text-foreground font-mono">{data.gyldig_til.slice(0, 10)}</span>
              </div>
            )}
            {data.rapport_url && (
              <a
                href={data.rapport_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-accent hover:underline"
              >
                Rapport PDF <ExternalLink size={10} />
              </a>
            )}
          </div>
        </>
      ) : null}
    </DatakildeCard>
  );
}

export { LoadingView, ErrorView, AnalyseTab };
