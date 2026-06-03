// src/lib/floor-plan/symbols/kitchen-symbols.ts
//
// Parametric SVG path definitions for kitchen elements. All coordinates in
// LOCAL_METER centered on (0,0).

import type { SymbolPaths } from "./symbol-types";
export type { SymbolPaths };

/**
 * Kitchen worktop unit: rectangle (counter top). 600mm depth, variable width.
 * A thin inner line 50mm from the front edge represents the worktop edge.
 */
export function kitchenUnitPaths(widthM = 0.6, depthM = 0.6): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  // Inner front-edge line (50mm from front face, full width)
  const inset = Math.min(0.05, depthM * 0.1);
  const frontLine = `M${-hw},${hd - inset} L${hw},${hd - inset}`;
  return {
    paths: [outer, frontLine],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Kitchen island: free-standing rectangular unit, no wall attachment.
 */
export function kitchenIslandPaths(widthM = 1.2, depthM = 0.9): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  return {
    paths: [outer],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Kitchen sink: double-bowl variant. Two circles side by side inside a rectangle.
 */
export function kitchenSinkPaths(widthM = 0.8, depthM = 0.5): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  // Two bowl circles side by side
  const bowlR = Math.min(widthM * 0.22, depthM * 0.38);
  const cx = widthM * 0.22;
  const bowl1 = `M${-cx + bowlR},0 A${bowlR},${bowlR} 0 1 1 ${-cx - bowlR},0 A${bowlR},${bowlR} 0 1 1 ${-cx + bowlR},0 Z`;
  const bowl2 = `M${cx + bowlR},0 A${bowlR},${bowlR} 0 1 1 ${cx - bowlR},0 A${bowlR},${bowlR} 0 1 1 ${cx + bowlR},0 Z`;
  return {
    paths: [outer, bowl1, bowl2],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Appliance label box: a simple rectangle with a centred text label.
 * Returns only the path (caller adds <text> separately if needed).
 * Defaults match a standard 600×600 appliance footprint.
 */
export function appliancePaths(widthM = 0.6, depthM = 0.6): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  // X-mark inside to differentiate from plain unit
  const x1 = `M${-hw * 0.6},${-hd * 0.6} L${hw * 0.6},${hd * 0.6}`;
  const x2 = `M${hw * 0.6},${-hd * 0.6} L${-hw * 0.6},${hd * 0.6}`;
  return {
    paths: [outer, x1, x2],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}
