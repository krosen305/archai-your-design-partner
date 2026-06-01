// src/lib/floor-plan/symbols/fixture-symbols.ts
//
// Parametric SVG path definitions for sanitary fixtures. All coordinates are in
// LOCAL_METER centered on (0,0). The SVG renderer applies transform="translate(cx,cy) scale(s,-s)"
// per symbol group so y-axis flipping is handled externally.

export type SymbolPaths = {
  paths: string[];
  defaultWidthM: number;
  defaultHeightM: number;
};

/**
 * Toilet symbol: rectangular cistern + D-shaped seat pan.
 * Oriented with cistern at the top (y = depthM/2) and seat at bottom.
 * Default 380mm wide × 680mm deep.
 */
export function toiletPaths(widthM = 0.38, depthM = 0.68): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const cisternH = depthM * 0.22;
  const cisternTop = hd;
  const cisternBottom = hd - cisternH;
  // Cistern rectangle
  const cistern = `M${-hw},${cisternTop} L${hw},${cisternTop} L${hw},${cisternBottom} L${-hw},${cisternBottom} Z`;
  // Seat bowl: D-shaped, from cisternBottom to bottom
  const bowlTop = cisternBottom;
  const bowlBottom = -hd;
  const rx = hw * 0.9;
  const ry = (bowlTop - bowlBottom) / 2;
  const cy = (bowlTop + bowlBottom) / 2;
  // Outer bowl ellipse as path
  const outerBowl = `M${-hw},${bowlTop} L${hw},${bowlTop} A${rx},${ry} 0 0 1 ${hw},${bowlBottom} L${-hw},${bowlBottom} A${rx},${ry} 0 0 0 ${-hw},${bowlTop} Z`;
  // Inner ellipse (seat ring inset) — 12% inset
  const ix = rx * 0.78;
  const iy = ry * 0.82;
  const innerBowl = `M0,${cy + iy} A${ix},${iy} 0 1 1 0,${cy - iy} A${ix},${iy} 0 1 1 0,${cy + iy} Z`;
  return {
    paths: [cistern, outerBowl, innerBowl],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Sink / washbasin: rectangular outer shell with circular drain hole.
 * Default 500mm wide × 420mm deep.
 */
export function sinkPaths(widthM = 0.5, depthM = 0.42): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  // Drain: small circle near bottom centre
  const dr = depthM * 0.1;
  const drain = `M${dr},0 A${dr},${dr} 0 1 1 ${-dr},0 A${dr},${dr} 0 1 1 ${dr},0 Z`;
  return {
    paths: [outer, drain],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Shower tray: 900×900 square with two diagonal hatching lines indicating wet area.
 */
export function showerPaths(widthM = 0.9, depthM = 0.9): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  // Diagonal hatch lines (bottom-left to top-right, top-left to bottom-right)
  const diag1 = `M${-hw},${-hd} L${hw},${hd}`;
  const diag2 = `M${hw},${-hd} L${-hw},${hd}`;
  return {
    paths: [outer, diag1, diag2],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Bathtub: 1700×800 rectangle with inner oval silhouette indicating the tub basin.
 */
export function bathtubPaths(widthM = 1.7, depthM = 0.8): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  // Inner oval (basin outline, inset by ~12%)
  const rx = hw * 0.82;
  const ry = hd * 0.72;
  const basin = `M${rx},0 A${rx},${ry} 0 1 1 ${-rx},0 A${rx},${ry} 0 1 1 ${rx},0 Z`;
  // Tap end mark (small rectangle at one end)
  const tapW = widthM * 0.06;
  const tapH = depthM * 0.35;
  const tapX = hw - tapW * 0.5;
  const tap = `M${tapX - tapW},${-tapH / 2} L${tapX},${-tapH / 2} L${tapX},${tapH / 2} L${tapX - tapW},${tapH / 2} Z`;
  return {
    paths: [outer, basin, tap],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}
