import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useRef } from "react";
import { XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useProject } from "@/lib/project-store";
import { CockpitStatusBar } from "@/components/cockpit/CockpitStatusBar";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import { FreeDesignCockpit } from "@/components/cockpit/FreeDesignCockpit";
import {
  AnalyseTab,
  LoadingView,
  ErrorView,
  type AnalyseTabData,
  type AnalyseTabCallbacks,
} from "@/components/cockpit/AnalyseTab";
import { EjendomPanel } from "@/components/cockpit/EjendomPanel";
import { OekonomiPanel } from "@/components/cockpit/OekonomiPanel";
import { useCockpitRestore } from "@/hooks/useCockpitRestore";
import { useCockpitAnalysis } from "@/hooks/useCockpitAnalysis";
import type { AnalysisSnapshot } from "@/lib/project-restore-facade";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

type CockpitTab = "analyse" | "ejendom" | "oekonomi";
const VALID_TABS: readonly CockpitTab[] = ["analyse", "ejendom", "oekonomi"];

export const Route = createFileRoute("/projekt/$id/cockpit")({
  component: CockpitPage,
  validateSearch: (search: Record<string, unknown>) => {
    const tab = search.tab;
    const projectId = search.projectId;
    return {
      tab:
        typeof tab === "string" && (VALID_TABS as readonly string[]).includes(tab)
          ? (tab as CockpitTab)
          : ("analyse" as CockpitTab),
      projectId: typeof projectId === "string" && projectId.trim() ? projectId : undefined,
    };
  },
});

// ---------------------------------------------------------------------------
// HardStopBanner
// ---------------------------------------------------------------------------

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
// Cockpit content
// ---------------------------------------------------------------------------

function CockpitContent({ adresseId }: { adresseId: string }) {
  const navigate = useNavigate();
  const { tab: activeTab, projectId: searchProjectId } = Route.useSearch();
  const setActiveTab = useCallback(
    (next: CockpitTab) => {
      navigate({
        to: "/projekt/$id/cockpit",
        params: { id: adresseId },
        search: { tab: next, projectId: searchProjectId },
        replace: false,
      });
    },
    [navigate, adresseId, searchProjectId],
  );

  const { address, bbrData, complianceMetrics, vurderingData } = useProject();

  const setSnapshotPatchRef = useRef<((p: Partial<AnalysisSnapshot>) => void) | null>(null);

  const { restorePhase } = useCockpitRestore({
    adresseId,
    searchProjectId,
    onSnapshotRestored: (patch) => setSnapshotPatchRef.current?.(patch),
  });

  const {
    status,
    fetchError,
    analysisSnapshot,
    isRecomputing,
    setSnapshotPatch,
    triggerRefresh,
    runManualAnalyse,
  } = useCockpitAnalysis({ adresseId, restorePhase });

  setSnapshotPatchRef.current = setSnapshotPatch;

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
          <ErrorView message={fetchError ?? "Ukendt fejl."} onRetry={triggerRefresh} />
        )}

        {status === "done" && bbrData && (
          <>
            <CockpitStatusBar onRefreshAll={triggerRefresh} isRefreshing={false} />
            <HardStopBanner />

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
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
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

            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {activeTab === "analyse" && (
                <AnalyseTab
                  adresse={address?.adresse ?? ""}
                  analyseData={
                    {
                      data: bbrData,
                      lokalplaner: analysisSnapshot.lokalplaner,
                      byggeanalyse: useProject.getState().byggeanalyseResultat,
                      metrics: complianceMetrics,
                      fbbData: analysisSnapshot.fbbData,
                      vurderingData,
                      geusRisk: analysisSnapshot.geusRisk,
                      servitutter: analysisSnapshot.servitutter,
                      terrain: analysisSnapshot.terrain,
                      fjernvarme: analysisSnapshot.fjernvarme,
                      naboer: analysisSnapshot.naboer,
                      naturbeskyttelse: analysisSnapshot.naturbeskyttelse,
                      dkjord: analysisSnapshot.dkjord,
                    } satisfies AnalyseTabData
                  }
                  callbacks={
                    {
                      onRunAnalyse: runManualAnalyse,
                      onShowEjendom: () => setActiveTab("ejendom"),
                      onShowOekonomi: () => setActiveTab("oekonomi"),
                    } satisfies AnalyseTabCallbacks
                  }
                  isRecomputing={isRecomputing}
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
