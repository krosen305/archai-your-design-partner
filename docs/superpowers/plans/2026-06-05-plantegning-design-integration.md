# Plantegning Design Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Plantegning editor visually and contextually in sync with Maskinrummet — dark theme tokens, accent-color active states, human-readable element labels, a compliance strip, and pre-populated form data from byggeoenske.

**Architecture:** The root app theme is already dark (`--background: #0a0a0a`, `--accent: #e8ff4d`). The `.floor-plan-theme` CSS class currently overrides these with light values so Shadcn primitives work. We fix this by removing the light override and letting all floor-plan components inherit the dark root theme. Hardcoded `stone-*` / `bg-white` classes are replaced with CSS-var utilities (`bg-surface`, `border-border/40`, `text-muted-foreground`, `bg-accent text-accent-foreground`). A new `FloorPlanComplianceStrip` component surfaces compliance context from the project store while the user draws.

**Tech Stack:** React, Tailwind CSS v4, Shadcn UI, `useProject()` from `@/lib/project-store`, lucide-react icons.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/styles.css` | Modify | Remove `.floor-plan-theme` light override block |
| `src/components/floor-plan/FloorPlanEditor.tsx` | Modify | Dark theme classes, integrate ComplianceStrip, pre-populate form |
| `src/components/floor-plan/FloorPlanToolbar.tsx` | Modify | Dark theme + `bg-accent` active state + focus-visible ring |
| `src/components/floor-plan/FloorPlanInspector.tsx` | Modify | Dark theme + mono labels + human-readable element names |
| `src/components/floor-plan/VerificationPanel.tsx` | Modify | Dark theme tokens (keep semantic amber/red/emerald finding colors) |
| `src/components/floor-plan/FloorPlanComplianceStrip.tsx` | Create | Inline compliance chip strip reading from project-store |

---

## Task 1: Remove the light-theme CSS override

**Files:**
- Modify: `src/styles.css` (lines 81–108)

- [ ] **Step 1: Delete the `.floor-plan-theme` block**

Open `src/styles.css`. Remove the entire comment + rule block from line 81 to 108:

```css
/* DELETE everything from here … */
/*
 * Light-themed scope for the floor-plan editor. The editor is a deliberate
 * …
 */
.floor-plan-theme {
  --background: #ffffff;
  …
}
/* … to here (inclusive) */
```

The file should jump straight from the `@layer base` block at line 110.

- [ ] **Step 2: Verify no other references to `.floor-plan-theme`**

Run:
```bash
bunx grep -r "floor-plan-theme" src/
```
Expected output: one hit in `FloorPlanEditor.tsx` (the class application — will be removed in Task 2). Zero hits in `styles.css`.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style(floor-plan): remove light-theme CSS override scope"
```

---

## Task 2: FloorPlanEditor — dark theme classes + fix structure

**Files:**
- Modify: `src/components/floor-plan/FloorPlanEditor.tsx`

All `stone-*`, `bg-white`, `shadow-sm` classes are replaced. Every change is a direct find-and-replace on class strings.

- [ ] **Step 1: Root wrapper — remove floor-plan-theme, switch to dark bg**

Find:
```tsx
<div className="floor-plan-theme min-h-screen bg-stone-100 text-stone-950">
```
Replace with:
```tsx
<div className="min-h-screen bg-background text-foreground">
```

- [ ] **Step 2: Header — lock to 48px, dark surface, match CockpitHeader**

Find:
```tsx
<header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-5 py-3">
```
Replace with:
```tsx
<header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/40 bg-surface px-5">
```

- [ ] **Step 3: Address subtitle — muted foreground**

Find:
```tsx
<p className="text-sm text-stone-500">{addressLabel ?? "Projekt uden adresse"}</p>
```
Replace with:
```tsx
<p className="text-xs text-muted-foreground">{addressLabel ?? "Projekt uden adresse"}</p>
```

- [ ] **Step 4: No-project warning — keep amber semantic color (already correct)**

No change needed here. The amber box is a correct semantic color for warnings.

- [ ] **Step 5: Opret-section container — dark surface card**

Find:
```tsx
<section className="grid gap-5 rounded-md border border-stone-200 bg-white p-5 shadow-sm lg:grid-cols-[320px_1fr]">
```
Replace with:
```tsx
<section className="grid gap-5 rounded-xl border border-border/40 bg-surface p-6 lg:grid-cols-[320px_1fr]">
```

- [ ] **Step 6: Opret-section heading and description**

Find:
```tsx
<h2 className="text-base font-semibold">Opret plantegning</h2>
<p className="mt-1 text-sm text-stone-500">
```
Replace with:
```tsx
<h2 className="text-base font-semibold text-foreground">Opret plantegning</h2>
<p className="mt-1 text-sm text-muted-foreground">
```

- [ ] **Step 7: All `<input>` and `<select>` inside the opret-form**

Find (all 5 occurrences — use replace_all):
```
border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900
```
Replace with:
```
border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60
```

- [ ] **Step 8: Level tabs bar — dark surface**

Find:
```tsx
<div className="flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-2">
```
Replace with:
```tsx
<div className="flex items-center gap-2 border-b border-border/40 bg-surface px-4 py-2">
```

- [ ] **Step 9: Active level tab — accent color**

Find:
```tsx
activeLevelId === level.id
  ? "bg-stone-900 text-white"
  : "text-stone-600 hover:bg-stone-100",
```
Replace with:
```tsx
activeLevelId === level.id
  ? "bg-accent text-accent-foreground"
  : "text-muted-foreground hover:bg-surface-elevated",
```

- [ ] **Step 10: Footer — dark surface**

Find:
```tsx
<footer className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-white px-5 py-2 text-xs text-stone-600">
```
Replace with:
```tsx
<footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-surface px-5 py-2 text-xs text-muted-foreground">
```

- [ ] **Step 11: Remove developer debug info from footer**

The footer currently shows `{editor.localFindings.length} live finding(s)` and a raw UUID hash. Replace the footer content:

Find:
```tsx
<div className="flex gap-4">
  <span>{editor.document.levels.length} etage(r)</span>
  <span>{totalNetArea.toFixed(1)} m² netto</span>
  <span>{editor.localFindings.length} live finding(s)</span>
</div>
<div className="font-mono" data-testid="floor-plan-version">
  {editor.floorPlanIterationId
    ? editor.floorPlanIterationId.slice(0, 8)
    : "ingen version"}
</div>
```
Replace with:
```tsx
<div className="flex gap-4">
  <span>{editor.document.levels.length} etage{editor.document.levels.length !== 1 ? "r" : ""}</span>
  <span>{totalNetArea.toFixed(1)} m² netto</span>
</div>
<div
  className="font-mono opacity-30"
  data-testid="floor-plan-version"
  title={editor.floorPlanIterationId ?? "ingen version"}
>
  v{editor.floorPlanIterationId ? editor.floorPlanIterationId.slice(0, 6) : "—"}
</div>
```

- [ ] **Step 12: TypeScript check**

```bash
bunx tsc --noEmit
```
Expected: no errors in `FloorPlanEditor.tsx`.

- [ ] **Step 13: Commit**

```bash
git add src/components/floor-plan/FloorPlanEditor.tsx
git commit -m "style(floor-plan): apply dark theme tokens to editor shell"
```

---

## Task 3: FloorPlanToolbar — accent active state + focus ring

**Files:**
- Modify: `src/components/floor-plan/FloorPlanToolbar.tsx`

- [ ] **Step 1: Sidebar container — dark surface**

Find:
```tsx
<aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-stone-200 bg-white px-2 py-3">
```
Replace with:
```tsx
<aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-border/40 bg-surface px-2 py-3">
```

- [ ] **Step 2: Dividers — dark border**

Find (replace_all):
```
className="my-1 h-px w-8 bg-stone-200"
```
Replace with:
```
className="my-1 h-px w-8 bg-border/40"
```

- [ ] **Step 3: ToolButton — active state to accent + focus ring**

Find:
```tsx
className={cn(
  "h-9 w-9 rounded-md border border-transparent text-stone-600",
  active && "border-stone-900 bg-stone-900 text-white hover:bg-stone-800",
)}
```
Replace with:
```tsx
className={cn(
  "h-9 w-9 rounded-md border border-transparent text-muted-foreground",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60",
  active && "border-accent bg-accent text-accent-foreground hover:brightness-95",
)}
```

- [ ] **Step 4: TypeScript check**

```bash
bunx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/floor-plan/FloorPlanToolbar.tsx
git commit -m "style(floor-plan): toolbar dark theme, accent active state, focus ring"
```

---

## Task 4: FloorPlanInspector — dark theme + mono labels + human-readable names

**Files:**
- Modify: `src/components/floor-plan/FloorPlanInspector.tsx`

- [ ] **Step 1: Aside container**

Find:
```tsx
<aside className="w-full border-b border-stone-200 bg-white p-4 lg:w-[340px] lg:border-b-0 lg:border-l">
```
Replace with:
```tsx
<aside className="w-full border-b border-border/40 bg-surface p-4 lg:w-[340px] lg:border-b-0 lg:border-l">
```

- [ ] **Step 2: Inspector heading + kind badge**

Find:
```tsx
<h2 className="text-sm font-semibold text-stone-950">Inspector</h2>
<p className="text-xs text-stone-500">{selected?.label ?? "Intet element valgt"}</p>
```
Replace with:
```tsx
<h2 className="text-sm font-semibold text-foreground">Inspector</h2>
<p className="text-xs text-muted-foreground">{selected?.label ?? "Intet element valgt"}</p>
```

Find:
```tsx
<span className="rounded bg-stone-100 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-stone-600">
```
Replace with:
```tsx
<span className="rounded bg-surface-elevated px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
```

- [ ] **Step 3: Empty state**

Find:
```tsx
<div className="rounded-md border border-dashed border-stone-200 p-4 text-sm text-stone-500">
```
Replace with:
```tsx
<div className="rounded-md border border-dashed border-border/40 p-4 text-sm text-muted-foreground">
```

- [ ] **Step 4: InfoRow — mono labels**

Find the `InfoRow` function at the bottom of the file:
```tsx
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-stone-100 py-2">
      <span className="text-xs text-stone-500">{label}</span>
      <span className="break-words text-right font-medium text-stone-900">{value}</span>
    </div>
  );
}
```
Replace with:
```tsx
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/30 py-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="break-words text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
```

- [ ] **Step 5: All input/select containers and labels in the inspector sub-components**

There are several `rounded-md border border-stone-200 p-3` containers with `text-xs font-medium text-stone-600` labels and `border-stone-300 focus:border-stone-900` inputs. Apply these replacements throughout the file:

Find (replace_all):
```
border-stone-200 p-3
```
Replace with:
```
border-border/40 p-3 bg-surface
```

Find (replace_all):
```
text-xs font-medium text-stone-600
```
Replace with:
```
font-mono text-[10px] uppercase tracking-wider text-muted-foreground
```

Find (replace_all):
```
border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900
```
Replace with:
```
border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60
```

- [ ] **Step 6: Human-readable labels in `resolveSelection()`**

Find the `resolveSelection` function at the bottom of the file:
```tsx
function resolveSelection(level: FloorLevel, selection: FloorPlanSelection | null) {
  if (!selection) return null;

  if (selection.kind === "wall") {
    const wall = level.walls.find((candidate) => candidate.id === selection.id);
    return wall ? { kind: "wall" as const, label: wall.id, wall } : null;
  }

  if (selection.kind === "opening") {
    const opening = level.openings.find((candidate) => candidate.id === selection.id);
    const hostWall = opening
      ? (level.walls.find((wall) => wall.id === opening.wallId) ?? null)
      : null;
    return opening ? { kind: "opening" as const, label: opening.id, opening, hostWall } : null;
  }

  if (selection.kind === "fixture") {
    const fixture = level.fixtures.find((candidate) => candidate.id === selection.id);
    return fixture ? { kind: "fixture" as const, label: fixture.id, fixture } : null;
  }

  const room = level.rooms.find((candidate) => candidate.id === selection.id);
  return room ? { kind: "room" as const, label: room.name, room } : null;
}
```
Replace with:
```tsx
function resolveSelection(level: FloorLevel, selection: FloorPlanSelection | null) {
  if (!selection) return null;

  if (selection.kind === "wall") {
    const wall = level.walls.find((candidate) => candidate.id === selection.id);
    if (!wall) return null;
    const index = level.walls.indexOf(wall) + 1;
    const roleLabel = wall.wallKind === "exterior" ? "Ydervæg" : "Skillevæg";
    return { kind: "wall" as const, label: `${roleLabel} ${index}`, wall };
  }

  if (selection.kind === "opening") {
    const opening = level.openings.find((candidate) => candidate.id === selection.id);
    const hostWall = opening
      ? (level.walls.find((wall) => wall.id === opening.wallId) ?? null)
      : null;
    if (!opening) return null;
    const kindLabel = opening.openingKind === "door" ? "Dør" : opening.openingKind === "window" ? "Vindue" : "Åbning";
    const index = level.openings.indexOf(opening) + 1;
    return { kind: "opening" as const, label: `${kindLabel} ${index}`, opening, hostWall };
  }

  if (selection.kind === "fixture") {
    const fixture = level.fixtures.find((candidate) => candidate.id === selection.id);
    if (!fixture) return null;
    const index = level.fixtures.indexOf(fixture) + 1;
    return { kind: "fixture" as const, label: `Inventar ${index} (${fixture.fixtureKind})`, fixture };
  }

  const room = level.rooms.find((candidate) => candidate.id === selection.id);
  return room ? { kind: "room" as const, label: room.name, room } : null;
}
```

- [ ] **Step 7: Danish kind badge labels**

The badge currently shows `selected?.kind` in English. Find:
```tsx
{selected?.kind && (
  <span className="rounded bg-surface-elevated px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
    {selected.kind}
  </span>
)}
```
Replace with:
```tsx
{selected?.kind && (
  <span className="rounded bg-surface-elevated px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
    {selected.kind === "wall" ? "Væg" : selected.kind === "opening" ? "Åbning" : selected.kind === "fixture" ? "Inventar" : "Rum"}
  </span>
)}
```

- [ ] **Step 8: Also fix `opening.wallId` display in OpeningInspector**

The inspector shows `<InfoRow label="Værtsvæg" value={opening.wallId} />` which shows a raw UUID. Find:
```tsx
<InfoRow label="Værtsvæg" value={opening.wallId} />
```
Replace with:
```tsx
<InfoRow label="Værtsvæg" value={hostWall ? `Væg ${level.walls.indexOf(hostWall) + 1}` : "Ukendt"} />
```

Wait — `level` is not in scope in `OpeningInspector`. Add it to props. Locate `OpeningInspector`:

```tsx
function OpeningInspector({
  opening,
  hostWall,
  document,
  onCommitCommand,
}: {
  opening: Opening;
  hostWall: Wall | null;
  document: FloorPlanDocument;
  onCommitCommand: FloorPlanInspectorProps["onCommitCommand"];
}) {
```
Replace with:
```tsx
function OpeningInspector({
  opening,
  hostWall,
  level,
  document,
  onCommitCommand,
}: {
  opening: Opening;
  hostWall: Wall | null;
  level: FloorLevel;
  document: FloorPlanDocument;
  onCommitCommand: FloorPlanInspectorProps["onCommitCommand"];
}) {
```

And update the call site in `FloorPlanInspector` (where `selected?.kind === "opening"` renders `<OpeningInspector>`):
```tsx
{selected?.kind === "opening" && (
  <OpeningInspector
    opening={selected.opening}
    hostWall={selected.hostWall}
    document={document}
    onCommitCommand={onCommitCommand}
  />
)}
```
Replace with:
```tsx
{selected?.kind === "opening" && (
  <OpeningInspector
    opening={selected.opening}
    hostWall={selected.hostWall}
    level={level}
    document={document}
    onCommitCommand={onCommitCommand}
  />
)}
```

Then inside `OpeningInspector`, update:
```tsx
<InfoRow label="Værtsvæg" value={opening.wallId} />
```
to:
```tsx
<InfoRow label="Værtsvæg" value={hostWall ? `Væg ${level.walls.indexOf(hostWall) + 1}` : "Ukendt"} />
```

- [ ] **Step 9: TypeScript check**

```bash
bunx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/floor-plan/FloorPlanInspector.tsx
git commit -m "style(floor-plan): inspector dark theme, mono labels, human-readable element names"
```

---

## Task 5: VerificationPanel — dark theme tokens

**Files:**
- Modify: `src/components/floor-plan/VerificationPanel.tsx`

Keep all semantic amber/red/emerald colors for finding cards — these are intentional status colors matching Maskinrummet's compliance language. Only replace the structural white/stone classes.

- [ ] **Step 1: Section container**

Find:
```tsx
<section className="border-t border-stone-200 bg-white p-4">
```
Replace with:
```tsx
<section className="border-t border-border/40 bg-surface p-4">
```

- [ ] **Step 2: Headings**

Find:
```tsx
<h2 className="text-sm font-semibold text-stone-950">Verifikation</h2>
<p className="text-xs text-stone-500">
```
Replace with:
```tsx
<h2 className="text-sm font-semibold text-foreground">Verifikation</h2>
<p className="text-xs text-muted-foreground">
```

- [ ] **Step 3: Metric tiles**

Find the `Metric` function:
```tsx
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
      <div className="text-stone-500">{label}</div>
      <div className="font-semibold text-stone-950">{value}</div>
    </div>
  );
}
```
Replace with:
```tsx
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-surface-elevated px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Export result section**

Find:
```tsx
<div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3">
  <p className="mb-2 text-xs font-semibold text-stone-700">
```
Replace with:
```tsx
<div className="mt-4 rounded-md border border-border/40 bg-surface-elevated p-3">
  <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
```

- [ ] **Step 5: TypeScript check**

```bash
bunx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/floor-plan/VerificationPanel.tsx
git commit -m "style(floor-plan): verification panel dark theme tokens"
```

---

## Task 6: FloorPlanComplianceStrip — compliance context while drawing

A horizontal chip strip shown between the level tabs and the drawing area. Reads from `useProject()` — no new server calls needed.

**Files:**
- Create: `src/components/floor-plan/FloorPlanComplianceStrip.tsx`
- Modify: `src/components/floor-plan/FloorPlanEditor.tsx` (integrate the strip)

- [ ] **Step 1: Create the component**

```tsx
// src/components/floor-plan/FloorPlanComplianceStrip.tsx
import { cn } from "@/lib/utils";
import { useProject } from "@/lib/project-store";

type Props = {
  totalNetAreaM2: number;
  targetAreaM2: number;
};

export function FloorPlanComplianceStrip({ totalNetAreaM2, targetAreaM2 }: Props) {
  const { hard_stop, complianceFlags } = useProject();

  const blockers = complianceFlags.filter((f) => f.status === "blocker").length;
  const warnings = complianceFlags.filter((f) => f.status === "advarsel").length;
  const deltaM2 = totalNetAreaM2 - targetAreaM2;
  const overTarget = deltaM2 > 5;
  const nearTarget = deltaM2 > 0 && deltaM2 <= 5;

  return (
    <div className="flex items-center gap-6 border-b border-border/40 bg-surface px-4 py-1.5">
      {hard_stop && (
        <Chip
          label="Hard stop"
          value="Blokeret"
          danger
        />
      )}
      <Chip
        label="Netto areal"
        value={`${totalNetAreaM2.toFixed(1)} m²`}
        sub={`/ ${targetAreaM2} m²`}
        danger={overTarget}
        near={nearTarget}
      />
      {blockers > 0 && (
        <Chip label="Blokkere" value={String(blockers)} danger />
      )}
      {warnings > 0 && (
        <Chip label="Advarsler" value={String(warnings)} near />
      )}
      {blockers === 0 && warnings === 0 && !hard_stop && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-success">
          ● Ingen blokkere
        </span>
      )}
    </div>
  );
}

function Chip({
  label,
  value,
  sub,
  danger = false,
  near = false,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
  near?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          danger ? "text-danger" : near ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </span>
      {sub && (
        <span className="font-mono text-[10px] text-muted-foreground">{sub}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate in FloorPlanEditor.tsx**

At the top of `FloorPlanEditor.tsx`, add the import:
```tsx
import { FloorPlanComplianceStrip } from "./FloorPlanComplianceStrip";
```

Find the level tabs bar (in the `editor.document && activeLevelId` branch):
```tsx
<div className="flex items-center gap-2 border-b border-border/40 bg-surface px-4 py-2">
  {editor.document.levels.map((level) => (
```
After the closing `</div>` of the level tabs bar, add the strip:
```tsx
</div>
<FloorPlanComplianceStrip
  totalNetAreaM2={totalNetArea}
  targetAreaM2={Number.parseFloat(targetAreaM2) || 120}
/>
```

- [ ] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/floor-plan/FloorPlanComplianceStrip.tsx src/components/floor-plan/FloorPlanEditor.tsx
git commit -m "feat(floor-plan): compliance strip shows area + blocker count while drawing"
```

---

## Task 7: Pre-populate opret-form from byggeoenske

When the user arrives at Plantegning from Maskinrummet they have already set `oensketAreal` and `antalEtager` in Byggeønsker. Seed the form with those values so they don't repeat themselves.

**Files:**
- Modify: `src/components/floor-plan/FloorPlanEditor.tsx`

- [ ] **Step 1: Read byggeoenske from project-store**

At the top of the `FloorPlanEditor` function body, after the `editor` hook, add:
```tsx
const { byggeoenske } = useProject();
```

`useProject` is already imported — no new import needed.

- [ ] **Step 2: Seed targetAreaM2 from byggeoenske**

Find the `useState` for `targetAreaM2`:
```tsx
const [targetAreaM2, setTargetAreaM2] = useState("120");
```
Replace with:
```tsx
const [targetAreaM2, setTargetAreaM2] = useState(() =>
  byggeoenske.oensketAreal != null && byggeoenske.oensketAreal > 0
    ? String(byggeoenske.oensketAreal)
    : "120",
);
```

- [ ] **Step 3: Show the source in the field label so users know where it came from**

In the opret-form, find the `Areal m²` label:
```tsx
<label className="text-sm font-medium text-stone-700">
  Areal m²
```
Replace with:
```tsx
<label className="text-sm font-medium text-muted-foreground">
  Areal m²{byggeoenske.oensketAreal != null ? " (fra byggeønsker)" : ""}
```

- [ ] **Step 4: TypeScript check**

```bash
bunx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Full verification suite**

```bash
bun test src
bunx eslint src/components/floor-plan/
bun run build
```
Expected: all pass, no new warnings on the changed files.

- [ ] **Step 6: Commit**

```bash
git add src/components/floor-plan/FloorPlanEditor.tsx
git commit -m "ux(floor-plan): seed opret-form target area from byggeoenske"
```

---

## Self-Review

**Spec coverage check:**

| Critique finding | Task |
|-----------------|------|
| Theme mismatch (light vs dark) | Task 1 (CSS), Task 2 (Editor), Task 3 (Toolbar), Task 4 (Inspector), Task 5 (Verification) |
| Accent color active states | Task 3 |
| Focus-visible ring | Task 3 |
| Human-readable element labels in Inspector | Task 4 |
| Developer debug info in footer (UUID, finding count) | Task 2 step 11 |
| Compliance context while drawing | Task 6 |
| Pre-populate form from byggeoenske | Task 7 |
| Opret form native `<select>` styling | Tasks 2 + 4 (uses `border-border bg-input` — Shadcn `Select` migration is a larger refactor, left for follow-up) |
| Header height consistency | Task 2 step 2 (locked to `h-12 shrink-0`) |
| Touch target size (36px buttons) | Not addressed — toolbar buttons remain `h-9 w-9`; increasing to `h-11 w-11` would change the 56px sidebar width and is a larger layout change. Flag as follow-up. |

**Placeholder scan:** None found. All steps contain explicit class strings or code blocks.

**Type consistency:** `FloorLevel` is imported in `FloorPlanInspector.tsx` (already in the import at line 8 via `floor-plan.types`). `OpeningInspector` receives `level: FloorLevel` — the type is already in scope.

**Note on canvas background:** `FloorPlanCanvas.tsx` was not read during planning. After removing the light theme, the SVG canvas background color should be verified visually. If the canvas uses `bg-white` or `fill="white"` as its background, it will appear as a dark background (`bg-background = #0a0a0a`) with a white SVG interior — which may actually look good (white drawing surface on dark app chrome). If it uses `bg-stone-100`, that will now render as `--surface` dark grey, which may need a manual override to `fill="white"` on the SVG root element.
