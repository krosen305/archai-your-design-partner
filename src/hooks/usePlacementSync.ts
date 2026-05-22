import { useEffect, useState } from "react";
import { useProject } from "@/lib/project-store";
import { syncPatch } from "@/lib/project-sync";
import type { Address } from "@/types/project-state";

export function usePlacementSync(address: Address | null): {
  rotationDeg: number;
  updateRotation: (deg: number) => void;
  resetPlacement: (
    geo: { lat: number; lng: number } | null,
    initialCenter: [number, number] | null,
  ) => void;
} {
  const { setAddress } = useProject();
  const [rotationDeg, setRotationDeg] = useState(address?.rotationDeg ?? 0);

  useEffect(() => {
    setRotationDeg(address?.rotationDeg ?? 0);
  }, [address?.rotationDeg]);

  const updateRotation = (deg: number) => {
    setRotationDeg(deg);
    if (!address) return;
    const next = { ...address, rotationDeg: deg };
    setAddress(next);
    void syncPatch({ address: next });
  };

  const resetPlacement = (
    geo: { lat: number; lng: number } | null,
    initialCenter: [number, number] | null,
  ) => {
    if (!address) return;
    const next = {
      ...address,
      centroid: geo ?? (initialCenter ? { lat: initialCenter[1], lng: initialCenter[0] } : null),
      rotationDeg: 0,
    };
    setRotationDeg(0);
    setAddress(next);
    void syncPatch({ address: next });
  };

  return { rotationDeg, updateRotation, resetPlacement };
}
