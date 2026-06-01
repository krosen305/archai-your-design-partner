// src/lib/floor-plan/symbols/furniture-symbols.ts
//
// Parametric SVG path definitions for furniture. All coordinates in
// LOCAL_METER centered on (0,0). Y-axis is architectural (up = positive).
// The SVG renderer applies scale(s,-s) so orientation is correct on screen.

export type SymbolPaths = {
  paths: string[];
  defaultWidthM: number;
  defaultHeightM: number;
};

/**
 * Single bed: 900×2000 rectangle with one oval pillow at head end.
 * Head end is at positive-y (top in LOCAL_METER).
 */
export function singleBedPaths(widthM = 0.9, depthM = 2.0): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  // Pillow: oval at head end
  const pr = hw * 0.72;
  const ph = depthM * 0.12;
  const pc = hd - ph - depthM * 0.04;
  const pillow = `M${pr},${pc} A${pr},${ph} 0 1 1 ${-pr},${pc} A${pr},${ph} 0 1 1 ${pr},${pc} Z`;
  return {
    paths: [outer, pillow],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Double bed: 1600×2000 with two oval pillows side by side.
 */
export function doubleBedPaths(widthM = 1.6, depthM = 2.0): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  const pr = hw * 0.38;
  const ph = depthM * 0.1;
  const pc = hd - ph - depthM * 0.04;
  const cx = hw * 0.45;
  const pillow1 = `M${-cx + pr},${pc} A${pr},${ph} 0 1 1 ${-cx - pr},${pc} A${pr},${ph} 0 1 1 ${-cx + pr},${pc} Z`;
  const pillow2 = `M${cx + pr},${pc} A${pr},${ph} 0 1 1 ${cx - pr},${pc} A${pr},${ph} 0 1 1 ${cx + pr},${pc} Z`;
  return {
    paths: [outer, pillow1, pillow2],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Sofa: 2000×900 rectangle with a seat-cushion line and arm rests.
 */
export function sofaPaths(widthM = 2.0, depthM = 0.9): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  // Back rest line
  const backY = hd - depthM * 0.25;
  const back = `M${-hw},${backY} L${hw},${backY}`;
  // Arm rests (left and right ends)
  const armW = widthM * 0.07;
  const armTop = hd;
  const armBottom = hd - depthM * 0.55;
  const armLeft = `M${-hw},${armBottom} L${-hw + armW},${armBottom} L${-hw + armW},${armTop}`;
  const armRight = `M${hw - armW},${armBottom} L${hw},${armBottom} L${hw},${armTop}`;
  return {
    paths: [outer, back, armLeft, armRight],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Armchair: 900×900 with back rest line and arm rests.
 */
export function armchairPaths(widthM = 0.9, depthM = 0.9): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  const backY = hd - depthM * 0.25;
  const back = `M${-hw},${backY} L${hw},${backY}`;
  const armW = widthM * 0.1;
  const armBottom = hd - depthM * 0.6;
  const armLeft = `M${-hw},${armBottom} L${-hw + armW},${armBottom} L${-hw + armW},${hd}`;
  const armRight = `M${hw - armW},${armBottom} L${hw},${armBottom} L${hw},${hd}`;
  return {
    paths: [outer, back, armLeft, armRight],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Dining table: rectangular (default 1600×900).
 */
export function diningTablePaths(widthM = 1.6, depthM = 0.9): SymbolPaths {
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
 * Chair: 450×450 circle (seen from above, round seat).
 */
export function chairPaths(widthM = 0.45, depthM = 0.45): SymbolPaths {
  const r = Math.min(widthM, depthM) / 2;
  const circle = `M${r},0 A${r},${r} 0 1 1 ${-r},0 A${r},${r} 0 1 1 ${r},0 Z`;
  return {
    paths: [circle],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Walk-in wardrobe / shelf unit: rectangle with diagonal shelf hatching lines.
 */
export function wardrobeShelfPaths(widthM = 2.0, depthM = 0.6): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  // Three evenly-spaced diagonal shelf lines
  const step = widthM / 4;
  const diags: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const x = -hw + step * i;
    diags.push(`M${x - hd},${-hd} L${x + hd},${hd}`);
  }
  return {
    paths: [outer, ...diags],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}
