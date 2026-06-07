# Beliggenhedsplan Authority-Grade — Phase 4: UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Prerequisite:** Phases 1–3 complete and merged.

**Goal:** Add tagform/kælder/jordvarme/nedrivning inputs to Maskinrummet, build Myndighed document hub, add MatrikelMap readonly prop, update project-store for 5 new fields.

**Architecture:** project-store.ts gets 5 new typed fields (protected file). Maskinrummet reads/writes via existing setProject pattern. Myndighed page calls `fetchDrawingReadinessFn` for completeness + `exportBeliggenhedsplanFn` for generation. MatrikelMap gets `readonly` and `planLayers` props.

**Tech Stack:** React, Zustand, TanStack Router, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-06-beliggenhedsplan-authority-grade-design.md` sections 10–11

---

### Task 24: Extend project-store (PROTECTED FILE)

> **PROTECTED FILE — PR must include: `Rører beskyttet fil — kræver review`**

**Context — read these files first:**
- `src/lib/project-store.ts` (full file — read all ~200+ lines to understand the State and setter pattern)
- `supabase/migrations/20260606200000_drawing_params.sql` (for the 5 column names)

**Files:**
- Modify: `src/lib/project-store.ts`

- [ ] **Step 1: Add 5 new fields to `State` type**

In the `State` type, after the `budget_estimate` field (or at the end of the typed columns block, around line 98), add:

```typescript
  // Drawing design params — typed SQL columns from 20260606200000_drawing_params.sql
  tagform: "sadeltag" | "fladt" | "mansard" | "pulttag" | null;
  taghaldning_grad: number | null;
  har_jordvarme: boolean;
  har_kaelder: boolean;
  kaelder_gulv_kote_m: number | null;
```

- [ ] **Step 2: Add corresponding setters to State type**

After existing setters, add:

```typescript
  setTagform: (v: "sadeltag" | "fladt" | "mansard" | "pulttag" | null) => void;
  setTaghaldningGrad: (v: number | null) => void;
  setHarJordvarme: (v: boolean) => void;
  setHarKaelder: (v: boolean) => void;
  setKaelderGulvKoteM: (v: number | null) => void;
```

- [ ] **Step 3: Add initial values in `create()`**

In the `create((set) => ({ ... }))` call, add to the initial state (alongside other nulled fields):

```typescript
  tagform: null,
  taghaldning_grad: null,
  har_jordvarme: false,
  har_kaelder: false,
  kaelder_gulv_kote_m: null,
```

- [ ] **Step 4: Implement setters in `create()`**

```typescript
  setTagform: (v) => set({ tagform: v }),
  setTaghaldningGrad: (v) => set({ taghaldning_grad: v }),
  setHarJordvarme: (v) => set({ har_jordvarme: v }),
  setHarKaelder: (v) => set({ har_kaelder: v }),
  setKaelderGulvKoteM: (v) => set({ kaelder_gulv_kote_m: v }),
```

- [ ] **Step 5: Wire into project restore**

Find the `loadProject` or restore function in `src/lib/project-restore-facade.ts` (or wherever Supabase project data is mapped to store state). Add the 5 new columns to the select query and mapping. The Supabase column names are: `tagform`, `taghaldning_grad`, `har_jordvarme`, `har_kaelder`, `kaelder_gulv_kote_m`.

- [ ] **Step 6: Wire into project persistence**

Find `src/integrations/supabase/project-persistence.ts`. Add the 5 new fields to the upsert payload when saving project data.

- [ ] **Step 7: TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/project-store.ts \
        src/lib/project-restore-facade.ts \
        src/integrations/supabase/project-persistence.ts
git commit -m "feat(store): add 5 drawing design fields to project-store (tagform, kælder, jordvarme)

Rører beskyttet fil — kræver review"
```

---

### Task 25: Maskinrummet inputs

**Context — read these files first:**
- `src/routes/projekt.teknik.tsx` (full file — understand current UI and form structure)
- `src/lib/project-store.ts` (for new setters)
- `src/lib/reactive-compliance.ts` (for `computePartialUpdate` return type — now includes `drawingReasons`)
- `src/domain/drawing/geometry-engine.ts` (for `computeRygningsKote`)

**Files:**
- Modify: `src/routes/projekt.teknik.tsx`

The Maskinrummet section of `projekt.teknik.tsx` currently has `bygherre`, `sokkelKoteM`, `heightM` inputs. Add four new input groups below the existing inputs.

- [ ] **Step 1: Add tagform chip selector**

Find the section with building dimension inputs. Add after the height input:

```tsx
{/* Tagform */}
<div className="space-y-2">
  <label className="text-sm font-medium text-gray-700">Tagform</label>
  <div className="flex gap-2 flex-wrap">
    {(["sadeltag", "fladt", "mansard", "pulttag"] as const).map((tf) => (
      <button
        key={tf}
        type="button"
        onClick={() => {
          setTagform(tf === tagform ? null : tf);
          if (tf === "fladt") setTaghaldningGrad(0);
        }}
        className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
          tagform === tf
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
        }`}
      >
        {tf.charAt(0).toUpperCase() + tf.slice(1)}
      </button>
    ))}
  </div>

  {tagform && tagform !== "fladt" && (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600 min-w-24">Taghaldning</label>
      <div className="flex gap-1">
        {[25, 35, 45].map((deg) => (
          <button
            key={deg}
            type="button"
            onClick={() => setTaghaldningGrad(deg)}
            className={`px-2 py-1 text-xs rounded border ${
              taghaldningGrad === deg ? "bg-blue-100 border-blue-400" : "border-gray-200"
            }`}
          >
            {deg}°
          </button>
        ))}
      </div>
      <input
        type="number"
        min={0}
        max={60}
        value={taghaldningGrad ?? ""}
        onChange={(e) => setTaghaldningGrad(e.target.value ? Number(e.target.value) : null)}
        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
        placeholder="°"
      />
    </div>
  )}

  {/* Live rygningskote */}
  {tagform && taghaldningGrad !== null && sokkelKoteM !== null && buildingWidthM !== null && (
    <p className="text-xs text-gray-500 mt-1">
      Beregnet rygningskote: DVR90 +{computeRygningsKote({
        sokkelKoteM,
        loftshøjdeM: 2.40,
        fodprintBreddeM: buildingWidthM,
        tagform,
        taghaldningGrad,
      }).toFixed(2)} m
    </p>
  )}
</div>
```

Add the needed imports and destructure the new store values at the top of the component. The store gives `tagform`, `taghaldning_grad`, `har_kaelder`, `kaelder_gulv_kote_m`, `har_jordvarme` and their setters.

- [ ] **Step 2: Add kælder toggle + input**

```tsx
{/* Kælder */}
<div className="space-y-2">
  <div className="flex items-center gap-3">
    <label className="text-sm font-medium text-gray-700">Kælder inkluderet</label>
    <button
      type="button"
      role="switch"
      aria-checked={harKaelder}
      onClick={() => setHarKaelder(!harKaelder)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        harKaelder ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
        harKaelder ? "translate-x-5" : "translate-x-0.5"
      }`} />
    </button>
  </div>

  {harKaelder && (
    <div className="ml-4 space-y-2">
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">Kælderens gulvkote DVR90 (m)</label>
        <input
          type="number"
          step={0.05}
          value={kaelderGulvKoteM ?? ""}
          onChange={(e) => setKaelderGulvKoteM(e.target.value ? Number(e.target.value) : null)}
          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
          placeholder="f.eks. 15.20"
        />
      </div>
      {/* Live validation warnings from reactive-compliance */}
      {drawingReasons.filter(r => r.affectedLayer === "proposed" && r.severity !== "info").map((r) => (
        <p key={r.code} className={`text-xs ${r.severity === "blocking" ? "text-red-600" : "text-amber-600"}`}>
          {r.severity === "blocking" ? "⛔ " : "⚠️ "}{r.message}
        </p>
      ))}
    </div>
  )}
</div>
```

`drawingReasons` comes from calling `computePartialUpdate` (already wired in the component via the compliance hook). The component needs to pass the new params to the existing compliance recomputation call.

- [ ] **Step 3: Add jordvarme toggle**

```tsx
{/* Jordvarme */}
<div className="flex items-center gap-3">
  <label className="text-sm font-medium text-gray-700">Jordvarme planlagt</label>
  <button
    type="button"
    role="switch"
    aria-checked={harJordvarme}
    onClick={() => setHarJordvarme(!harJordvarme)}
    className={`relative w-10 h-5 rounded-full transition-colors ${
      harJordvarme ? "bg-blue-600" : "bg-gray-300"
    }`}
  >
    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
      harJordvarme ? "translate-x-5" : "translate-x-0.5"
    }`} />
  </button>
  {harJordvarme && (
    <p className="text-xs text-blue-700">
      ℹ Kræver §19-tilladelse fra kommunen. Registreres i GEUS Jupiter efter etablering.
    </p>
  )}
</div>
```

- [ ] **Step 4: Add nedrivning checkboxes**

This requires knowing which existing buildings are on the parcel. Use BBR data from `bbrData` store field:

```tsx
{/* Nedrivning */}
{bbrData?.buildings && bbrData.buildings.length > 0 && (
  <div className="space-y-2">
    <label className="text-sm font-medium text-gray-700">Eksisterende bygninger</label>
    <p className="text-xs text-gray-500">Markér bygninger der nedrives som del af projektet</p>
    {bbrData.buildings.map((b) => (
      <label key={b.id} className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={nedrivesBbrIds.includes(b.id)}
          onChange={(e) => {
            setNedrivesBbrIds(
              e.target.checked
                ? [...nedrivesBbrIds, b.id]
                : nedrivesBbrIds.filter((id) => id !== b.id),
            );
          }}
        />
        BBR {b.id} — {b.bebyggetAreal_m2} m² (opf. {b.byggeaar})
      </label>
    ))}
  </div>
)}
```

Note: `nedrivesBbrIds` is local `useState<string[]>([])` in the component — it doesn't need to persist to the DB for now (it affects the drawing generation call). Pass it to the drawing export.

- [ ] **Step 5: Pass new fields to `exportBeliggenhedsplanFn`**

Find the `onGenerate` / submit handler in the component. Add the new fields to the call:

```typescript
await exportBeliggenhedsplanFn({
  data: {
    ...existingFields,
    tagform: tagform ?? null,
    taghaldningGrad: taghaldning_grad ?? null,
    harKaelder: har_kaelder,
    kaelderGulvKoteM: kaelder_gulv_kote_m ?? null,
    harJordvarme: har_jordvarme,
  },
});
```

Also update `ExportBeliggenhedsplanInputSchema` in `src/routes/api.drawing.ts` to accept these new fields (all optional):

```typescript
tagform: z.enum(["sadeltag", "fladt", "mansard", "pulttag"]).nullable().optional(),
taghaldningGrad: z.number().min(0).max(60).nullable().optional(),
harKaelder: z.boolean().optional(),
kaelderGulvKoteM: z.number().nullable().optional(),
harJordvarme: z.boolean().optional(),
```

And pass them through to `assembleBeliggenhedsplan` which passes them to the `proposed` layer.

- [ ] **Step 6: TypeScript check**

```bash
bunx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/routes/projekt.teknik.tsx \
        src/routes/api.drawing.ts
git commit -m "feat(ui): add tagform, kælder, jordvarme, nedrivning inputs to Maskinrummet"
```

---

### Task 26: MatrikelMap readonly prop

**Context — read these files first:**
- `src/components/cockpit/MatrikelMap.tsx` (full file — focus on the Translate interaction and OL layer setup)
- `src/domain/drawing/beliggenhedsplan.types.ts` (for `VejLayer`, `NaturbeskyttelseLayer`, `LerLedning`)

**Files:**
- Modify: `src/components/cockpit/MatrikelMap.tsx`

- [ ] **Step 1: Add `readonly` and `planLayers` to props type**

Find the props type/interface in `MatrikelMap.tsx`. Add:

```typescript
readonly?: boolean;
planLayers?: {
  vej: import("@/domain/drawing/beliggenhedsplan.types").VejLayer | null;
  naturbeskyttelse: import("@/domain/drawing/beliggenhedsplan.types").NaturbeskyttelseLayer[];
  lerLedninger: import("@/domain/drawing/beliggenhedsplan.types").LerLedning[];
} | null;
```

- [ ] **Step 2: Disable Translate interaction when `readonly={true}`**

Find the `Translate` or drag interaction setup in the component. Wrap it:

```typescript
if (!readonly) {
  // existing Translate interaction setup
}
```

Also remove the drag cursor hint when `readonly` is true.

- [ ] **Step 3: TypeScript check + commit**

```bash
bunx tsc --noEmit
git add src/components/cockpit/MatrikelMap.tsx
git commit -m "feat(map): add readonly prop and planLayers prop to MatrikelMap"
```

---

### Task 27: Myndighed document hub page

**Context — read these files first:**
- `src/routes/projekt.teknik.tsx` (current full file — understand existing layout and data access patterns)
- `src/domain/drawing/completeness-engine.ts` (for `DrawingCompleteness`, `FieldStatus`)
- `src/routes/api.drawing-readiness.ts` (for `fetchDrawingReadinessFn`)
- `src/routes/api.drawing.ts` (for `exportBeliggenhedsplanFn`)

**Files:**
- Modify: `src/routes/projekt.teknik.tsx`

The current page is a single form. The new layout splits into two columns:
- Left: `MatrikelMap` with `readonly={true}` and completeness-based status
- Right: document panel with completeness fields, download buttons

- [ ] **Step 1: Add completeness state**

Add `useState` for drawing completeness (fetched on mount):

```typescript
const [completeness, setCompleteness] = useState<DrawingCompleteness | null>(null);
const [isLoadingReadiness, setIsLoadingReadiness] = useState(false);

useEffect(() => {
  if (!currentProjectId || !address?.id) return;
  setIsLoadingReadiness(true);
  fetchDrawingReadinessFn({ data: { projectId: currentProjectId, addressId: address.id } })
    .then(setCompleteness)
    .catch(() => {})
    .finally(() => setIsLoadingReadiness(false));
}, [currentProjectId, address?.id]);
```

- [ ] **Step 2: Build the completeness panel component**

Add a helper function inside the component:

```typescript
function FieldStatusIcon({ status }: { status: FieldStatus["status"] }) {
  if (status === "auto") return <span className="text-green-600 font-bold">✓</span>;
  if (status === "estimated") return <span className="text-gray-400">~</span>;
  if (status === "placeholder") return <span className="text-orange-500">○</span>;
  if (status === "missing") return <span className="text-red-600 font-bold">!</span>;
  return null;
}

function CompletenessPanel({ completeness }: { completeness: DrawingCompleteness }) {
  const fieldLabels: Record<keyof DrawingCompleteness["fields"], string> = {
    parcelPolygon: "Matrikelpolygon",
    proposedFootprint: "Bygningsfodprint",
    sokkelKote: "Sokkelkote",
    rygningsKote: "Rygningskote",
    vejGeometry: "Vejgeometri",
    koterTerræn: "Terrænkoter",
    kloakStikledning: "Kloakstikledning",
    regnvandsløsning: "Regnvandsløsning",
    overkørsel: "Overkørsel",
    naturbeskyttelse: "Naturbeskyttelse",
    tinglysteServitutter: "Tinglyste servitutter",
  };

  return (
    <div className="space-y-1">
      {Object.entries(completeness.fields).map(([key, fieldStatus]) => (
        <div key={key} className="flex items-start gap-2 text-sm">
          <FieldStatusIcon status={fieldStatus.status} />
          <span className={fieldStatus.status === "missing" ? "text-red-600" : "text-gray-700"}>
            {fieldLabels[key as keyof typeof fieldLabels]}
          </span>
          {fieldStatus.status === "estimated" && (
            <span className="text-gray-400 text-xs">{fieldStatus.note}</span>
          )}
          {fieldStatus.status === "placeholder" && (
            <span className="text-orange-500 text-xs">{fieldStatus.displayLabel}</span>
          )}
        </div>
      ))}
      {completeness.permanentWarnings.map((w, i) => (
        <p key={i} className="text-xs text-amber-700 mt-2 border-t border-amber-200 pt-2">⚠ {w}</p>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Build the document hub layout**

The Myndighed section of the page (the second main section or the entire teknik page) becomes:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {/* Left: Map preview */}
  <div className="h-96 rounded-lg overflow-hidden border border-gray-200">
    <MatrikelMap
      readonly={true}
      footprintGeojson={designPlacement?.footprintGeojson ?? null}
      {/* pass other required existing props */}
    />
  </div>

  {/* Right: Document panel */}
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="font-semibold text-gray-900">Beliggenhedsplan</h3>
      {completeness && (
        <span className={`text-xs px-2 py-1 rounded font-medium ${
          completeness.overallStatus === "ready"
            ? "bg-green-100 text-green-700"
            : "bg-amber-100 text-amber-700"
        }`}>
          {completeness.overallStatus === "ready" ? "Klar" : "UDKAST"}
        </span>
      )}
    </div>

    {completeness ? (
      <CompletenessPanel completeness={completeness} />
    ) : (
      <p className="text-sm text-gray-400">
        {isLoadingReadiness ? "Indlæser…" : "Kør adresseanalyse for at se status"}
      </p>
    )}

    <div className="flex gap-3 pt-2 border-t border-gray-100">
      <button
        type="button"
        disabled={isGenerating}
        onClick={handleGenerate}
        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-md text-sm font-medium"
      >
        {isGenerating ? "Genererer…" : `↓ SVG${completeness?.overallStatus === "draft" ? " (UDKAST)" : ""}`}
      </button>
      <button
        type="button"
        disabled={isGenerating}
        onClick={handleGeneratePdf}
        className="flex-1 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 py-2 px-4 rounded-md text-sm font-medium"
      >
        ↓ PDF
      </button>
    </div>

    {completeness && completeness.blockingCount > 0 && (
      <p className="text-xs text-amber-700">
        {completeness.blockingCount} manglende felt(er) — tegning genereres som UDKAST
      </p>
    )}

    {/* Navigation link to Maskinrummet for placeholders */}
    {completeness && completeness.placeholderCount > 0 && (
      <p className="text-xs text-gray-500">
        <span className="text-orange-500">○</span> {completeness.placeholderCount} placeholders udfyldes af fagfolk under byggeprocessen
      </p>
    )}
  </div>
</div>
```

- [ ] **Step 4: TypeScript check**

```bash
bunx tsc --noEmit
```

Fix any type errors. Common issues: missing props on MatrikelMap, wrong destructuring of completeness fields.

- [ ] **Step 5: Commit**

```bash
git add src/routes/projekt.teknik.tsx
git commit -m "feat(ui): build Myndighed document hub with completeness panel and download buttons"
```

---

### Task 28: Update CLAUDE.md

**Context:** Read `CLAUDE.md` sections "Protected Files" and around `analysis-orchestrator.ts`.

**Files:**
- Modify: `CLAUDE.md`

> **PROTECTED FILE — PR must include: `Rører beskyttet fil — kræver review`**

- [ ] **Step 1: Move analysis-orchestrator.ts from Protected Files to new section**

In `CLAUDE.md`, find the Protected Files section. Remove `analysis-orchestrator.ts` from that list.

Add a new section after Protected Files:

```markdown
## Files Requiring Gatekeeper Review (Not Untouchable)

Changes to these files are allowed but require an architecture plan answer
(Gatekeeper Protocol) and explicit human review call-out in the PR:

- `src/lib/analysis-orchestrator.ts` — orchestrates compliance pipeline; changes
  must not break existing source results or introduce circular dependencies
```

- [ ] **Step 2: Add notes for project-store and reactive-compliance**

In the Protected Files section, add inline notes:

Under `src/lib/project-store.ts`:
```
  - Drawing design params (tagform, taghaldning_grad, har_kaelder, kaelder_gulv_kote_m,
    har_jordvarme) added 2026-06-06 for authority-grade beliggenhedsplan.
```

Under `src/lib/reactive-compliance.ts`:
```
  - Extended 2026-06-06 with optional drawing validation params (harKælder, harJordvarme,
    naturbeskyttelseZoner). Returns drawingReasons alongside existing result.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE.md): move analysis-orchestrator to Gatekeeper-review; note drawing extensions

Rører beskyttet fil — kræver review"
```

---

### Phase 4 complete ✓

Final check — all four phases done:

```bash
bunx tsc --noEmit && bun test src && bunx eslint . && bun run build
```

All must pass. No debug logs. No new `any` casts. No direct Supabase calls outside repositories.
