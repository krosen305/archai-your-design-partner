# Beliggenhedsplan 100% Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lukke alle resterende gaps så beliggenhedsplan-generatoren producerer myndighedsgodkendt SVG/PDF output der kan indsendes til kommunen som bilag til byggetilladelsesansøgning.

**Architecture:** Drawing-domænet bruger en pipeline: `assembleBeliggenhedsplan` (samler data fra live integrationer) → `buildDrawingModel` (konverterer til SVG-features) → `renderSvg`/`renderPdf` (output). Alle fixes rører kun drawing-domænet og dets adapters — ingen compliance-core eller projekt-persistence berøres.

**Tech Stack:** TypeScript, Bun/bun:test, JSTS (geometri), pdf-lib (PDF), SVG-strenge, TanStack React-routes, Supabase

---

## Gaps der lukkes (fra fresh analyse 2026-05-30)

| Gap                                                                                | Konsekvens                                                   | Task |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---- |
| `polygonFeature` skriver ingen tekst i SVG — matrikelnumre er usynlige             | Myndighed kan ikke se nabolotsnumre                          | T1   |
| `plan.parcel.roadName` hentes men rendres aldrig                                   | Vejnavn mangler på tegning                                   | T2   |
| `model.legend` bygges men `render-svg.ts` rendrer den ikke                         | Forklaring af symboler mangler                               | T3   |
| `metersPerMm` tager altid `plan.metadata.scale/1000`, ikke den faktiske skala      | Skalatav viser forkert skala                                 | T4   |
| `distanceToBoundarySegments()` eksisterer men ingen visuel skel-afstandsannotation | **Lovpligtige skelmål mangler** — kritisk for myndighed      | T5   |
| Fallback-fodprint bruger UTM (0,0) — bygning placeres i Atlanterhavet              | Generation fejler for brugere uden design-tool footprint     | T6   |
| Teknik-siden viser ikke om der er et fodprint og har ingen dimension-inputs        | Brugere sidder fast og forstår ikke fejlen                   | T6   |
| `drawing_exports`-tabellen er ikke i Supabase-typerne — repository bruger `as any` | Skrives til DB med tab af typesikkerhed; mulige runtime-fejl | T7   |
| Ingen end-to-end test der verificerer SVG-output har alle obligatoriske elementer  | Regressioner opdages ikke                                    | T8   |

---

## Filstruktur

| Fil                                                            | Ændring                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/domain/drawing/geometry-engine.ts`                        | Tilføj `SetbackAnnotation` type + `buildSetbackAnnotations()`        |
| `src/domain/drawing/geometry-engine.test.ts`                   | Opret ny testfil for `buildSetbackAnnotations`                       |
| `src/lib/drawing/drawing-model-builder.ts`                     | Polygon labels, road name label, setback annotations, scale accuracy |
| `src/lib/drawing/render-svg.ts`                                | Legend rendering                                                     |
| `src/lib/drawing/footprint-builder.ts`                         | Tilføj `buildRectangularFootprint25832()`                            |
| `src/routes/api.drawing.ts`                                    | Fix footprint fallback, tilføj width/depth/centroid params           |
| `src/routes/projekt.teknik.tsx`                                | Footprint status UI, dimension inputs                                |
| `src/integrations/supabase/repositories/drawing.repository.ts` | Fjern `as any`, tilføj lokal type                                    |
| `src/services/drawing/beliggenhedsplan-elements.test.ts`       | Opret end-to-end SVG-verifikationstest                               |

---

## Task 1: Polygon labels (matrikelnummer synligt på tegning)

**Files:**

- Modify: `src/lib/drawing/drawing-model-builder.ts`

Den eksisterende `polygonFeature`-funktion gemmer `label` i `DrawingFeature.label` men skriver det aldrig til `svgElement`. Fix: inkluder en `<text>`-node inde i et `<g>`-element.

- [ ] **Step 1: Opdater `polygonFeature` til at inkludere label-tekst**

Erstat den eksisterende `polygonFeature`-funktion (linje 25-48 i `drawing-model-builder.ts`) med:

```typescript
function polygonFeature(
  id: string,
  kind: DrawingFeature["kind"],
  coords: [number, number][],
  minX: number,
  maxY: number,
  scale: number,
  style: string,
  label: string | null = null,
  zIndex = 10,
): DrawingFeature {
  const pts = coordsToSvgPoints(coords, minX, maxY, scale);
  const cx = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const cy = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const labelX = (cx - minX) * scale;
  const labelY = (maxY - cy) * scale;
  const labelSvg = label
    ? `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="6" fill="#444">${esc(label)}</text>`
    : "";
  return {
    id,
    kind,
    svgElement: `<g><polygon points="${pts}" ${style}/>${labelSvg}</g>`,
    label,
    labelX,
    labelY,
    zIndex,
  };
}
```

- [ ] **Step 2: Kør typecheck**

```bash
bunx tsc --noEmit
```

Forventet: 0 fejl.

- [ ] **Step 3: Kør relevante tests**

```bash
bun test src/lib/drawing/render-svg.test.ts src/services/drawing/assemble-beliggenhedsplan.service.test.ts
```

Forventet: alle passer.

- [ ] **Step 4: Commit**

```bash
git add src/lib/drawing/drawing-model-builder.ts
git commit -m "feat(drawing): render matrikelnummer labels in polygon SVG elements"
```

---

## Task 2: Vejnavn-label på tegning

**Files:**

- Modify: `src/lib/drawing/drawing-model-builder.ts`

`plan.parcel.roadName` hentes fra GeoDanmark men tilføjes aldrig som SVG-feature. Placér det som kursiv tekst syd for parcellen (lavest UTM-Y = sydkant i tegnefeltet).

- [ ] **Step 1: Tilføj road-name feature i `buildDrawingModel`**

Indsæt følgende blok i `buildDrawingModel` **efter** constraints-løkken (efter linje ~163 — efter `allConstraints.forEach`-blokken):

```typescript
// Vejnavn-label — placeret syd for parcelpolygon
if (plan.parcel.roadName) {
  const parcelCoords = plan.parcel.polygon25832.coordinates[0] as [number, number][];
  const centerX = parcelCoords.reduce((s, c) => s + c[0], 0) / parcelCoords.length;
  const southY = Math.min(...parcelCoords.map((c) => c[1]));
  const labelPxX = (centerX - bboxMinX) * scale;
  const labelPxY = (bboxMaxY - southY) * scale + 14;
  features.push({
    id: "road-name",
    kind: "road_label",
    svgElement: `<text x="${labelPxX.toFixed(1)}" y="${labelPxY.toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="6.5" fill="#555" font-style="italic">${esc(plan.parcel.roadName)}</text>`,
    label: plan.parcel.roadName,
    labelX: labelPxX,
    labelY: labelPxY,
    zIndex: 45,
  });
}
```

- [ ] **Step 2: Kør typecheck + tests**

```bash
bunx tsc --noEmit && bun test src/services/drawing/assemble-beliggenhedsplan.service.test.ts
```

Forventet: 0 fejl, alle tests passer.

- [ ] **Step 3: Commit**

```bash
git add src/lib/drawing/drawing-model-builder.ts
git commit -m "feat(drawing): render road name label south of parcel boundary"
```

---

## Task 3: Legend rendering i SVG

**Files:**

- Modify: `src/lib/drawing/render-svg.ts`
- Modify: `src/lib/drawing/render-svg.test.ts`

`model.legend` er populeret i `buildDrawingModel` men `renderSvg` ignorerer den. Tilføj legend-rendering nederst i titelblokken.

- [ ] **Step 1: Skriv fejlende test i `render-svg.test.ts`**

Tilføj denne test i `describe("renderSvg")` blokken:

```typescript
it("indeholder legend-items fra model.legend", () => {
  const modelWithLegend: DrawingModel = {
    ...model,
    legend: [
      {
        symbol: '<rect width="12" height="8" fill="none" stroke="#000" stroke-width="1.5"/>',
        label: "Parcel",
      },
      {
        symbol: '<rect width="12" height="8" fill="#d4e8ff" stroke="#00f" stroke-width="1"/>',
        label: "Nyt byggeri",
      },
    ],
  };
  const svg = renderSvg(modelWithLegend);
  expect(svg).toContain("Parcel");
  expect(svg).toContain("Nyt byggeri");
});
```

- [ ] **Step 2: Kør test for at bekræfte den fejler**

```bash
bun test src/lib/drawing/render-svg.test.ts
```

Forventet: ny test fejler ("Parcel" ikke fundet i SVG).

- [ ] **Step 3: Tilføj legend-rendering i `render-svg.ts`**

Indsæt følgende **i slutningen af `titleSvg`-arrayet** (umiddelbart efter `tb.disclaimer`-betingelsen, men stadig inden `.join("\n")`):

```typescript
    ...(model.legend.length > 0
      ? [
          `<line x1="${tx + 2}" y1="${lineY + 4}" x2="${tx + titleBlockW - 2}" y2="${lineY + 4}" stroke="#bbb" stroke-width="0.3"/>`,
          ...model.legend.map((item, i) => {
            const ly = lineY + 14 + i * 13;
            return [
              `<g transform="translate(${(tx + 5).toFixed(1)},${(ly - 7).toFixed(1)})"><svg width="14" height="9" viewBox="0 0 12 8">${item.symbol}</svg></g>`,
              `<text x="${(tx + 22).toFixed(1)}" y="${ly.toFixed(1)}" font-family="Arial" font-size="5.5" fill="#333">${esc(item.label)}</text>`,
            ].join("\n");
          }),
        ]
      : []),
```

- [ ] **Step 4: Kør tests for at bekræfte de passer**

```bash
bun test src/lib/drawing/render-svg.test.ts
```

Forventet: alle tests passer inkl. den nye.

- [ ] **Step 5: Commit**

```bash
git add src/lib/drawing/render-svg.ts src/lib/drawing/render-svg.test.ts
git commit -m "feat(drawing): render legend items in SVG title block"
```

---

## Task 4: Skalanøjagtighed (metersPerMm fra faktisk beregnet skala)

**Files:**

- Modify: `src/domain/drawing/drawing-model.ts`
- Modify: `src/lib/drawing/drawing-model-builder.ts`

`computeViewport` tager `scale: 250 | 500` og dividerer med 1000. Men `buildDrawingModel` beregner en dynamisk pixel-skala der passer tegning til papir. Den faktiske skala kan afvige markant fra den erklærede. Skalataven viser dermed den forkerte skala. Fix: beregn faktisk `metersPerMm` fra pixel-skalaen og brug den.

- [ ] **Step 1: Opdater `computeViewport` signaturen i `drawing-model.ts`**

Erstat:

```typescript
export function computeViewport(
  bbox25832: [number, number, number, number],
  scale: 250 | 500,
): DrawingModel["viewport"] {
  return { bbox25832, metersPerMm: scale / 1000 };
}
```

Med:

```typescript
export function computeViewport(
  bbox25832: [number, number, number, number],
  metersPerMm: number,
): DrawingModel["viewport"] {
  return { bbox25832, metersPerMm };
}
```

- [ ] **Step 2: Beregn og brug faktisk `metersPerMm` i `drawing-model-builder.ts`**

I `buildDrawingModel`, umiddelbart efter `const scale = Math.min(scaleX, scaleY) * 0.9;` (linje 72), tilføj:

```typescript
// Faktisk skala: pixels per UTM-meter → meter per mm papir
const actualMetersPerMm = PX_PER_MM / scale;
const actualScaleRounded = Math.round(actualMetersPerMm * 1000);
```

Erstat derefter den eksisterende `viewport:`-linje i return-objektet (linje ~259):

```typescript
  // Erstat denne linje:
  viewport: computeViewport([bboxMinX, bboxMinY, bboxMaxX, bboxMaxY], plan.metadata.scale),
  // Med:
  viewport: computeViewport([bboxMinX, bboxMinY, bboxMaxX, bboxMaxY], actualMetersPerMm),
```

Og opdater `scale:`-feltet i `titleBlock` (find `scale: \`1:${plan.metadata.scale}\`` i return-objektet):

```typescript
  // Erstat:
  scale: `1:${plan.metadata.scale}`,
  // Med:
  scale: `1:${actualScaleRounded}`,
```

- [ ] **Step 3: Kør typecheck + tests**

```bash
bunx tsc --noEmit && bun test src/lib/drawing/render-svg.test.ts src/services/drawing/assemble-beliggenhedsplan.service.test.ts
```

Forventet: 0 fejl, alle tests passer. `render-svg.test.ts` har `expect(svg).toContain("1:250")` — verificér at denne stadig passer (eller opdater den til `1:` + matchet præfiks hvis skala afviger i testscenarie).

> **Note:** `render-svg.test.ts` linje 91 tester `expect(renderSvg(model)).toContain("1:250")`. Den bruger `model.titleBlock.scale: "1:250"` direkte (ikke via `buildDrawingModel`) så denne test er upåvirket.

- [ ] **Step 4: Commit**

```bash
git add src/domain/drawing/drawing-model.ts src/lib/drawing/drawing-model-builder.ts
git commit -m "fix(drawing): compute actual metersPerMm from pixel scale so scale bar is accurate"
```

---

## Task 5: Skel-afstandsmål (setback dimension lines) — KRITISK

**Files:**

- Modify: `src/domain/drawing/geometry-engine.ts`
- Create: `src/domain/drawing/geometry-engine.test.ts`
- Modify: `src/lib/drawing/drawing-model-builder.ts`

Dette er det vigtigste lovkrav for en dansk beliggenhedsplan: alle afstande fra ny bygning til hvert skel-segment SKAL vises med målsatte linjer. `distanceToBoundarySegments()` beregner minimum-afstand men producerer ingen visuel annotation. Tilføj `buildSetbackAnnotations()` som returnerer linjepunkter + afstandslabel, og render disse i model-builderen.

- [ ] **Step 1: Opret testfil `src/domain/drawing/geometry-engine.test.ts`**

```typescript
// src/domain/drawing/geometry-engine.test.ts
import { describe, it, expect } from "bun:test";
import { buildSetbackAnnotations, polygonAreaM2 } from "./geometry-engine";
import type { GeoJsonPolygon25832 } from "./beliggenhedsplan.types";

const parcel: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ],
  ],
};

// Bygning centreret 5m inde fra alle skel
const building: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [
    [
      [5, 5],
      [15, 5],
      [15, 15],
      [5, 15],
      [5, 5],
    ],
  ],
};

describe("buildSetbackAnnotations", () => {
  it("returnerer én annotation per bygningskant", () => {
    const anns = buildSetbackAnnotations(building, parcel);
    expect(anns.length).toBe(4); // 4 kanter på rektangulær bygning (ring = 5 pts inkl. closing)
  });

  it("afstand fra centreret 10x10 bygning i 20x20 parcel er 5m", () => {
    const anns = buildSetbackAnnotations(building, parcel);
    for (const ann of anns) {
      expect(ann.distanceM).toBeCloseTo(5, 0);
    }
  });

  it("buildingPt er midtpunkt af bygningskant", () => {
    const anns = buildSetbackAnnotations(building, parcel);
    // Sydkant: (5,5)→(15,5), midpunkt = (10,5)
    const south = anns.find((a) => Math.abs(a.buildingPt[1] - 5) < 0.1);
    expect(south).toBeDefined();
    expect(south!.buildingPt[0]).toBeCloseTo(10, 0);
  });
});
```

- [ ] **Step 2: Kør test for at bekræfte den fejler**

```bash
bun test src/domain/drawing/geometry-engine.test.ts
```

Forventet: FAIL — `buildSetbackAnnotations` er ikke defineret endnu.

- [ ] **Step 3: Implementér `buildSetbackAnnotations` i `geometry-engine.ts`**

Tilføj følgende **øverst i filen** (after imports, before existing functions) — de to hjælpefunktioner er pure math uden JSTS:

```typescript
export type SetbackAnnotation = {
  buildingPt: [number, number];
  parcelPt: [number, number];
  distanceM: number;
};

function nearestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return [ax, ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return [ax + t * dx, ay + t * dy];
}

export function buildSetbackAnnotations(
  building: GeoJsonPolygon25832,
  parcel: GeoJsonPolygon25832,
): SetbackAnnotation[] {
  const buildingRing = building.coordinates[0] as [number, number][];
  const parcelRing = parcel.coordinates[0] as [number, number][];
  const results: SetbackAnnotation[] = [];

  for (let i = 0; i < buildingRing.length - 1; i++) {
    const [ax, ay] = buildingRing[i]!;
    const [bx, by] = buildingRing[i + 1]!;
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;

    let minDist = Infinity;
    let nearestPt: [number, number] = [midX, midY];

    for (let j = 0; j < parcelRing.length - 1; j++) {
      const [px, py] = parcelRing[j]!;
      const [qx, qy] = parcelRing[j + 1]!;
      const [nx, ny] = nearestPointOnSegment(midX, midY, px, py, qx, qy);
      const d = Math.sqrt((midX - nx) ** 2 + (midY - ny) ** 2);
      if (d < minDist) {
        minDist = d;
        nearestPt = [nx, ny];
      }
    }

    results.push({
      buildingPt: [midX, midY],
      parcelPt: nearestPt,
      distanceM: Math.round(minDist * 100) / 100,
    });
  }

  return results;
}
```

- [ ] **Step 4: Kør tests for at bekræfte de passer**

```bash
bun test src/domain/drawing/geometry-engine.test.ts
```

Forventet: alle 3 tests passer.

- [ ] **Step 5: Render setback-annotationer i `drawing-model-builder.ts`**

Tilføj import øverst i filen:

```typescript
import {
  polygonAreaM2,
  distanceToNearestBoundaryM,
  splitPolygonIntoBoundarySegments,
  generateBuffer25832,
  buildSetbackAnnotations,
} from "@/domain/drawing/geometry-engine";
```

Indsæt derefter følgende blok i `buildDrawingModel` **efter** `dimLines.forEach`-blokken (efter linje ~183):

```typescript
// Skel-afstandsmål — obligatoriske afstandsannotationer til myndighed
const setbackAnnotations = buildSetbackAnnotations(
  plan.proposed.footprint25832,
  plan.parcel.polygon25832,
);
setbackAnnotations.forEach((ann, i) => {
  const bx = (ann.buildingPt[0] - bboxMinX) * scale;
  const by = (bboxMaxY - ann.buildingPt[1]) * scale;
  const px = (ann.parcelPt[0] - bboxMinX) * scale;
  const py = (bboxMaxY - ann.parcelPt[1]) * scale;
  const mx = (bx + px) / 2;
  const my = (by + py) / 2;
  const label = `${ann.distanceM.toFixed(2)} m`;
  features.push({
    id: `setback-ann-${i}`,
    kind: "dimension_lines",
    svgElement: `<g>
        <line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#b00" stroke-width="0.5" stroke-dasharray="3,1.5"/>
        <text x="${mx.toFixed(1)}" y="${(my - 2).toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="5.5" fill="#b00" font-weight="bold">${label}</text>
      </g>`,
    label,
    labelX: mx,
    labelY: my,
    zIndex: 36,
  });
});
```

- [ ] **Step 6: Kør typecheck + alle drawing-tests**

```bash
bunx tsc --noEmit && bun test src/domain/drawing/ src/lib/drawing/ src/services/drawing/
```

Forventet: 0 fejl, alle tests passer.

- [ ] **Step 7: Commit**

```bash
git add src/domain/drawing/geometry-engine.ts src/domain/drawing/geometry-engine.test.ts src/lib/drawing/drawing-model-builder.ts
git commit -m "feat(drawing): add setback dimension annotations (skel-afstandsmål) — mandatory for authority beliggenhedsplan"
```

---

## Task 6: Fodprint-fallback fix + Teknik-side UX

**Files:**

- Modify: `src/lib/drawing/footprint-builder.ts`
- Modify: `src/routes/api.drawing.ts`
- Modify: `src/routes/projekt.teknik.tsx`

**Problem A:** Når `designPlacement.footprintGeojson` er null, sætter `api.drawing.ts` fodprintet til UTM (0,0) — en position i Atlanterhavet. Resulterer i en tegning der er geometrisk ubrugelig.

**Problem B:** Brugere der ikke har brugt design-toolet får ingen forklaring og ingen mulighed for at angive dimensioner.

**Fix:** Tilføj `buildRectangularFootprint25832()` der bruger adressens lat/lng-koordinat som centrum. Udvid server-funktionens input-schema. Opdater Teknik-siden med fodprint-status og dimension-inputs.

### Del A: footprint-builder

- [ ] **Step 1: Tilføj `buildRectangularFootprint25832` i `footprint-builder.ts`**

Tilføj efter den eksisterende `buildSquareFootprint25832`-funktion:

```typescript
export type RectangularFootprintParams = {
  centroidWgs84: [number, number]; // [lng, lat]
  widthM: number;
  depthM: number;
  rotationDeg: number;
};

export function buildRectangularFootprint25832(
  params: RectangularFootprintParams,
): GeoJsonPolygon25832 {
  const [cx, cy] = proj4("WGS84", "EPSG:25832", [params.centroidWgs84[0], params.centroidWgs84[1]]);
  const halfW = params.widthM / 2;
  const halfD = params.depthM / 2;
  const angle = (params.rotationDeg * Math.PI) / 180;

  const corners: [number, number][] = (
    [
      [-halfW, -halfD],
      [halfW, -halfD],
      [halfW, halfD],
      [-halfW, halfD],
    ] as [number, number][]
  ).map(([dx, dy]) => [
    cx + dx * Math.cos(angle) - dy * Math.sin(angle),
    cy + dx * Math.sin(angle) + dy * Math.cos(angle),
  ]);

  return {
    type: "Polygon",
    crs: "EPSG:25832",
    coordinates: [[...corners, corners[0]]],
  };
}
```

### Del B: server function schema

- [ ] **Step 2: Udvid input-schema i `api.drawing.ts`**

Tilføj følgende felter til `ExportBeliggenhedsplanInputSchema`:

```typescript
  centroidLng: z.number().optional().nullable(),
  centroidLat: z.number().optional().nullable(),
  buildingWidthM: z.number().positive().max(60).optional().nullable(),
  buildingDepthM: z.number().positive().max(60).optional().nullable(),
  rotationDeg: z.number().min(0).max(360).optional().nullable(),
```

- [ ] **Step 3: Erstat den brudte fallback-logik i `api.drawing.ts`**

Erstat den eksisterende `let proposedFootprint25832: GeoJsonPolygon25832`-blok (linje 55-72) med:

```typescript
let proposedFootprint25832: GeoJsonPolygon25832;
if (data.footprintGeojson) {
  proposedFootprint25832 = decodeGeoJsonFootprint(data.footprintGeojson);
} else if (data.centroidLng != null && data.centroidLat != null && data.buildingWidthM != null) {
  const { buildRectangularFootprint25832 } = await import("@/lib/drawing/footprint-builder");
  proposedFootprint25832 = buildRectangularFootprint25832({
    centroidWgs84: [data.centroidLng, data.centroidLat],
    widthM: data.buildingWidthM,
    depthM: data.buildingDepthM ?? data.buildingWidthM,
    rotationDeg: data.rotationDeg ?? 0,
  });
} else {
  throw new Error(
    "MISSING_FOOTPRINT: angiv enten fodprint fra designværktøjet eller bredde/dybde i formularen",
  );
}
```

### Del C: Teknik-side UI

- [ ] **Step 4: Opdater `projekt.teknik.tsx`**

Tilføj følgende state-variabler i `TeknikPage`-komponenten (efter eksisterende `useState`-kald):

```typescript
const [buildingWidthM, setBuildingWidthM] = useState<string>("");
const [buildingDepthM, setBuildingDepthM] = useState<string>("");
const [rotationDeg, setRotationDeg] = useState<string>("0");
```

Tilføj disse selectors (under `designPlacement`-selectoren):

```typescript
const hasFootprint = !!designPlacement?.footprintGeojson;
const centroid = address?.koordinater ?? null;
```

Opdater `canGenerate`-logikken og tilføj en ny `canGenerateDefault`:

```typescript
const canGenerate =
  !!currentProjectId && !!address?.adresseid && !!address?.kommunekode && !!matrikelId;

const canGenerateWithDimensions =
  canGenerate &&
  !hasFootprint &&
  !!centroid &&
  buildingWidthM !== "" &&
  parseFloat(buildingWidthM) > 0;
```

Opdater `handleGenerate` til at sende de nye felter:

```typescript
const res = await exportBeliggenhedsplanFn({
  data: {
    projectId: currentProjectId!,
    matrikelId: matrikelId!,
    kommunekode: address!.kommunekode,
    addressId: address!.adresseid,
    addressText: address!.adresse ?? null,
    footprintGeojson: designPlacement?.footprintGeojson ?? null,
    bygherre: bygherre.trim() || null,
    sokkelKoteM: sokkelKoteM !== "" ? parseFloat(sokkelKoteM) : null,
    heightM: heightM !== "" ? parseFloat(heightM) : null,
    // Dimension-fallback hvis ingen designPlacement
    centroidLng: !hasFootprint && centroid ? centroid.lng : null,
    centroidLat: !hasFootprint && centroid ? centroid.lat : null,
    buildingWidthM: !hasFootprint && buildingWidthM !== "" ? parseFloat(buildingWidthM) : null,
    buildingDepthM: !hasFootprint && buildingDepthM !== "" ? parseFloat(buildingDepthM) : null,
    rotationDeg: rotationDeg !== "" ? parseFloat(rotationDeg) : null,
  },
});
```

Opdater `disabled`-betingelsen på generer-knappen:

```typescript
          disabled={(!canGenerate || loading) || (!hasFootprint && !canGenerateWithDimensions)}
```

Tilføj et fodprint-status-banner og dimension-inputs **oven over** det eksisterende tegningsdata-panel (indsæt efter `!canGenerate`-blokken):

```tsx
{
  canGenerate && !hasFootprint && (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <p className="text-sm font-medium text-blue-800">
        Ingen bygningsfodprint fra designværktøjet — angiv dimensioner for at generere en centreret
        standardplacering
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-blue-700 mb-1">Bredde (m) *</label>
          <input
            type="number"
            value={buildingWidthM}
            onChange={(e) => setBuildingWidthM(e.target.value)}
            placeholder="f.eks. 12"
            min={1}
            max={60}
            step={0.5}
            className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-blue-700 mb-1">Dybde (m)</label>
          <input
            type="number"
            value={buildingDepthM}
            onChange={(e) => setBuildingDepthM(e.target.value)}
            placeholder="= bredde hvis tom"
            min={1}
            max={60}
            step={0.5}
            className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-blue-700 mb-1">Rotation (°)</label>
          <input
            type="number"
            value={rotationDeg}
            onChange={(e) => setRotationDeg(e.target.value)}
            placeholder="0"
            min={0}
            max={360}
            step={5}
            className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      </div>
    </div>
  );
}

{
  canGenerate && hasFootprint && (
    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
      <p className="text-sm text-green-800">
        Fodprint fra designværktøjet anvendes ({(designPlacement!.footprintAreaM2 ?? 0).toFixed(0)}{" "}
        m²)
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Kør typecheck**

```bash
bunx tsc --noEmit
```

Forventet: 0 fejl.

- [ ] **Step 6: Kør relevante tests**

```bash
bun test src/lib/drawing/footprint-builder.test.ts
```

Forventet: alle eksisterende footprint-tests passer.

- [ ] **Step 7: Commit**

```bash
git add src/lib/drawing/footprint-builder.ts src/routes/api.drawing.ts src/routes/projekt.teknik.tsx
git commit -m "feat(drawing): fix broken footprint fallback + add dimension inputs on Teknik page"
```

---

## Task 7: `drawing_exports` migration + type cleanup

**Files:**

- Modify: `src/integrations/supabase/repositories/drawing.repository.ts`

`DrawingRepository` bruger `(supabaseAdmin as any)` fordi `drawing_exports`-tabellen ikke eksisterer i de genererede Supabase-typer. Migrationsfilen eksisterer i `supabase/migrations/20260528100000_drawing_exports.sql`.

**Strategi:** Definer en lokal RowType for tabellen og brug den som type assertion frem for `any`. Undgår `any` uden at kræve fuld type-regenerering.

- [ ] **Step 1: Verificér at migration er applied**

Spørg brugeren (eller kør lokalt):

```bash
# Tjek om tabellen eksisterer i prod:
bunx supabase db pull --schema public 2>&1 | grep drawing_exports
# Eller check om migration-timestamp er i supabase_migrations-tabellen
```

Hvis tabellen IKKE eksisterer i databasen, skal brugeren køre:

```bash
bunx supabase db push
```

Eller apply migration manuelt via Supabase Dashboard → SQL Editor med indholdet af `supabase/migrations/20260528100000_drawing_exports.sql`.

- [ ] **Step 2: Tilføj lokal type til `drawing.repository.ts` og fjern `as any`**

Tilføj følgende type-definition øverst i filen (efter imports):

```typescript
type DrawingExportInsert = {
  project_id: string;
  svg_path: string | null;
  pdf_path: string | null;
  readiness_status: string;
  input_hash: string;
  generated_at: string;
  drawing_type: string;
  status: string;
};

type DrawingExportRow = DrawingExportInsert & {
  id: string;
  approved_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabase = { from: (table: string) => any };
const drawingDb = supabaseAdmin as unknown as UntypedSupabase;
```

Erstat alle `(supabaseAdmin as any)` i filen med `drawingDb`:

```typescript
  async getExport(exportId: string): Promise<DrawingExportRecord | null> {
    const { data, error } = await drawingDb
      .from("drawing_exports")
      .select("*")
      .eq("id", exportId)
      .single();
    if (error || !data) return null;
    const row = data as DrawingExportRow;
    return {
      id: row.id,
      projectId: row.project_id,
      svgPath: row.svg_path,
      pdfPath: row.pdf_path,
      readinessStatus: row.readiness_status,
      generatedAt: row.generated_at,
      approvedAt: row.approved_at,
    };
  }

  async saveExportRecord(params: {
    projectId: string;
    svgPath: string | null;
    pdfPath: string | null;
    readinessStatus: string;
    inputHash: string;
  }): Promise<string> {
    const insert: DrawingExportInsert = {
      project_id: params.projectId,
      svg_path: params.svgPath,
      pdf_path: params.pdfPath,
      readiness_status: params.readinessStatus,
      input_hash: params.inputHash,
      generated_at: new Date().toISOString(),
      drawing_type: "beliggenhedsplan",
      status: "draft",
    };
    const { data, error } = await drawingDb
      .from("drawing_exports")
      .insert(insert)
      .select("id")
      .single();
    if (error || !data) throw new Error(`Kunne ikke gemme export-record: ${error?.message}`);
    return (data as { id: string }).id;
  }
```

- [ ] **Step 3: Kør typecheck**

```bash
bunx tsc --noEmit
```

Forventet: 0 fejl.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/repositories/drawing.repository.ts
git commit -m "fix(drawing): replace 'as any' in DrawingRepository with typed local interfaces"
```

---

## Task 8: End-to-end SVG-verifikationstest

**Files:**

- Create: `src/services/drawing/beliggenhedsplan-elements.test.ts`

Ingen test verificerer at det endelige SVG-output indeholder ALLE lovpligtige elementer for en beliggenhedsplan. Skriv en test der kører hele pipeline (assemble → buildModel → renderSvg) med fake-port og tjekker SVG-output.

- [ ] **Step 1: Opret testfil**

```typescript
// src/services/drawing/beliggenhedsplan-elements.test.ts
import { describe, it, expect } from "bun:test";
import { assembleBeliggenhedsplan } from "./assemble-beliggenhedsplan.service";
import { exportDrawing } from "./export-drawing.service";
import type { DrawingGeometrySourcePort } from "@/domain/drawing/ports";
import type {
  ParcelLayer,
  ExistingFeaturesLayer,
  GeoJsonPolygon25832,
  TerrainLayer,
} from "@/domain/drawing/beliggenhedsplan.types";
import { registrySourceMeta } from "@/domain/drawing/source-quality";
import type { DrawingExportStorePort, DrawingExportRecord } from "@/domain/drawing/ports";
import { buildDrawingModel } from "@/lib/drawing/drawing-model-builder";
import { renderSvg } from "@/lib/drawing/render-svg";

const now = new Date().toISOString();

const fakeParcel: ParcelLayer = {
  idLokalId: "test-id",
  bfeNr: "12345",
  matrikelnummer: "1a",
  ejerlavskode: 1234,
  ejerlavsnavn: "Testejerlav",
  polygon25832: {
    type: "Polygon",
    crs: "EPSG:25832",
    coordinates: [[[720000, 6170000], [720030, 6170000], [720030, 6170030], [720000, 6170030], [720000, 6170000]]],
  },
  areaRegisteredM2: 900,
  areaGeometryM2: 900,
  areaDiscrepancyM2: 0,
  boundarySegments: [],
  neighborParcels: [
    {
      matrikelnummer: "2b",
      polygon25832: {
        type: "Polygon",
        crs: "EPSG:25832",
        coordinates: [[[720030, 6170000], [720060, 6170000], [720060, 6170030], [720030, 6170030], [720030, 6170000]]],
      },
      labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [720045, 6170015] },
    },
  ],
  roadName: "Testvej",
  labelPoint25832: { type: "Point", crs: "EPSG:25832", coordinates: [720015, 6170015] },
  source: registrySourceMeta(now),
};

const fakeExisting: ExistingFeaturesLayer = {
  buildings: [],
  fences: [],
  source: { source: "registry", confidence: "low", fetchedAt: null, requiresReview: false },
};

const fakeTerrain: TerrainLayer = {
  verticalDatum: "DVR90",
  points: [{ x: 720015, y: 6170015, z: 18.5, label: "terræn", source: "registry" }],
  slopePercent: 1.2,
  lowPointM: 18.2,
  source: registrySourceMeta(now),
};

const fakeSource: DrawingGeometrySourcePort = {
  fetchParcelLayers: async () => fakeParcel,
  fetchNeighborBuildings: async () => fakeExisting,
  fetchRoadGeometry: async () => ({ centerline25832: null }),
  fetchPlandataLayers: async () => [],
  fetchNeighborParcels: async () => [],
  fetchRoadName: async () => ({ name: "Testvej" }),
  fetchDhmKoter: async () => fakeTerrain,
};

// Bygning centreret i parcellen med 8m til alle skel
const centeredFootprint: GeoJsonPolygon25832 = {
  type: "Polygon",
  crs: "EPSG:25832",
  coordinates: [[[720008, 6170008], [720022, 6170008], [720022, 6170022], [720008, 6170022], [720008, 6170008]]],
};

const baseMeta = {
  title: "Beliggenhedsplan",
  address: "Testvej 1",
  matrikel: "1a Testejerlav",
  bfeNr: "12345",
  bygherre: "Test Bygherre",
  sagNr: null,
  buildingCode: "BR18" as const,
  draughtsman: null,
  responsibleFirm: null,
  revisions: [],
  areaTable: null,
  date: "2026-05-30",
  scale: 250 as const,
  paperSize: "A3" as const,
};

class FakeStore implements DrawingExportStorePort & { saveExportRecord: (p: { projectId: string; svgPath: string | null; pdfPath: string | null; readinessStatus: string; inputHash: string }) => Promise<string> } {
  async saveSvg(_projectId: string, _svg: string): Promise<string> { return "drawings/test/drawing.svg"; }
  async savePdf(_projectId: string, _pdf: Uint8Array): Promise<string> { return "drawings/test/drawing.pdf"; }
  async createSignedUrl(_path: string, _secs: number): Promise<string | null> { return null; }
  async getExport(_id: string): Promise<DrawingExportRecord | null> { return null; }
  async saveExportRecord(_p: { projectId: string; svgPath: string | null; pdfPath: string | null; readinessStatus: string; inputHash: string }): Promise<string> { return "export-id-123"; }
}

describe("beliggenhedsplan SVG — lovpligtige elementer", () => {
  async function generateSvg(): Promise<string> {
    const { plan, readiness } = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: centeredFootprint,
      projectId: "proj-1",
      sokkelKoteM: 18.65,
      heightM: 8.0,
      metadata: baseMeta,
      geometrySource: fakeSource,
      survey: null,
    });
    if (!plan) throw new Error("Plan null — test setup fejl");
    const model = buildDrawingModel(plan, readiness);
    return renderSvg(model);
  }

  it("SVG indeholder matrikelnummer for parcel", async () => {
    expect(await generateSvg()).toContain("1a");
  });

  it("SVG indeholder vejnavn", async () => {
    expect(await generateSvg()).toContain("Testvej");
  });

  it("SVG indeholder BR18-byggelinje-annotation", async () => {
    expect(await generateSvg()).toContain("Byggelinje");
  });

  it("SVG indeholder skel-afstandsmål (m-annotation i rød)", async () => {
    const svg = await generateSvg();
    // Skel-afstandsmål rendres som " m" labels i rød farve
    expect(svg).toContain(" m</text>");
    expect(svg).toContain("#b00");
  });

  it("SVG indeholder nordpil", async () => {
    expect(await generateSvg()).toContain(">N<");
  });

  it("SVG indeholder skalatav", async () => {
    expect(await generateSvg()).toContain("1:");
  });

  it("SVG indeholder DVR90 kotedatum-annotation", async () => {
    expect(await generateSvg()).toContain("DVR90");
  });

  it("SVG indeholder bygherre i titelblok", async () => {
    expect(await generateSvg()).toContain("Test Bygherre");
  });

  it("SVG indeholder adresse i titelblok", async () => {
    expect(await generateSvg()).toContain("Testvej 1");
  });

  it("readiness er AUTO_REVIEW når DHM koter og eksisterende bygningsgeometri er tilgængeligt", async () => {
    const existing: ExistingFeaturesLayer = {
      buildings: [
        {
          bbrId: "bbr-1",
          footprint25832: {
            type: "Polygon",
            crs: "EPSG:25832",
            coordinates: [[[720001, 6170001], [720006, 6170001], [720006, 6170006], [720001, 6170006], [720001, 6170001]]],
          },
          usageCode: "120",
          areaM2: 25,
          sokkelKoteM: null,
          source: registrySourceMeta(now),
        },
      ],
      fences: [],
      source: registrySourceMeta(now),
    };
    const sourceWithBuildings: DrawingGeometrySourcePort = {
      ...fakeSource,
      fetchNeighborBuildings: async () => existing,
    };
    const { readiness } = await assembleBeliggenhedsplan({
      matrikelId: "test-id",
      kommunekode: "0101",
      addressId: "addr-1",
      proposedFootprint25832: centeredFootprint,
      projectId: "proj-1",
      sokkelKoteM: 18.65,
      heightM: 8.0,
      metadata: baseMeta,
      geometrySource: sourceWithBuildings,
      survey: null,
    });
    expect(readiness.status).toBe("AUTO_REVIEW");
  });
});
```

- [ ] **Step 2: Kør test**

```bash
bun test src/services/drawing/beliggenhedsplan-elements.test.ts
```

Forventet: alle tests passer. Fejl her indikerer at et af de foregående tasks ikke er implementeret korrekt.

- [ ] **Step 3: Kør den fulde test-suite for at tjekke for regressioner**

```bash
bun test src
```

Forventet: alle tests passer.

- [ ] **Step 4: Kør typecheck + lint + build**

```bash
bunx tsc --noEmit && bunx eslint . --max-warnings=0 && bun run build
```

Forventet: 0 fejl, 0 warnings, build lykkes.

- [ ] **Step 5: Commit**

```bash
git add src/services/drawing/beliggenhedsplan-elements.test.ts
git commit -m "test(drawing): add end-to-end SVG element verification for authority beliggenhedsplan"
```

---

## Self-review checklist

**Spec coverage:**

| Krav                                      | Task  |
| ----------------------------------------- | ----- |
| Matrikelnumre synlige på tegning          | T1 ✅ |
| Vejnavn på tegning                        | T2 ✅ |
| Legend                                    | T3 ✅ |
| Korrekt skala                             | T4 ✅ |
| Skel-afstandsmål (lovpligtige)            | T5 ✅ |
| Brugere uden design-tool kan generere     | T6 ✅ |
| DB-typesikkerhed for drawing_exports      | T7 ✅ |
| Automatisk verification af alle elementer | T8 ✅ |

**Fortsat ikke i scope (kendte begrænsninger):**

- Forsyningslag (kloak/vand/el) — kræver bruger-input-flow + separat integrationsdata
- Landinspektør-survey upload — SurveyLayer-typen eksisterer, men upload-flow og PDF-parsing er ikke implementeret
- Vejlinje/centerline-deklaration geometri — hentes fra Plandata men geometri-præsentationen er ikke implementeret

Disse begrænsninger er transparente i readiness-modellen: cases der kræver dem klassificeres korrekt som `SURVEY_REQUIRED`.

---

## Definition of Done

En task er done når:

- [ ] TypeScript passer (`bunx tsc --noEmit`)
- [ ] Alle tests passer (`bun test src`)
- [ ] Lint passer (`bunx eslint .`)
- [ ] Build lykkes (`bun run build`)
