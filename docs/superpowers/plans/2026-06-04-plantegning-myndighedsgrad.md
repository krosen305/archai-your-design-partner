# Plantegning → myndighedsgrad — Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (anbefalet) eller superpowers:executing-plans til at eksekvere denne plan opgave-for-opgave. Trin bruger checkbox (`- [ ]`).

**Goal:** Løft den interaktive plantegningseditor fra prototype til myndighedsgrad: ægte WYSIWYG med PDF-outputtet, fuldt redigerings-værktøjssæt, realistisk layout-generator og et annotations-lag — så en bruger kan producere en plantegning der nærmer sig en professionel arkitekt-reference (~8/10).

**Architecture:** Én deterministisk render-model (`buildRenderModel`) er sandheden for både skærm og PDF. UI er adapter; al redigering går gennem typede kommandoer → `applyCommand` (domæne, allerede implementeret) → ny model. Verifikation er server-autoritet. Ortogonal geometri nu; datamodel klar til frie vinkler senere.

**Tech Stack:** TypeScript, React, TanStack Router (`createServerFn`), Zod, SVG, Bun (`bun:test`), Supabase (kun via repositories).

**Spec:** `docs/superpowers/specs/2026-06-04-plantegning-myndighedsgrad-design.md`

---

## Sådan bruges denne plan på tværs af sessioner/LLM'er

Hver opgave er **selvstændig**. En kold agent skal kunne tage én opgave uden at have set de andre. Derfor har hver opgave:

- **Depends on:** opgaver der SKAL være færdige først (ellers `—`).
- **Parallel-safe med:** opgaver der trygt kan køre samtidig (ingen fil-overlap).
- **Cold-start kontekst:** de filer agenten skal læse FØRST for at forstå mønstre.
- **Files / TDD-trin / commit** som normalt.

**Globale regler (gælder ALLE opgaver):**

- Kør `bunx tsc --noEmit`, `bun test <berørt sti>`, `bunx eslint <berørt fil>` før commit. Hele suiten (`bun test`, `bun run build`) før en opgave meldes helt færdig.
- `bun:test`, IKKE Vitest. Importér: `import { describe, expect, it } from "bun:test";`.
- React-komponent/hook-tests kræver `import "@/testing/react-test-setup";` som ALLERFØRSTE linje.
- Ingen `any`, ingen unchecked `as`, ingen direkte Supabase/AI-kald i UI, ingen nye importcyklusser.
- Domæne-core (`src/domain/**`) må IKKE importere fra `src/lib/**`, React, Supabase eller AI.
- Commit-besked slutter med: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Afhængighedsgraf (høj-niveau):**

```txt
WS-A (canvas-konvergens)  ─┐
WS-F1 (schema-udvidelse)  ─┼─> WS-F2..F5 (annotations-render)
WS-C1/C3 (domæne)         ─┘
WS-B (redigeringsværktøjer) afhænger visuelt af WS-A, men kommandoer findes
WS-D (validerings-UI), WS-E (PDF-finish): kan køre uafhængigt
```

---

## WS-A — Canvas-konvergens (WYSIWYG)

**Mål:** `FloorPlanCanvas` renderer de rige felter fra render-modellen i stedet for naive `<line>`/cirkel-tegninger.

**Fælles cold-start kontekst for HELE WS-A:**
- Læs `src/lib/floor-plan/floor-plan-render-model.ts` — typen `FloorPlanRenderModel` og dens felter (`wallPoche`, `openings`, `dimensionChains`, `interiorDimensions`, `furniture`, `zones`, `complianceOverlay`).
- Læs `src/lib/floor-plan/render-floor-plan-svg.ts` — den STATELØSE streng-renderer der allerede tegner alt korrekt. Den er din facit/referencimplementering for hvordan hvert felt skal tegnes (poché, dørsving via `getSymbol`, dimensioner med pile, hatch, badges).
- Læs `src/components/floor-plan/FloorPlanCanvas.tsx` — den interaktive React-canvas du skal opgradere. Bevar dens pointer/drag/selection-logik; udskift KUN tegne-outputtet.
- Renderer-koordinater: `viewport.localToScreen(point)` mapper LOCAL_METER → skærm-px. Den stateløse renderer bruger `px(p) = {x:(p.x-minX)*scale, y:(maxY-p.y)*scale}`; i React-canvas’en bruges `viewport.localToScreen` i stedet.

### Task A1: Render poché-vægge i stedet for liniestreger

**Depends on:** —
**Parallel-safe med:** A5, alle WS-C/WS-F domæne-opgaver
**Files:**
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx` (vægsektionen, linje ~256-280)
- Test: `src/components/floor-plan/FloorPlanCanvas.test.tsx` (opret)

- [ ] **Step 1: Skriv den fejlende test**

```tsx
import "@/testing/react-test-setup";
import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { FloorPlanCanvas } from "./FloorPlanCanvas";
import { generateSeedFloorPlan } from "@/domain/floor-plan/seed-generator";

function doc() {
  return generateSeedFloorPlan({
    projectId: "p1",
    targetAreaM2: 80,
    rooms: [{ name: "Stue", roomType: "living" }],
  });
}

describe("FloorPlanCanvas poché", () => {
  it("renderer wallPoche-polygoner, ikke line-elementer, for vægge", () => {
    const d = doc();
    const { container } = render(
      <FloorPlanCanvas
        document={d}
        levelId={d.levels[0]!.id}
        selectedElement={null}
        activeTool="select"
        snapEnabled
        statusMessage={null}
        onSelectElement={() => {}}
        onPreviewCommand={() => true}
        onResetPreview={() => {}}
        onCommitCommand={async () => true}
      />,
    );
    expect(container.querySelectorAll("[data-wall-poche]").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("line[data-wall-id]").length).toBe(0);
  });
});
```

- [ ] **Step 2: Kør testen, bekræft at den fejler**

Run: `bun test src/components/floor-plan/FloorPlanCanvas.test.tsx`
Expected: FAIL (ingen `[data-wall-poche]`-elementer endnu).

- [ ] **Step 3: Implementér**

Erstat `{model.walls.map((wall) => (<line .../>))}`-blokken med rendering af `model.wallPoche` som `<polygon>`-elementer. Brug `viewport.localToScreen` på hvert punkt. Behold per-væg `<line>` UDELUKKENDE som usynligt hit-mål hvis nødvendigt for selektion (eller behold eksisterende hit-testing via `pickFloorPlanElement`, som bruger `pochePolygon`). Reference-tegning: se `wallPocheEls` i `render-floor-plan-svg.ts` (fill `#1a1a1a`).

```tsx
{model.wallPoche
  .filter((poly) => poly.length >= 3)
  .map((poly, i) => (
    <polygon
      key={`poche-${i}`}
      data-wall-poche={i}
      points={poly.map((p) => pointString(viewport.localToScreen(p))).join(" ")}
      className="fill-stone-900"
    />
  ))}
```

- [ ] **Step 4: Kør testen, bekræft PASS**

Run: `bun test src/components/floor-plan/FloorPlanCanvas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/floor-plan/FloorPlanCanvas.tsx src/components/floor-plan/FloorPlanCanvas.test.tsx
git commit -m "feat(floor-plan): render poché-vægge i interaktiv canvas"
```

### Task A2: Render døre/vinduer som arkitekt-symboler

**Depends on:** A1
**Parallel-safe med:** A5
**Files:**
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx` (åbningssektionen, linje ~281-303)
- Test: `src/components/floor-plan/FloorPlanCanvas.test.tsx` (tilføj case)

- [ ] **Step 1: Skriv den fejlende test**

```tsx
it("renderer åbninger som symbol-path, ikke cirkel+bogstav", () => {
  const d = doc();
  const { container } = render(
    <FloorPlanCanvas
      document={d}
      levelId={d.levels[0]!.id}
      selectedElement={null}
      activeTool="select"
      snapEnabled
      statusMessage={null}
      onSelectElement={() => {}}
      onPreviewCommand={() => true}
      onResetPreview={() => {}}
      onCommitCommand={async () => true}
    />,
  );
  const openingGroups = container.querySelectorAll("g[data-opening-id]");
  expect(openingGroups.length).toBeGreaterThan(0);
  // ingen "D"/"V"-bogstav-tekst som åbningssymbol
  const texts = [...container.querySelectorAll("text")].map((t) => t.textContent);
  expect(texts).not.toContain("D");
  expect(texts).not.toContain("V");
});
```

- [ ] **Step 2: Kør og bekræft FAIL**

Run: `bun test src/components/floor-plan/FloorPlanCanvas.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementér**

Erstat åbnings-blokken (cirkel + `<text>D/V`) med symbol-path-rendering, præcis som `openingEls` i `render-floor-plan-svg.ts`: hent paths via `getSymbol` (`door_left`/`window`/`sliding_door`/`garage_door`) og indsæt i en `<g transform=...>`. Importér `getSymbol` fra `@/lib/floor-plan/symbols/symbol-registry`. Transform skal bruge `viewport`-skala; udled px-per-meter fra `viewport.localDistanceToScreen(1)`.

```tsx
{model.openings.map((op) => {
  const c = viewport.localToScreen(op.center);
  const s = viewport.localDistanceToScreen(1);
  let paths: string[] = [];
  try {
    if (op.kind === "door") paths = getSymbol("door_left", op.widthM).paths;
    else if (op.kind === "sliding_door") paths = getSymbol("sliding_door", op.widthM).paths;
    else if (op.kind === "window") paths = getSymbol("window", op.widthM).paths;
    else if (op.kind === "garage_door") paths = getSymbol("garage_door", op.widthM).paths;
  } catch { paths = []; }
  const selected = selectedElement?.kind === "opening" && selectedElement.id === op.id;
  return (
    <g
      key={op.id}
      data-opening-id={op.id}
      transform={`translate(${c.x},${c.y}) rotate(${-op.angleDeg}) scale(${s},${-s})`}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" strokeWidth={1.5 / s}
          className={selected ? "stroke-sky-600" : "stroke-emerald-600"} />
      ))}
    </g>
  );
})}
```

- [ ] **Step 4: Kør og bekræft PASS**

Run: `bun test src/components/floor-plan/FloorPlanCanvas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/floor-plan/FloorPlanCanvas.tsx src/components/floor-plan/FloorPlanCanvas.test.tsx
git commit -m "feat(floor-plan): tegn døre/vinduer som arkitekt-symboler i canvas"
```

### Task A3: Render målsætning (dimension chains + interior) i canvas

**Depends on:** A1
**Parallel-safe med:** A2, A5
**Files:**
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx`
- Test: `src/components/floor-plan/FloorPlanCanvas.test.tsx` (tilføj case)

- [ ] **Step 1: Skriv den fejlende test**

```tsx
it("renderer mål-labels (dimension chains)", () => {
  const d = doc();
  const { container } = render(
    <FloorPlanCanvas
      document={d}
      levelId={d.levels[0]!.id}
      selectedElement={null}
      activeTool="select"
      snapEnabled
      statusMessage={null}
      onSelectElement={() => {}}
      onPreviewCommand={() => true}
      onResetPreview={() => {}}
      onCommitCommand={async () => true}
    />,
  );
  expect(container.querySelectorAll("[data-dimension]").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Kør og bekræft FAIL**

Run: `bun test src/components/floor-plan/FloorPlanCanvas.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementér**

Tilføj en dimensions-render-blok. Iterér `model.dimensionChains` (hver `chain.segments`) og `model.interiorDimensions`. Tegn vidnelinjer (`from→chainFrom`, `to→chainTo`), kædelinje (`chainFrom→chainTo`) og en `<text data-dimension>` ved `labelPt` med `labelText`. Reference: `dimensionEls` + `interiorDimEls` i `render-floor-plan-svg.ts`. Brug `viewport.localToScreen` på alle punkter. Respektér `model.layers.showDimensions`.

- [ ] **Step 4: Kør og bekræft PASS**

Run: `bun test src/components/floor-plan/FloorPlanCanvas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/floor-plan/FloorPlanCanvas.tsx src/components/floor-plan/FloorPlanCanvas.test.tsx
git commit -m "feat(floor-plan): vis målsætning i interaktiv canvas"
```

### Task A4: Render møbler/inventar-symboler, zoner med hatch og compliance-badges

**Depends on:** A1
**Parallel-safe med:** A2, A3, A5
**Files:**
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx`
- Modify: `src/components/floor-plan/FloorPlanEditor.tsx` (videregiv `localFindings` til canvas via `buildRenderModel(..., { findings })`)
- Test: `src/components/floor-plan/FloorPlanCanvas.test.tsx` (tilføj case)

- [ ] **Step 1: Skriv den fejlende test**

```tsx
it("renderer møbel-symboler som path-grupper når furniture findes", () => {
  const base = doc();
  const lvl = base.levels[0]!;
  const withFurniture = {
    ...base,
    levels: [{ ...lvl, furniture: [{
      id: "f1", levelId: lvl.id, roomId: null, furnitureKind: "sofa" as const,
      position: { x: 2, y: 2 }, rotationDeg: 0, widthM: 2, depthM: 0.9,
      source: { source: "manual" as const, confidence: "medium" as const, fetchedAt: null, requiresReview: false },
    }] }],
  };
  const { container } = render(
    <FloorPlanCanvas
      document={withFurniture}
      levelId={lvl.id}
      selectedElement={null}
      activeTool="select"
      snapEnabled
      statusMessage={null}
      onSelectElement={() => {}}
      onPreviewCommand={() => true}
      onResetPreview={() => {}}
      onCommitCommand={async () => true}
    />,
  );
  expect(container.querySelectorAll("g[data-furniture-id]").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Kør og bekræft FAIL**

Run: `bun test src/components/floor-plan/FloorPlanCanvas.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementér**

Tre render-blokke, alle med reference i `render-floor-plan-svg.ts`:
1. **Møbler** (`model.furniture`): `<g data-furniture-id transform="translate(cx,cy) rotate(-rot) scale(s,-s)">` med symbol-paths.
2. **Zoner** (`model.zones`): polygon med stiplet kant + `hatchPaths`.
3. **Compliance-badges** (`model.complianceOverlay.roomCompliance`): farvede cirkler i rummets øvre-venstre hjørne (rød=blocking, orange=warning, blå=info).

I `FloorPlanEditor.tsx`: byg render-modellen med findings, så overlay'et er tilgængeligt. Find hvor canvas’en får sit `document`; canvas’en bygger selv modellen via `buildRenderModel(document, levelId)` — udvid det kald til `buildRenderModel(document, levelId, { findings: localFindings })` og send `localFindings` ind som prop.

- [ ] **Step 4: Kør og bekræft PASS**

Run: `bun test src/components/floor-plan/FloorPlanCanvas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/floor-plan/FloorPlanCanvas.tsx src/components/floor-plan/FloorPlanEditor.tsx src/components/floor-plan/FloorPlanCanvas.test.tsx
git commit -m "feat(floor-plan): møbel-symboler, zoner og compliance-badges i canvas"
```

### Task A5: Gulv-finish-hatch pr. rum

**Depends on:** —
**Parallel-safe med:** A1-A4 (rører primært domæne/lib + render-model; koordinér flet med A-canvas)
**Files:**
- Modify: `src/lib/floor-plan/hatch-patterns.ts` (tilføj evt. `plank`-mønster med retning)
- Modify: `src/lib/floor-plan/floor-plan-render-model.ts` (tilføj `roomHatch` til `RenderRoom` eller en ny `roomFloorHatch`-liste)
- Modify: `src/lib/floor-plan/render-floor-plan-svg.ts` (render rum-hatch)
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx` (render rum-hatch)
- Test: `src/lib/floor-plan/floor-plan-render-model.test.ts` (tilføj case)

- [ ] **Step 1: Skriv den fejlende test**

```ts
import { describe, expect, it } from "bun:test";
import { buildRenderModel } from "./floor-plan-render-model";
import { generateSeedFloorPlan } from "@/domain/floor-plan/seed-generator";

describe("rum-gulv-hatch", () => {
  it("giver hatch-paths pr. rum når floorFinishAssemblyId er sat", () => {
    const base = generateSeedFloorPlan({
      projectId: "p1", targetAreaM2: 60,
      rooms: [{ name: "Stue", roomType: "living" }],
    });
    const lvl = base.levels[0]!;
    const withFinish = { ...base, levels: [{ ...lvl,
      rooms: lvl.rooms.map((r) => ({ ...r, floorFinishAssemblyId: "oak_plank" })) }] };
    const model = buildRenderModel(withFinish, lvl.id);
    const room = model.rooms[0]!;
    expect(room.floorHatchPaths.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Kør og bekræft FAIL**

Run: `bun test src/lib/floor-plan/floor-plan-render-model.test.ts`
Expected: FAIL (`floorHatchPaths` findes ikke på `RenderRoom`).

- [ ] **Step 3: Implementér**

Tilføj `floorHatchPaths: string[]` til `RenderRoom`. I `buildRenderModel`: når `room.floorFinishAssemblyId` er sat, kald `buildHatchPaths({ polygon: room.polygon.vertices, pattern: "plank" })` (tilføj `plank`-mønster i `hatch-patterns.ts` — parallelle linjer i én retning, tættere end zone-hatch). Når feltet er `null`, returnér `[]`. Render i begge renderere under rum-polygonen.

- [ ] **Step 4: Kør og bekræft PASS**

Run: `bun test src/lib/floor-plan/floor-plan-render-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/floor-plan/hatch-patterns.ts src/lib/floor-plan/floor-plan-render-model.ts src/lib/floor-plan/render-floor-plan-svg.ts src/components/floor-plan/FloorPlanCanvas.tsx src/lib/floor-plan/floor-plan-render-model.test.ts
git commit -m "feat(floor-plan): retningsbestemt gulv-finish-hatch pr. rum"
```

---

## WS-B — Redigering: tilføj / slet / del rum

**Mål:** Aktivér de deaktiverede værktøjer og kobl dem til det eksisterende kommando-vokabular. **Alle kommandoer findes allerede i `apply-command.ts`** — dette er ren UI-wiring.

**Fælles cold-start kontekst for HELE WS-B:**
- Læs `src/domain/floor-plan/command.schemas.ts` — `FloorPlanCommandSchema` (de eksakte kommando-former).
- Læs `src/domain/floor-plan/apply-command.ts` — bekræft at `add_wall`, `add_opening`, `delete_wall`, `split_room`, `merge_rooms` allerede er implementeret.
- Læs `src/hooks/useFloorPlanEditor.ts` — `commitCommand(command, baseDocument?, source?)` og `previewCommand`. UI sender kommandoer hertil.
- Læs `src/components/floor-plan/FloorPlanToolbar.tsx` — værktøjslinjen med deaktiverede knapper.
- Læs `src/components/floor-plan/FloorPlanCanvas.tsx` + `src/lib/floor-plan/editor-hit-testing.ts` + `src/lib/floor-plan/snap-engine.ts` — pointer/snap-mønstre.

### Task B1: Udvid værktøjs-typen og toolbar med tegne-modes

**Depends on:** —
**Parallel-safe med:** A*-opgaver
**Files:**
- Modify: `src/components/floor-plan/FloorPlanToolbar.tsx`
- Test: `src/components/floor-plan/FloorPlanToolbar.test.tsx` (opret)

- [ ] **Step 1: Skriv den fejlende test**

```tsx
import "@/testing/react-test-setup";
import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { FloorPlanToolbar } from "./FloorPlanToolbar";

describe("FloorPlanToolbar", () => {
  it("har aktive knapper for tegn-væg og dør/vindue", () => {
    const { getByLabelText } = render(
      <FloorPlanToolbar
        activeTool="select" snapEnabled canUndo canRedo
        onToolChange={() => {}} onToggleSnap={() => {}} onUndo={() => {}} onRedo={() => {}}
      />,
    );
    expect((getByLabelText("Tegn væg") as HTMLButtonElement).disabled).toBe(false);
    expect((getByLabelText("Tilføj dør/vindue") as HTMLButtonElement).disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Kør og bekræft FAIL**

Run: `bun test src/components/floor-plan/FloorPlanToolbar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementér**

Udvid `FloorPlanTool` til `"select" | "pan" | "draw_wall" | "add_opening"`. Erstat de deaktiverede `Ruler`/`DoorOpen`-knapper med aktive `ToolButton`s der kalder `onToolChange("draw_wall")` / `onToolChange("add_opening")`, labels "Tegn væg" / "Tilføj dør/vindue".

- [ ] **Step 4: Kør og bekræft PASS** — Run: `bun test src/components/floor-plan/FloorPlanToolbar.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/floor-plan/FloorPlanToolbar.tsx src/components/floor-plan/FloorPlanToolbar.test.tsx
git commit -m "feat(floor-plan): aktive tegne-værktøjer i toolbar"
```

### Task B2: Tegn-væg-interaktion (klik-klik) → add_wall med ortogonal-snap

**Depends on:** B1
**Parallel-safe med:** B4
**Files:**
- Create: `src/lib/floor-plan/draw-wall-interaction.ts` (pure: udregn snappet endepunkt + add_wall-kommando)
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx` (håndtér `activeTool === "draw_wall"`)
- Test: `src/lib/floor-plan/draw-wall-interaction.test.ts` (opret)

- [ ] **Step 1: Skriv den fejlende test**

```ts
import { describe, expect, it } from "bun:test";
import { orthoSnapEndpoint, buildAddWallCommand } from "./draw-wall-interaction";

describe("draw-wall ortho-snap", () => {
  it("snapper til vandret når dx > dy", () => {
    const p = orthoSnapEndpoint({ x: 0, y: 0 }, { x: 5, y: 0.3 });
    expect(p).toEqual({ x: 5, y: 0 });
  });
  it("snapper til lodret når dy > dx", () => {
    const p = orthoSnapEndpoint({ x: 0, y: 0 }, { x: 0.2, y: 4 });
    expect(p).toEqual({ x: 0, y: 4 });
  });
  it("bygger en gyldig add_wall-kommando", () => {
    const cmd = buildAddWallCommand("level_0", { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(cmd.type).toBe("add_wall");
    expect(cmd.wallKind).toBe("interior");
    expect(cmd.thicknessM).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Kør og bekræft FAIL** — Run: `bun test src/lib/floor-plan/draw-wall-interaction.test.ts` → FAIL.

- [ ] **Step 3: Implementér**

```ts
import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import type { FloorPlanCommand } from "@/domain/floor-plan/commands";

export function orthoSnapEndpoint(start: Point2D, raw: Point2D): Point2D {
  const dx = Math.abs(raw.x - start.x);
  const dy = Math.abs(raw.y - start.y);
  return dx >= dy ? { x: raw.x, y: start.y } : { x: start.x, y: raw.y };
}

export function buildAddWallCommand(
  levelId: string, start: Point2D, end: Point2D,
): Extract<FloorPlanCommand, { type: "add_wall" }> {
  return { type: "add_wall", levelId, start, end, thicknessM: 0.1, wallKind: "interior" };
}
```

I canvas’en: når `activeTool === "draw_wall"`, første klik sætter `drawStart`; mus-bevægelse viser preview-linje til `orthoSnapEndpoint(drawStart, local)` (snap også til eksisterende hjørner via `snapPoint`); andet klik kalder `onCommitCommand(buildAddWallCommand(levelId, drawStart, snapped), document)`.

- [ ] **Step 4: Kør og bekræft PASS** — Run: `bun test src/lib/floor-plan/draw-wall-interaction.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/floor-plan/draw-wall-interaction.ts src/lib/floor-plan/draw-wall-interaction.test.ts src/components/floor-plan/FloorPlanCanvas.tsx
git commit -m "feat(floor-plan): tegn-væg-værktøj med ortogonal-snap"
```

### Task B3: Placér dør/vindue ved klik på væg → add_opening

**Depends on:** B1
**Parallel-safe med:** B2, B4
**Files:**
- Create: `src/lib/floor-plan/add-opening-interaction.ts`
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx`
- Test: `src/lib/floor-plan/add-opening-interaction.test.ts`

- [ ] **Step 1: Skriv den fejlende test**

```ts
import { describe, expect, it } from "bun:test";
import { buildAddOpeningCommand } from "./add-opening-interaction";

describe("add-opening", () => {
  it("bygger en dør-kommando med standard bredde/højde", () => {
    const cmd = buildAddOpeningCommand("level_0", "w1", 1.5, "door");
    expect(cmd).toEqual({
      type: "add_opening", levelId: "level_0", wallId: "w1",
      openingKind: "door", offsetAlongWallM: 1.5, widthM: 0.9, heightM: 2.1, swing: "left",
    });
  });
  it("bygger en vindue-kommando", () => {
    const cmd = buildAddOpeningCommand("level_0", "w1", 2, "window");
    expect(cmd.openingKind).toBe("window");
    expect(cmd.swing).toBe("none");
  });
});
```

- [ ] **Step 2: Kør og bekræft FAIL** — Run: `bun test src/lib/floor-plan/add-opening-interaction.test.ts` → FAIL.

- [ ] **Step 3: Implementér**

```ts
import type { FloorPlanCommand } from "@/domain/floor-plan/commands";

export function buildAddOpeningCommand(
  levelId: string, wallId: string, offsetAlongWallM: number, kind: "door" | "window",
): Extract<FloorPlanCommand, { type: "add_opening" }> {
  return kind === "door"
    ? { type: "add_opening", levelId, wallId, openingKind: "door", offsetAlongWallM, widthM: 0.9, heightM: 2.1, swing: "left" }
    : { type: "add_opening", levelId, wallId, openingKind: "window", offsetAlongWallM, widthM: 1.2, heightM: 1.4, swing: "none" };
}
```

I canvas’en: når `activeTool === "add_opening"` og brugeren klikker på en væg (brug `pickFloorPlanElement` → `kind === "wall"`), udregn offset langs væggen via `offsetAlongWall(wall, local)` (fra `editor-hit-testing.ts`) og kald `onCommitCommand`. Tilføj et lille valg (dør/vindue) i statuslinjen eller via en sekundær toolbar-toggle.

- [ ] **Step 4: Kør og bekræft PASS** — Run: `bun test src/lib/floor-plan/add-opening-interaction.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/floor-plan/add-opening-interaction.ts src/lib/floor-plan/add-opening-interaction.test.ts src/components/floor-plan/FloorPlanCanvas.tsx
git commit -m "feat(floor-plan): placér dør/vindue ved klik på væg"
```

### Task B4: Rum-konteksthandlinger (omdøb, rumtype, målareal, slet)

**Depends on:** —
**Parallel-safe med:** B2, B3
**Files:**
- Modify: `src/components/floor-plan/FloorPlanInspector.tsx` (rum-panel når selection.kind === "room")
- Modify: `src/components/floor-plan/FloorPlanEditor.tsx` (videregiv handlers)
- Test: `src/components/floor-plan/FloorPlanInspector.test.tsx` (opret)

**Note:** "Slet rum" mapper til at fjerne en skillevæg / `merge_rooms`. Først: læs `FloorPlanInspector.tsx` for at se hvilke handlers der allerede findes. Omdøb/rumtype/målareal kræver KOMMANDOER der opdaterer rum-metadata. Hvis ingen `update_room`-kommando findes i `command.schemas.ts`, tilføj den (se Step 3) — det er den eneste domæne-tilføjelse i WS-B.

- [ ] **Step 1: Skriv den fejlende test (domæne-kommando først)**

Opret `src/domain/floor-plan/apply-command.update-room.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { applyCommand } from "./apply-command";
import { generateSeedFloorPlan } from "./seed-generator";

describe("update_room", () => {
  it("omdøber rum og skifter rumtype", () => {
    const doc = generateSeedFloorPlan({ projectId: "p1", targetAreaM2: 40,
      rooms: [{ name: "Rum", roomType: "other" }] });
    const roomId = doc.levels[0]!.rooms[0]!.id;
    const out = applyCommand(doc, { type: "update_room", roomId, name: "Køkken", roomType: "kitchen" });
    expect(out.accepted).toBe(true);
    if (out.accepted) {
      const r = out.document.levels[0]!.rooms.find((x) => x.id === roomId)!;
      expect(r.name).toBe("Køkken");
      expect(r.roomType).toBe("kitchen");
    }
  });
});
```

- [ ] **Step 2: Kør og bekræft FAIL** — Run: `bun test src/domain/floor-plan/apply-command.update-room.test.ts` → FAIL.

- [ ] **Step 3: Implementér domæne-kommando**

I `command.schemas.ts`, tilføj til `FloorPlanCommandSchema`-unionen:

```ts
z.object({
  type: z.literal("update_room"),
  roomId: z.string().min(1),
  name: z.string().optional(),
  roomType: RoomZoneSchema.shape.roomType.optional(),
  targetAreaM2: z.number().positive().nullable().optional(),
}),
```

(Importér `RoomZoneSchema` i command.schemas.ts.) I `apply-command.ts`: tilføj `case "update_room": return applyUpdateRoom(doc, command);` og en `applyUpdateRoom`-funktion der finder rummet, `structuredClone`r, sætter de angivne felter (kun dem der ikke er `undefined`), og returnerer accepted med `liveFindingsFor(next)`. Returnér `ROOM_NOT_FOUND` hvis rummet ikke findes.

- [ ] **Step 4: Kør og bekræft PASS** — Run: `bun test src/domain/floor-plan/apply-command.update-room.test.ts` → PASS.

- [ ] **Step 5: Skriv inspector-test + UI**

Opret `FloorPlanInspector.test.tsx` (med `import "@/testing/react-test-setup";`) der renderer inspector med en valgt room-selection og verificerer at et navn-input og en rumtype-select findes. Implementér i `FloorPlanInspector.tsx`: når `selection.kind === "room"`, vis input (navn), select (rumtype), tal-input (målareal) og en "Slet rum"-knap. Hver ændring kalder `commitCommand({ type: "update_room", ... })`. "Slet rum" kalder `merge_rooms` med rummet + nabo, eller `delete_wall` på en skillevæg — vælg den enkleste: find en ikke-bærende skillevæg der grænser til rummet og kald `delete_wall`.

- [ ] **Step 6: Kør, bekræft PASS, commit**

```bash
git add src/domain/floor-plan/command.schemas.ts src/domain/floor-plan/apply-command.ts src/domain/floor-plan/apply-command.update-room.test.ts src/components/floor-plan/FloorPlanInspector.tsx src/components/floor-plan/FloorPlanInspector.test.tsx src/components/floor-plan/FloorPlanEditor.tsx
git commit -m "feat(floor-plan): rum-konteksthandlinger + update_room-kommando"
```

### Task B5: Slet valgt væg (Delete-tast) med bærende-væg-review

**Depends on:** —
**Parallel-safe med:** alle B-opgaver
**Files:**
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx` (keydown-handler)
- Test: dækket af eksisterende `apply-command`-tests for `delete_wall`; tilføj en UI-test i `FloorPlanCanvas.test.tsx` der simulerer Delete på en valgt væg og forventer `onCommitCommand` kaldt med `{ type: "delete_wall" }`.

- [ ] **Step 1: Skriv test** — simulér `keydown` Delete med en valgt væg-selection; spy på `onCommitCommand`.
- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** — `onKeyDown` på canvas-wrapper: hvis `selectedElement?.kind === "wall"` og key === "Delete"/"Backspace", kald `onCommitCommand({ type: "delete_wall", wallId: selectedElement.id }, document)`. (Domænet afviser bærende vægge med `BEARING_WALL_REQUIRES_REVIEW`/`ELEMENT_LOCKED`; fejlen vises allerede via `error` i hook’en.)
- [ ] **Step 4: Kør og bekræft PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(floor-plan): slet valgt væg med Delete-tast"
```

### Task B6: Type-to-set-dimension (klik mål → indtast → move_wall)

**Depends on:** A3 (mål skal renderes), B1
**Parallel-safe med:** B4, B5
**Files:**
- Create: `src/lib/floor-plan/dimension-edit.ts` (pure: udregn `move_wall`-delta fra ønsket længde)
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx`
- Test: `src/lib/floor-plan/dimension-edit.test.ts`

- [ ] **Step 1: Skriv test**

```ts
import { describe, expect, it } from "bun:test";
import { deltaForTargetLength } from "./dimension-edit";

describe("type-to-set-dimension", () => {
  it("udregner delta så et 4.0 m segment bliver 5.0 m", () => {
    expect(deltaForTargetLength(4.0, 5.0)).toBeCloseTo(1.0, 6);
  });
});
```

- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** — `export function deltaForTargetLength(currentM: number, targetM: number): number { return targetM - currentM; }`. I canvas’en: klik på en `<text data-dimension>` åbner et lille input; ved Enter kald `onCommitCommand({ type: "move_wall", wallId, axis, deltaM: deltaForTargetLength(seg.currentM, parsed) })`. (Mål-segmentet skal bære reference til den væg/akse det styrer; udvid `RenderDimensionSegment` med valgfri `wallId?`/`axis?` hvis nødvendigt, sat i `buildRenderModel`.)
- [ ] **Step 4: Kør og bekræft PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/floor-plan/dimension-edit.ts src/lib/floor-plan/dimension-edit.test.ts src/components/floor-plan/FloorPlanCanvas.tsx
git commit -m "feat(floor-plan): type-to-set redigering af mål"
```

---

## WS-C — Layout-motor + symboler + tegne-ergonomi

### Task C1: Deterministisk layout-motor (erstat strimler)

**Depends on:** —
**Parallel-safe med:** alle WS-A/WS-B-opgaver
**Files:**
- Create: `src/domain/floor-plan/layout-engine.ts`
- Test: `src/domain/floor-plan/layout-engine.test.ts`
- Modify (senere, C2): `src/domain/floor-plan/seed-generator.ts`

**Cold-start kontekst:** Læs `src/domain/floor-plan/seed-generator.ts` (nuværende strimmel-logik, linje 40-93) og `src/domain/floor-plan/topology-engine.ts` (`detectRooms`). Layout-motoren skal producere et `walls: Wall[]`-array (centerlines) som `detectRooms` kan udlede rum fra — IKKE strimler.

- [ ] **Step 1: Skriv den fejlende test**

```ts
import { describe, expect, it } from "bun:test";
import { layoutWalls } from "./layout-engine";
import { detectRooms } from "./topology-engine";

describe("layout-engine", () => {
  it("producerer et lukket hylster + skillevægge der giver mindst antallet af rum", () => {
    const walls = layoutWalls({
      widthM: 10, depthM: 8,
      rooms: [
        { name: "Stue", roomType: "living" },
        { name: "Køkken", roomType: "kitchen" },
        { name: "Bad", roomType: "bathroom" },
        { name: "Værelse", roomType: "bedroom" },
      ],
    });
    const faces = detectRooms(walls.map((w) => w.centerline));
    expect(faces.length).toBeGreaterThanOrEqual(4);
  });

  it("giver ikke alle rum samme bredde (ikke strimler)", () => {
    const walls = layoutWalls({
      widthM: 10, depthM: 8,
      rooms: [
        { name: "Bad", roomType: "bathroom" },
        { name: "Stue", roomType: "living" },
      ],
    });
    const faces = detectRooms(walls.map((w) => w.centerline));
    const areas = faces.map((f) => f.areaM2).sort((a, b) => a - b);
    // badeværelse skal være markant mindre end stue
    expect(areas[0]! / areas[areas.length - 1]!).toBeLessThan(0.8);
  });
});
```

- [ ] **Step 2: Kør og bekræft FAIL** — Run: `bun test src/domain/floor-plan/layout-engine.test.ts` → FAIL.

- [ ] **Step 3: Implementér**

Skriv `layoutWalls(brief: { widthM: number; depthM: number; rooms: Array<{ name: string; roomType: RoomZone["roomType"] }> }): Wall[]`. Algoritme (deterministisk, ortogonal):
1. Byg ydre hylster (4 vægge).
2. Tildel hvert rum en vægtet arealandel ud fra rumtype (fx `bathroom: 0.5`, `living: 1.6`, `kitchen: 1.3`, `bedroom: 1.1`, default `1.0`).
3. Placér en cirkulations-/gang-stribe (smal) hvis ≥4 rum.
4. Fordel rum i et 2D-gitter (rækker × kolonner) i stedet for én række strimler — vælg antal kolonner ≈ `round(sqrt(roomCount))`.
5. Returnér ydervægge (thickness 0.3, `wallKind: "exterior"`, `structuralRole: "bearing"`) + skillevægge (thickness 0.1, `wallKind: "interior"`, `structuralRole: "non_bearing"`). Brug samme `Wall`-form som `seed-generator.ts`’ `wall()`-helper.

Hold det 100% deterministisk (ingen `Math.random`).

- [ ] **Step 4: Kør og bekræft PASS** — Run: `bun test src/domain/floor-plan/layout-engine.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/floor-plan/layout-engine.ts src/domain/floor-plan/layout-engine.test.ts
git commit -m "feat(floor-plan): deterministisk 2D-layout-motor (erstatter strimler)"
```

### Task C2: Kobl layout-motoren ind i seed-generatoren

**Depends on:** C1
**Parallel-safe med:** —
**Files:**
- Modify: `src/domain/floor-plan/seed-generator.ts`
- Modify: `src/domain/floor-plan/seed-generator.test.ts` (hvis findes; ellers opret)

- [ ] **Step 1: Skriv/udvid test** — verificér at `generateSeedFloorPlan` med 5 rum producerer rum med varierende arealer (ikke lige brede strimler) og at navne fra briefen bevares.
- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** — erstat strimmel-løkken (linje 46-56) med `const walls = layoutWalls({ widthM: W, depthM: D, rooms: brief.rooms });`. Behold rum-derivation via `detectRooms` + label-tildeling. Bevar determinisme og Zod-validering.
- [ ] **Step 4: Kør og bekræft PASS.** Kør også `bun test src/domain/floor-plan` for at sikre topologi-tests stadig passerer.
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(floor-plan): generér plan via layout-motor i stedet for strimler"
```

### Task C3: Nye symbol-kinds (bil/plante/havemøbler/walk-in)

**Depends on:** —
**Parallel-safe med:** alt
**Files:**
- Modify: `src/domain/floor-plan/floor-plan.schemas.ts` (`FURNITURE_KINDS`)
- Create: `src/lib/floor-plan/symbols/landscape-symbols.ts`
- Modify: `src/lib/floor-plan/symbols/symbol-registry.ts`
- Test: `src/lib/floor-plan/symbols/symbol-registry.test.ts` (tilføj cases)

- [ ] **Step 1: Skriv test**

```ts
import { describe, expect, it } from "bun:test";
import { getSymbol } from "./symbol-registry";

describe("nye symboler", () => {
  for (const kind of ["vehicle", "plant", "outdoor_lounge", "wardrobe_walkin"] as const) {
    it(`returnerer paths for ${kind}`, () => {
      expect(getSymbol(kind).paths.length).toBeGreaterThan(0);
    });
  }
});
```

- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** — tilføj `"vehicle"`, `"plant"`, `"outdoor_lounge"`, `"wardrobe_walkin"` til `FURNITURE_KINDS` i schemas. Opret `landscape-symbols.ts` med path-funktioner (følg mønster i `furniture-symbols.ts`: returnér `{ paths, defaultWidthM, defaultHeightM }`, koordinater centreret på (0,0) i meter). Tilføj cases i `symbol-registry.ts`’ `resolve`-switch.
- [ ] **Step 4: Kør og bekræft PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/domain/floor-plan/floor-plan.schemas.ts src/lib/floor-plan/symbols/landscape-symbols.ts src/lib/floor-plan/symbols/symbol-registry.ts src/lib/floor-plan/symbols/symbol-registry.test.ts
git commit -m "feat(floor-plan): symboler for bil, plante, havemøbler, walk-in"
```

### Task C4: Sammenhængende polylinje-vægtegning

**Depends on:** B2
**Parallel-safe med:** C3
**Files:**
- Modify: `src/lib/floor-plan/draw-wall-interaction.ts` (tilføj polylinje-state-reducer)
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx`
- Test: `src/lib/floor-plan/draw-wall-interaction.test.ts` (tilføj cases)

- [ ] **Step 1: Skriv test** — en ren reducer `polylineStep(state, point)` der akkumulerer punkter og udsender én `add_wall`-kommando pr. segment; dobbeltklik/luk afslutter.
- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** reduceren + wiring: hvert klik i `draw_wall`-mode tilføjer et segment fra forrige punkt (ortho-snappet) og committer `add_wall`; Escape/dobbeltklik nulstiller.
- [ ] **Step 4: Kør og bekræft PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(floor-plan): polylinje-vægtegning (klik-klik-klik)"
```

### Task C5: Tilbyggede uopvarmede masser (carport/udhus) som zoner

**Depends on:** —
**Parallel-safe med:** C1, C3
**Files:**
- Modify: `src/domain/floor-plan/command.schemas.ts` (`add_zone`)
- Modify: `src/domain/floor-plan/apply-command.ts` (`applyAddZone`)
- Test: `src/domain/floor-plan/apply-command.add-zone.test.ts`

- [ ] **Step 1: Skriv test** — `applyCommand(doc, { type: "add_zone", levelId, zoneKind: "carport", polygon, name: "Carport" })` returnerer accepted og tilføjer en zone med korrekt `areaM2` (udregnet via `polygonSignedAreaM2`).
- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** — tilføj `add_zone`-kommando (felter: `levelId`, `zoneKind` fra `ZONE_KINDS`, `polygon: Polygon2DSchema`, `name`, `heated: z.boolean().default(false)`). `applyAddZone` udregner areal, sætter `source: DEFAULT_MANUAL_SOURCE`, pusher til `level.zones`. (Zone-rendering findes allerede i begge renderere.)
- [ ] **Step 4: Kør og bekræft PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/domain/floor-plan/command.schemas.ts src/domain/floor-plan/apply-command.ts src/domain/floor-plan/apply-command.add-zone.test.ts
git commit -m "feat(floor-plan): add_zone for carport/udhus/overdækkede arealer"
```

---

## WS-D — Live BR18-validering (UI)

### Task D1: Findings-panel med severity, konsekvens og næste skridt

**Depends on:** A4 (badges i canvas) — kan dog laves uafhængigt
**Parallel-safe med:** alt
**Files:**
- Modify: `src/components/floor-plan/VerificationPanel.tsx`
- Test: `src/components/floor-plan/VerificationPanel.test.tsx`

**Cold-start kontekst:** Læs `src/domain/floor-plan/verification-engine.ts` for `VerificationFinding`-formen (`severity`, `category`, `message`, evt. `nextAction`, `shortLabel`). Læs hvordan `useFloorPlanEditor` eksponerer `localFindings`/`formalVerification`.

- [ ] **Step 1: Skriv test** — render panel med en liste findings inkl. en `blocking` og en `warning`; verificér at begge vises, sorteret med blocking øverst, og at `nextAction`-tekst vises.
- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** — grupper findings efter severity (blocking → review_required → warning → info), vis konsekvens (`message`) + næste skridt (`nextAction`) pr. finding med farvekodning.
- [ ] **Step 4: Kør og bekræft PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/components/floor-plan/VerificationPanel.tsx src/components/floor-plan/VerificationPanel.test.tsx
git commit -m "feat(floor-plan): findings-panel med konsekvens og næste skridt"
```

---

## WS-E — Målfast PDF-finish

### Task E1: Bekræft/komplettér titelblok, nordpil, målestok, arealskema i PDF

**Depends on:** —
**Parallel-safe med:** alt
**Files:**
- Modify: `src/lib/floor-plan/floor-plan-sheet.ts`
- Modify: `src/lib/floor-plan/render-floor-plan-sheet-pdf.ts`
- Test: `src/lib/floor-plan/floor-plan-sheet.test.ts` (opret hvis mangler)

**Cold-start kontekst:** Læs `src/lib/floor-plan/floor-plan-sheet.ts` og `render-floor-plan-sheet-pdf.ts` for nuværende titelblok/nordpil/målestok. Verificér hvad der allerede findes (git-log nævner WS6 title block + north arrow).

- [ ] **Step 1: Skriv test** — `buildFloorPlanSheet(...)` indeholder nordpil, målestok-label (`1:100`/`1:50`), titelblok-felter (adresse, dato, målestok) og arealskema-rækker. Assert på de strukturelle felter.
- [ ] **Step 2: Kør og bekræft FAIL** (kun for de felter der mangler).
- [ ] **Step 3: Implementér** de manglende felter. Hvis alt allerede findes, gør testen til en regressionssikring og spring implementering over.
- [ ] **Step 4: Kør og bekræft PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -am "test(floor-plan): sikr titelblok/nordpil/målestok/arealskema i PDF-sheet"
```

### Task E2: WYSIWYG-paritets-test (editor-model == PDF-model)

**Depends on:** A1-A5
**Parallel-safe med:** —
**Files:**
- Test: `src/lib/floor-plan/wysiwyg-parity.test.ts` (opret)

- [ ] **Step 1: Skriv test** — byg samme `FloorPlanDocument`, kald `buildRenderModel(doc, levelId, { findings })` én gang og assert at både den interaktive canvas og PDF-rendereren bruger SAMME model-felter (samme antal `wallPoche`-polygoner, samme antal `openings`, samme `dimensionChains`). Da begge konsumerer `buildRenderModel`, tester dette at ingen renderer dropper felter.
- [ ] **Step 2: Kør og bekræft den passerer (eller afslører divergens).**
- [ ] **Step 3: Hvis divergens:** ret den renderer der mangler felter (peg tilbage til den relevante A-opgave).
- [ ] **Step 4: Commit**

```bash
git add src/lib/floor-plan/wysiwyg-parity.test.ts
git commit -m "test(floor-plan): WYSIWYG-paritet mellem editor og PDF"
```

---

## WS-F — Annotations-lag

### Task F1: Udvid datamodellen (operable opening + rum-kote/lofthøjde)

**Depends on:** —
**Parallel-safe med:** WS-A, WS-C domæne-opgaver
**Files:**
- Modify: `src/domain/floor-plan/floor-plan.schemas.ts`
- Test: `src/domain/floor-plan/floor-plan.schemas.test.ts` (tilføj cases)

**Cold-start kontekst:** Læs `src/domain/floor-plan/floor-plan.schemas.ts` — `OpeningSchema`, `RoomZoneSchema`. Ændringer SKAL være additive med `.default(...)` så eksisterende persisterede dokumenter stadig validerer (Rule 1, bagudkompatibilitet).

- [ ] **Step 1: Skriv test**

```ts
import { describe, expect, it } from "bun:test";
import { OpeningSchema, RoomZoneSchema } from "./floor-plan.schemas";

describe("annotations-felter", () => {
  it("Opening har operable med default false", () => {
    const base = {
      id: "o1", levelId: "l0", wallId: "w1", openingKind: "window",
      offsetAlongWallM: 1, widthM: 1.2, heightM: 1.4, sillHeightM: 0.9,
      swing: "none", productTypeId: null, locked: false,
      source: { source: "manual", confidence: "medium", fetchedAt: null, requiresReview: false },
    };
    expect(OpeningSchema.parse(base).operable).toBe(false);
    expect(OpeningSchema.parse({ ...base, operable: true }).operable).toBe(true);
  });

  it("RoomZone har ceilingHeightM og floorOffsetM (nullable, default null)", () => {
    const base = {
      id: "r1", levelId: "l0", name: "Stue", roomType: "living",
      polygon: { vertices: [{x:0,y:0},{x:1,y:0},{x:1,y:1}] },
      netAreaM2: 1, minAreaM2: null, targetAreaM2: null,
      floorFinishAssemblyId: null, ceilingFinishAssemblyId: null,
      wallFinishAssemblyByWallId: {}, ventilationNeed: "natural",
      wetRoomZone: false, daylightRelevant: true,
      source: { source: "manual", confidence: "medium", fetchedAt: null, requiresReview: false },
    };
    const parsed = RoomZoneSchema.parse(base);
    expect(parsed.ceilingHeightM).toBeNull();
    expect(parsed.floorOffsetM).toBeNull();
  });
});
```

- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** — tilføj til `OpeningSchema`: `operable: z.boolean().default(false),`. Tilføj til `RoomZoneSchema`: `ceilingHeightM: z.number().positive().nullable().default(null),` og `floorOffsetM: z.number().nullable().default(null),`. (Typer udledes automatisk i `floor-plan.types.ts`.)
- [ ] **Step 4: Kør og bekræft PASS.** Kør `bun test src/domain/floor-plan` for at sikre intet andet brækker.
- [ ] **Step 5: Commit**

```bash
git add src/domain/floor-plan/floor-plan.schemas.ts src/domain/floor-plan/floor-plan.schemas.test.ts
git commit -m "feat(floor-plan): additive felter for operable vinduer og rum-kote/lofthøjde"
```

### Task F2: Render annotations i render-modellen

**Depends on:** F1
**Parallel-safe med:** —
**Files:**
- Modify: `src/lib/floor-plan/floor-plan-render-model.ts` (tilføj `annotations`-felt til modellen)
- Test: `src/lib/floor-plan/floor-plan-render-model.test.ts`

- [ ] **Step 1: Skriv test** — et dokument hvor et rum har `ceilingHeightM: 2.5` og `floorOffsetM: 0.4`, og et vindue har `operable: true`, producerer render-annotationer: en lofthøjde-callout (`"Lofthøjde ca. 2,5"` eller lignende), en niveau-callout (`"Gulvniveau +40 cm"`), og en `"Opluk. felt"`-markering. Assert på en ny `model.annotations`-liste med `{ kind, text, position }`.
- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** — i `buildRenderModel`, byg en `annotations: RenderAnnotation[]`-liste: pr. rum med `ceilingHeightM`/`floorOffsetM` → callouts ved rummets centroid; pr. opening med `operable === true` → `"Opluk. felt"` ved åbningens center. Inkludér også eksisterende `level.annotations` (fri `PlanAnnotation`). Formatér tal dansk (komma).
- [ ] **Step 4: Kør og bekræft PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/floor-plan/floor-plan-render-model.ts src/lib/floor-plan/floor-plan-render-model.test.ts
git commit -m "feat(floor-plan): annotations i render-model (kote/lofthøjde/opluk)"
```

### Task F3: Render annotations i begge renderere (canvas + PDF)

**Depends on:** F2
**Parallel-safe med:** —
**Files:**
- Modify: `src/lib/floor-plan/render-floor-plan-svg.ts`
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx`
- Test: `src/lib/floor-plan/render-floor-plan-svg.test.ts` (tilføj case)

- [ ] **Step 1: Skriv test** — `renderFloorPlanSvg(modelMedAnnotations)` indeholder `data-annotation`-tekstelementer med callout-teksten.
- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** — render `model.annotations` som `<text data-annotation>` i begge renderere ved `annotation.position`.
- [ ] **Step 4: Kør og bekræft PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/floor-plan/render-floor-plan-svg.ts src/components/floor-plan/FloorPlanCanvas.tsx src/lib/floor-plan/render-floor-plan-svg.test.ts
git commit -m "feat(floor-plan): render annotations-lag i canvas og PDF"
```

### Task F4: Installations-/hvidevarelabels på inventar

**Depends on:** F2
**Parallel-safe med:** F3
**Files:**
- Modify: `src/lib/floor-plan/floor-plan-render-model.ts` (label pr. fixture/furniture ud fra kind)
- Test: `src/lib/floor-plan/floor-plan-render-model.test.ts`

- [ ] **Step 1: Skriv test** — en fixture med `fixtureKind: "appliance"` giver en render-label (fx "Hvidevarer"), og et kitchen_unit giver "Kogeplade"/"Køkken". Assert at `model.annotations` (eller `RenderFixture.label`) bærer teksten.
- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** — et deterministisk kind→label-map (dansk), brugt i `buildRenderModel` til at udsende labels for fixtures/furniture. Ingen fri tekst fra UI; labels udledes af domænedata.
- [ ] **Step 4: Kør og bekræft PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(floor-plan): installations-/hvidevarelabels fra inventar-kind"
```

### Task F5: Fri-annotation-værktøj (placér note/label)

**Depends on:** F3
**Parallel-safe med:** F4
**Files:**
- Modify: `src/domain/floor-plan/command.schemas.ts` (`add_annotation`)
- Modify: `src/domain/floor-plan/apply-command.ts` (`applyAddAnnotation`)
- Modify: `src/components/floor-plan/FloorPlanCanvas.tsx` + `FloorPlanToolbar.tsx` (annotations-værktøj)
- Test: `src/domain/floor-plan/apply-command.add-annotation.test.ts`

- [ ] **Step 1: Skriv test** — `applyCommand(doc, { type: "add_annotation", levelId, kind: "note", text: "Brandadskillelse", position: {x:2,y:2} })` tilføjer en `PlanAnnotation` til `level.annotations`.
- [ ] **Step 2: Kør og bekræft FAIL.**
- [ ] **Step 3: Implementér** — `add_annotation`-kommando (felter matcher `PlanAnnotationSchema` minus `id`), `applyAddAnnotation` genererer id og pusher. Tilføj et toolbar-værktøj + canvas-klik der opretter en note og åbner et tekst-input.
- [ ] **Step 4: Kør og bekræft PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/domain/floor-plan/command.schemas.ts src/domain/floor-plan/apply-command.ts src/domain/floor-plan/apply-command.add-annotation.test.ts src/components/floor-plan/FloorPlanCanvas.tsx src/components/floor-plan/FloorPlanToolbar.tsx
git commit -m "feat(floor-plan): fri-annotation-værktøj"
```

---

## Sluttjek (kør efter alle opgaver)

- [ ] `bunx tsc --noEmit` — grøn
- [ ] `bun test` — grøn
- [ ] `bunx eslint .` — grøn
- [ ] `bun run build` — grøn
- [ ] Manuel/Playwright-journey: generér plan → tegn væg → placér dør → annotér rum → se mål → eksportér PDF, og bekræft at editor og PDF ser ens ud.
- [ ] Ingen `apply-command.ts`-kommando refereret i UI uden at være i `FloorPlanCommandSchema`.
- [ ] Ingen nye direkte Supabase/AI-kald i UI; ingen nye importcyklusser; ingen `any`.

---

## Afhængigheds- og parallel-oversigt (til fordeling på sessioner)

| Opgave | Depends on | Kan starte straks |
|---|---|---|
| A1 | — | ✅ |
| A2 | A1 | efter A1 |
| A3 | A1 | efter A1 |
| A4 | A1 | efter A1 |
| A5 | — | ✅ |
| B1 | — | ✅ |
| B2 | B1 | efter B1 |
| B3 | B1 | efter B1 |
| B4 | — | ✅ (domæne-del) |
| B5 | — | ✅ |
| B6 | A3, B1 | efter A3+B1 |
| C1 | — | ✅ |
| C2 | C1 | efter C1 |
| C3 | — | ✅ |
| C4 | B2 | efter B2 |
| C5 | — | ✅ |
| D1 | — | ✅ |
| E1 | — | ✅ |
| E2 | A1-A5 | sidst |
| F1 | — | ✅ |
| F2 | F1 | efter F1 |
| F3 | F2 | efter F2 |
| F4 | F2 | efter F2 |
| F5 | F3 | efter F3 |

**Straks-startbare i parallel (ingen fil-overlap):** A1, A5, B1, B4(domæne), B5, C1, C3, C5, D1, E1, F1.
