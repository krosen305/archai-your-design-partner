import { useState, useEffect } from "react";
import { useProject } from "@/lib/project-store";
import { getSession } from "@/lib/auth";
import { loadProjectRestore } from "@/lib/project-sync";
import { logger } from "@/lib/logger";
import { runProjectRestoreWorkflow } from "@/lib/project-restore-workflow";
import { hydrateProjectIntoStore, type AnalysisSnapshot } from "@/lib/project-restore-facade";
import { routeMatchesAddress, objectField } from "@/hooks/cockpit-restore-utils";

export { routeMatchesAddress, objectField };

export type RestorePhase = "pending" | "checked";

export function useCockpitRestore(params: {
  adresseId: string;
  searchProjectId: string | undefined;
  onSnapshotRestored: (snapshot: Partial<AnalysisSnapshot>) => void;
}): { restorePhase: RestorePhase } {
  const { adresseId, searchProjectId, onSnapshotRestored } = params;
  const address = useProject((s) => s.address);
  const bbrData = useProject((s) => s.bbrData);

  // Spring kun restore over hvis vi både har matching adresse OG compliance
  // in-memory. Hvis bbrData mangler skal vi hente fra Supabase — ellers fyrer
  // useCockpitAnalysis en ny fetchCompliance og kører en dyr analyse forfra.
  const [restorePhase, setRestorePhase] = useState<RestorePhase>(
    routeMatchesAddress(address, adresseId) && bbrData ? "checked" : "pending",
  );

  useEffect(() => {
    if (routeMatchesAddress(address, adresseId) && useProject.getState().bbrData) {
      setRestorePhase("checked");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const project = await runProjectRestoreWorkflow(
          {
            projectId: searchProjectId ?? null,
            addressId: adresseId,
          },
          {
            getSession,
            loadProjectRestore,
          },
        );
        if (cancelled) return;
        if (!project) return;
        const snapshot = hydrateProjectIntoStore(project, { routeAddressId: adresseId });
        onSnapshotRestored(snapshot);
      } catch (e) {
        logger.warn("[Cockpit] restore-by-url fejlede:", (e as Error).message);
      } finally {
        if (!cancelled) setRestorePhase("checked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { restorePhase };
}
