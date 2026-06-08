# Beliggenhedsplan UX Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Beliggenhedsplan (`projekt.teknik.tsx`) to match ArchAI's dark design system, add spatial map preview, actionable errors, navigation bridges from Cockpit and Plantegning, pre-filled form data, and improved download UX — resolving all seven findings from the 2026-06-06 design critique.

**Architecture:** All changes are pure UI-adapter changes. No domain logic, compliance rules, or server functions are modified. `MatrikelMap` is reused directly from the cockpit. `NaesteStepSection` and `VerificationPanel` gain optional navigation links via new props/data.

**Tech Stack:** React 18, TanStack Router, Tailwind CSS, Lucide icons, OpenLayers (via MatrikelMap)

---

## File map

| File                                                    | Action  | Responsibility after change                                                                            |
| ------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `src/routes/projekt.teknik.tsx`                         | Rewrite | Full TeknikPage — dark shell, two-column layout, map preview, actionable errors, pre-fill, download UX |
| `src/components/cockpit/sections/NaesteStepSection.tsx` | Modify  | Add Beliggenhedsplan as navigation step with a real link                                               |
| `src/components/floor-plan/VerificationPanel.tsx`       | Modify  | Accept optional `beliggenhedsplanHref` prop, show next-step link after export                          |
| `src/components/floor-plan/FloorPlanEditor.tsx`         | Modify  | Compute and pass `beliggenhedsplanHref` down to VerificationPanel                                      |

---

## Task 1: Dark shell + design tokens

**Finding addressed:** Finding 1 (🔴 Critical — visual design language inconsistency)

**Files:**

- Modify: `src/routes/projekt.teknik.tsx`

The current page uses `bg-stone-50`, white cards, and `bg-stone-900` buttons — completely different from the rest of the app. This task rewrites the visual shell while keeping all existing logic intact.

- [ ] **Step 1: Replace outer container and add dark header**

Open `src/routes/projekt.teknik.tsx`. Replace the entire `return (...)` block's outer structure:

```tsx
// OLD outer wrapper:
return (
  <div className="min-h-screen bg-stone-50 p-6">
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to={backTo} className="text-sm text-stone-500 hover:text-stone-700 mb-1 block">
            ← Tilbage til cockpit
          </Link>
          <h1 className="text-2xl font-semibold text-stone-900">Beliggenhedsplan</h1>
          <p className="text-stone-500 text-sm mt-1">
            Myndighedstegning til byggetilladelse — genereret fra matrikeldata og bygningsfodprint
          </p>
        </div>
      </div>

// NEW: full-screen dark layout with a header bar that matches CockpitHeader style
return (
  <div className="flex h-screen flex-col bg-background text-foreground">
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-6">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          to={backTo}
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Cockpit
        </Link>
        <span className="text-border/40">|</span>
        <span className="font-mono text-[11px] tracking-[0.1em] text-foreground">
          BELIGGENHEDSPLAN
        </span>
        <span className="text-xs text-muted-foreground hidden sm:block">
          — myndighedstegning til byggetilladelse
        </span>
      </div>
    </header>
    <main className="flex-1 overflow-y-auto p-8 space-y-6">
```

Close the new wrappers at the bottom:

```tsx
    </main>
  </div>
);
```

- [ ] **Step 2: Update card containers to dark style**

Replace the white tegningsdata card:

```tsx
// OLD:
<div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
  <h2 className="text-sm font-semibold text-stone-700">Tegningsdata</h2>

// NEW:
<div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-5 space-y-4">
  <h2 className="text-sm font-medium text-foreground">Tegningsdata</h2>
```

- [ ] **Step 3: Update all input fields to dark style**

Replace every `className` on `<input>` elements inside the tegningsdata card and dimensions card:

```tsx
// OLD:
className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm
           focus:outline-none focus:ring-2 focus:ring-stone-300"

// NEW (use replace_all across all inputs in the file):
className="w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm
           text-foreground placeholder:text-muted-foreground/50
           focus:outline-none focus:ring-1 focus:ring-border"
```

Also replace `border-blue-200` input variant (dimensions card) with:

```tsx
className="w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm
           text-foreground placeholder:text-muted-foreground/50
           focus:outline-none focus:ring-1 focus:ring-border"
```

- [ ] **Step 4: Update all label text tokens**

Replace:

- `text-stone-600` → `text-muted-foreground`
- `text-stone-700` → `text-foreground`
- `text-stone-500` → `text-muted-foreground`
- `text-blue-700` → `text-muted-foreground`

- [ ] **Step 5: Update generate button to dark mono style**

```tsx
// OLD:
className="px-5 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium
           hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed
           transition-colors"

// NEW:
className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111]
           px-4 py-2 font-mono text-[11px] tracking-[0.1em] text-foreground
           hover:bg-[#1a1a1a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
```

Also update the inline "Tegning genereret" success text:

```tsx
// OLD: className="text-sm text-green-700 font-medium"
// NEW: className="font-mono text-[11px] text-emerald-400"
```

- [ ] **Step 6: Update alert cards to use dark-compatible colors**

For the "footprint fra designværktøjet" status, replace:

```tsx
// OLD border-green-200 bg-green-50 p-3:
<div className="rounded-lg border border-green-200 bg-green-50 p-3">
  <p className="text-sm text-green-800">

// NEW:
<div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3">
  <p className="text-sm text-emerald-300">
```

- [ ] **Step 7: Verify TypeScript and build**

```bash
bunx tsc --noEmit
bun run build
```

Expected: both pass with no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/routes/projekt.teknik.tsx
git commit -m "style(beliggenhedsplan): apply dark design system tokens and app shell"
```

---

## Task 2: Two-column layout with MatrikelMap preview

**Findings addressed:** Finding 3 (🔴 Critical — missing spatial visualization), Finding 4 (🟡 Moderate — form vs workflow pattern)

**Files:**

- Modify: `src/routes/projekt.teknik.tsx`

This restructures the page from a single scrolling column to a two-column split: map on the left, input panel on the right — matching the spatial workflow of Maskinrummet and Plantegning.

- [ ] **Step 1: Add MatrikelMap import**

At the top of `src/routes/projekt.teknik.tsx`, add:

```tsx
import { MatrikelMap } from "@/components/cockpit/MatrikelMap";
import type { GeoJsonPolygon25832 } from "@/domain/drawing/beliggenhedsplan.types";
```

- [ ] **Step 2: Read bbrData from project-store**

`bbrData` is already imported via `useProject`. Verify the destructure includes it:

```tsx
const bbrData = useProject((s) => s.bbrData);
```

This gives us `RuleEngineBbrData | null` — the exact type that `MatrikelMap` expects for its `bbr` prop.

- [ ] **Step 3: Compute the footprint for map preview**

After the existing state declarations, add:

```tsx
// Convert designPlacement footprint to 25832-typed polygon for MatrikelMap.
// designPlacement.footprintGeojson uses 25832 coordinates without the crs tag.
const footprintForMap: GeoJsonPolygon25832 | null = designPlacement?.footprintGeojson
  ? { ...designPlacement.footprintGeojson, crs: "EPSG:25832" as const }
  : null;
```

- [ ] **Step 4: Restructure main content to two-column layout**

Replace the current `<main className="flex-1 overflow-y-auto p-8 space-y-6">` section with a two-column flex split. The new `<main>` becomes a flex row:

```tsx
<main className="flex flex-1 overflow-hidden">
  {/* Left: map fills remaining space */}
  <div className="flex-1 overflow-hidden">
    <MatrikelMap
      bbr={bbrData}
      metrics={null}
      naboer={null}
      jordstykkeLokalId={matrikelId}
      footprintGeojson={footprintForMap}
    />
  </div>

  {/* Right: input panel 360px wide */}
  <aside className="w-[360px] shrink-0 border-l border-border/40 flex flex-col overflow-hidden">
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* All existing alert/input/result content moves here */}
    </div>

    {/* Sticky generate button at bottom of panel */}
    <div className="shrink-0 border-t border-border/40 p-4">
      <button
        onClick={handleGenerate}
        disabled={!canGenerate || loading || (!hasFootprint && !canGenerateWithDimensions)}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border
                       border-border/60 bg-[#111] px-4 py-2.5 font-mono text-[11px]
                       tracking-[0.1em] text-foreground hover:bg-[#1a1a1a]
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Genererer…" : "Generer beliggenhedsplan"}
      </button>
      {result && !loading && (
        <p className="mt-2 text-center font-mono text-[10px] text-emerald-400">Tegning genereret</p>
      )}
    </div>
  </aside>
</main>
```

Move all existing content blocks (alerts, dimension inputs, footprint status, tegningsdata card, error, result) into `<div className="flex-1 overflow-y-auto p-5 space-y-5">`. Remove the old standalone generate button (it is now in the sticky footer).

- [ ] **Step 5: Verify TypeScript**

```bash
bunx tsc --noEmit
```

If TypeScript complains about `GeoJsonPolygon25832` type compatibility, confirm the spread `{ ...designPlacement.footprintGeojson, crs: "EPSG:25832" as const }` resolves it. It should: both types share `type: "Polygon"` and `coordinates: [number, number][][]`; we add the required `crs` discriminant.

- [ ] **Step 6: Verify build**

```bash
bun run build
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/routes/projekt.teknik.tsx
git commit -m "feat(beliggenhedsplan): two-column layout with MatrikelMap parcel preview"
```

---

## Task 3: Actionable error messages

**Finding addressed:** Finding 5 (🟡 Moderate — technical, handlingsløse fejlbeskeder)

**Files:**

- Modify: `src/routes/projekt.teknik.tsx`

Replace the amber bullet-list with structured dark cards that each carry a direct navigation link.

- [ ] **Step 1: Replace the `!canGenerate` alert block**

Find and replace the entire `{!canGenerate && ( ... )}` block:

```tsx
// OLD:
{
  !canGenerate && (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-800 mb-2">Mangler data for at generere:</p>
      <ul className="list-disc list-inside space-y-1">
        {missingFields.map((f) => (
          <li key={f} className="text-sm text-amber-700">
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

// NEW:
{
  !canGenerate && (
    <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-4 space-y-2">
      <p className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase mb-3">
        Mangler data
      </p>

      {!currentProjectId && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2">
          <p className="text-sm text-amber-300">Projekt ikke gemt</p>
          <Link
            to="/projekt/start"
            className="shrink-0 font-mono text-[10px] text-amber-400 hover:text-amber-200 transition-colors"
          >
            Start projekt →
          </Link>
        </div>
      )}

      {!address?.adresseid && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2">
          <p className="text-sm text-amber-300">Adresse ikke valgt</p>
          <Link
            to="/projekt/adresse"
            className="shrink-0 font-mono text-[10px] text-amber-400 hover:text-amber-200 transition-colors"
          >
            Vælg adresse →
          </Link>
        </div>
      )}

      {!address?.kommunekode && !!address?.adresseid && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2">
          <p className="text-sm text-amber-300">Kommunekode mangler</p>
          <Link
            to={backTo}
            className="shrink-0 font-mono text-[10px] text-amber-400 hover:text-amber-200 transition-colors"
          >
            Åbn cockpit →
          </Link>
        </div>
      )}

      {!matrikelId && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2">
          <div>
            <p className="text-sm text-amber-300">Matrikeldata ikke hentet</p>
            <p className="text-xs text-amber-400/70 mt-0.5">Kør adresseanalysen i cockpit</p>
          </div>
          <Link
            to={backTo}
            className="shrink-0 font-mono text-[10px] text-amber-400 hover:text-amber-200 transition-colors"
          >
            Åbn cockpit →
          </Link>
        </div>
      )}
    </div>
  );
}
```

Remove the `missingFields` array — it's no longer needed:

```tsx
// Delete these lines:
const missingFields: string[] = [];
if (!currentProjectId) missingFields.push("Projekt ikke gemt");
if (!address?.adresseid) missingFields.push("Adresse ikke valgt");
if (!address?.kommunekode) missingFields.push("Kommunekode mangler");
if (!matrikelId) missingFields.push("Matrikeldata ikke hentet (kør adresseanalyse)");
```

- [ ] **Step 2: Update readiness status cards to dark style**

Replace all `READINESS_COLORS` values:

```tsx
// OLD:
const READINESS_COLORS: Record<DrawingReadinessStatus, string> = {
  AUTO_DRAFT: "bg-yellow-50 border-yellow-200 text-yellow-800",
  AUTO_REVIEW: "bg-green-50 border-green-200 text-green-800",
  SURVEY_REQUIRED: "bg-orange-50 border-orange-200 text-orange-800",
  BLOCKED_MISSING_CORE_DATA: "bg-red-50 border-red-200 text-red-800",
};

// NEW:
const READINESS_COLORS: Record<DrawingReadinessStatus, string> = {
  AUTO_DRAFT: "border-amber-500/20 bg-amber-950/20 text-amber-300",
  AUTO_REVIEW: "border-emerald-500/20 bg-emerald-950/20 text-emerald-300",
  SURVEY_REQUIRED: "border-orange-500/20 bg-orange-950/20 text-orange-300",
  BLOCKED_MISSING_CORE_DATA: "border-red-500/20 bg-red-950/20 text-red-300",
};
```

- [ ] **Step 3: Update error display**

```tsx
// OLD:
{
  error && (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">Fejl ved generering</p>
      <p className="text-sm text-red-700 mt-1 font-mono">{error}</p>
    </div>
  );
}

// NEW:
{
  error && (
    <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-4">
      <p className="text-sm font-medium text-red-300">Fejl ved generering</p>
      <p className="text-sm text-red-400/80 mt-1 font-mono">{error}</p>
    </div>
  );
}
```

- [ ] **Step 4: TypeScript + build check**

```bash
bunx tsc --noEmit && bun run build
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/projekt.teknik.tsx
git commit -m "ux(beliggenhedsplan): actionable error cards with navigation links"
```

---

## Task 4: Navigation bridges from Cockpit and Plantegning

**Finding addressed:** Finding 2 (🔴 Critical — ingen navigationsvej ind i Beliggenhedsplan)

**Files:**

- Modify: `src/components/cockpit/sections/NaesteStepSection.tsx`
- Modify: `src/components/floor-plan/VerificationPanel.tsx`
- Modify: `src/components/floor-plan/FloorPlanEditor.tsx`

### Subtask 4a — NaesteStepSection

- [ ] **Step 1: Add Link import and Beliggenhedsplan step**

In `src/components/cockpit/sections/NaesteStepSection.tsx`, add the `Link` import:

```tsx
import { Link } from "@tanstack/react-router";
```

Replace the static `NAESTE_TRIN` constant with a typed array that includes an optional `href`:

```tsx
const NAESTE_TRIN: Array<{
  nummer: string;
  titel: string;
  beskrivelse: string;
  href?: string;
  kommerSnart: boolean;
}> = [
  {
    nummer: "01",
    titel: "Byg på plantegning",
    beskrivelse: "Åbn plantegningsværktøjet og definer din bygnings præcise placering og form.",
    kommerSnart: false,
  },
  {
    nummer: "02",
    titel: "Indhent tilbud",
    beskrivelse: "Brug budgetestimatet som udgangspunkt for at indhente tilbud fra entreprenører.",
    kommerSnart: false,
  },
  {
    nummer: "03",
    titel: "Generer beliggenhedsplan",
    beskrivelse: "Lav myndighedstegningen til byggetilladelsesansøgningen direkte fra dit design.",
    href: "/projekt/teknik",
    kommerSnart: false,
  },
  {
    nummer: "04",
    titel: "Ansøg om byggetilladelse",
    beskrivelse:
      "Forbered ansøgningsmaterialet til kommunen. Vi hjælper dig med at samle dokumentation.",
    kommerSnart: true,
  },
];
```

- [ ] **Step 2: Render the step title as a link when href is set**

In the render loop, replace the static `<p className="text-sm font-medium text-foreground">` title with a conditional link:

```tsx
<div className="flex items-center gap-2">
  {trin.href && !trin.kommerSnart ? (
    <Link
      to={trin.href}
      className="text-sm font-medium text-foreground hover:text-[#c8ff00] transition-colors"
    >
      {trin.titel} →
    </Link>
  ) : (
    <p className="text-sm font-medium text-foreground">{trin.titel}</p>
  )}
  {trin.kommerSnart && (
    <span className="font-mono text-[10px] text-muted-foreground/50 border border-border/40 rounded px-1">
      KOMMER SNART
    </span>
  )}
</div>
```

- [ ] **Step 3: Verify TypeScript**

```bash
bunx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/cockpit/sections/NaesteStepSection.tsx
git commit -m "feat(cockpit): add Beliggenhedsplan navigation link in NaesteStepSection"
```

### Subtask 4b — VerificationPanel + FloorPlanEditor

- [ ] **Step 5: Add optional prop to VerificationPanel**

In `src/components/floor-plan/VerificationPanel.tsx`, add the prop to the type and import `Link` and the `Map` icon:

```tsx
import { Link } from "@tanstack/react-router";
import { Download, FileCheck2, FileDown, Map, RefreshCw } from "lucide-react";

type VerificationPanelProps = {
  busy: boolean;
  localFindings: VerificationFinding[];
  liveFindings: LiveFinding[];
  formalVerification: FloorPlanVerificationResult | null;
  exportResult: ExportFloorPlanResult | null;
  onVerify: () => Promise<void>;
  onExport: () => Promise<void>;
  beliggenhedsplanHref?: string; // ← new optional prop
};
```

Destructure it in the function signature:

```tsx
export function VerificationPanel({
  busy,
  localFindings,
  liveFindings,
  formalVerification,
  exportResult,
  onVerify,
  onExport,
  beliggenhedsplanHref,   // ← new
}: VerificationPanelProps) {
```

- [ ] **Step 6: Render the next-step link after exportResult**

After the closing `}` of `{exportResult && ( ... )}` block, add:

```tsx
{
  beliggenhedsplanHref && exportResult && (
    <div className="mt-3 rounded-md border border-border/40 bg-surface-elevated p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Næste trin
      </p>
      <Link
        to={beliggenhedsplanHref}
        className="inline-flex items-center gap-1.5 font-mono text-[11px]
                 tracking-[0.1em] text-foreground hover:text-[#c8ff00] transition-colors"
      >
        <Map size={12} />
        Generer beliggenhedsplan →
      </Link>
    </div>
  );
}
```

- [ ] **Step 7: Pass the prop from FloorPlanEditor**

In `src/components/floor-plan/FloorPlanEditor.tsx`, compute the href and pass it to `VerificationPanel`:

```tsx
// After existing const declarations in FloorPlanEditor function body:
const beliggenhedsplanHref = projectId ? "/projekt/teknik" : undefined;
```

Then in the JSX where `<VerificationPanel .../>` is rendered (around line 316):

```tsx
<VerificationPanel
  busy={busy}
  localFindings={editor.localFindings}
  liveFindings={editor.liveFindings}
  formalVerification={editor.formalVerification}
  exportResult={editor.exportResult}
  onVerify={editor.verify}
  onExport={editor.exportPlan}
  beliggenhedsplanHref={beliggenhedsplanHref} // ← new
/>
```

- [ ] **Step 8: TypeScript + build check**

```bash
bunx tsc --noEmit && bun run build
```

Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/floor-plan/VerificationPanel.tsx src/components/floor-plan/FloorPlanEditor.tsx
git commit -m "feat(plantegning): add Beliggenhedsplan next-step link in VerificationPanel"
```

---

## Task 5: Pre-fill heightM and improved download UX

**Findings addressed:** Finding 6 (🟢 Minor — pre-fill Tegningsdata), Finding 7 (🟢 Minor — download UX)

**Files:**

- Modify: `src/routes/projekt.teknik.tsx`

### Subtask 5a — Pre-fill heightM from designPlacement

- [ ] **Step 1: Change heightM initial state to use designPlacement**

`DesignPlacement.heightM` holds the building height set in the design tool. Pre-fill it:

```tsx
// OLD:
const [heightM, setHeightM] = useState<string>("");

// NEW:
const [heightM, setHeightM] = useState<string>(() =>
  designPlacement?.heightM != null ? String(designPlacement.heightM) : "",
);
```

Note: `sokkelKoteM` has no equivalent in `DesignPlacement` — leave it as `useState<string>("")`.

### Subtask 5b — Improved download UX

- [ ] **Step 2: Add Download icon import**

Add `Download` to the lucide import at the top of the file:

```tsx
// Ensure the import includes Download, e.g.:
import { Download } from "lucide-react";
```

- [ ] **Step 3: Replace download buttons and result card**

Find the `{result && ( ... )}` block. Replace the download buttons and add guidance:

```tsx
{
  result && (
    <div className="space-y-4">
      {/* Readiness status */}
      <div className={`rounded-lg border p-3 ${READINESS_COLORS[result.readinessStatus]}`}>
        <p className="text-sm font-semibold">Status: {READINESS_LABELS[result.readinessStatus]}</p>
      </div>

      {/* Downloads */}
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] p-4 space-y-3">
        <p className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
          Download
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() =>
              downloadSvg(result.svgContent, `beliggenhedsplan-${result.exportId.slice(0, 8)}.svg`)
            }
            className="inline-flex items-center gap-2 rounded-md border border-border/60
                     bg-[#111] px-3 py-2 font-mono text-[11px] text-foreground
                     hover:bg-[#1a1a1a] transition-colors"
          >
            <Download size={12} />
            SVG
            <span className="text-muted-foreground text-[10px]">vektorgrafik</span>
          </button>

          {result.pdfUrl !== null && (
            <a
              href={result.pdfUrl}
              download={`beliggenhedsplan-${result.exportId.slice(0, 8)}.pdf`}
              className="inline-flex items-center gap-2 rounded-md border border-border/60
                       bg-[#111] px-3 py-2 font-mono text-[11px] text-foreground
                       hover:bg-[#1a1a1a] transition-colors"
            >
              <Download size={12} />
              PDF
              <span className="text-muted-foreground text-[10px]">til print</span>
            </a>
          )}
        </div>

        <p className="text-xs text-muted-foreground border-t border-border/20 pt-3">
          Upload filen til kommunens byggesagsportal (Byg og Miljø) som bilag til byggeansøgningen.
        </p>
      </div>

      {/* SVG preview */}
      <div className="rounded-xl border border-border/40 bg-[#0d0d0d] overflow-auto shadow-sm">
        <div className="p-3 border-b border-border/20">
          <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
            Preview — beliggenhedsplan
          </span>
        </div>
        <div className="p-4" dangerouslySetInnerHTML={{ __html: result.svgContent }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Final verification**

Run the full Definition of Done check:

```bash
bunx tsc --noEmit
bun test src
bunx eslint src/routes/projekt.teknik.tsx src/components/cockpit/sections/NaesteStepSection.tsx src/components/floor-plan/VerificationPanel.tsx src/components/floor-plan/FloorPlanEditor.tsx
bun run build
```

Expected: all pass. If ESLint warns about unused `missingFields` from Task 3 (should already be removed), verify the deletion.

- [ ] **Step 5: Final commit**

```bash
git add src/routes/projekt.teknik.tsx
git commit -m "ux(beliggenhedsplan): pre-fill height, improved download UX with guidance"
```

---

## Self-review

### Spec coverage check

| Finding                                | Task    | Covered                                               |
| -------------------------------------- | ------- | ----------------------------------------------------- |
| F1: Visual design language (🔴)        | Task 1  | ✅ Dark theme, consistent tokens, app header          |
| F2: Navigation bridges (🔴)            | Task 4  | ✅ NaesteStepSection + VerificationPanel entry points |
| F3: Missing spatial visualization (🔴) | Task 2  | ✅ MatrikelMap with footprint overlay                 |
| F4: Form vs workflow layout (🟡)       | Task 2  | ✅ Two-column layout, sticky generate button          |
| F5: Actionable error messages (🟡)     | Task 3  | ✅ Per-error cards with navigation links              |
| F6: Pre-fill Tegningsdata (🟢)         | Task 5a | ✅ heightM pre-filled from designPlacement            |
| F7: Download UX (🟢)                   | Task 5b | ✅ Format labels + "hvad nu?" guidance                |

### Placeholder scan

No TBD, TODO, or "similar to" patterns detected.

### Type consistency

- `GeoJsonPolygon25832` — used in Task 2 for footprint spread. Type requires `crs: Crs25832`. Handled by `{ ...footprintGeojson, crs: "EPSG:25832" as const }`.
- `beliggenhedsplanHref?: string` — defined in Task 4 step 5, passed in step 7. Consistent.
- `NAESTE_TRIN` typed array — `href?: string` added in Task 4 step 1, consumed in step 2. Consistent.
- All Tailwind class strings are consistent with `bg-[#0d0d0d]`, `border-border/40`, `text-muted-foreground` tokens used elsewhere in the cockpit.

### Protected files

None of the four modified files appear in the protected files list in `CLAUDE.md`. No special review flag needed.
