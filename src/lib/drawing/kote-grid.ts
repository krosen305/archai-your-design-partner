// src/lib/drawing/kote-grid.ts
//
// Layer C of the kote-motor: paper-space thinning + collision unclutter for the
// open-terrain grid koter. This is a PRESENTATION concern (it reasons in mm/px
// via the Projector), so it lives in the renderer layer rather than the pure
// domain kote-engine. Grid koter are the lowest priority: a candidate is kept
// only when it is far enough from every already-kept kote AND outside every
// higher-priority occupancy box (buildings, dimension lines, kloak, A/B koter).

import { PX_PER_MM } from "./sheet-layout";
import type { Projector } from "./projector";
import { koteLabel, type TerrainSample, type KotePlacement } from "@/domain/drawing/kote-engine";

export type PaperBox = { x: number; y: number; width: number; height: number };

function inBox(px: number, py: number, b: PaperBox): boolean {
  return px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height;
}

/**
 * Greedy spatial thinning in paper space. Keeps a candidate only when it is
 * >= minSpacingMm (converted to px) from every already-kept/already-placed kote
 * and outside every occupancy box.
 */
export function selectGridKoter(input: {
  terrain: TerrainSample[];
  project: Projector;
  minSpacingMm: number;
  occupancy: PaperBox[];
  alreadyPlaced: KotePlacement[];
}): KotePlacement[] {
  const minPx = input.minSpacingMm * PX_PER_MM;
  const minPxSq = minPx * minPx;
  const keptPx: [number, number][] = input.alreadyPlaced.map((k) => input.project(k.x, k.y));
  const out: KotePlacement[] = [];
  for (const t of input.terrain) {
    const [px, py] = input.project(t.x, t.y);
    if (input.occupancy.some((b) => inBox(px, py, b))) continue;
    let ok = true;
    for (const [kx, ky] of keptPx) {
      if ((px - kx) ** 2 + (py - ky) ** 2 < minPxSq) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    keptPx.push([px, py]);
    out.push({ x: t.x, y: t.y, z: t.z, label: koteLabel(t.z), layer: "C", kind: "grid" });
  }
  return out;
}
