// src/lib/floor-plan/symbols/symbol-registry.ts
//
// Central registry for all floor-plan symbols. Each symbol is parameterised by
// optional width/height overrides. Symbols are returned in LOCAL_METER
// coordinates centered on (0,0). The SVG renderer applies a
// transform="translate(cx,cy) scale(s,-s)" group per symbol.

import { toiletPaths, sinkPaths, showerPaths, bathtubPaths } from "./fixture-symbols";
import {
  kitchenUnitPaths,
  kitchenIslandPaths,
  kitchenSinkPaths,
  appliancePaths,
} from "./kitchen-symbols";
import {
  singleBedPaths,
  doubleBedPaths,
  sofaPaths,
  armchairPaths,
  diningTablePaths,
  chairPaths,
  wardrobeShelfPaths,
} from "./furniture-symbols";
import { doorPaths, slidingDoorPaths, windowPaths, garageDoorPaths } from "./opening-symbols";
import { FURNITURE_KINDS } from "@/domain/floor-plan/floor-plan.schemas";

// Re-export FURNITURE_KINDS and FurnitureKind so consumers can import from one place.
export { FURNITURE_KINDS } from "@/domain/floor-plan/floor-plan.schemas";
export type { FurnitureKind } from "@/domain/floor-plan/floor-plan.schemas";

// --- Kind union type ---------------------------------------------------------

export type SymbolKind =
  // Sanitary fixtures
  | "toilet"
  | "washbasin"
  | "shower"
  | "bathtub"
  // Kitchen
  | "kitchen_unit"
  | "kitchen_island"
  | "kitchen_sink"
  | "appliance"
  // Furniture (from FURNITURE_KINDS canonical list)
  | (typeof FURNITURE_KINDS)[number]
  // Openings
  | "door"
  | "door_left"
  | "door_right"
  | "sliding_door"
  | "window"
  | "garage_door";

// --- Output type -------------------------------------------------------------

export type SymbolPath = {
  kind: SymbolKind;
  /** SVG path `d` strings in LOCAL_METER, centered on (0,0). */
  paths: string[];
  defaultWidthM: number;
  defaultHeightM: number;
};

// --- Registry function -------------------------------------------------------

/**
 * Return the symbol definition for `kind`. Optional `widthM`/`heightM`
 * override the default dimensions. All coordinates are in LOCAL_METER centered
 * on (0,0).
 */
export function getSymbol(kind: SymbolKind, widthM?: number, heightM?: number): SymbolPath {
  const result = resolve(kind, widthM, heightM);
  return { kind, ...result };
}

function resolve(
  kind: SymbolKind,
  widthM?: number,
  heightM?: number,
): { paths: string[]; defaultWidthM: number; defaultHeightM: number } {
  switch (kind) {
    // --- Sanitary ---
    case "toilet":
      return toiletPaths(widthM, heightM);
    case "washbasin":
      return sinkPaths(widthM, heightM);
    case "shower":
      return showerPaths(widthM, heightM);
    case "bathtub":
      return bathtubPaths(widthM, heightM);

    // --- Kitchen ---
    case "kitchen_unit":
      return kitchenUnitPaths(widthM, heightM);
    case "kitchen_island":
      return kitchenIslandPaths(widthM, heightM);
    case "kitchen_sink":
      return kitchenSinkPaths(widthM, heightM);
    case "appliance":
      return appliancePaths(widthM, heightM);

    // --- Furniture ---
    case "single_bed":
      return singleBedPaths(widthM, heightM);
    case "double_bed":
      return doubleBedPaths(widthM, heightM);
    case "sofa":
      return sofaPaths(widthM, heightM);
    case "armchair":
      return armchairPaths(widthM, heightM);
    case "dining_table":
      return diningTablePaths(widthM, heightM);
    case "chair":
      return chairPaths(widthM, heightM);
    case "wardrobe_shelf":
      return wardrobeShelfPaths(widthM, heightM);

    // --- Openings ---
    case "door":
    case "door_left":
      return doorPaths(widthM, heightM, "left");
    case "door_right":
      return doorPaths(widthM, heightM, "right");
    case "sliding_door":
      return slidingDoorPaths(widthM, heightM);
    case "window":
      return windowPaths(widthM, heightM);
    case "garage_door":
      return garageDoorPaths(widthM, heightM);

    default: {
      // Exhaustiveness check — TypeScript will error if a case is unhandled
      const _exhaustive: never = kind;
      throw new Error(`getSymbol: unknown kind "${String(_exhaustive)}"`);
    }
  }
}
