// src/lib/floor-plan/symbols/landscape-symbols.ts
//
// Parametric SVG path definitions for outdoor/landscape symbols and
// walk-in wardrobe. All coordinates in LOCAL_METER centered on (0,0).
// Y-axis is architectural (up = positive).

import type { SymbolPaths } from "./symbol-types";

/**
 * Vehicle (car plan view): rounded rectangle body with a cabin/roof line.
 * Default ~4.6 × 1.9 m (typical compact car footprint).
 */
export function vehiclePaths(widthM = 1.9, heightM = 4.6): SymbolPaths {
  const hw = widthM / 2;
  const hh = heightM / 2;
  // Body outline as a simple rectangle
  const body = `M${-hw},${-hh} L${hw},${-hh} L${hw},${hh} L${-hw},${hh} Z`;
  // Cabin/windscreen lines: front at ~25% from front, rear at ~30% from rear
  const frontY = hh - heightM * 0.25;
  const rearY = -hh + heightM * 0.3;
  const inset = hw * 0.1;
  const frontScreen = `M${-hw + inset},${frontY} L${hw - inset},${frontY}`;
  const rearScreen = `M${-hw + inset},${rearY} L${hw - inset},${rearY}`;
  // Wheel arches: four small rectangles at corners
  const ww = hw * 0.25; // wheel width along car axis
  const wd = hw * 0.15; // wheel depth (sticking out visually)
  const axleFront = hh - heightM * 0.18;
  const axleRear = -hh + heightM * 0.18;
  const wheelFL = `M${-hw - wd},${axleFront - ww} L${-hw},${axleFront - ww} L${-hw},${axleFront + ww} L${-hw - wd},${axleFront + ww} Z`;
  const wheelFR = `M${hw},${axleFront - ww} L${hw + wd},${axleFront - ww} L${hw + wd},${axleFront + ww} L${hw},${axleFront + ww} Z`;
  const wheelRL = `M${-hw - wd},${axleRear - ww} L${-hw},${axleRear - ww} L${-hw},${axleRear + ww} L${-hw - wd},${axleRear + ww} Z`;
  const wheelRR = `M${hw},${axleRear - ww} L${hw + wd},${axleRear - ww} L${hw + wd},${axleRear + ww} L${hw},${axleRear + ww} Z`;
  return {
    paths: [body, frontScreen, rearScreen, wheelFL, wheelFR, wheelRL, wheelRR],
    defaultWidthM: widthM,
    defaultHeightM: heightM,
  };
}

/**
 * Plant (potted plant / tree plan view): circle outline with three leaf strokes.
 * Default 0.6 × 0.6 m.
 */
export function plantPaths(widthM = 0.6, heightM = 0.6): SymbolPaths {
  const r = Math.min(widthM, heightM) / 2;
  const circle = `M${r},0 A${r},${r} 0 1 1 ${-r},0 A${r},${r} 0 1 1 ${r},0 Z`;
  // Three leaf strokes from center to edge at 0°, 120°, 240°
  const angles = [90, 210, 330];
  const leaves = angles.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const ex = (r * 0.85 * Math.cos(rad)).toFixed(4);
    const ey = (r * 0.85 * Math.sin(rad)).toFixed(4);
    return `M0,0 L${ex},${ey}`;
  });
  return {
    paths: [circle, ...leaves],
    defaultWidthM: widthM,
    defaultHeightM: heightM,
  };
}

/**
 * Outdoor lounge seat: sofa-like rectangle with seat division lines and arm rests.
 * Default 2.0 × 0.8 m.
 */
export function outdoorLoungePaths(widthM = 2.0, heightM = 0.8): SymbolPaths {
  const hw = widthM / 2;
  const hh = heightM / 2;
  const outer = `M${-hw},${-hh} L${hw},${-hh} L${hw},${hh} L${-hw},${hh} Z`;
  // Back rest line
  const backY = hh - heightM * 0.22;
  const back = `M${-hw},${backY} L${hw},${backY}`;
  // Arm rests at ends
  const armW = widthM * 0.07;
  const armBottom = hh - heightM * 0.55;
  const armLeft = `M${-hw},${armBottom} L${-hw + armW},${armBottom} L${-hw + armW},${hh}`;
  const armRight = `M${hw - armW},${armBottom} L${hw},${armBottom} L${hw},${hh}`;
  // Seat cushion divider (middle of seating area)
  const seatTop = backY;
  const seatBottom = -hh;
  const midX = 0;
  const cushionMid = `M${midX},${seatBottom} L${midX},${seatTop}`;
  return {
    paths: [outer, back, armLeft, armRight, cushionMid],
    defaultWidthM: widthM,
    defaultHeightM: heightM,
  };
}

/**
 * Walk-in wardrobe: rectangle with a hanging rail line across the width.
 * Default 2.0 × 0.6 m.
 */
export function wardrobeWalkinPaths(widthM = 2.0, heightM = 0.6): SymbolPaths {
  const hw = widthM / 2;
  const hh = heightM / 2;
  const outer = `M${-hw},${-hh} L${hw},${-hh} L${hw},${hh} L${-hw},${hh} Z`;
  // Hanging rail: a horizontal line at mid-depth
  const rail = `M${-hw * 0.9},0 L${hw * 0.9},0`;
  // Small hooks at each end of the rail
  const hookSize = heightM * 0.1;
  const hookLeft = `M${-hw * 0.9},0 L${-hw * 0.9},${hookSize}`;
  const hookRight = `M${hw * 0.9},0 L${hw * 0.9},${hookSize}`;
  return {
    paths: [outer, rail, hookLeft, hookRight],
    defaultWidthM: widthM,
    defaultHeightM: heightM,
  };
}
