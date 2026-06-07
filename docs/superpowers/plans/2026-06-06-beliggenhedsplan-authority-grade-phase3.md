# Beliggenhedsplan Authority-Grade — Phase 3: SVG Renderer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Prerequisite:** Phase 1 and Phase 2 complete and merged.

**Goal:** Add road geometry, naturbeskyttelse, LER, placeholder elements, and UDKAST watermark to the SVG output. The drawing renders meaningful content where data is available and clearly-labelled placeholders where it is not.

**Architecture:** New `DrawingLayerKind` values added to `drawing-model.ts`. New layer builder functions in `src/lib/drawing/layers/` produce `DrawingFeature[]`. `buildDrawingModel` in `drawing-model-builder.ts` calls the new builders. `render-svg.ts` is unchanged (it already sorts and renders all features by zIndex).

**Tech Stack:** TypeScript, SVG string generation, jsts geometry, bun:test.

**Spec:** `docs/superpowers/specs/2026-06-06-beliggenhedsplan-authority-grade-design.md` sections 9–10

---

### Task 19: Extend DrawingModel layer kinds

**Context — read these files first:**
- `src/domain/drawing/drawing-model.ts` (full file — 79 lines)
- `src/lib/drawing/render-svg.ts` (to confirm it renders `model.features` by zIndex — no changes needed)

**Files:**
- Modify: `src/domain/drawing/drawing-model.ts`

- [ ] **Step 1: Add new DrawingLayerKind values**

Replace the `DrawingLayerKind` type union — add 5 new values:

```typescript
export type DrawingLayerKind =
  | "parcel_boundary"
  | "neighbor_parcels"
  | "existing_buildings"
  | "proposed_buildings"
  | "setback_lines"
  | "building_lines"
  | "terrain_points"
  | "utilities"
  | "site_use"
  | "dimensions"
  | "labels"
  | "title_block"
  | "legend"
  | "dimension_lines"
  | "terrain_labels"
  | "utility_lines"
  | "utility_wells"
  | "hatch_areas"
  | "road_label"
  | "scale_bar"
  | "mandatory_annotations"
  | "north_arrow"
  // New for authority-grade:
  | "road_fill"
  | "road_centerline"
  | "naturbeskyttelse_zones"
  | "ler_lines"
  | "placeholder"
  | "watermark";
```

- [ ] **Step 2: Add `completenessStatus` field to `DrawingTitleBlock`**

```typescript
export type DrawingTitleBlock = {
  title: string;
  address: string;
  matrikel: string;
  bygherre: string | null;
  sagNr: string | null;
  scale: string;
  paperSize: string;
  date: string;
  revision: string;
  disclaimer: string | null;
  sourceList: string[];
  completenessStatus: string | null;  // e.g. "UDKAST — 2 placeholders"
};
```

- [ ] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: zero errors (all existing code that creates `DrawingTitleBlock` may need `completenessStatus: null` added — fix any errors).

- [ ] **Step 4: Fix any title block construction errors**

Search for places that create `DrawingTitleBlock`:
```bash
bunx grep -r "DrawingTitleBlock\|titleBlock:" src --include="*.ts" -l
```
For each file found, add `completenessStatus: null` to the object literal if missing.

- [ ] **Step 5: Commit**

```bash
git add src/domain/drawing/drawing-model.ts
git commit -m "feat(drawing): add new DrawingLayerKind values and completenessStatus to title block"
```

---

### Task 20: Road layer renderer

**Context — read these files first:**
- `src/domain/drawing/drawing-model.ts` (for `DrawingFeature` type and `DrawingLayerKind`)
- `src/domain/drawing/beliggenhedsplan.types.ts` (for `VejLayer`)
- `src/lib/drawing/drawing-model-builder.ts` lines 1–57 (for `coordsToSvgPoints` helper pattern — the `minX`/`maxY`/`scale` coordinate transform)

**Files:**
- Create: `src/lib/drawing/layers/render-road-layer.ts`
- Create: `src/lib/drawing/layers/render-road-layer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/drawing/layers/render-road-layer.test.ts
import { describe, it, expect } from "bun:test";
import { buildRoadFeatures } from "./render-road-layer";
import type { VejLayer } from "@/domain/drawing/beliggenhedsplan.types";

const vejMedCenterline: VejLayer = {
  vejnavn: "Testvej",
  centerline25832: { type: "LineString", crs: "EPSG:25832", coordinates: [[100, 100], [200, 100]] },
  vejkant25832: null,
  vejbreddeM: null,
  source: { source: "registry", confidence: "medium", fetchedAt: "2026-06-06", requiresReview: false },
};

describe("buildRoadFeatures", () => {
  it("null vej → empty array", () => {
    expect(buildRoadFeatures(null, 0, 0, 1)).toHaveLength(0);
  });

  it("vej med centerline → road_centerline feature", () => {
    const features = buildRoadFeatures(vejMedCenterline, 50, 200, 2);
    expect(features.some(f => f.kind === "road_centerline")).toBe(true);
  });

  it("alle features har negativt zIndex (bag parcel)", () => {
    const features = buildRoadFeatures(vejMedCenterline, 50, 200, 2);
    expect(features.every(f => f.zIndex < 5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test src/lib/drawing/layers/render-road-layer.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/drawing/layers/render-road-layer.ts
import type { DrawingFeature } from "@/domain/drawing/drawing-model";
import type { VejLayer } from "@/domain/drawing/beliggenhedsplan.types";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toSvg(coords: [number, number][], minX: number, maxY: number, scale: number): string {
  return coords.map(([x, y]) => `${((x - minX) * scale).toFixed(1)},${((maxY - y) * scale).toFixed(1)}`).join(" ");
}

export function buildRoadFeatures(
  vej: VejLayer | null,
  minX: number,
  maxY: number,
  scale: number,
): DrawingFeature[] {
  if (!vej) return [];

  const features: DrawingFeature[] = [];

  // Road centerline (always — even if just a label)
  if (vej.centerline25832) {
    const pts = toSvg(vej.centerline25832.coordinates, minX, maxY, scale);
    features.push({
      id: "road-centerline",
      kind: "road_centerline",
      svgElement: `<polyline points="${pts}" fill="none" stroke="#d1d5db" stroke-width="0.3" stroke-dasharray="4,2"/>`,
      label: vej.vejnavn,
      labelX: null,
      labelY: null,
      zIndex: 2,
    });
  }

  // Road fill (grey rectangle between centerline + estimated width)
  if (vej.centerline25832 && vej.vejbreddeM) {
    const pts = toSvg(vej.centerline25832.coordinates, minX, maxY, scale);
    const halfW = (vej.vejbreddeM / 2) * scale;
    features.push({
      id: "road-fill",
      kind: "road_fill",
      svgElement: `<polyline points="${pts}" fill="none" stroke="#e5e7eb" stroke-width="${(halfW * 2).toFixed(1)}" stroke-linecap="square"/>`,
      label: null,
      labelX: null,
      labelY: null,
      zIndex: 1,
    });
  }

  // Vejkant (road edge line)
  if (vej.vejkant25832) {
    const pts = toSvg(vej.vejkant25832.coordinates, minX, maxY, scale);
    features.push({
      id: "road-edge",
      kind: "road_centerline",
      svgElement: `<polyline points="${pts}" fill="none" stroke="#9ca3af" stroke-width="0.5"/>`,
      label: null,
      labelX: null,
      labelY: null,
      zIndex: 3,
    });
  }

  // Road name label (positioned at midpoint of centerline)
  const lineCoords = vej.centerline25832?.coordinates ?? [];
  if (lineCoords.length >= 2) {
    const mid = Math.floor(lineCoords.length / 2);
    const [mx, my] = lineCoords[mid]!;
    const svgX = (mx - minX) * scale;
    const svgY = (maxY - my) * scale;

    // Compute angle for rotated text
    const [x1, y1] = lineCoords[mid - 1] ?? lineCoords[0]!;
    const [x2, y2] = lineCoords[mid + 1] ?? lineCoords[lineCoords.length - 1]!;
    const angleDeg = Math.atan2(-(y2 - y1), x2 - x1) * (180 / Math.PI);

    features.push({
      id: "road-name-label",
      kind: "road_label",
      svgElement: `<text x="${svgX.toFixed(1)}" y="${svgY.toFixed(1)}" font-family="Arial" font-size="5" fill="#6b7280" text-anchor="middle" transform="rotate(${angleDeg.toFixed(1)},${svgX.toFixed(1)},${svgY.toFixed(1)})">${esc(vej.vejnavn)}</text>`,
      label: vej.vejnavn,
      labelX: svgX,
      labelY: svgY,
      zIndex: 4,
    });
  }

  // "vejkant ikke kortlagt" note if only centerline
  if (vej.centerline25832 && !vej.vejkant25832) {
    features.push({
      id: "road-note-no-edge",
      kind: "road_label",
      svgElement: `<!-- vejkant ikke kortlagt for ${esc(vej.vejnavn)} -->`,
      label: null,
      labelX: null,
      labelY: null,
      zIndex: 4,
    });
  }

  return features;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
bun test src/lib/drawing/layers/render-road-layer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/drawing/layers/render-road-layer.ts \
        src/lib/drawing/layers/render-road-layer.test.ts
git commit -m "feat(drawing): add road layer renderer (vejmidte, vejkant, vejnavn)"
```

---

### Task 21: Naturbeskyttelse + LER layer renderers

**Context — read these files first:**
- `src/lib/drawing/layers/render-road-layer.ts` (for coordinate transform pattern)
- `src/domain/drawing/beliggenhedsplan.types.ts` (for `NaturbeskyttelseLayer`, `LerLedning`, `LerLedningType`)

**Files:**
- Create: `src/lib/drawing/layers/render-naturbeskyttelse-layer.ts`
- Create: `src/lib/drawing/layers/render-ler-layer.ts`

- [ ] **Step 1: Implement naturbeskyttelse renderer**

```typescript
// src/lib/drawing/layers/render-naturbeskyttelse-layer.ts
import type { DrawingFeature } from "@/domain/drawing/drawing-model";
import type { NaturbeskyttelseLayer } from "@/domain/drawing/beliggenhedsplan.types";

const NATUR_COLORS: Record<NaturbeskyttelseLayer["type"], string> = {
  strandbeskyttelse: "#fbbf24",
  skovbyggelinje: "#34d399",
  åbeskyttelse: "#60a5fa",
  fortidsmindebeskyttelse: "#a78bfa",
  klitfredning: "#f97316",
};

const NATUR_LABELS: Record<NaturbeskyttelseLayer["type"], string> = {
  strandbeskyttelse: "Strandbeskyttelse 300m",
  skovbyggelinje: "Skovbyggelinje 300m",
  åbeskyttelse: "Åbeskyttelse 150m",
  fortidsmindebeskyttelse: "Fortidsminde 100m",
  klitfredning: "Klitfredning",
};

function toSvg(coords: [number, number][], minX: number, maxY: number, scale: number): string {
  return coords.map(([x, y]) => `${((x - minX) * scale).toFixed(1)},${((maxY - y) * scale).toFixed(1)}`).join(" ");
}

export function buildNaturbeskyttelseFeatures(
  layers: NaturbeskyttelseLayer[],
  minX: number,
  maxY: number,
  scale: number,
): DrawingFeature[] {
  return layers.flatMap((layer, i): DrawingFeature[] => {
    const color = NATUR_COLORS[layer.type];
    const label = NATUR_LABELS[layer.type];
    const opacity = layer.intersectsProposedBuilding ? "0.35" : "0.15";
    const strokeColor = layer.intersectsProposedBuilding ? "#dc2626" : color;

    if (layer.geometry25832.type === "Polygon") {
      const ring = layer.geometry25832.coordinates[0] as [number, number][];
      const pts = toSvg(ring, minX, maxY, scale);
      return [{
        id: `natur-${i}`,
        kind: "naturbeskyttelse_zones",
        svgElement: `<polygon points="${pts}" fill="${color}" fill-opacity="${opacity}" stroke="${strokeColor}" stroke-width="0.5" stroke-dasharray="6,3"/>`,
        label,
        labelX: null,
        labelY: null,
        zIndex: 5,
      }];
    }

    if (layer.geometry25832.type === "LineString") {
      const pts = toSvg(layer.geometry25832.coordinates, minX, maxY, scale);
      return [{
        id: `natur-${i}`,
        kind: "naturbeskyttelse_zones",
        svgElement: `<polyline points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="${layer.intersectsProposedBuilding ? "1.5" : "0.8"}" stroke-dasharray="8,4"/>`,
        label,
        labelX: null,
        labelY: null,
        zIndex: 5,
      }];
    }

    return [];
  });
}
```

- [ ] **Step 2: Implement LER renderer**

```typescript
// src/lib/drawing/layers/render-ler-layer.ts
import type { DrawingFeature } from "@/domain/drawing/drawing-model";
import type { LerLedning, LerLedningType } from "@/domain/drawing/beliggenhedsplan.types";

const LER_COLORS: Record<LerLedningType, string> = {
  kloak_spildevand: "#78350f",
  kloak_regnvand: "#1d4ed8",
  kloak_faelles: "#525252",
  vand: "#0891b2",
  el: "#ca8a04",
  naturgas: "#ea580c",
  fjernvarme: "#dc2626",
  telekom: "#16a34a",
};

function toSvg(coords: [number, number][], minX: number, maxY: number, scale: number): string {
  return coords.map(([x, y]) => `${((x - minX) * scale).toFixed(1)},${((maxY - y) * scale).toFixed(1)}`).join(" ");
}

export function buildLerFeatures(
  ledninger: LerLedning[],
  minX: number,
  maxY: number,
  scale: number,
): DrawingFeature[] {
  return ledninger.map((l, i): DrawingFeature => {
    const color = LER_COLORS[l.type];
    const pts = toSvg(l.geometry25832.coordinates, minX, maxY, scale);
    const label = l.ejer ? `${l.type} (${l.ejer})` : l.type;

    return {
      id: `ler-${i}`,
      kind: "ler_lines",
      svgElement: `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="5,2" opacity="0.8"/>`,
      label,
      labelX: null,
      labelY: null,
      zIndex: 4,
    };
  });
}

export function buildLerLegendEntries(
  ledninger: LerLedning[],
): Array<{ symbol: string; label: string }> {
  const seen = new Set<LerLedningType>();
  return ledninger
    .filter((l) => !seen.has(l.type) && seen.add(l.type))
    .map((l) => ({
      symbol: `<line x1="0" y1="4" x2="12" y2="4" stroke="${LER_COLORS[l.type]}" stroke-width="1.5" stroke-dasharray="4,2"/>`,
      label: l.type.replace(/_/g, " "),
    }));
}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
bunx tsc --noEmit
git add src/lib/drawing/layers/render-naturbeskyttelse-layer.ts \
        src/lib/drawing/layers/render-ler-layer.ts
git commit -m "feat(drawing): add naturbeskyttelse and LER layer renderers"
```

---

### Task 22: Placeholder elements + watermark

**Context — read these files first:**
- `src/lib/drawing/layers/render-road-layer.ts` (for coordinate transform pattern)
- `src/domain/drawing/beliggenhedsplan.types.ts` (for `ParcelLayer`, `BoundarySegment`)
- `src/domain/drawing/completeness-engine.ts` (for `DrawingCompleteness`, `FieldStatus`)

**Files:**
- Create: `src/lib/drawing/layers/render-placeholder-layer.ts`
- Create: `src/lib/drawing/layers/render-watermark.ts`

- [ ] **Step 1: Implement placeholder renderer**

```typescript
// src/lib/drawing/layers/render-placeholder-layer.ts
// Renders orange-dashed placeholder elements for missing data.

import type { DrawingFeature } from "@/domain/drawing/drawing-model";
import type { DrawingCompleteness } from "@/domain/drawing/completeness-engine";
import type { ParcelLayer, ProposedBuildingLayer } from "@/domain/drawing/beliggenhedsplan.types";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toSvgPt(x: number, y: number, minX: number, maxY: number, scale: number): [number, number] {
  return [(x - minX) * scale, (maxY - y) * scale];
}

function orangeText(text: string, x: number, y: number, fontSize = 5): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Arial" font-size="${fontSize}" fill="#f97316" font-style="italic" font-weight="bold">${esc(text)}</text>`;
}

export function buildPlaceholderFeatures(
  completeness: DrawingCompleteness,
  parcel: ParcelLayer,
  proposed: ProposedBuildingLayer,
  minX: number,
  maxY: number,
  scale: number,
): DrawingFeature[] {
  const features: DrawingFeature[] = [];
  const { fields } = completeness;

  // Find road-facing parcel boundary segment
  const roadSegment = parcel.boundarySegments.find((s) => s.type === "road");
  const skelMidX = roadSegment
    ? (roadSegment.start.coordinates[0] + roadSegment.end.coordinates[0]) / 2
    : parcel.labelPoint25832.coordinates[0];
  const skelMidY = roadSegment
    ? (roadSegment.start.coordinates[1] + roadSegment.end.coordinates[1]) / 2
    : parcel.labelPoint25832.coordinates[1];

  // Find nearest building point to road for stikledning start
  const footprintRing = proposed.footprint25832.coordinates[0] as [number, number][];
  const bldNearestPt = footprintRing.reduce(
    (best, pt) => {
      const d = Math.sqrt((pt[0] - skelMidX) ** 2 + (pt[1] - skelMidY) ** 2);
      return d < best.d ? { pt, d } : best;
    },
    { pt: footprintRing[0]!, d: Infinity },
  );

  // Kloakstikledning placeholder (always rendered)
  if (fields.kloakStikledning.status === "placeholder") {
    const [bx, by] = toSvgPt(bldNearestPt.pt[0], bldNearestPt.pt[1], minX, maxY, scale);
    const [sx, sy] = toSvgPt(skelMidX, skelMidY, minX, maxY, scale);

    features.push({
      id: "placeholder-sewer-connection",
      kind: "placeholder",
      svgElement: [
        `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}" stroke="#f97316" stroke-width="1.2" stroke-dasharray="6,3"/>`,
        `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3" fill="none" stroke="#f97316" stroke-width="1" stroke-dasharray="3,2"/>`,
        orangeText("[Stikledning — kloakmester]", sx + 5, sy),
      ].join("\n"),
      label: "Stikledning",
      labelX: sx,
      labelY: sy,
      zIndex: 15,
    });
  }

  // Regnvandsløsning placeholder
  if (fields.regnvandsløsning.status === "placeholder") {
    // Place faskine at a point 5m from building, 2m from nearest skel
    // Simple heuristic: offset from building centroid toward parcel centroid
    const buildingCx = footprintRing.reduce((s, p) => s + p[0], 0) / footprintRing.length;
    const buildingCy = footprintRing.reduce((s, p) => s + p[1], 0) / footprintRing.length;
    const parcelCx = parcel.labelPoint25832.coordinates[0];
    const parcelCy = parcel.labelPoint25832.coordinates[1];

    const dx = parcelCx - buildingCx;
    const dy = parcelCy - buildingCy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const offsetScale = Math.min(8 / dist, 0.4); // 8m toward parcel center, max 40% of distance
    const faskineX = buildingCx + dx * offsetScale;
    const faskineY = buildingCy + dy * offsetScale;

    const [fx, fy] = toSvgPt(faskineX, faskineY, minX, maxY, scale);
    const sizeM = proposed.footprintAreaM2 * 0.08;

    features.push({
      id: "placeholder-faskine",
      kind: "placeholder",
      svgElement: [
        `<rect x="${(fx - 6).toFixed(1)}" y="${(fy - 4).toFixed(1)}" width="12" height="8" fill="none" stroke="#f97316" stroke-width="1" stroke-dasharray="4,2"/>`,
        orangeText(`[Faskine ca. ${sizeM.toFixed(0)} m³ — kloakmester]`, fx - 30, fy + 14, 4.5),
      ].join("\n"),
      label: "Faskine",
      labelX: fx,
      labelY: fy,
      zIndex: 15,
    });
  }

  // Overkørsel placeholder
  if (fields.overkørsel.status === "placeholder") {
    const [ox, oy] = toSvgPt(skelMidX, skelMidY, minX, maxY, scale);
    features.push({
      id: "placeholder-overkørsel",
      kind: "placeholder",
      svgElement: [
        `<line x1="${(ox - 8).toFixed(1)}" y1="${oy.toFixed(1)}" x2="${(ox + 8).toFixed(1)}" y2="${oy.toFixed(1)}" stroke="#f97316" stroke-width="2" stroke-dasharray="4,2"/>`,
        orangeText("[Overkørsel — bekræftes af kommunen]", ox + 10, oy + 3, 4.5),
      ].join("\n"),
      label: "Overkørsel",
      labelX: ox,
      labelY: oy,
      zIndex: 15,
    });
  }

  // Sokkelkote annotation
  if (fields.sokkelKote.status !== "auto" && proposed.sokkelKoteM !== null) {
    const [cx, cy] = toSvgPt(footprintRing[0]![0], footprintRing[0]![1], minX, maxY, scale);
    const isEstimated = fields.sokkelKote.status === "estimated";
    features.push({
      id: "annotation-sokkelkote",
      kind: "placeholder",
      svgElement: `<text x="${(cx + 2).toFixed(1)}" y="${(cy - 3).toFixed(1)}" font-family="Arial" font-size="4.5" fill="${isEstimated ? "#6b7280" : "#f97316"}" font-style="italic">${isEstimated ? `~DVR90 +${proposed.sokkelKoteM.toFixed(2)}m (DHM est.)` : "[Sokkelkote — kloakmester]"}</text>`,
      label: null,
      labelX: cx,
      labelY: cy,
      zIndex: 13,
    });
  }

  return features;
}
```

- [ ] **Step 2: Implement watermark**

```typescript
// src/lib/drawing/layers/render-watermark.ts
import type { DrawingFeature } from "@/domain/drawing/drawing-model";

export function buildWatermarkFeature(
  isDraft: boolean,
  drawWidthPx: number,
  drawHeightPx: number,
): DrawingFeature | null {
  if (!isDraft) return null;

  const cx = drawWidthPx / 2;
  const cy = drawHeightPx / 2;
  const fontSize = drawWidthPx / 5;

  return {
    id: "watermark-udkast",
    kind: "watermark",
    svgElement: `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-family="Arial" font-size="${fontSize.toFixed(1)}" fill="#6b7280" fill-opacity="0.12" text-anchor="middle" dominant-baseline="middle" transform="rotate(-35,${cx.toFixed(1)},${cy.toFixed(1)})" font-weight="bold">UDKAST</text>`,
    label: null,
    labelX: cx,
    labelY: cy,
    zIndex: 19,
  };
}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
bunx tsc --noEmit
git add src/lib/drawing/layers/render-placeholder-layer.ts \
        src/lib/drawing/layers/render-watermark.ts
git commit -m "feat(drawing): add placeholder element renderer and UDKAST watermark"
```

---

### Task 23: Wire new layers into drawing-model-builder

**Context — read these files first:**
- `src/lib/drawing/drawing-model-builder.ts` (full file)
- `src/domain/drawing/beliggenhedsplan.types.ts` (for `BeliggenhedsplanInput` — now includes `vej`, `naturbeskyttelse`, `lerLedninger`, `kloakoplandType`)
- `src/domain/drawing/completeness-engine.ts` (for `computeDrawingCompleteness`, `CompletenessInput`)
- All four new layer files just created

**Files:**
- Modify: `src/lib/drawing/drawing-model-builder.ts`

- [ ] **Step 1: Add imports to `drawing-model-builder.ts`**

Add at the top:

```typescript
import { buildRoadFeatures } from "./layers/render-road-layer";
import { buildNaturbeskyttelseFeatures } from "./layers/render-naturbeskyttelse-layer";
import { buildLerFeatures, buildLerLegendEntries } from "./layers/render-ler-layer";
import { buildPlaceholderFeatures } from "./layers/render-placeholder-layer";
import { buildWatermarkFeature } from "./layers/render-watermark";
import { computeDrawingCompleteness } from "@/domain/drawing/completeness-engine";
import type { DrawingReadinessDecision } from "@/domain/drawing/decision-engine";
```

- [ ] **Step 2: Update `buildDrawingModel` signature**

The function signature stays the same — it already takes `BeliggenhedsplanInput` which now includes the new fields.

- [ ] **Step 3: Add completeness computation inside `buildDrawingModel`**

After the `const scale = ...` line (around line 80), add:

```typescript
  const completeness = computeDrawingCompleteness({
    hasParcelPolygon: true,
    proposedFootprintSource: plan.proposed.source.source,
    sokkelKoteM: plan.proposed.sokkelKoteM,
    sokkelSource: plan.proposed.source.source,
    tagform: plan.proposed.tagform,
    taghaldningGrad: plan.proposed.taghaldningGrad,
    rygningsKoteM: plan.proposed.rygningsKoteM,
    vejLayer: plan.vej,
    terrainLayer: plan.terrain,
    surveyTerrainPointCount: plan.survey?.terrainPoints.length ?? 0,
    kloakoplandType: plan.kloakoplandType,
    siteUseLayers: plan.siteUse,
    naturbeskyttelseFetchedAt: plan.naturbeskyttelse.length > 0
      ? plan.naturbeskyttelse[0]!.source.fetchedAt
      : null,
  });

  const isDraft = completeness.overallStatus === "draft";
```

- [ ] **Step 4: Add new features to the `features` array**

Find where `features` is built in `buildDrawingModel`. After all existing features are pushed, add:

```typescript
  // Road layer (behind parcel, zIndex 1-4)
  const roadFeatures = buildRoadFeatures(plan.vej, bboxMinX, bboxMaxY, scale);

  // Naturbeskyttelse (zIndex 5)
  const naturFeatures = buildNaturbeskyttelseFeatures(
    plan.naturbeskyttelse, bboxMinX, bboxMaxY, scale,
  );

  // LER (zIndex 4)
  const lerFeatures = buildLerFeatures(plan.lerLedninger, bboxMinX, bboxMaxY, scale);

  // Placeholder elements (zIndex 13-15)
  const placeholderFeatures = buildPlaceholderFeatures(
    completeness, plan.parcel, plan.proposed, bboxMinX, bboxMaxY, scale,
  );

  // Watermark (zIndex 19)
  const watermarkFeature = buildWatermarkFeature(
    isDraft,
    (paperWidthMm - titleBlockMm) * PX_PER_MM,
    paperHeightMm * PX_PER_MM,
  );

  const allFeatures = [
    ...features, // existing features from current buildDrawingModel
    ...roadFeatures,
    ...naturFeatures,
    ...lerFeatures,
    ...placeholderFeatures,
    ...(watermarkFeature ? [watermarkFeature] : []),
  ];
```

Then ensure the returned `DrawingModel` uses `allFeatures` instead of `features`.

- [ ] **Step 5: Add LER legend entries and completeness status to title block**

When constructing the `DrawingModel` return value, update:

```typescript
  legend: [
    ...existingLegend,  // keep existing legend items
    ...buildLerLegendEntries(plan.lerLedninger),
  ],
  titleBlock: {
    ...existingTitleBlock,
    completenessStatus: isDraft
      ? `UDKAST — ${completeness.placeholderCount} placeholders`
      : null,
  },
```

- [ ] **Step 6: Read current `buildDrawingModel` to do the precise edit**

Read `src/lib/drawing/drawing-model-builder.ts` in full and apply the edits carefully — do not break existing feature building. After editing, run:

```bash
bunx tsc --noEmit
bun test src/lib/drawing
```

Expected: all existing tests pass, zero TypeScript errors.

- [ ] **Step 7: Update render-svg.ts to show completenessStatus**

Open `src/lib/drawing/render-svg.ts`. Find where `tb.disclaimer` is rendered (around line 63). Add completenessStatus rendering just before disclaimer:

```typescript
    ...(tb.completenessStatus
      ? [
          `<rect x="${tx}" y="${lineY}" width="${titleBlockW}" height="10" fill="#fef3c7"/>`,
          `<text x="${(tx + 5).toFixed(1)}" y="${(lineY + 7).toFixed(1)}" font-family="Arial" font-size="6" fill="#92400e" font-weight="bold">${esc(tb.completenessStatus)}</text>`,
          ...(() => { lineY += 12; return []; })(),
        ]
      : []),
```

- [ ] **Step 8: Full test + build**

```bash
bunx tsc --noEmit && bun test src && bun run build
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/drawing/drawing-model-builder.ts \
        src/lib/drawing/render-svg.ts
git commit -m "feat(drawing): wire new layers (road, natur, LER, placeholders, watermark) into DrawingModel"
```

---

### Phase 3 complete ✓

```bash
bunx tsc --noEmit && bun test src && bunx eslint . && bun run build
```

All must pass. Phase 4 plan: `docs/superpowers/plans/2026-06-06-beliggenhedsplan-authority-grade-phase4.md`
