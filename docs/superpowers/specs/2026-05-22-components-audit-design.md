# Components Audit Refactoring — Design Spec

**Dato:** 2026-05-22
**Scope:** 5 prioriterede findings fra Components audit i ROADMAP.md
**Strategi:** Gruppe C — pure lib → hooks → service+hook

---

## Problemstilling

Fem cockpit-komponenter bryder CLAUDE.md Rule 2 (UI Is An Adapter) og Rule 7
(Refactor Dirty Domain Boundaries Before Extending):

| Komponent | Primær violation |
|---|---|
| `BudgetKalkulator.tsx` | Pure beregningsfunktioner og debounced `syncPatch` lever i komponentfilen |
| `AnalyseTab.tsx` | Fritekst-match på lokalplan-status direkte i JSX |
| `MatrikelMap.tsx` | Importerer route server functions direkte; `syncPatch` fra render-handlers |
| `cockpit/index.tsx` | `StepExtras` hard-koder flag-IDs og compliance-semantik; `DispensationModal` muterer store direkte |
| `AiDesignHero.tsx` | Auth, upload, AI-kald og persistence alt i én komponent |

---

## Arkitektur-oversigt

```
Lag                     Nye filer
─────────────────────────────────────────────────────────────────────
Domain / lib (pure TS)  src/lib/budget-calculator.ts
                        src/lib/lokalplan-classifier.ts
                        src/lib/billedanalyse-tags.ts
                        src/lib/byggeoenske-constraint-view-model.ts

Application service     src/lib/services/ai-design-workflow.service.ts

Hooks (React lifecycle) src/hooks/useBudgetSync.ts
                        src/hooks/useParcelData.ts
                        src/hooks/usePlacementSync.ts
                        src/hooks/useDispensationFlow.ts
                        src/hooks/useAiDesignWorkflow.ts

Komponenter (tynde)     AiDesignHero.tsx
                        MatrikelMap.tsx
                        cockpit/index.tsx  (StepExtras + DispensationModal)
                        BudgetKalkulator.tsx
                        AnalyseTab.tsx
```

Ingen nye Supabase-kald. Ingen nye server functions. Ingen nye JSONB-felter.
Importretning forbliver én-vejs: komponenter → hooks → services → lib.

---

## Gruppe 1 — Pure lib extraction

### 1a. BudgetKalkulator

#### `src/lib/budget-calculator.ts` (ny)

Indeholder alle eksisterende eksporterede typer og pure functions fra
`BudgetKalkulator.tsx`:

- Typer: `GeoteknikKategori`, `BudgetInput`, `BudgetKategori`, `BudgetResultat`
- Functions: `beregnNedrivning`, `beregnForsyning`, `beregnGeoteknik`, `beregnNybyg`, `beregnBudget`

Ingen React-imports. Ingen side-effects.

#### `src/hooks/useBudgetSync.ts` (ny)

```ts
export function useBudgetSync(totalTypisk: number): void
```

Indkapsler den debounced `useEffect` (800 ms) der kalder:
- `useProject.getState().setBudgetEstimate(totalTypisk)`
- `syncPatch({ budget_estimate: totalTypisk })`

#### `BudgetKalkulator.tsx` (modificeret)

Fjerner: pure functions, typer, inline `useEffect` med debounce.
Importerer fra `@/lib/budget-calculator` og bruger `useBudgetSync`.
Formaterings-helpers (`fmtDKK`, `fmtShort`) forbliver i komponentfilen — de er
presentation-lag uden domæne-semantik.

#### Tests

`src/lib/budget-calculator.test.ts` (ny) — unit tests for alle fire
beregningsfunktioner inkl. edge cases: `null` areal, byggeår < 1978
(asbestrisiko), geoteknik-kategorier.

---

### 1b. AnalyseTab

#### `src/lib/lokalplan-classifier.ts` (ny)

```ts
export function classifyLokalplaner(lokalplaner: RuleEngineLokalplan[]): {
  vedtagne: RuleEngineLokalplan[];
  forslag: RuleEngineLokalplan[];
}
```

Erstatter de to inline `.filter()`-kald med fritekst-match i `AnalyseTab`.
Logikken: `vedtagne` = ingen status, eller status indeholder "vedtaget" men ikke
"forslag". `forslag` = status indeholder "forslag". Case-insensitive.

#### `AnalyseTab.tsx` (modificeret)

Fjerner inline filter-logik. Kalder `classifyLokalplaner(lokalplaner)` og
destrukturerer `{ vedtagne, forslag }`. Ingen andre ændringer — `classifyTerrain`,
`classifyGroundwater` og `isNearNeighbor` er allerede pure lib-kald og forbliver.

#### Tests

`src/lib/lokalplan-classifier.test.ts` (ny) — tester vedtaget/forslag-opdeling
med: `null` status, tom streng, "Vedtaget", "vedtaget" (lowercase), "Forslag",
"Lokalplanforslag", mixed arrays.

---

## Gruppe 2 — Hook extraction

### 2a. MatrikelMap

#### `src/hooks/useParcelData.ts` (ny)

```ts
export function useParcelData(params: {
  geo: { lat: number; lng: number } | null;
  jordstykkeLokalId: string | null;
  adresseid: string | null;
}): {
  parcelStatus: "idle" | "loading" | "ready" | "missing";
  parcelGeojson: GeoJSON.FeatureCollection | null;
  previewImage: {
    dataUrl: string;
    extent3857: [number, number, number, number];
  } | null;
}
```

Indkapsler: `useServerFn`-kald for `fetchParcelGeometry`, `fetchParcelGeometryById`
og `fetchMatriklenPreview`, samt `useEffect` der loader geometri og preview ved
ændret geo/jordstykkeLokalId/adresseid.

`MatrikelMap.tsx` importerer ikke længere fra `@/routes/api.map-tiles`.

#### `src/hooks/usePlacementSync.ts` (ny)

```ts
export function usePlacementSync(address: AddressState | null): {
  updateRotation: (deg: number) => void;
  resetPlacement: (
    geo: { lat: number; lng: number } | null,
    initialCenter: [number, number] | null,
  ) => void;
}
```

Indkapsler `setAddress + syncPatch` for rotation og centroid-reset. Komponenten
kalder `updateRotation(val)` og `resetPlacement(...)` uden at kende til `syncPatch`.

#### `MatrikelMap.tsx` (modificeret)

Fjerner: direkte `@/routes/api.map-tiles`-imports, alle `useServerFn`-kald,
geometri/preview-`useEffect`, og inline `syncPatch`-kald i `updateRotation` og
`resetPlacement`.

Bevarer: OL map-initialisering og al render-logik (lokal visuel state).

Tilføjer: `const { parcelStatus, parcelGeojson, previewImage } = useParcelData(...)`
og `const { updateRotation, resetPlacement } = usePlacementSync(address)`.

---

### 2b. cockpit/index.tsx

#### `src/lib/byggeoenske-constraint-view-model.ts` (ny)

```ts
export type StepConstraintViewModel = {
  contextChip: string | null;
  dispensation: {
    needed: boolean;
    acked: boolean;
    kontekst: string;
    graense: string;
    beregnetPct: number | null;
  } | null;
  fjernvarme: "tilgaengelig" | "mismatch" | "unknown" | null;
  lokalplanHint: string | null;
};

export function buildStepConstraintViewModel(
  stepKey: keyof Byggeoenske,
  validering: BoligoenskeValidering | null,
  preCheck: AdressePreCheck | null,
  complianceFlags: ComplianceFlag[],
): StepConstraintViewModel
```

Struktureret objekt frem for union — `antalEtager` og `oensketAreal` viser
context-chip OG dispensation-state simultant. `StepExtras` renderer kun
non-null felter.

Pure function — ingen React-imports. Indkapsler:
- Flag-ID-opslag: `"fjernvarme-tilslutningspligt"`, `"fjernvarme-mismatch-ingen-daekning"`
- Status-matching: `etagerStatus === "dispensation"`, `arealStatus === "dispensation"`
- Threshold-beregning: `maxEtager`, `restBygningsareal`, `beregnetBebyggelsespct`
- `findFlagForStep` for `tagform` og `facademateriale`

`StepExtras` reduceres til en ren renderer af den returnerede viewmodel.

#### `src/hooks/useDispensationFlow.ts` (ny)

```ts
export function useDispensationFlow(): {
  dispensationFor: "etager" | "areal" | null;
  open: (type: "etager" | "areal") => void;
  acknowledge: (type: "etager" | "areal") => void;
  close: () => void;
}
```

Ejer `useState` for modal-type og kalder `setBoligoenskeValidering` ved
acknowledge. `DispensationModal` modtager `{ type, onAcknowledge, onClose }` som
props og muterer ikke store direkte.

`ByggeoenskeAccordion` bruger `useDispensationFlow()` og sender `open` ned som
`onOpenDispensation` prop.

#### Tests

`src/lib/byggeoenske-constraint-view-model.test.ts` (ny) — tester alle
`stepKey`-grene: `antalEtager` (dispensation needed/acked/none), `oensketAreal`
(same), `varmekilde` (alle tre flag-states), `tagform`/`facademateriale`
(med/uden hint). Ingen tests eksisterer her i dag.

---

## Gruppe 3 — Application service + hook

### AiDesignHero

#### `src/lib/billedanalyse-tags.ts` (ny)

Pure helpers uden React:

```ts
export function uniqueTags(tags: string[]): string[]
export function removeTag(
  kategori: keyof BilledeAnalyseKategorier,
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat
export function addTag(
  kategori: keyof BilledeAnalyseKategorier,
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat
export function resolveKonflikt(
  kategori: keyof BilledeAnalyseKategorier,
  valgteTags: string[],
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat
export function removeExtraTag(tag: string, current: BilledeAnalyseResultat): BilledeAnalyseResultat
```

#### `src/lib/services/ai-design-workflow.service.ts` (ny)

Pure TS application service — ingen React-imports. Tre fokuserede funktioner der
kalder eksisterende server functions:

```ts
export async function uploadInspirationImages(params: {
  files: Array<{ base64: string; mimeType: "image/jpeg" | "image/png" }>;
  projectId: string;
  accessToken: string;
}): Promise<{ signedUrls: string[]; paths: string[] }>

export async function analyseInspirationImages(params: {
  signedUrls: string[];
}): Promise<BilledeAnalyseResultat>

export async function generateDesignProposalsService(params: {
  prompt: string;
  inspirationsUrls: string[];
  stil: string | undefined;
  facademateriale: string | undefined;
  projectId: string | undefined;
  addressId: string | undefined;
}): Promise<{ images: string[] }>
```

Servicen kalder `uploadBillede`, `analyserBillederFn` og `generateDesignProposals`
fra deres respektive functions-filer. Den ejer ikke React-state eller persistence.

#### `src/hooks/useAiDesignWorkflow.ts` (ny)

Tynd React-hook. Ansvar: session-opslag, state-management, kald til service,
persistence via `syncPatch`.

```ts
export type AiDesignWorkflowState = {
  droem: string;
  uploadedImages: string[];
  analyseState:
    | "idle" | "uploading" | "ready" | "analysing"
    | "conflict" | "validated" | "saved" | "error";
  analyse: BilledeAnalyseResultat | null;
  forslag: string[];
  valgt: string | null;
  uploadError: string | null;
  error: string | null;
  loading: boolean;
  hasHardStop: boolean;
};

export type AiDesignWorkflowActions = {
  setDroem: (v: string) => void;
  handleFiles: (files: FileList | null) => Promise<void>;
  removeUpload: (index: number) => void;
  handleAnalyser: () => Promise<void>;
  handleGem: () => void;
  handleGenerate: () => Promise<void>;
  handleSelect: (url: string) => void;
  resolveKonflikt: (kategori: keyof BilledeAnalyseKategorier, tags: string[]) => void;
  addTag: (kategori: keyof BilledeAnalyseKategorier, tag: string) => void;
  removeTag: (kategori: keyof BilledeAnalyseKategorier, tag: string) => void;
  removeExtraTag: (tag: string) => void;
};

export function useAiDesignWorkflow(): AiDesignWorkflowState & AiDesignWorkflowActions
```

#### `AiDesignHero.tsx` (modificeret)

Reduceres til renderers-only. Kalder `useAiDesignWorkflow()`, destrukturerer
state og actions, sender dem til sub-komponenter som props.

Fjerner: `getSession`, `syncPatch`, `useProject.getState()`, `uploadBillede`,
`analyserBillederFn`, `generateDesignProposals`, alle inline workflow-handlers,
alle tag-manipulationsfunktioner.

#### Tests

`src/lib/billedanalyse-tags.test.ts` (ny) — unit tests for `uniqueTags` (duplikat-
deduplication, case-insensitive), `addTag` (tom streng ignoreres), `removeTag`,
`resolveKonflikt` (fjerner konflikt efter resolve), `removeExtraTag`.

---

## Definition of Done

- [ ] TypeScript passer (`bunx tsc --noEmit`)
- [ ] Tests passer (`bun test`)
- [ ] Lint passer (`bunx eslint .`)
- [ ] Build passer (`bun run build`)
- [ ] Ingen nye `any`-casts
- [ ] Ingen nye direkte Supabase-kald udenfor repositories
- [ ] Ingen circular imports
- [ ] `MatrikelMap.tsx` importerer ikke fra `@/routes/`
- [ ] `AiDesignHero.tsx` kalder ikke `getSession` eller `syncPatch` direkte
- [ ] `StepExtras` indeholder ingen hard-kodede flag-IDs
- [ ] `BudgetKalkulator.tsx` indeholder ingen pure beregningsfunktioner
