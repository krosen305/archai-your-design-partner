# Beliggenhedsplan — Orientering (sand nord) + Kote-motor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the beliggenhedsplan render the matrikel in the **same orientation as the in-app matrikelkort (true/geographic north up)** with a north arrow frozen to that orientation, and **plot DHM terrain koter** using a 3-tier priority placement engine with collision-based unclutter.

**Architecture:** A single pure `Projector` (world EPSG:25832 → SVG px) replaces the scattered inline `(x−minX)·s, (maxY−y)·s` math in the builder and the four layer builders. The projector applies a rigid rotation about the parcel centroid equal to the **meridian/grid convergence** of UTM32N at the site, so grid-north-up becomes true-north-up while distances stay målfaste. A new pure `kote-engine` selects and unclutters koter (layers A/B/C from the spec) from `plan.terrain.points` (DHM), which is currently fetched and discarded. The builder owns wiring; renderers stay pure presentation.

**Tech Stack:** TypeScript, `bun:test`, `proj4` (already a dep, pure), `jsts` (geometry-engine), SVG/pdf-lib renderers.

---

## Gatekeeper Protocol answers (compliance-relevant geometry)

1. **Boundary crossed:** Drawing geometry → SVG/PDF presentation. No new external boundary; DHM terrain already crosses the adapter boundary in `drawing-layers.ts` and is Zod-validated (`ruleEngineTerrainDataSchema`) in `dhm-client.ts`.
2. **Schema/decoder:** Existing `TerrainLayer`/`TerrainPoint` (`beliggenhedsplan.types.ts`) and `ParcelLayer`. No new persisted compliance values; nothing new in JSONB. Koter are rendered, not stored.
3. **Business logic location:** New pure modules under `src/domain/drawing/` (`kote-engine.ts`) and `src/lib/drawing/` (`projector.ts`); convergence math in `src/lib/geometry-utils.ts` (already proj4-based, client-safe). No logic added to UI or server-fn handlers.
4. **Application service:** `assembleBeliggenhedsplan` (widen DHM bbox only); `buildDrawingModel` owns model assembly. No new service.
5. **Adapter:** None changed — DHM koter already arrive via `GeoDanmarkDrawingLayersAdapter.fetchDhmKoter`.
6. **UI owning domain:** Prevented — `render-svg.ts`/`render-pdf.ts` stay presentation-only; orientation + kote decisions live in domain/builder pure code.
7. **Tests:** Pure unit tests for convergence, projector parity+rotation, terrain sampling, and each kote layer; builder tests for orientation + koter wiring; existing acceptance tests guard the refactor.

**Protected files:** none touched. `reactive-compliance.ts`, `project-store.ts` not involved. No `Rører beskyttet fil` needed.

---

## File Structure

**Create**
- `src/lib/geometry-utils.ts` → add `northUpRotationDeg(easting, northing)` + `gridConvergenceDeg(lat, lng)` (pure, proj4).
- `src/lib/drawing/projector.ts` → `Projector` type + `createProjector(opts)`; rotation about pivot, then translate/scale/flip.
- `src/domain/drawing/kote-engine.ts` → pure `selectPriorityKoter`, `selectGridKoter`, `sampleTerrainZ`, types.
- Test files co-located: `geometry-utils.test.ts` (extend), `projector.test.ts`, `kote-engine.test.ts`.

**Modify**
- `src/lib/drawing/drawing-model-builder.ts` → build a `Projector`; route every coordinate through it; wire kote-engine; set `northArrowRotationDeg`.
- `src/lib/drawing/layers/render-road-layer.ts`, `render-naturbeskyttelse-layer.ts`, `render-ler-layer.ts`, `render-placeholder-layer.ts` → accept a `Projector` instead of `(minX, maxY, scale)`.
- `src/lib/drawing/render-svg.ts` + `render-pdf.ts` → north arrow honours `model.northArrowRotationDeg`; add north-reference note.
- `src/services/drawing/assemble-beliggenhedsplan.service.ts` → widen DHM bbox to cover road/neighbours + margin.

**Contracts**

```ts
// src/lib/drawing/projector.ts
export type Projector = (x: number, y: number) => [number, number];

export type ProjectorOptions = {
  pivot: [number, number];   // world rotation centre (parcel centroid)
  rotationDeg: number;       // +ve = rotate world CCW about pivot before mapping
  minX: number;              // rotated-bbox min easting (world, after rotation)
  maxY: number;              // rotated-bbox max northing (world, after rotation)
  scale: number;             // px per world-metre
};
```

```ts
// src/domain/drawing/kote-engine.ts
export type WorldPoint = { x: number; y: number };
export type TerrainSample = { x: number; y: number; z: number };
export type KoteLayer = "A" | "B" | "C";
export type KoteKind =
  | "building_corner" | "parcel_corner" | "road" | "extremum" | "grid";
export type KotePlacement = {
  x: number; y: number;        // world EPSG:25832, where the dot is drawn
  z: number;                   // DVR90 metres
  label: string;               // e.g. "20.14"
  layer: KoteLayer;
  kind: KoteKind;
};
```

---

## PHASE 1 — Orientation: true-north-up + frozen arrow

### Task 1: Convergence / north-up rotation helper

**Files:**
- Modify: `src/lib/geometry-utils.ts` (append exports)
- Test: `src/lib/geometry-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/geometry-utils.test.ts` (create the file with this import header if it does not exist):

```ts
import { describe, it, expect } from "bun:test";
import { northUpRotationDeg, gridConvergenceDeg, wgs84ToUtm32 } from "./geometry-utils";

describe("gridConvergenceDeg (UTM32N)", () => {
  it("is ~0 on the central meridian (9°E)", () => {
    expect(Math.abs(gridConvergenceDeg(56.0, 9.0))).toBeLessThan(0.05);
  });
  it("is positive east of 9°E (e.g. København ~+2.9°)", () => {
    const g = gridConvergenceDeg(55.68, 12.57);
    expect(g).toBeGreaterThan(2.5);
    expect(g).toBeLessThan(3.4);
  });
  it("is negative west of 9°E (e.g. Esbjerg ~-0.45°)", () => {
    expect(gridConvergenceDeg(55.47, 8.45)).toBeLessThan(0);
  });
});

describe("northUpRotationDeg", () => {
  it("rotates a grid-north-up drawing so true north points up", () => {
    // København centroid in 25832
    const { x, y } = wgs84ToUtm32(55.68, 12.57);
    const rot = northUpRotationDeg(x, y);
    // Equal in magnitude to convergence, opposite sense applied to geometry.
    expect(Math.abs(rot)).toBeGreaterThan(2.5);
    expect(Math.abs(rot)).toBeLessThan(3.4);
  });
  it("is ~0 on the central meridian", () => {
    const { x, y } = wgs84ToUtm32(56.0, 9.0);
    expect(Math.abs(northUpRotationDeg(x, y))).toBeLessThan(0.05);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/geometry-utils.test.ts`
Expected: FAIL — `northUpRotationDeg`/`gridConvergenceDeg` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/geometry-utils.ts`:

```ts
/**
 * Grid (meridian) convergence of UTM32N at a WGS84 point, in degrees.
 * Positive = grid north lies east of true north (eastern part of the zone).
 * Derived empirically via proj4 so it matches the exact ellipsoidal projection
 * the rest of the pipeline uses, rather than a truncated series.
 */
export function gridConvergenceDeg(lat: number, lng: number): number {
  const { x, y } = wgs84ToUtm32(lat, lng);
  const step = 50; // metres of grid-north
  const a = proj4(EPSG25832, WGS84, [x, y]) as [number, number];          // [lng,lat]
  const b = proj4(EPSG25832, WGS84, [x, y + step]) as [number, number];
  const R = 6378137;
  const dEast = ((b[0] - a[0]) * Math.PI) / 180 * R * Math.cos((lat * Math.PI) / 180);
  const dNorth = ((b[1] - a[1]) * Math.PI) / 180 * R;
  return (Math.atan2(dEast, dNorth) * 180) / Math.PI;
}

/**
 * Rotation (deg, CCW-positive in world space about the centroid) to apply to
 * EPSG:25832 geometry so that, after the renderer's y-flip (world +Y → screen
 * up), TRUE north points up instead of grid north. Equals the convergence.
 */
export function northUpRotationDeg(easting: number, northing: number): number {
  const { lat, lng } = utm32ToWgs84(easting, northing);
  return gridConvergenceDeg(lat, lng);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/geometry-utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry-utils.ts src/lib/geometry-utils.test.ts
git commit -m "feat(drawing): add UTM32 grid-convergence + north-up rotation helpers"
```

> **Sign note for Task 4:** the renderer maps world `+Y → screen up`. Rotating world geometry CCW by `+convergence` about the centroid makes the true-north direction land on world `+Y`, i.e. screen-up. Verify empirically in Task 2's rotation test; if the parcel tilts the wrong way, negate `northUpRotationDeg`'s return (and update its test expectation to assert the signed value, not just magnitude).

---

### Task 2: `Projector` module (parity at rotation=0, correct rotation otherwise)

**Files:**
- Create: `src/lib/drawing/projector.ts`
- Test: `src/lib/drawing/projector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "bun:test";
import { createProjector } from "./projector";

describe("createProjector", () => {
  it("at rotation=0 reproduces the legacy (x-minX)*s, (maxY-y)*s mapping", () => {
    const p = createProjector({ pivot: [0, 0], rotationDeg: 0, minX: 100, maxY: 200, scale: 2 });
    expect(p(100, 200)).toEqual([0, 0]);
    expect(p(110, 190)).toEqual([20, 20]); // (110-100)*2 , (200-190)*2
  });

  it("rotation is rigid: preserves distances between points", () => {
    const p = createProjector({ pivot: [500, 500], rotationDeg: 30, minX: 0, maxY: 1000, scale: 1 });
    const a = p(500, 500);
    const b = p(510, 500); // 10 m east of pivot
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    expect(d).toBeCloseTo(10, 6); // scale=1 ⇒ 10 px
  });

  it("CCW world rotation about pivot moves a due-north point screen-left (y-flip aware)", () => {
    const p = createProjector({ pivot: [0, 0], rotationDeg: 90, minX: -100, maxY: 100, scale: 1 });
    const pivotPx = p(0, 0);
    const northPx = p(0, 10); // 10 m world-north of pivot
    // 90° CCW world rotation sends world-north (+Y) to world-west (−X) ⇒ screen-left.
    expect(northPx[0]).toBeLessThan(pivotPx[0]);
    expect(Math.abs(northPx[1] - pivotPx[1])).toBeLessThan(1e-6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/drawing/projector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/drawing/projector.ts
export type Projector = (x: number, y: number) => [number, number];

export type ProjectorOptions = {
  pivot: [number, number];
  rotationDeg: number;
  minX: number;
  maxY: number;
  scale: number;
};

/** Rotate world point about pivot by rotationDeg (CCW), then translate/scale/flip. */
export function createProjector(opts: ProjectorOptions): Projector {
  const { pivot, rotationDeg, minX, maxY, scale } = opts;
  const a = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const [px, py] = pivot;
  return (x: number, y: number): [number, number] => {
    const dx = x - px;
    const dy = y - py;
    const rx = px + dx * cos - dy * sin;
    const ry = py + dx * sin + dy * cos;
    return [(rx - minX) * scale, (maxY - ry) * scale];
  };
}

/** Rotate a world point about a pivot (no projection) — used to recompute the
 *  fitted bbox from already-rotated geometry. */
export function rotateWorld(
  x: number,
  y: number,
  pivot: [number, number],
  rotationDeg: number,
): [number, number] {
  const a = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = x - pivot[0];
  const dy = y - pivot[1];
  return [pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/drawing/projector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/drawing/projector.ts src/lib/drawing/projector.test.ts
git commit -m "feat(drawing): add Projector (rotation-aware world→svg transform)"
```

---

### Task 3: Thread `Projector` through builder + layer builders (rotation still 0 — no visual change)

**Files:**
- Modify: `src/lib/drawing/drawing-model-builder.ts`
- Modify: `src/lib/drawing/layers/render-road-layer.ts`, `render-naturbeskyttelse-layer.ts`, `render-ler-layer.ts`, `render-placeholder-layer.ts`
- Guarded by: `src/lib/drawing/byledet3.acceptance.test.ts`, `render-svg.test.ts`, `render-pdf.test.ts` (must stay green unchanged)

- [ ] **Step 1: Change layer-builder signatures to take a `Projector`.**

For each `render-*-layer.ts`, replace the `(layer, bboxMinX, bboxMaxY, scale)` params with `(layer, project: Projector)` and replace internal `(c[0]-bboxMinX)*scale` / `(bboxMaxY-c[1])*scale` with `const [sx, sy] = project(c[0], c[1])`. Example for `render-road-layer.ts` (apply the analogous edit to the other three):

```ts
import type { Projector } from "@/lib/drawing/projector";
// ...
export function buildRoadFeatures(vej: VejLayer | null, project: Projector): DrawingFeature[] {
  // was: const x = (coord[0] - bboxMinX) * scale; const y = (bboxMaxY - coord[1]) * scale;
  // now:
  // const [x, y] = project(coord[0], coord[1]);
}
```

- [ ] **Step 2: In `drawing-model-builder.ts`, build a projector and use it everywhere.**

Replace the local `coordsToSvgPoints` / `polygonFeature` math and all inline mappings with the projector. Concretely:

```ts
import { createProjector, rotateWorld, type Projector } from "./projector";
// ...
// after computing bboxMin/Max + scale (rotation stays 0 in this task):
const pivot: [number, number] = [
  (bboxMinX + bboxMaxX) / 2,
  (bboxMinY + bboxMaxY) / 2,
];
const rotationDeg = 0; // Task 4 turns this on
const project = createProjector({ pivot, rotationDeg, minX: bboxMinX, maxY: bboxMaxY, scale });
```

Rewrite `coordsToSvgPoints` and `polygonFeature` to take `project: Projector` instead of `(minX, maxY, scale)`:

```ts
function coordsToSvgPoints(coords: [number, number][], project: Projector): string {
  return coords.map(([x, y]) => { const [sx, sy] = project(x, y); return `${sx},${sy}`; }).join(" ");
}
```

Update every call site in the builder (parcel, neighbours, existing, proposed, constraints, dimension lines, setback annotations, survey koter, road fallback label) to use `project(...)` instead of `(v - bboxMinX) * scale` / `(bboxMaxY - v) * scale`. Pass `project` to `buildRoadFeatures`, `buildNaturbeskyttelseFeatures`, `buildLerFeatures`, `buildPlaceholderFeatures`.

- [ ] **Step 3: Update any layer-builder unit tests** that pass `(minX, maxY, scale)` to pass a projector instead, e.g.:

```ts
import { createProjector } from "@/lib/drawing/projector";
const project = createProjector({ pivot: [0, 0], rotationDeg: 0, minX: 0, maxY: 100, scale: 1 });
const features = buildRoadFeatures(vej, project);
```

(Search: `bun test src/lib/drawing/layers` to find affected tests; update call sites only — assertions stay.)

- [ ] **Step 4: Run the full drawing suite — expect NO behavioural change.**

Run: `bun test src/lib/drawing src/domain/drawing src/services/drawing`
Expected: PASS (byledet3 acceptance, render-svg, render-pdf all green; output identical because rotation=0).

- [ ] **Step 5: Commit**

```bash
git add src/lib/drawing
git commit -m "refactor(drawing): route all coordinates through a single Projector (no behaviour change)"
```

---

### Task 4: Turn on true-north rotation + honest north arrow

**Files:**
- Modify: `src/lib/drawing/drawing-model-builder.ts`
- Modify: `src/lib/drawing/render-svg.ts` (and `render-pdf.ts` north arrow)
- Test: `src/lib/drawing/drawing-model-builder.test.ts`, `src/lib/drawing/render-svg.test.ts`

- [ ] **Step 1: Write the failing test (builder rotates geometry to true north).**

Add to `drawing-model-builder.test.ts` a case whose parcel sits well east of 9°E so convergence is non-trivial, and assert the model carries a non-zero applied rotation while keeping the arrow up:

```ts
import { northUpRotationDeg } from "@/lib/geometry-utils";

it("orients the drawing true-north-up (arrow stays up; geometry pre-rotated)", () => {
  // build a plan with a parcel near København (E≈725000, N≈6175000 in 25832)
  const model = buildDrawingModel(kbhPlan, autoReview);
  // The arrow is up because geometry is rotated to true north:
  expect(model.northArrowRotationDeg).toBe(0);
  // The builder must expose the applied projection rotation for review/notes:
  expect(Math.abs(model.projectionRotationDeg)).toBeGreaterThan(2);
});
```

Add `projectionRotationDeg: number` to `DrawingModel` (`src/domain/drawing/drawing-model.ts`) and to the builder return. (This documents how much the sheet was rotated to reach true north — needed for the info-panel note and surveyor transparency.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/drawing/drawing-model-builder.test.ts`
Expected: FAIL — `projectionRotationDeg` undefined / rotation is 0.

- [ ] **Step 3: Implement rotation in the builder.**

```ts
import { northUpRotationDeg } from "@/lib/geometry-utils";
// pivot = parcel centroid (label point) in 25832:
const lp = plan.parcel.labelPoint25832.coordinates;
const pivot: [number, number] = [lp[0], lp[1]];
const rotationDeg = northUpRotationDeg(pivot[0], pivot[1]);

// Recompute the fitted bbox FROM ROTATED coordinates so the rotated drawing fits:
const rotated = bboxCoords.map(([x, y]) => rotateWorld(x, y, pivot, rotationDeg));
const rxs = rotated.map((c) => c[0]); const rys = rotated.map((c) => c[1]);
const bboxMinX = Math.min(...rxs) - pad;  const bboxMaxX = Math.max(...rxs) + pad;
const bboxMinY = Math.min(...rys) - pad;  const bboxMaxY = Math.max(...rys) + pad;
// scaleX/scaleY/scale computed from these rotated extents (unchanged formulas).
const project = createProjector({ pivot, rotationDeg, minX: bboxMinX, maxY: bboxMaxY, scale });
```

Set on the returned model:
```ts
northArrowRotationDeg: 0,            // geometry is true-north-up ⇒ arrow points up
projectionRotationDeg: rotationDeg,  // how far 25832 grid was rotated to true north
```

> The `viewport.bbox25832` returned must remain the **unrotated** world bbox (used only by `planContentOffsetPx` for centring); compute it from the original (pre-rotation) coords as today, but derive `contentWpx/contentHpx` consistency by keeping centring based on the rotated content width. Simplest correct approach: also store rotated extents and have `planContentOffsetPx` use them. Since `planContentOffsetPx` recomputes `contentWpx` from `viewport.bbox25832`, set `viewport.bbox25832` to the **rotated** extents `[bboxMinX,bboxMinY,bboxMaxX,bboxMaxY]` — these are still metres, and centring only needs width/height, which are now the rotated footprint. (Document this: bbox becomes the rotated fitted extent.)

- [ ] **Step 4: Make the renderer honour `northArrowRotationDeg` + add a north-reference note.**

In `render-svg.ts`, change `northArrow` to accept a rotation and a label, and call it with the model value:

```ts
function northArrow(cx: number, cy: number, rotationDeg: number): string {
  return `<g transform="translate(${cx},${cy}) rotate(${rotationDeg})">
    <polygon points="0,-15 5,5 0,1 -5,5" fill="#222"/>
    <polygon points="0,15 5,-5 0,-1 -5,-5" fill="#fff" stroke="#222" stroke-width="0.5"/>
    <text x="0" y="-19" text-anchor="middle" font-family="Arial" font-size="8" font-weight="bold" fill="#222" transform="rotate(${-rotationDeg})">N</text>
  </g>`;
}
// call: ${northArrow(30, 32, model.northArrowRotationDeg)}
```

(The `N` glyph counter-rotates so it stays upright regardless of arrow angle — this keeps the renderer honest for any future grid-north mode.) Apply the same `rotationDeg` parameter to the PDF north arrow in `render-pdf.ts`.

Add an info-panel note so authorities see the basis. In `buildInfoLines` (`sheet-layout.ts`), under "Terræn og koter" or a new "Projektion" line, emit when `model.projectionRotationDeg` is non-trivial:

```ts
// in builder's infoPanel technicalNotes (preferred — keeps sheet-layout dumb):
technicalNotes.push({
  category: "generel",
  text: `Tegningen er orienteret mod geografisk nord (EPSG:25832, drejet ${rotationDeg.toFixed(1)}° for meridiankonvergens).`,
});
```

- [ ] **Step 5: Update `render-svg.test.ts`** — keep the `>N<` assertion (still present), and add:

```ts
it("north arrow group carries the model rotation", () => {
  const svg = renderSvg({ ...model, northArrowRotationDeg: 0 });
  expect(svg).toContain(">N<");           // glyph still rendered
  expect(svg).toMatch(/geografisk nord/i); // projection note present when rotated
});
```

- [ ] **Step 6: Run tests**

Run: `bun test src/lib/drawing src/domain/drawing`
Expected: PASS. (byledet3 fixture near central meridian → tiny rotation, assertions are presence-based so remain valid.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/drawing src/domain/drawing
git commit -m "feat(drawing): orient beliggenhedsplan true-north-up to match matrikelkort + honest north arrow"
```

---

## PHASE 2 — Kote-motor (DHM koter, layers A/B/C)

### Task 5: Terrain sampling + extrema (pure)

**Files:**
- Create: `src/domain/drawing/kote-engine.ts`
- Test: `src/domain/drawing/kote-engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "bun:test";
import { sampleTerrainZ, terrainExtrema, type TerrainSample } from "./kote-engine";

const grid: TerrainSample[] = [
  { x: 0, y: 0, z: 10.0 }, { x: 10, y: 0, z: 10.5 },
  { x: 0, y: 10, z: 11.0 }, { x: 10, y: 10, z: 12.4 },
];

describe("sampleTerrainZ", () => {
  it("returns nearest point's z within radius", () => {
    expect(sampleTerrainZ({ x: 1, y: 1 }, grid, 5)).toBe(10.0);
    expect(sampleTerrainZ({ x: 9, y: 9 }, grid, 5)).toBe(12.4);
  });
  it("returns null when nearest point is beyond maxRadiusM", () => {
    expect(sampleTerrainZ({ x: 100, y: 100 }, grid, 5)).toBeNull();
  });
});

describe("terrainExtrema", () => {
  it("returns the lowest and highest measured koter", () => {
    const { low, high } = terrainExtrema(grid);
    expect(low.z).toBe(10.0); expect(high.z).toBe(12.4);
  });
});
```

- [ ] **Step 2: Run → FAIL.** Run: `bun test src/domain/drawing/kote-engine.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/domain/drawing/kote-engine.ts
export type WorldPoint = { x: number; y: number };
export type TerrainSample = { x: number; y: number; z: number };
export type KoteLayer = "A" | "B" | "C";
export type KoteKind = "building_corner" | "parcel_corner" | "road" | "extremum" | "grid";
export type KotePlacement = {
  x: number; y: number; z: number; label: string; layer: KoteLayer; kind: KoteKind;
};

export function sampleTerrainZ(
  p: WorldPoint, terrain: TerrainSample[], maxRadiusM: number,
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const t of terrain) {
    const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = t.z; }
  }
  return best !== null && bestD <= maxRadiusM ** 2 ? best : null;
}

export function terrainExtrema(terrain: TerrainSample[]): { low: TerrainSample; high: TerrainSample } {
  let low = terrain[0]!; let high = terrain[0]!;
  for (const t of terrain) { if (t.z < low.z) low = t; if (t.z > high.z) high = t; }
  return { low, high };
}

const fmt = (z: number): string => z.toFixed(2);
export const koteLabel = fmt;
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(drawing): kote-engine terrain sampling + extrema`.

---

### Task 6: Layer A — building-corner + parcel-corner koter (pure)

**Files:** Modify `src/domain/drawing/kote-engine.ts`; Test same.

- [ ] **Step 1: Write the failing test**

```ts
import { selectLayerAKoter } from "./kote-engine";

it("places one kote per building corner (offset outward) + one per parcel corner", () => {
  const building = [[2,2],[8,2],[8,8],[2,8],[2,2]] as [number,number][];
  const parcel = [[0,0],[10,0],[10,10],[0,10],[0,0]] as [number,number][];
  const terrain = [
    {x:2,y:2,z:10},{x:8,y:2,z:10.2},{x:8,y:8,z:10.4},{x:2,y:8,z:10.1},
    {x:0,y:0,z:9.9},{x:10,y:0,z:9.8},{x:10,y:10,z:10.6},{x:0,y:10,z:10.0},
  ];
  const koter = selectLayerAKoter({ building, parcel, terrain, cornerOffsetM: 0.15, maxRadiusM: 3 });
  expect(koter.filter(k => k.kind === "building_corner")).toHaveLength(4);
  expect(koter.filter(k => k.kind === "parcel_corner")).toHaveLength(4);
  // building-corner koter are nudged outward from the polygon centroid:
  const c = koter.find(k => k.kind === "building_corner")!;
  expect(c.layer).toBe("A");
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — append:

```ts
function ringCorners(ring: [number, number][]): [number, number][] {
  // drop the closing duplicate vertex
  const last = ring[ring.length - 1];
  const first = ring[0];
  const closed = last && first && last[0] === first[0] && last[1] === first[1];
  return (closed ? ring.slice(0, -1) : ring) as [number, number][];
}

function centroidOf(ring: [number, number][]): [number, number] {
  const cs = ringCorners(ring);
  const cx = cs.reduce((s, c) => s + c[0], 0) / cs.length;
  const cy = cs.reduce((s, c) => s + c[1], 0) / cs.length;
  return [cx, cy];
}

export function selectLayerAKoter(input: {
  building: [number, number][];
  parcel: [number, number][];
  terrain: TerrainSample[];
  cornerOffsetM: number;
  maxRadiusM: number;
}): KotePlacement[] {
  const out: KotePlacement[] = [];
  const [bcx, bcy] = centroidOf(input.building);
  for (const [x, y] of ringCorners(input.building)) {
    const z = sampleTerrainZ({ x, y }, input.terrain, input.maxRadiusM);
    if (z === null) continue;
    // nudge the marker outward from the building centroid by cornerOffsetM
    const dx = x - bcx, dy = y - bcy; const len = Math.hypot(dx, dy) || 1;
    out.push({
      x: x + (dx / len) * input.cornerOffsetM,
      y: y + (dy / len) * input.cornerOffsetM,
      z, label: koteLabel(z), layer: "A", kind: "building_corner",
    });
  }
  for (const [x, y] of ringCorners(input.parcel)) {
    const z = sampleTerrainZ({ x, y }, input.terrain, input.maxRadiusM);
    if (z === null) continue;
    out.push({ x, y, z, label: koteLabel(z), layer: "A", kind: "parcel_corner" });
  }
  return out;
}
```

> **Center text (sokkel/gulv)** is rendered by the builder, not the engine — it uses `plan.proposed.sokkelKoteM` / `finishedFloorKoteM` directly and must NOT be fabricated when null (respect the no-invention rule in `info-panel.ts`). See Task 9.

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(drawing): kote-engine layer A (building+parcel corner koter)`.

---

### Task 7: Layer B — road koter + extrema + neighbour proximity (pure)

**Files:** Modify `src/domain/drawing/kote-engine.ts`; Test same.

- [ ] **Step 1: Write the failing test**

```ts
import { selectLayerBKoter, neighbourWithin } from "./kote-engine";

it("plots road koter (nearest centreline + edges to parcel) and both extrema", () => {
  const terrain = [
    {x:0,y:0,z:9.5},{x:5,y:-3,z:9.2},{x:10,y:0,z:9.8},{x:5,y:12,z:11.9},
  ];
  const parcel = [[0,0],[10,0],[10,10],[0,10],[0,0]] as [number,number][];
  const centerline = [[-2,-3],[12,-3]] as [number,number][]; // road south of parcel
  const koter = selectLayerBKoter({
    parcel, terrain, centerline, edges: [], maxRadiusM: 4,
  });
  expect(koter.some(k => k.kind === "road")).toBe(true);
  expect(koter.filter(k => k.kind === "extremum")).toHaveLength(2); // low + high
});

it("neighbourWithin flags a neighbour building closer than threshold to the boundary", () => {
  const parcel = [[0,0],[10,0],[10,10],[0,10],[0,0]] as [number,number][];
  const near = [[10.5,4],[12,4],[12,6],[10.5,6],[10.5,4]] as [number,number][]; // 0.5 m off east skel
  expect(neighbourWithin(near, parcel, 2.5)).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — append (reuse `minDistanceToBoundaryM`/`polygonToPolygonDistanceM` from `@/lib/geometry-utils` for proximity; keep engine pure by importing only those pure helpers):

```ts
import { minDistanceToBoundaryM } from "@/lib/geometry-utils";

function nearestOnPolyline(pt: WorldPoint, line: [number, number][]): WorldPoint | null {
  if (line.length === 0) return null;
  let best: WorldPoint | null = null; let bestD = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i]!; const [bx, by] = line[i + 1]!;
    const dx = bx - ax, dy = by - ay; const lenSq = dx * dx + dy * dy || 1;
    let t = ((pt.x - ax) * dx + (pt.y - ay) * dy) / lenSq; t = Math.max(0, Math.min(1, t));
    const nx = ax + t * dx, ny = ay + t * dy;
    const d = (pt.x - nx) ** 2 + (pt.y - ny) ** 2;
    if (d < bestD) { bestD = d; best = { x: nx, y: ny }; }
  }
  return best;
}

export function selectLayerBKoter(input: {
  parcel: [number, number][];
  terrain: TerrainSample[];
  centerline: [number, number][] | null;
  edges: [number, number][][];   // vejkant polylines
  maxRadiusM: number;
}): KotePlacement[] {
  const out: KotePlacement[] = [];
  const [pcx, pcy] = centroidOf(input.parcel);
  const pushRoad = (pt: WorldPoint | null) => {
    if (!pt) return;
    const z = sampleTerrainZ(pt, input.terrain, input.maxRadiusM);
    if (z !== null) out.push({ x: pt.x, y: pt.y, z, label: koteLabel(z), layer: "B", kind: "road" });
  };
  pushRoad(input.centerline ? nearestOnPolyline({ x: pcx, y: pcy }, input.centerline) : null);
  for (const e of input.edges) pushRoad(nearestOnPolyline({ x: pcx, y: pcy }, e));

  if (input.terrain.length > 0) {
    const { low, high } = terrainExtrema(input.terrain);
    out.push({ x: low.x, y: low.y, z: low.z, label: koteLabel(low.z), layer: "B", kind: "extremum" });
    out.push({ x: high.x, y: high.y, z: high.z, label: koteLabel(high.z), layer: "B", kind: "extremum" });
  }
  return out;
}

export function neighbourWithin(
  neighbour: [number, number][], parcel: [number, number][], thresholdM: number,
): boolean {
  // min distance from neighbour corners to parcel boundary (cheap, sufficient for flagging)
  for (const [x, y] of ringCorners(neighbour)) {
    const d = minDistanceToBoundaryM([x, y], { type: "Polygon", coordinates: [parcel] });
    if (d !== null && d <= thresholdM) return true;
  }
  return false;
}
```

> **Neighbour sokkelkote:** the registry provides no neighbour `sokkelKoteM` (it is `null` in `drawing-layers.ts`). Per the no-invention rule we do **not** print a fabricated number. The builder (Task 9) uses `neighbourWithin` to emit a `MissingDataWarning` ("Nabosokkel < 2,5 m fra skel — opmåles") instead of a kote. "Each side of the driveway" requires driveway geometry, which is absent in the export path (`siteUse: []`); road koter approximate this with centreline + vejkant points nearest the parcel and are refined automatically once driveway geometry exists.

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(drawing): kote-engine layer B (road, extrema, neighbour proximity)`.

---

### Task 8: Layer C — adaptive paper-grid thinning + collision unclutter (pure)

**Files:** Modify `src/domain/drawing/kote-engine.ts`; Test same.

- [ ] **Step 1: Write the failing test**

```ts
import { selectGridKoter, type PaperBox } from "./kote-engine";
import { createProjector } from "@/lib/drawing/projector";

it("thins koter to ~one per minSpacingMm and drops any inside an occupancy box", () => {
  const project = createProjector({ pivot: [0,0], rotationDeg: 0, minX: 0, maxY: 100, scale: 3.7795 });
  // dense 1 m terrain grid 0..20 m
  const terrain = [];
  for (let x = 0; x <= 20; x++) for (let y = 0; y <= 20; y++) terrain.push({ x, y, z: 10 + x*0.1 });
  const occupancy: PaperBox[] = [ /* covers world ~ (0..6,0..6) → paper px */
    (() => { const [x0,y0] = project(0,6); const [x1,y1] = project(6,0); return { x: Math.min(x0,x1), y: Math.min(y0,y1), width: Math.abs(x1-x0), height: Math.abs(y1-y0) }; })(),
  ];
  const grid = selectGridKoter({ terrain, project, minSpacingMm: 35, occupancy, alreadyPlaced: [] });
  // spacing: 35 mm * 3.7795 ≈ 132 px ⇒ ≈ one per ~35 m; over a 20 m field ⇒ a handful, not 441
  expect(grid.length).toBeGreaterThan(0);
  expect(grid.length).toBeLessThan(12);
  // none of the kept koter fall inside the occupancy box (paper space)
  for (const k of grid) {
    const [px, py] = project(k.x, k.y);
    const b = occupancy[0]!;
    const inside = px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height;
    expect(inside).toBe(false);
  }
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — append:

```ts
import { PX_PER_MM } from "@/lib/drawing/sheet-layout";
import type { Projector } from "@/lib/drawing/projector";

export type PaperBox = { x: number; y: number; width: number; height: number };

function inBox(px: number, py: number, b: PaperBox): boolean {
  return px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height;
}

/**
 * Greedy spatial thinning in PAPER space. Lowest-priority layer: a candidate is
 * kept only if it is ≥ minSpacingMm from every already-kept/already-placed kote
 * and outside every occupancy box (buildings, dimension lines, kloak, A/B koter).
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
      if ((px - kx) ** 2 + (py - ky) ** 2 < minPxSq) { ok = false; break; }
    }
    if (!ok) continue;
    keptPx.push([px, py]);
    out.push({ x: t.x, y: t.y, z: t.z, label: koteLabel(t.z), layer: "C", kind: "grid" });
  }
  return out;
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(drawing): kote-engine layer C (adaptive grid + collision unclutter)`.

---

### Task 9: Wire kote-engine into the builder; widen DHM bbox; legend/notes

**Files:**
- Modify: `src/lib/drawing/drawing-model-builder.ts`
- Modify: `src/services/drawing/assemble-beliggenhedsplan.service.ts`
- Test: `src/lib/drawing/drawing-model-builder.test.ts`

- [ ] **Step 1: Write the failing test (builder emits koter from `plan.terrain`, not just survey).**

```ts
it("plots DHM terrain koter (layers A/B/C) when plan.terrain is present", () => {
  const model = buildDrawingModel(planWithDhmTerrain, autoReview);
  const koteFeatures = model.features.filter((f) => f.kind === "terrain_labels");
  expect(koteFeatures.length).toBeGreaterThan(0);
  // building-corner koter exist (layer A)
  expect(model.features.some((f) => f.id.startsWith("kote-A-building"))).toBe(true);
  // center sokkel/gulv text appears when sokkelKoteM is set
  expect(model.features.some((f) => f.id === "kote-center-text")).toBe(true);
});

it("does NOT fabricate center koter when sokkelKoteM is null", () => {
  const model = buildDrawingModel({ ...planWithDhmTerrain, proposed: { ...planWithDhmTerrain.proposed, sokkelKoteM: null, finishedFloorKoteM: null } }, autoReview);
  expect(model.features.some((f) => f.id === "kote-center-text")).toBe(false);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement the wiring.** Replace the `if (plan.survey) { … terrainPoints … }` block (`drawing-model-builder.ts` ~line 329) with a kote-engine pipeline that uses **survey points when present, otherwise DHM `plan.terrain.points`**:

```ts
import {
  selectLayerAKoter, selectLayerBKoter, selectGridKoter,
  neighbourWithin, type TerrainSample, type PaperBox, type KotePlacement,
} from "@/domain/drawing/kote-engine";

const terrainSamples: TerrainSample[] =
  (plan.survey?.terrainPoints.length
    ? plan.survey.terrainPoints
    : (plan.terrain?.points ?? [])
  ).map((p) => ({ x: p.x, y: p.y, z: p.z }));

let kotePlacements: KotePlacement[] = [];
if (terrainSamples.length > 0) {
  const layerA = selectLayerAKoter({
    building: plan.proposed.footprint25832.coordinates[0] as [number, number][],
    parcel: plan.parcel.polygon25832.coordinates[0] as [number, number][],
    terrain: terrainSamples, cornerOffsetM: 0.15, maxRadiusM: 3,
  });
  const layerB = selectLayerBKoter({
    parcel: plan.parcel.polygon25832.coordinates[0] as [number, number][],
    terrain: terrainSamples,
    centerline: plan.vej?.centerline25832?.coordinates ?? null,
    edges: (plan.vej?.vejkant25832 ?? []).map((e) => e.coordinates as [number, number][]),
    maxRadiusM: 4,
  });
  // occupancy = buildings + dimension/setback label rects + kloak lines + A/B kote dots
  const occupancy: PaperBox[] = buildOccupancyBoxes(/* proposed+existing polys, placedLabels, lerLedninger via project */);
  const layerC = selectGridKoter({
    terrain: terrainSamples, project, minSpacingMm: 35,
    occupancy, alreadyPlaced: [...layerA, ...layerB],
  });
  kotePlacements = [...layerA, ...layerB, ...layerC];
}

for (const k of kotePlacements) {
  const [px, py] = project(k.x, k.y);
  const pos = placeLabel(px + 4, py - 2, k.label, 6);
  features.push({
    id: `kote-${k.layer}-${k.kind}-${features.length}`,
    kind: "terrain_labels",
    svgElement: `<g><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="1.3" fill="#555"/><text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" font-family="Arial" font-size="${k.layer === "C" ? 5 : 6}" fill="#333">${k.label}</text></g>`,
    label: k.label, labelX: pos.x, labelY: pos.y, zIndex: 40,
  });
}

// Center sokkel/gulv text — only when documented (never fabricate):
if (plan.proposed.sokkelKoteM !== null) {
  const [bx, by] = project(...centroidOfProposed); // proposed footprint centroid
  const gulv = plan.proposed.finishedFloorKoteM;
  features.push({
    id: "kote-center-text", kind: "terrain_labels",
    svgElement: `<g><text x="${bx.toFixed(1)}" y="${by.toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="6" fill="#111">Sokkel ${plan.proposed.sokkelKoteM.toFixed(2)}</text>` +
      (gulv !== null ? `<text x="${bx.toFixed(1)}" y="${(by+8).toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="6" fill="#111">Gulv ${gulv.toFixed(2)}</text>` : "") + `</g>`,
    label: null, labelX: bx, labelY: by, zIndex: 41,
  });
}

// Neighbour-proximity warning (no fabricated kote):
for (const b of plan.existing.buildings) {
  if (neighbourWithin(b.footprint25832.coordinates[0] as [number, number][],
        plan.parcel.polygon25832.coordinates[0] as [number, number][], 2.5)) {
    // add a MissingDataWarning via infoPanel input (Task 9b) — "Nabosokkel < 2,5 m fra skel — opmåles"
    break;
  }
}
```

Add a small local `buildOccupancyBoxes(...)` helper in the builder that converts the proposed/existing building rings and `placedLabels` (already collected for dimensions/setbacks) into `PaperBox[]` via `project` + bbox.

- [ ] **Step 3b: Widen the DHM bbox in `assemble-beliggenhedsplan.service.ts`** so road/extrema koter have terrain coverage. After computing the parcel `bbox`, expand by a margin before `fetchDhmKoter`:

```ts
const DHM_MARGIN_M = 15;
const dhmBbox: [number, number, number, number] = [
  bbox[0] - DHM_MARGIN_M, bbox[1] - DHM_MARGIN_M,
  bbox[2] + DHM_MARGIN_M, bbox[3] + DHM_MARGIN_M,
];
// pass dhmBbox to geometrySource.fetchDhmKoter(dhmBbox, centroidLat, centroidLng)
```

(Leave the other layer fetches on the tight `bbox`.) Note in the PR: DHM `MAX_GRID_SIDE`/downsample already caps point count, so a 15 m margin stays within limits.

- [ ] **Step 4: Legend already has "Terrænkote (DVR90)"** (builder line ~432) — keep it. Run tests.

Run: `bun test src/lib/drawing/drawing-model-builder.test.ts src/services/drawing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/drawing/drawing-model-builder.ts src/services/drawing/assemble-beliggenhedsplan.service.ts src/domain/drawing/kote-engine.ts
git commit -m "feat(drawing): plot DHM koter via layered kote-engine (A/B/C) in beliggenhedsplan"
```

---

### Task 10: Full verification + visual smoke + docs

- [ ] **Step 1: Update the stale "Koter ikke dokumenteret" expectation only where a fixture now HAS terrain.** Fixtures `byledet3` and the `render-svg.test.ts` model have `terrain: null` → those assertions stay valid. Do not weaken them.

- [ ] **Step 2: Run the full gate.**

```bash
bunx tsc --noEmit
bun test
bunx eslint .
bun run build
```

Expected: all pass (baseline clean).

- [ ] **Step 3: Visual smoke.** Generate an SVG for a København-area fixture and a central-meridian fixture; write to `C:\tmp`. Confirm: (a) parcel orientation matches the OpenLayers `MatrikelMap` (overlay screenshot), (b) north arrow points up, (c) koter are legible with ≥ ~35 mm spacing, no overlaps over buildings/dimensions. Do not commit artifacts.

- [ ] **Step 4: Docs.** Update `CLAUDE.md` protected-files note only if a protected file changed (none planned). Update `docs/INTEGRATIONS.md` DHM section to note koter are now plotted; add a CHANGELOG entry. Refresh memory `project_beliggenhedsplan.md`.

- [ ] **Step 5: Commit** `docs+test: verify orientation+koter; update integration notes`.

---

## Self-Review

- **Spec coverage:** Orientation→true-north (Phase 1, Tasks 1–4). Layer A building+parcel corners + center sokkel/gulv text (Task 6 + Task 9). Layer B road≥3 / neighbour proximity / extrema (Task 7 + Task 9). Layer C adaptive 30–40 mm grid + collision unclutter (Task 8). "Acceptabel afstand" = `minSpacingMm: 35`. ✓
- **Known data gaps (documented, not faked):** neighbour `sokkelKoteM` (registry null → warning, not a number); driveway sides (no geometry in export path → centreline+vejkant approximation). These honour the no-invention rule.
- **Open item to confirm with user:** `finishedFloorKoteM` is computed as `sokkel + 0.15` in `assemble-beliggenhedsplan.service.ts:264`, but the spec says gulv ≈ sokkel + 0.02. The builder renders whatever the model holds; the +0.15 formula is **not** changed in this plan. Flag for decision.
- **Type consistency:** `Projector`, `KotePlacement`, `TerrainSample`, `PaperBox` names used identically across tasks. `projectionRotationDeg` added to `DrawingModel` and set in builder. ✓
- **Refactor safety:** Task 3 introduces the projector at rotation=0 (output-identical, guarded by acceptance tests) before Task 4 enables rotation. ✓
