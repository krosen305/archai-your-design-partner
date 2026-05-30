import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth";
import { useProject } from "@/lib/project-store";
import { saveProjectPatch } from "@/lib/project-sync";
import { runProjectSaveWorkflow } from "@/lib/project-save-workflow";
import type { DesignPlacement } from "@/types/project-state";

function buildPlacement(
  current: DesignPlacement | null,
  patch: Partial<DesignPlacement>,
): DesignPlacement {
  return {
    footprintGeojson:
      patch.footprintGeojson !== undefined
        ? patch.footprintGeojson
        : (current?.footprintGeojson ?? null),
    footprintAreaM2:
      patch.footprintAreaM2 !== undefined
        ? patch.footprintAreaM2
        : (current?.footprintAreaM2 ?? null),
    centroid: patch.centroid !== undefined ? patch.centroid : (current?.centroid ?? null),
    rotationDeg: patch.rotationDeg !== undefined ? patch.rotationDeg : (current?.rotationDeg ?? 0),
    floors: patch.floors !== undefined ? patch.floors : (current?.floors ?? null),
    heightM: patch.heightM !== undefined ? patch.heightM : (current?.heightM ?? null),
    minDistanceToBoundaryM:
      patch.minDistanceToBoundaryM !== undefined
        ? patch.minDistanceToBoundaryM
        : (current?.minDistanceToBoundaryM ?? null),
    outsideParcelAreaM2:
      patch.outsideParcelAreaM2 !== undefined
        ? patch.outsideParcelAreaM2
        : (current?.outsideParcelAreaM2 ?? 0),
    source: patch.source !== undefined ? patch.source : (current?.source ?? "user"),
  };
}

export function usePlacementSync(
  designPlacement: DesignPlacement | null,
  fallbackCentroid: { lat: number; lng: number } | null,
): {
  rotationDeg: number;
  updateRotation: (deg: number) => void;
  updateCentroid: (centroid: { lat: number; lng: number }) => void;
  resetPlacement: (initialCenter: [number, number] | null) => void;
} {
  const { setDesignPlacement, currentProjectId } = useProject();
  const [rotationDeg, setRotationDeg] = useState(designPlacement?.rotationDeg ?? 0);

  useEffect(() => {
    setRotationDeg(designPlacement?.rotationDeg ?? 0);
  }, [designPlacement?.rotationDeg]);

  const persistPlacement = (patch: Partial<DesignPlacement>) => {
    const next = buildPlacement(designPlacement, patch);
    setDesignPlacement(next);
    void runProjectSaveWorkflow(
      {
        patch: { designPlacement: next },
        projectId: currentProjectId,
      },
      {
        getSession,
        saveProjectPatch,
      },
    );
  };

  const updateRotation = (deg: number) => {
    setRotationDeg(deg);
    persistPlacement({ rotationDeg: deg, source: "user" });
  };

  const updateCentroid = (centroid: { lat: number; lng: number }) => {
    persistPlacement({ centroid, source: "user" });
  };

  const resetPlacement = (initialCenter: [number, number] | null) => {
    const centroid =
      fallbackCentroid ?? (initialCenter ? { lat: initialCenter[1], lng: initialCenter[0] } : null);
    setRotationDeg(0);
    persistPlacement({ centroid, rotationDeg: 0, source: "user" });
  };

  return { rotationDeg, updateRotation, updateCentroid, resetPlacement };
}
