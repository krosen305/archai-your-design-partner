import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useProject } from "@/lib/project-store";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import { FreeDesignCockpit } from "@/components/cockpit/FreeDesignCockpit";
import { LoadingView, ErrorView } from "@/components/cockpit/AnalyseTab";
import { useCockpitRestore } from "@/hooks/useCockpitRestore";
import { useCockpitAnalysis } from "@/hooks/useCockpitAnalysis";
import type { AnalysisSnapshot } from "@/lib/project-restore-facade";
import { CockpitLayout } from "@/components/cockpit/layout/CockpitLayout";
import { VerdiktSection } from "@/components/cockpit/sections/VerdiktSection";
import { OpmærksomhedSection } from "@/components/cockpit/sections/OpmærksomhedSection";
import { GrundenSection } from "@/components/cockpit/sections/GrundenSection";
import { PlanReguleringSection } from "@/components/cockpit/sections/PlanReguleringSection";
import { OkonomiSection } from "@/components/cockpit/sections/OkonomiSection";
import { NaesteStepSection } from "@/components/cockpit/sections/NaesteStepSection";
import { DatakilderSection } from "@/components/cockpit/sections/DatakilderSection";
import { ByggeønskerSection } from "@/components/cockpit/sections/ByggeønskerSection";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/projekt/$id/cockpit")({
  component: CockpitPage,
  validateSearch: (search: Record<string, unknown>) => {
    const tab = search.tab;
    const projectId = search.projectId;
    return {
      tab: typeof tab === "string" ? tab : undefined,
      projectId: typeof projectId === "string" && projectId.trim() ? projectId : undefined,
    };
  },
});

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
  const { tab: _tab, projectId: searchProjectId } = Route.useSearch();
  const { address, bbrData, complianceMetrics } = useProject();
  const setSnapshotPatchRef = useRef<((p: Partial<AnalysisSnapshot>) => void) | null>(null);

  const { restorePhase } = useCockpitRestore({
    adresseId,
    searchProjectId,
    onSnapshotRestored: (patch) => setSnapshotPatchRef.current?.(patch),
  });

  const { status, fetchError, analysisSnapshot, isRecomputing, setSnapshotPatch, triggerRefresh } =
    useCockpitAnalysis({ adresseId, restorePhase });

  setSnapshotPatchRef.current = setSnapshotPatch;

  if (status === "loading") {
    return (
      <PageTransition>
        <div className="mx-auto max-w-[720px] px-6 py-10">
          <LoadingView />
        </div>
      </PageTransition>
    );
  }

  if (status === "error") {
    return (
      <PageTransition>
        <div className="mx-auto max-w-[720px] px-6 py-10">
          <ErrorView message={fetchError ?? "Ukendt fejl."} onRetry={triggerRefresh} />
        </div>
      </PageTransition>
    );
  }

  if (!bbrData) return null;

  return (
    <CockpitLayout adresse={address?.adresse ?? adresseId}>
      {(scrollTo, registerSection) => (
        <>
          <VerdiktSection
            metrics={complianceMetrics}
            registerSection={registerSection}
            scrollTo={scrollTo}
          />
          <OpmærksomhedSection onOpenDetails={() => {}} registerSection={registerSection} />
          <GrundenSection
            bbr={bbrData}
            metrics={complianceMetrics}
            naboer={analysisSnapshot.naboer}
            registerSection={registerSection}
          />
          <ByggeønskerSection registerSection={registerSection} />
          <PlanReguleringSection
            lokalplaner={analysisSnapshot.lokalplaner}
            servitutter={analysisSnapshot.servitutter}
            registerSection={registerSection}
          />
          <OkonomiSection registerSection={registerSection} />
          <NaesteStepSection registerSection={registerSection} scrollTo={scrollTo} />
          <DatakilderSection
            onRefreshAll={triggerRefresh}
            isRefreshing={isRecomputing}
            registerSection={registerSection}
          />
        </>
      )}
    </CockpitLayout>
  );
}
