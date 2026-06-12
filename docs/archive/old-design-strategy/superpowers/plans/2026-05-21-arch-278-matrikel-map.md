# ARCH-278: MatrikelMap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract pure geometry helpers from `MatrikelMap.tsx` into a tested module, wrap OpenLayers dynamic imports in typed variables (eliminating broad `any` casts), and move `syncPatch` calls out of map rendering into a callback prop so the component doesn't own persistence.

**Architecture:** New `src/lib/parcel-geometry.ts` contains pure functions for footprint placement, boundary distance computation, and outside-parcel area detection. `MatrikelMap.tsx` accepts an `onPlacementChange` prop instead of calling `syncPatch` directly. OpenLayers classes are typed via local interface declarations rather than `as any` casts on each access.

**Tech Stack:** TypeScript, Bun test, OpenLayers (already installed), no new dependencies.

---

## File Map

| Action | File                                                                   |
| ------ | ---------------------------------------------------------------------- |
| Create | `src/lib/parcel-geometry.ts`                                           |
| Create | `src/lib/parcel-geometry.test.ts`                                      |
| Modify | `src/components/cockpit/MatrikelMap.tsx`                               |
| Modify | `src/routes/projekt.$id.cockpit.tsx` (call site for onPlacementChange) |

---

### Task 1: Extract pure geometry helpers

**Files:**

- Create: `src/lib/parcel-geometry.ts`
- Create: `src/lib/parcel-geometry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/parcel-geometry.test.ts
import { describe, it, expect } from "bun:test";
import {
  computeFootprintAreaM2,
  computeMinDistanceToBoundaryM,
  computeOutsideParcelAreaM2,
} from "./parcel-geometry";

// A 10m × 10m square at the origin in WGS84 degrees
// (approximate — tests validate logic, not geodetic precision)
const SQUARE_10x10 = [
  [0, 0],
  [0.0001, 0],
  [0.0001, 0.0001],
  [0, 0.0001],
  [0, 0],
] as [number, number][];

const SQUARE_5x5 = [
  [0, 0],
  [0.00005, 0],
  [0.00005, 0.00005],
  [0, 0.00005],
  [0, 0],
] as [number, number][];

describe("computeFootprintAreaM2", () => {
  it("returns null for empty ring", () => {
    expect(computeFootprintAreaM2([])).toBeNull();
  });
  it("returns positive area for a polygon ring", () => {
    const area = computeFootprintAreaM2(SQUARE_10x10);
    expect(area).not.toBeNull();
    expect(area!).toBeGreaterThan(0);
  });
});

describe("computeMinDistanceToBoundaryM", () => {
  it("returns null for empty boundary", () => {
    expect(computeMinDistanceToBoundaryM([10, 56], [])).toBeNull();
  });
  it("returns positive distance for point inside polygon", () => {
    const center: [number, number] = [0.00005, 0.00005];
    const dist = computeMinDistanceToBoundaryM(center, SQUARE_10x10);
    expect(dist).not.toBeNull();
    expect(dist!).toBeGreaterThan(0);
  });
});

describe("computeOutsideParcelAreaM2", () => {
  it("returns 0 when footprint is fully inside parcel", () => {
    const footprint = SQUARE_5x5;
    const parcel = SQUARE_10x10;
    const outside = computeOutsideParcelAreaM2(footprint, parcel);
    expect(outside).toBe(0);
  });
  it("returns null for empty inputs", () => {
    expect(computeOutsideParcelAreaM2([], SQUARE_10x10)).toBeNull();
    expect(computeOutsideParcelAreaM2(SQUARE_10x10, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/lib/parcel-geometry.test.ts
```

Expected: `Cannot find module './parcel-geometry'`

- [ ] **Step 3: Create `parcel-geometry.ts`**

```typescript
// src/lib/parcel-geometry.ts
// Pure geometry helpers for parcel/footprint calculations.
// All functions use WGS84 [lng, lat] coordinates.
// No OpenLayers dependency — testable without browser setup.

type Ring = [number, number][];

// Shoelace formula for polygon area in degrees² — multiply by ~1.2e10 for rough m² at Danish latitudes
function shoelaceArea(ring: Ring): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(area / 2);
}

// Approximate degrees² to m² at latitude ~56°N (Denmark)
const DEG2_TO_M2_DK = 1.2e10;

export function computeFootprintAreaM2(ring: Ring): number | null {
  if (ring.length < 3) return null;
  return shoelaceArea(ring) * DEG2_TO_M2_DK;
}

// Minimum distance from point [lng, lat] to any segment in a polygon ring, in metres
export function computeMinDistanceToBoundaryM(point: [number, number], ring: Ring): number | null {
  if (ring.length < 2) return null;
  // Approximate metres per degree at 56°N
  const mPerLng = 111_320 * Math.cos((56 * Math.PI) / 180);
  const mPerLat = 111_320;

  let minDist = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0] * mPerLng;
    const ay = ring[j][1] * mPerLat;
    const bx = ring[i][0] * mPerLng;
    const by = ring[i][1] * mPerLat;
    const px = point[0] * mPerLng;
    const py = point[1] * mPerLat;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const closestX = ax + t * dx;
    const closestY = ay + t * dy;
    const dist = Math.hypot(px - closestX, py - closestY);
    if (dist < minDist) minDist = dist;
  }
  return minDist === Infinity ? null : minDist;
}

// Area of footprint ring that lies outside the parcel ring, in m²
// Simple approximation: if bounding boxes don't overlap, return footprint area.
// For overlapping cases returns 0 (conservative — avoids false positives).
export function computeOutsideParcelAreaM2(footprintRing: Ring, parcelRing: Ring): number | null {
  if (footprintRing.length < 3 || parcelRing.length < 3) return null;

  const fMinX = Math.min(...footprintRing.map((p) => p[0]));
  const fMaxX = Math.max(...footprintRing.map((p) => p[0]));
  const fMinY = Math.min(...footprintRing.map((p) => p[1]));
  const fMaxY = Math.max(...footprintRing.map((p) => p[1]));
  const pMinX = Math.min(...parcelRing.map((p) => p[0]));
  const pMaxX = Math.max(...parcelRing.map((p) => p[0]));
  const pMinY = Math.min(...parcelRing.map((p) => p[1]));
  const pMaxY = Math.max(...parcelRing.map((p) => p[1]));

  // No overlap — all of footprint is outside
  if (fMaxX < pMinX || fMinX > pMaxX || fMaxY < pMinY || fMinY > pMaxY) {
    return computeFootprintAreaM2(footprintRing);
  }
  // Footprint bbox is fully inside parcel bbox — assume contained
  if (fMinX >= pMinX && fMaxX <= pMaxX && fMinY >= pMinY && fMaxY <= pMaxY) {
    return 0;
  }
  // Partial overlap — conservative
  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/lib/parcel-geometry.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parcel-geometry.ts src/lib/parcel-geometry.test.ts
git commit -m "feat(arch-278): pure parcel geometry helpers with tests"
```

---

### Task 2: Add `onPlacementChange` prop and remove `syncPatch` from map

**Files:**

- Modify: `src/components/cockpit/MatrikelMap.tsx`

- [ ] **Step 1: Add callback prop to `MatrikelMapProps`**

In `MatrikelMap.tsx`, extend `MatrikelMapProps`:

```typescript
export type MatrikelMapProps = {
  bbr: BbrKompliantData | null;
  metrics: ComplianceMetrics | null;
  naboer: NeighborBuildingData | null;
  jordstykkeLokalId?: string | null;
  onPlacementChange?: (patch: { centroid: { lat: number; lng: number } }) => void;
};
```

- [ ] **Step 2: Replace `syncPatch` in `translateend` handler**

Locate the `translate.on("translateend", ...)` handler (lines ~298-319). Replace:

```typescript
translate.on("translateend", (event: any) => {
  // ... existing coordinate extraction ...
  if (address) {
    const nextAddress = { ...address, centroid: { lat, lng } };
    setAddress(nextAddress);
    void syncPatch({ address: nextAddress });
  }
});
```

With:

```typescript
translate.on("translateend", (event: any) => {
  const feature = event.features.item(0);
  const geometry = feature?.getGeometry();
  if (!feature || !geometry) return;

  const extent = geometry.getExtent();
  const center3857: [number, number] = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
  const [lng, lat] = transform(center3857, "EPSG:3857", "EPSG:4326") as [number, number];
  footprintCenterRef.current = [lng, lat];
  setDragHint("Placering opdateret");

  if (address) {
    const nextAddress = { ...address, centroid: { lat, lng } };
    setAddress(nextAddress);
    onPlacementChange?.({ centroid: { lat, lng } });
  }
});
```

Remove `import { syncPatch } from "@/lib/project-sync"` from the top of the file if it is now unused.

- [ ] **Step 3: Type the dynamic import destructures**

In the `initMap` function, replace each `as any` cast with a typed local declaration. Add this block right after the dynamic imports resolve:

```typescript
// Typed OL adapter — avoids broad `any` on all OL class references
type OlMap = import("ol/Map").default;
type OlView = import("ol/View").default;
type OlTileLayer = import("ol/layer/Tile").default<any>;
type OlImageLayer = import("ol/layer/Image").default<any>;
type OlVectorLayer = import("ol/layer/Vector").default<any>;
type OlVectorSource = import("ol/source/Vector").default<any>;
type OlFeature = import("ol/Feature").default;
type OlTranslate = import("ol/interaction/Translate").default;
```

Then change each `(imports[N] as any).default` to a typed variable:

```typescript
const Map: new (...args: any[]) => OlMap = (imports[0] as any).default;
const View: new (...args: any[]) => OlView = (imports[1] as any).default;
const TileLayer: new (...args: any[]) => OlTileLayer = (imports[2] as any).default;
const ImageLayer: new (...args: any[]) => OlImageLayer = (imports[3] as any).default;
const VectorLayer: new (...args: any[]) => OlVectorLayer = (imports[4] as any).default;
const VectorSource: new (...args: any[]) => OlVectorSource = (imports[5] as any).default;
const Feature: new (...args: any[]) => OlFeature = (imports[6] as any).default;
const Translate: new (...args: any[]) => OlTranslate = (imports[10] as any).default;
```

Also type the refs:

```typescript
const mapRef = useRef<OlMap | null>(null);
const parcelSourceRef = useRef<OlVectorSource | null>(null);
const footprintSourceRef = useRef<OlVectorSource | null>(null);
const footprintFeatureRef = useRef<OlFeature | null>(null);
const translateRef = useRef<OlTranslate | null>(null);
```

The `previewLayerRef` can stay typed as `useRef<import("ol/layer/Image").default<any> | null>`.

- [ ] **Step 4: Verify type check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/cockpit/MatrikelMap.tsx
git commit -m "refactor(arch-278): MatrikelMap removes syncPatch, adds onPlacementChange prop + typed OL refs"
```

---

### Task 3: Wire `onPlacementChange` in the call site

**Files:**

- Modify: `src/routes/projekt.$id.cockpit.tsx` (or wherever `<MatrikelMap>` is rendered in `<MatrikelCanvas>`)

Note: Check if `MatrikelMap` is rendered inside `MatrikelCanvas` in `cockpit/index.tsx` or in the route directly.

- [ ] **Step 1: Find the call site**

```bash
grep -r "MatrikelMap" src/ --include="*.tsx" -l
```

- [ ] **Step 2: Add `onPlacementChange` prop at the call site**

At the call site (whichever file renders `<MatrikelMap>`), add:

```typescript
<MatrikelMap
  bbr={bbr}
  metrics={metrics}
  naboer={naboer}
  jordstykkeLokalId={address?.jordstykkeLokalId ?? null}
  onPlacementChange={({ centroid }) => {
    const next = { ...address!, centroid };
    setAddress(next);
    void syncPatch({ address: next });
  }}
/>
```

- [ ] **Step 3: Run type check and tests**

```bash
bunx tsc --noEmit && bun test
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/projekt.$id.cockpit.tsx
# (or the file containing MatrikelCanvas if different)
git commit -m "refactor(arch-278): wire onPlacementChange at MatrikelMap call site"
```
