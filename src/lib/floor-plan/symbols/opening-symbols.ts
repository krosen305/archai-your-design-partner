// src/lib/floor-plan/symbols/opening-symbols.ts
//
// Parametric SVG path definitions for doors, windows and other openings.
// All coordinates in LOCAL_METER centered on (0,0). Width is the clear
// opening dimension. Height/depth is the wall thickness or leaf thickness.

import type { SymbolPaths } from "./symbol-types";
export type { SymbolPaths };

/**
 * Door symbol: door leaf (thin rectangle) + quarter-circle swing arc.
 * The leaf is along the x-axis (left to right). The hinge is at x = -widthM/2.
 * swing "left" opens upward (+y arc), swing "right" opens downward (-y arc).
 * Convention: the arc represents the full 90-degree sweep of the door leaf.
 *
 * @param widthM   Clear door width (leaf length), default 0.9 m
 * @param depthM   Leaf thickness, default 0.04 m (40mm)
 * @param swing    "left" | "right"
 */
export function doorPaths(
  widthM = 0.9,
  depthM = 0.04,
  swing: "left" | "right" = "left",
): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  // Door leaf: thin rectangle from -hw..+hw along x, centred on y=0
  const leaf = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;

  // Hinge at (-hw, 0). Leaf swings out to the y-axis side.
  // Arc: radius = widthM. Quarter circle (90°).
  // "left" swing: hinge at left, tip travels from (hw, 0) to (0, widthM) for left-open
  // Actually architectural convention in plan view:
  //   - hinge is at one jamb (-hw, 0)
  //   - leaf tip starts at (+hw, 0)
  //   - swing "left" = tip moves to (-hw + 0, +widthM) = arc upward
  //   - swing "right" = tip moves to (-hw + 0, -widthM) = arc downward
  const r = widthM;
  let arc: string;
  if (swing === "left") {
    // Large arc flag=0, sweep=1 for CCW quarter turn from (hw,0) to (-hw, widthM)
    arc = `M${hw},0 A${r},${r} 0 0 0 ${-hw},${widthM}`;
    // Radial line from hinge to start of arc (already the leaf, but add the radial reference line)
    // Convention: just the arc is sufficient, leaf is the rectangle
  } else {
    arc = `M${hw},0 A${r},${r} 0 0 1 ${-hw},${-widthM}`;
  }

  return {
    paths: [leaf, arc],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Sliding door: two overlapping rectangles with directional arrow lines.
 * Both panels share the same opening width (each panel = widthM/2).
 */
export function slidingDoorPaths(widthM = 1.2, depthM = 0.05): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const panelW = widthM / 2;
  // Left panel
  const left = `M${-hw},${-hd} L${0},${-hd} L${0},${hd} L${-hw},${hd} Z`;
  // Right panel (overlaps left by 25%)
  const overlap = panelW * 0.25;
  const rStart = -overlap;
  const right = `M${rStart},${-hd} L${hw},${-hd} L${hw},${hd} L${rStart},${hd} Z`;
  // Arrow lines: left arrow in left panel, right arrow in right panel
  const arrowY = 0;
  const arrowLen = panelW * 0.4;
  const headLen = panelW * 0.12;
  // Left panel arrow (pointing left)
  const lax = -hw + panelW * 0.5;
  const leftArrow = [
    `M${lax + arrowLen / 2},${arrowY} L${lax - arrowLen / 2},${arrowY}`,
    `M${lax - arrowLen / 2},${arrowY} L${lax - arrowLen / 2 + headLen},${headLen}`,
    `M${lax - arrowLen / 2},${arrowY} L${lax - arrowLen / 2 + headLen},${-headLen}`,
  ].join(" ");
  // Right panel arrow (pointing right)
  const rax = hw - panelW * 0.5 + overlap / 2;
  const rightArrow = [
    `M${rax - arrowLen / 2},${arrowY} L${rax + arrowLen / 2},${arrowY}`,
    `M${rax + arrowLen / 2},${arrowY} L${rax + arrowLen / 2 - headLen},${headLen}`,
    `M${rax + arrowLen / 2},${arrowY} L${rax + arrowLen / 2 - headLen},${-headLen}`,
  ].join(" ");
  return {
    paths: [left, right, leftArrow, rightArrow],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Window symbol: three parallel lines representing outer frame, glass and inner frame.
 * Oriented along x-axis. Width = window width. Depth = wall thickness.
 */
export function windowPaths(widthM = 1.2, depthM = 0.12): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  // Outer frame line
  const outer = `M${-hw},${-hd} L${hw},${-hd}`;
  // Centre glass line
  const glass = `M${-hw},0 L${hw},0`;
  // Inner frame line
  const inner = `M${-hw},${hd} L${hw},${hd}`;
  // Short end caps to make it look like a window in a wall
  const capLeft = `M${-hw},${-hd} L${-hw},${hd}`;
  const capRight = `M${hw},${-hd} L${hw},${hd}`;
  return {
    paths: [outer, glass, inner, capLeft, capRight],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}

/**
 * Garage door: full-width rectangle with evenly spaced horizontal panel lines
 * representing the sectional door panels.
 */
export function garageDoorPaths(widthM = 2.4, depthM = 0.1): SymbolPaths {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outer = `M${-hw},${-hd} L${hw},${-hd} L${hw},${hd} L${-hw},${hd} Z`;
  // 3 panel lines evenly spaced within the depth
  const panels: string[] = [];
  const panelCount = 3;
  for (let i = 1; i <= panelCount; i++) {
    const y = -hd + (depthM / (panelCount + 1)) * i;
    panels.push(`M${-hw},${y} L${hw},${y}`);
  }
  return {
    paths: [outer, ...panels],
    defaultWidthM: widthM,
    defaultHeightM: depthM,
  };
}
