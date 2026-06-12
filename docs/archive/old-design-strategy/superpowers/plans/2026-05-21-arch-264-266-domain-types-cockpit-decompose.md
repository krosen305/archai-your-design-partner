# ARCH-264 + ARCH-266: Domain type extraction and cockpit decomposition

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all domain types from `project-store.ts` into neutral modules so server code never imports from the Zustand store, then decompose the 1739-line cockpit route into focused hooks and components.

**Architecture:** Clean cut — no re-export bridges. ARCH-264 lands first (compile errors guide every missed import). ARCH-266 builds on clean type imports from day one. TypeScript compiler is the safety net: `bunx tsc --noEmit` must pass between every task.

**Tech Stack:** TypeScript, Zustand, React hooks, TanStack Start `createServerFn`, Bun test

---

## Phase 1: ARCH-264 — Domain type extraction

### Task 1: Create `src/types/project-state.ts`

**Files:**

- Create: `src/types/project-state.ts`

- [ ] **Step 1: Create the file with all domain types**

```typescript
// src/types/project-state.ts
// Domain and pipeline types that are safe to import in both server and client code.
// project-store.ts imports these — it does NOT define them.

import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { VurData } from "@/integrations/vur/client";
import type { ComplianceMetrics } from "@/lib/compliance-engine";

// ---------------------------------------------------------------------------
// Adresse
// ---------------------------------------------------------------------------

export type Address = {
  adresseid: string;
  adresse: string;
  postnr: string;
  postnrnavn: string;
  kommune: string;
  kommunekode: string;
  matrikel: string | null;
  adgangsadresseid: string;
  koordinater: { lat: number; lng: number } | null;
  bbrId: string | null;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  grundareal: number | null;
  centroid?: { lat: number; lng: number } | null;
  rotationDeg?: number;
  footprintAreaM2?: number | null;
  minDistanceToBoundaryM?: number | null;
  outsideParcelAreaM2?: number;
};

// ---------------------------------------------------------------------------
// Projekt-formdata
// ---------------------------------------------------------------------------

export type ProjectData = {
  area?: string;
  floors?: string;
  budget?: string;
  timeline?: string;
  description?: string;
  inspirations?: string[];
};

// ---------------------------------------------------------------------------
// 5-fase arkitektur
// ---------------------------------------------------------------------------

export type PhaseName = "hus-dna" | "match" | "finans" | "engineering" | "udbud";
export type PhaseStatus = "locked" | "active" | "complete" | "error";

// ---------------------------------------------------------------------------
// Hus-DNA
// ---------------------------------------------------------------------------

export type HusDna = {
  stil: string;
  bruttoareal: string;
  etager: string;
  tagform: string;
  energiklasse: string;
  saerligeKrav: string[];
  confidence: number;
  kilde: "mock" | "anthropic";
};

// ---------------------------------------------------------------------------
// Byggeønske
// ---------------------------------------------------------------------------

export type Byggeoenske = {
  byggetype?: "nybyg" | "tilbyg" | "ombyg";
  husstandsstoerrelse?: number;
  voksne?: number;
  boern?: number;
  livsfase?: "ung" | "etableret" | "senior";
  oensketAreal?: number;
  antalEtager?: 1 | 1.5 | 2 | 3;
  antalSovevaerelser?: number;
  antalBadevaerelser?: number;
  hjemmekontor?: boolean;
  arkitektoniskStil?: "moderne" | "klassisk" | "skandinavisk" | "industriel" | "minimalistisk";
  tagform?: "fladt" | "saddeltag" | "valm" | "ensidig";
  facademateriale?: "tegl" | "trae" | "puds" | "metal" | "kombineret";
  vinduesandel?: "lille" | "mellem" | "stor";
  udeomraade?: "terrasse" | "have" | "altan" | "tagterrasse";
  energiklasse?: "BR18" | "lavenergi" | "passiv" | "plusenergi";
  varmekilde?: "varmepumpe" | "fjernvarme" | "jordvarme" | "solvarme";
  solceller?: boolean;
  ventilation?: "naturlig" | "mekanisk" | "balanceret";
  ladestander?: boolean;
  budget?: "under-3" | "3-5" | "5-8" | "8-12" | "over-12";
  inspirationsbilleder?: string[];
  inspirationsbilledePaths?: string[];
  designDroem?: string;
  valgteDesignforslag?: string;
  genererededDesignforslag?: string[];
};

// ---------------------------------------------------------------------------
// Design placement
// ---------------------------------------------------------------------------

type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: [number, number][][];
};

export type DesignPlacement = {
  footprintGeojson: GeoJsonPolygon | null;
  footprintAreaM2: number | null;
  centroid: { lat: number; lng: number } | null;
  rotationDeg: number;
  floors: number | null;
  heightM: number | null;
  minDistanceToBoundaryM: number | null;
  outsideParcelAreaM2: number;
  source: "user" | "generated";
};

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export type ComplianceFlag = {
  id: string;
  label: string;
  status: "ok" | "advarsel" | "blocker";
  detalje: string | null;
  aktuelVærdi: string | null;
  tilladt: string | null;
  kilde:
    | "bbr"
    | "plandata"
    | "servitut"
    | "beregnet"
    | "sdfi"
    | "dkjord"
    | "geus"
    | "regelkerne"
    | "fbb";
  dispensationMulig?: boolean;
  dispensationMyndighed?: string;
};

export type BoligoenskeValidering = {
  etagerStatus: "ok" | "dispensation" | "ingen_data";
  arealStatus: "ok" | "dispensation" | "ingen_data";
  beregnetBebyggelsespct: number | null;
  etagerDispensationAcknowledged: boolean;
  arealDispensationAcknowledged: boolean;
};

// ---------------------------------------------------------------------------
// AdressePreCheckResultat — defined here to avoid circular deps with pre-check-adresse.ts
// ---------------------------------------------------------------------------

export type AdressePreCheckResultat = {
  analysisRunId?: string | null;
  blockers: ComplianceFlag[];
  advarsler: ComplianceFlag[];
  kontekst: {
    grundareal: number | null;
    bebyggetAreal: number | null;
    bebyggelsesprocent: number | null;
    antalEtager: number | null;
    maxBebyggelsesprocent: number | null;
    maxEtager: number | null;
    maxBygningshoejde: number | null;
    restBygningsareal: number | null;
    ejendomsvaerdi: number | null;
    grundvaerdi: number | null;
  };
  bbr: BbrKompliantData | null;
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  vurderingData: VurData | null;
  complianceMetrics: ComplianceMetrics | null;
};

// ---------------------------------------------------------------------------
// DataSource status + kind
// ---------------------------------------------------------------------------

export type DataSourceStatus = "fresh" | "stale" | "missing" | "loading" | "error";

export type DataSourceKind =
  | "bbr"
  | "lokalplaner"
  | "kommuneplanramme"
  | "fbb"
  | "naturbeskyttelse"
  | "dkjord"
  | "geusRisk"
  | "servitutter"
  | "terrain"
  | "fjernvarme"
  | "naboer"
  | "matGeometri"
  | "vurdering"
  | "byggeanalyse"
  | "billedanalyse"
  | "husDna";

export const DATA_SOURCE_LABELS: Record<DataSourceKind, string> = {
  bbr: "BBR & matrikel",
  lokalplaner: "Lokalplaner",
  kommuneplanramme: "Kommuneplanramme",
  fbb: "SAVE & fredning (FBB)",
  naturbeskyttelse: "Naturbeskyttelse",
  dkjord: "Jordforurening (DK-Jord)",
  geusRisk: "Geoteknisk risiko",
  servitutter: "Servitutter",
  terrain: "Terræn (DHM)",
  fjernvarme: "Fjernvarme",
  naboer: "Nabobygninger",
  matGeometri: "Parcelgeometri (MAT WFS)",
  vurdering: "Ejendomsvurdering",
  byggeanalyse: "AI byggeanalyse",
  billedanalyse: "AI billedanalyse",
  husDna: "Hus-DNA",
};

// ---------------------------------------------------------------------------
// PipelineServiceState
// ---------------------------------------------------------------------------

export type PipelineServiceState =
  | "success"
  | "no_hit"
  | "error"
  | "skipped"
  | "mock"
  | "cache_hit"
  | "not_run";

export const PIPELINE_SERVICE_STATE_LABELS: Record<PipelineServiceState, string> = {
  success: "Live",
  no_hit: "Ingen hit",
  error: "Fejl",
  skipped: "Sprunget over",
  mock: "Mock",
  cache_hit: "Cache",
  not_run: "Ikke kørt",
};

// ---------------------------------------------------------------------------
// Type guards and restore helpers
// ---------------------------------------------------------------------------

export function isHusDna(v: unknown): v is HusDna {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).stil === "string" &&
    typeof (v as Record<string, unknown>).confidence === "number"
  );
}

// Stale thresholds per source (days). Mirror of cache TTL — UI display only.
const STALE_DAYS: Record<DataSourceKind, number> = {
  bbr: 30,
  lokalplaner: 30,
  kommuneplanramme: 30,
  fbb: 30,
  naturbeskyttelse: 30,
  dkjord: 30,
  geusRisk: 30,
  servitutter: 7,
  terrain: 30,
  fjernvarme: 30,
  naboer: 30,
  matGeometri: 90,
  vurdering: 30,
  byggeanalyse: 60,
  billedanalyse: 60,
  husDna: 60,
};

export function deriveSourceStatus(
  kind: DataSourceKind,
  value: unknown,
  lastFetchedIso: string | null,
): DataSourceStatus {
  const hasValue = Array.isArray(value) ? value.length > 0 : value != null;
  if (!hasValue) return "missing";
  if (!lastFetchedIso) return "fresh";
  const ageMs = Date.now() - new Date(lastFetchedIso).getTime();
  const staleMs = STALE_DAYS[kind] * 24 * 60 * 60 * 1000;
  return ageMs > staleMs ? "stale" : "fresh";
}

type ParsedComplianceData = {
  bbr: BbrKompliantData | null;
  flags: ComplianceFlag[];
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  byggeanalyseResultat: import("@/integrations/ai/byggeanalyse").ByggeanalyseResultat | null;
  vurderingData: VurData | null;
};

export function parseComplianceData(v: unknown): ParsedComplianceData | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  return {
    bbr: (typeof o.bbr === "object" ? o.bbr : null) as BbrKompliantData | null,
    flags: Array.isArray(o.flags) ? (o.flags as ComplianceFlag[]) : [],
    lokalplaner: Array.isArray(o.lokalplaner) ? (o.lokalplaner as Lokalplan[]) : [],
    kommuneplanramme: (typeof o.kommuneplanramme === "object"
      ? o.kommuneplanramme
      : null) as Kommuneplanramme | null,
    byggeanalyseResultat: (typeof o.byggeanalyseResultat === "object"
      ? o.byggeanalyseResultat
      : null) as import("@/integrations/ai/byggeanalyse").ByggeanalyseResultat | null,
    vurderingData: (typeof o.vurderingData === "object" ? o.vurderingData : null) as VurData | null,
  };
}
```

- [ ] **Step 2: Verify file compiles**

Run: `bunx tsc --noEmit`
Expected: No errors related to `project-state.ts` (other files will error until Task 4-6 update imports — that is expected).

---

### Task 2: Create `src/lib/compliance-flags.ts`

**Files:**

- Create: `src/lib/compliance-flags.ts`

- [ ] **Step 1: Create the file**

Copy `deriveComplianceFlags` verbatim from `src/lib/project-store.ts` lines 566–921 (end of file), then update its imports:

```typescript
// src/lib/compliance-flags.ts
// Pure function — no Zustand dependency. Derives ComplianceFlag[] from pipeline data.

import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Kommuneplanramme } from "@/integrations/plandata/client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import type { ComplianceFlag } from "@/types/project-state";

export function deriveComplianceFlags(
  bbr: BbrKompliantData | null,
  ramme: Kommuneplanramme | null,
  naturbeskyttelse?: NaturbeskyttelsesResultat | null,
  dkjord?: DkJordResultat | null,
  geusRisk?: GeusRiskData | null,
  ruleEngine?: RuleEngineResult | null,
  fjernvarme?: FjernvarmeResultat | null,
): ComplianceFlag[] {
  // Paste the full function body from project-store.ts lines 575–921 verbatim here.
  // Do not change any logic — this is a pure move.
}
```

The full body is at `src/lib/project-store.ts:575` through the end of the file. Copy every line inside the function body as-is.

- [ ] **Step 2: Verify file compiles**

Run: `bunx tsc --noEmit`
Expected: Only import errors in files that still point to `project-store` — no errors in `compliance-flags.ts` itself.

---

### Task 3: Write tests for `compliance-flags.ts`

**Files:**

- Create: `src/lib/compliance-flags.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from "bun:test";
import { deriveComplianceFlags } from "./compliance-flags";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Kommuneplanramme } from "@/integrations/plandata/client";

const baseBbr: BbrKompliantData = {
  byggeaar: "1980",
  bebygget_areal: 100,
  samlet_areal: 200,
  antal_etager: 2,
  anvendelseskode: "120",
  anvendelse_tekst: "Fritliggende enfamilieshus",
  grundareal: 600,
  bebyggelsesprocent: 17,
  beregning_mulig: true,
  fejl: null,
  mat_strandbeskyttelse: false,
  mat_fredskov: false,
  mat_klitfredning: false,
  fredet: false,
  varmeinstallation: null,
};

const baseRamme: Kommuneplanramme = {
  planid: "test",
  plannavn: "Testramme",
  plannr: "1.1.B",
  kommunenavn: "Testkommune",
  komnr: 101,
  bebygpct: 30,
  maxetager: 2,
  maxbygnhjd: 8.5,
  anvgen: 1,
  anvendelseGenerel: "Boligformål",
  fremtidigzonestatus: null,
  sforhold: null,
};

describe("deriveComplianceFlags", () => {
  it("returns empty array when bbr is null", () => {
    expect(deriveComplianceFlags(null, null)).toEqual([]);
  });

  it("returns ok bebyggelsesprocent flag when within limit", () => {
    const flags = deriveComplianceFlags(baseBbr, baseRamme);
    const flag = flags.find((f) => f.id === "bebyggelsesprocent");
    expect(flag?.status).toBe("ok");
  });

  it("returns blocker for strandbeskyttelse from MAT", () => {
    const bbr = { ...baseBbr, mat_strandbeskyttelse: true };
    const flags = deriveComplianceFlags(bbr, null);
    const flag = flags.find((f) => f.id === "mat-strandbeskyttelse");
    expect(flag?.status).toBe("blocker");
    expect(flag?.kilde).toBe("bbr");
  });

  it("returns blocker for fredskov from MAT", () => {
    const bbr = { ...baseBbr, mat_fredskov: true };
    const flags = deriveComplianceFlags(bbr, null);
    const flag = flags.find((f) => f.id === "mat-fredskov");
    expect(flag?.status).toBe("blocker");
  });

  it("returns blocker for fredet building", () => {
    const bbr = { ...baseBbr, fredet: true };
    const flags = deriveComplianceFlags(bbr, null);
    const flag = flags.find((f) => f.id === "bbr-fredet");
    expect(flag?.status).toBe("blocker");
    expect(flag?.dispensationMyndighed).toBe("Slots- og Kulturstyrelsen");
  });

  it("returns blocker when bebyggelsesprocent exceeds limit", () => {
    const bbr = { ...baseBbr, bebyggelsesprocent: 40 };
    const flags = deriveComplianceFlags(bbr, baseRamme);
    const flag = flags.find((f) => f.id === "bebyggelsesprocent");
    expect(flag?.status).toBe("blocker");
  });

  it("returns advarsel when no kommuneplanramme available", () => {
    const flags = deriveComplianceFlags(baseBbr, null);
    const flag = flags.find((f) => f.id === "bebyggelsesprocent");
    expect(flag?.status).toBe("advarsel");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bun test src/lib/compliance-flags.test.ts`
Expected: All 7 tests pass. If `BbrKompliantData` is missing a field (e.g., `mat_strandbeskyttelse`), check the actual type in `src/integrations/bbr/client.ts` and adjust the `baseBbr` fixture accordingly.

- [ ] **Step 3: Commit**

```bash
git add src/types/project-state.ts src/lib/compliance-flags.ts src/lib/compliance-flags.test.ts
git commit -m "feat(arch-264): add project-state.ts type module and compliance-flags.ts"
```

---

### Task 4: Strip `project-store.ts` to Zustand-only

**Files:**

- Modify: `src/lib/project-store.ts`

- [ ] **Step 1: Replace the file header — add imports from project-state.ts**

Replace the top of `project-store.ts` (lines 1–14) with:

```typescript
import { create } from "zustand";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { VurData } from "@/integrations/vur/client";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type {
  Address,
  ProjectData,
  PhaseName,
  PhaseStatus,
  HusDna,
  Byggeoenske,
  DesignPlacement,
  ComplianceFlag,
  BoligoenskeValidering,
  DataSourceStatus,
  DataSourceKind,
  PipelineServiceState,
  AdressePreCheckResultat,
} from "@/types/project-state";
export type {
  Address,
  ProjectData,
  PhaseName,
  PhaseStatus,
  HusDna,
  Byggeoenske,
  DesignPlacement,
  ComplianceFlag,
  BoligoenskeValidering,
  DataSourceStatus,
  DataSourceKind,
  PipelineServiceState,
  AdressePreCheckResultat,
} from "@/types/project-state";
export {
  DATA_SOURCE_LABELS,
  PIPELINE_SERVICE_STATE_LABELS,
  isHusDna,
  parseComplianceData,
  deriveSourceStatus,
} from "@/types/project-state";
export { deriveComplianceFlags } from "@/lib/compliance-flags";
```

**Note:** These re-exports are a one-way bridge for the route files that will be updated in Tasks 5–6. They keep the build green while we migrate consumers. The re-exports will be removed in ARCH-266 when the route no longer imports from project-store.

- [ ] **Step 2: Remove all type definitions from the file body**

Delete these sections from `project-store.ts` (they are now in `project-state.ts`):

- Lines 20–39: `Address` type
- Lines 45–52: `ProjectData` type
- Lines 58–60: `PhaseName`, `PhaseStatus`
- Lines 66–75: `HusDna` type
- Lines 81–114: `Byggeoenske` type
- Lines 120–135: `GeoJsonPolygon` + `DesignPlacement` types
- Lines 141–160: `ComplianceFlag` type
- Lines 166–172: `BoligoenskeValidering` type
- Lines 180–198: `DataSourceStatus`, `DataSourceKind`
- Lines 200–217: `DATA_SOURCE_LABELS` constant
- Lines 243–260: `PipelineServiceState`, `PIPELINE_SERVICE_STATE_LABELS`

- [ ] **Step 3: Remove all functions from the file body**

Delete these from `project-store.ts` (they are now in `project-state.ts` / `compliance-flags.ts`):

- `isHusDna` function (around line 488)
- `STALE_DAYS` constant (around line 499)
- `ParsedComplianceData` type + `parseComplianceData` function (around line 536)
- `deriveSourceStatus` function (around line 523)
- `deriveComplianceFlags` function (around line 566 — end of file)

- [ ] **Step 4: Update the State type to import AdressePreCheckResultat from project-state**

The `State` type internal to project-store.ts references `AdressePreCheckResultat`. It now comes from the import block added in Step 1 — no change needed to the State type definition itself.

- [ ] **Step 5: Run tsc to check**

Run: `bunx tsc --noEmit`
Expected: Errors only in files that haven't updated their imports yet (Tasks 5–6). No errors inside `project-store.ts` itself.

---

### Task 5: Update server and domain file imports

**Files:**

- Modify: `src/lib/pre-check-adresse.ts`
- Modify: `src/lib/reactive-compliance.ts`
- Modify: `src/lib/rule-engine/input-assembler.ts`
- Modify: `src/integrations/supabase/project-persistence.ts`
- Modify: `src/integrations/ai/byggeanalyse.ts`
- Modify: `src/integrations/ai/hus-dna-generator.ts`

- [ ] **Step 1: Update `src/lib/pre-check-adresse.ts`**

Change:

```typescript
import type { ComplianceFlag } from "@/lib/project-store";
```

To:

```typescript
import type { ComplianceFlag, AdressePreCheckResultat } from "@/types/project-state";
```

Remove the local `AdressePreCheckResultat` type definition from the file (lines 70–96 of pre-check-adresse.ts). Add at the top:

```typescript
export type { AdressePreCheckResultat } from "@/types/project-state";
```

This keeps external consumers of `pre-check-adresse.ts` working without changes.

- [ ] **Step 2: Update `src/lib/reactive-compliance.ts`**

Change:

```typescript
import { deriveComplianceFlags } from "@/lib/project-store";
import type { Byggeoenske, ComplianceFlag } from "@/lib/project-store";
```

To:

```typescript
import { deriveComplianceFlags } from "@/lib/compliance-flags";
import type { Byggeoenske, ComplianceFlag } from "@/types/project-state";
```

- [ ] **Step 3: Update `src/lib/rule-engine/input-assembler.ts`**

Change:

```typescript
import type { Byggeoenske, DesignPlacement } from "@/lib/project-store";
```

To:

```typescript
import type { Byggeoenske, DesignPlacement } from "@/types/project-state";
```

- [ ] **Step 4: Update `src/integrations/supabase/project-persistence.ts`**

Change:

```typescript
import type { Address, HusDna, ComplianceFlag, Byggeoenske } from "@/lib/project-store";
```

To:

```typescript
import type { Address, HusDna, ComplianceFlag, Byggeoenske } from "@/types/project-state";
```

- [ ] **Step 5: Update `src/integrations/ai/byggeanalyse.ts`**

Change:

```typescript
import type { Byggeoenske } from "@/lib/project-store";
```

To:

```typescript
import type { Byggeoenske } from "@/types/project-state";
```

- [ ] **Step 6: Update `src/integrations/ai/hus-dna-generator.ts`**

Change:

```typescript
import type { HusDna } from "@/lib/project-store";
```

To:

```typescript
import type { HusDna } from "@/types/project-state";
```

- [ ] **Step 7: Run tsc and verify server files are clean**

Run: `bunx tsc --noEmit`
Expected: No errors in any of the 6 files above. Remaining errors are in route/component files (fixed in Task 6).

---

### Task 6: Update component and route file imports

**Files:**

- Modify: `src/routes/__root.tsx`
- Modify: `src/routes/projekt.$id.cockpit.tsx`
- Modify: `src/routes/projekt.adresse.tsx`
- Modify: `src/routes/projekt.start.tsx`
- Modify: `src/routes/projekt.datacheck.tsx`
- Modify: `src/routes/projekt.teknik.tsx`
- Modify: `src/routes/projekt.udbud.tsx`
- Modify: `src/lib/byggeoenske-steps.ts`
- Modify: `src/lib/byggeoenske.ts`
- Modify: `src/lib/mock-data.ts`
- Modify: `src/components/cockpit/AiDesignHero.tsx`
- Modify: `src/components/cockpit/ComplianceFeed.tsx`
- Modify: `src/components/cockpit/CockpitStatusBar.tsx`
- Modify: `src/components/cockpit/DataSourceStatus.tsx`
- Modify: `src/components/cockpit/EjendomPanel.tsx`
- Modify: `src/components/cockpit/RisikoFeed.tsx`

- [ ] **Step 1: Update each file**

For each file listed, change every import from `@/lib/project-store` that imports **only types** (not `useProject`) to import from `@/types/project-state` instead.

Pattern: if the import is `import type { Foo, Bar } from "@/lib/project-store"` → change to `import type { Foo, Bar } from "@/types/project-state"`.

If the import mixes `useProject` with types:

```typescript
// Before
import { useProject, type Byggeoenske } from "@/lib/project-store";

// After — split into two lines
import { useProject } from "@/lib/project-store";
import type { Byggeoenske } from "@/types/project-state";
```

Special cases:

- `src/routes/__root.tsx`: change `isHusDna, parseComplianceData` imports to `@/types/project-state`
- `src/routes/projekt.$id.cockpit.tsx`: change `deriveComplianceFlags, parseComplianceData, deriveSourceStatus` to their new modules (they come from project-store re-exports today, but import them directly after this change):

  ```typescript
  import { deriveComplianceFlags } from "@/lib/compliance-flags";
  import { parseComplianceData, deriveSourceStatus } from "@/types/project-state";
  ```

- [ ] **Step 2: Run full verification**

Run: `bunx tsc --noEmit`
Expected: Zero errors.

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 3: Commit ARCH-264**

```bash
git add -p  # stage all modified files
git commit -m "feat(arch-264): migrate domain types to project-state.ts — server modules no longer import from project-store"
```

---

## Phase 2: ARCH-266 — Cockpit route decomposition

### Task 7: Create `src/lib/cockpit.functions.ts`

**Files:**

- Create: `src/lib/cockpit.functions.ts`

- [ ] **Step 1: Write the file**

Move `fetchCompliance` and `runByggeanalyse` verbatim from `src/routes/projekt.$id.cockpit.tsx` lines 76–137. Also move the `analysisInputSchema` and its import:

```typescript
// src/lib/cockpit.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import type { ComplianceResult } from "@/lib/analysis-orchestrator";
import type { ByggeanalyseInput, ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";

const analysisInputSchema = z.object({
  addressId: z.string().min(1),
  adgangsadresseid: z.string().nullable(),
  ejerlavskode: z.number().nullable(),
  matrikelnummer: z.string().nullable(),
  koordinater: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  grundareal: z.number().nullable(),
  projectId: z.string().nullable(),
  token: z.string().min(1),
});

export const fetchCompliance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => analysisInputSchema.parse(data))
  .handler(async ({ data }): Promise<ComplianceResult> => {
    return withAuth(data.token, async (userId) => {
      const { token: _token, ...analysisInput } = data;
      const { analyseAddress } = await import("@/lib/analysis-orchestrator");
      return analyseAddress({ ...analysisInput, userId });
    });
  });

export const runByggeanalyse = createServerFn({ method: "POST" })
  .inputValidator((data: ByggeanalyseInput & { token: string }) => {
    if (!data.token || typeof data.token !== "string") throw new Error("Token er påkrævet");
    return data;
  })
  .handler(async ({ data }): Promise<ByggeanalyseResultat> => {
    return withAuth(data.token, async () => {
      const { token: _token, ...analysisInput } = data;

      let ruleEngineResult: import("@/lib/rule-engine/types").RuleEngineResult | undefined;
      try {
        const { assembleRuleEngineInput } = await import("@/lib/rule-engine/input-assembler");
        const { runRuleEngine } = await import("@/lib/rule-engine/engine");
        const { input: ruleInput, missingFields } = assembleRuleEngineInput({
          bbr: analysisInput.bbr,
          kommuneplanramme: analysisInput.kommuneplanramme ?? null,
          lokalplaner: analysisInput.lokalplaner ?? [],
          lokalplanExtract: analysisInput.lokalplanExtract,
          naturbeskyttelse: analysisInput.naturbeskyttelse ?? null,
          geusRisk: analysisInput.geusRisk ?? null,
          servitutter: analysisInput.servitutter ?? null,
          terrain: analysisInput.terrain ?? null,
          fbbData: analysisInput.fbbData ?? null,
          dkjord: null,
          byggeoenske: analysisInput.byggeoenske,
          municipality: analysisInput.municipality ?? "",
          kommunekode: analysisInput.kommunekode ?? "",
        });
        ruleEngineResult = runRuleEngine(ruleInput, missingFields);
      } catch (e) {
        logger.warn(
          "[ByggeanalyseService] Regelkerne fejlede (ikke kritisk):",
          (e as Error).message,
        );
      }

      const { ByggeanalyseService } = await import("@/integrations/ai/byggeanalyse");
      return ByggeanalyseService.analyse({ ...analysisInput, ruleEngineResult });
    });
  });
```

- [ ] **Step 2: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors in `cockpit.functions.ts`.

---

### Task 8: Create `src/hooks/useCockpitRestore.ts`

**Files:**

- Create: `src/hooks/useCockpitRestore.ts`

- [ ] **Step 1: Write the hook**

Extract the restore `useEffect` from `src/routes/projekt.$id.cockpit.tsx` lines 527–670. The hook owns `restorePhase` state and all the async restore logic:

```typescript
// src/hooks/useCockpitRestore.ts
import { useState, useEffect } from "react";
import { useProject } from "@/lib/project-store";
import { parseComplianceData, deriveSourceStatus } from "@/types/project-state";
import { restoreProject } from "@/lib/project-sync";
import { logger } from "@/lib/logger";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { AnalysisSnapshot } from "./useCockpitAnalysis";

function routeMatchesAddress(
  currentAddress: { adresseid?: string | null; adgangsadresseid?: string | null } | null,
  routeAddressId: string,
) {
  return (
    !!currentAddress &&
    (currentAddress.adresseid === routeAddressId ||
      currentAddress.adgangsadresseid === routeAddressId)
  );
}

function objectField<T>(value: unknown, key: string): T | null {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "object" && field !== null ? (field as T) : null;
}

export { routeMatchesAddress, objectField };

export type RestorePhase = "pending" | "checked";

export function useCockpitRestore(params: {
  adresseId: string;
  searchProjectId: string | undefined;
  onSnapshotRestored: (snapshot: Partial<AnalysisSnapshot>) => void;
}): { restorePhase: RestorePhase } {
  const { adresseId, searchProjectId, onSnapshotRestored } = params;
  const address = useProject((s) => s.address);

  const [restorePhase, setRestorePhase] = useState<RestorePhase>(
    routeMatchesAddress(address, adresseId) ? "checked" : "pending",
  );

  useEffect(() => {
    if (routeMatchesAddress(address, adresseId)) {
      setRestorePhase("checked");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const pid = searchProjectId ?? null;
        const project = await restoreProject(pid, adresseId);
        if (cancelled) return;
        if (project?.address_full && (project?.address_adresseid || project?.address_bbr)) {
          const store = useProject.getState();
          store.setCurrentProjectId(project.id);
          const resolvedAdresseid = project.address_adresseid ?? project.address_bbr ?? adresseId;
          const resolvedAdgangsadresseid =
            project.address_bbr ?? project.address_adresseid ?? adresseId;
          store.setAddress({
            adresseid: resolvedAdresseid,
            adresse: project.address_full,
            postnr: project.address_postnr ?? "",
            postnrnavn: project.address_postnrnavn ?? "",
            kommune: project.address_kommune ?? "",
            kommunekode: "",
            matrikel: project.address_matrikel,
            adgangsadresseid: resolvedAdgangsadresseid,
            grundareal: project.grundareal_m2 ?? null,
            koordinater: (project.address_koordinater as { lat: number; lng: number } | null) ?? {
              lat: 0,
              lng: 0,
            },
            bbrId: null,
            ejerlavskode: project.address_ejerlavskode ?? null,
            matrikelnummer: project.address_matrikelnummer ?? null,
          });
          const cd = parseComplianceData(project.compliance_data);
          if (cd) {
            if (cd.bbr) store.setBbrData(cd.bbr);
            store.setComplianceFlags(cd.flags);
            store.setLokalplaner(cd.lokalplaner);
            if (cd.kommuneplanramme) store.setKommuneplanramme(cd.kommuneplanramme);
            if (cd.byggeanalyseResultat) store.setByggeanalyseResultat(cd.byggeanalyseResultat);
            if (cd.vurderingData) store.setVurderingData(cd.vurderingData);
            if (project.compliance_done) store.setComplianceDone(true);
          }
          const snapshot: Partial<AnalysisSnapshot> = {
            lokalplaner: cd?.lokalplaner ?? [],
            geusRisk: objectField<GeusRiskData>(project.compliance_data, "geusRisk"),
            servitutter: objectField<TinglysningResult>(project.compliance_data, "servitutter"),
            terrain: objectField<TerrainData>(project.compliance_data, "terrain"),
            fjernvarme: objectField<FjernvarmeResultat>(project.compliance_data, "fjernvarme"),
            naboer: objectField<NeighborBuildingData>(project.compliance_data, "naboer"),
            fbbData: objectField<FbbResultat>(project.compliance_data, "fbbData"),
            naturbeskyttelse: objectField<NaturbeskyttelsesResultat>(
              project.compliance_data,
              "naturbeskyttelse",
            ),
            dkjord: objectField<DkJordResultat>(project.compliance_data, "dkjord"),
          };
          onSnapshotRestored(snapshot);
          if (project.heritage_save_value != null)
            store.setHeritageSaveValue(project.heritage_save_value);
          if (project.is_fredet != null) store.setIsFredet(project.is_fredet);
          store.setHardStop(project.hard_stop ?? false, project.hard_stop_reason ?? null);
          const { setGrundareal, setBebyggetAreal, setBudgetEstimate, setBfeNr } =
            useProject.getState();
          if (project.grundareal_m2 != null) setGrundareal(project.grundareal_m2);
          if (project.bebygget_areal_m2 != null) setBebyggetAreal(project.bebygget_areal_m2);
          if (project.budget_estimate != null) setBudgetEstimate(project.budget_estimate);
          setBfeNr(project.bfe_nr ?? null);
          if (project.billedanalyse) {
            store.setBilledanalyse(
              project.billedanalyse as import("@/lib/billede-analyse-vocabulary").BilledeAnalyseResultat,
            );
          }
          if (project.hus_dna) {
            store.setHusDna(project.hus_dna as import("@/lib/project-store").HusDna);
          }
          const lastFetched = project.updated_at ?? null;
          const s = useProject.getState();
          store.setDataLastFetchedAt(lastFetched);
          store.setDataStatusBulk({
            bbr: deriveSourceStatus("bbr", s.bbrData, lastFetched),
            lokalplaner: deriveSourceStatus("lokalplaner", s.lokalplaner, lastFetched),
            kommuneplanramme: deriveSourceStatus(
              "kommuneplanramme",
              s.kommuneplanramme,
              lastFetched,
            ),
            fbb: deriveSourceStatus(
              "fbb",
              objectField(project.compliance_data, "fbbData"),
              lastFetched,
            ),
            naturbeskyttelse: deriveSourceStatus(
              "naturbeskyttelse",
              objectField(project.compliance_data, "naturbeskyttelse"),
              lastFetched,
            ),
            geusRisk: deriveSourceStatus(
              "geusRisk",
              objectField(project.compliance_data, "geusRisk"),
              lastFetched,
            ),
            servitutter: deriveSourceStatus(
              "servitutter",
              objectField(project.compliance_data, "servitutter"),
              lastFetched,
            ),
            terrain: deriveSourceStatus(
              "terrain",
              objectField(project.compliance_data, "terrain"),
              lastFetched,
            ),
            fjernvarme: deriveSourceStatus(
              "fjernvarme",
              objectField(project.compliance_data, "fjernvarme"),
              lastFetched,
            ),
            naboer: deriveSourceStatus(
              "naboer",
              objectField(project.compliance_data, "naboer"),
              lastFetched,
            ),
            vurdering: deriveSourceStatus("vurdering", s.vurderingData, lastFetched),
            byggeanalyse: deriveSourceStatus("byggeanalyse", s.byggeanalyseResultat, lastFetched),
            billedanalyse: deriveSourceStatus("billedanalyse", project.billedanalyse, lastFetched),
            husDna: deriveSourceStatus("husDna", project.hus_dna, lastFetched),
          });
        }
      } catch (e) {
        logger.warn("[Cockpit] restore-by-url fejlede:", (e as Error).message);
      } finally {
        if (!cancelled) setRestorePhase("checked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { restorePhase };
}
```

- [ ] **Step 2: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors in `useCockpitRestore.ts`.

---

### Task 9: Create `src/hooks/useCockpitAnalysis.ts`

**Files:**

- Create: `src/hooks/useCockpitAnalysis.ts`

- [ ] **Step 1: Write the hook and AnalysisSnapshot type**

Extract the analysis trigger `useEffect` from `src/routes/projekt.$id.cockpit.tsx` lines 708–859. Move the 10 local state vars into one `AnalysisSnapshot` object:

```typescript
// src/hooks/useCockpitAnalysis.ts
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useProject } from "@/lib/project-store";
import { deriveComplianceFlags } from "@/lib/compliance-flags";
import { syncPatch } from "@/lib/project-sync";
import { calculateComplianceMetrics } from "@/lib/compliance-engine";
import { fetchCompliance, runByggeanalyse } from "@/lib/cockpit.functions";
import { logger } from "@/lib/logger";
import type { Lokalplan } from "@/integrations/plandata/client";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import { routeMatchesAddress } from "./useCockpitRestore";

export type AnalysisSnapshot = {
  lokalplaner: Lokalplan[];
  geusRisk: GeusRiskData | null;
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  fjernvarme: FjernvarmeResultat | null;
  naboer: NeighborBuildingData | null;
  fbbData: FbbResultat | null;
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  dkjord: DkJordResultat | null;
};

type Status = "loading" | "done" | "error";

const EMPTY_SNAPSHOT: AnalysisSnapshot = {
  lokalplaner: [],
  geusRisk: null,
  servitutter: null,
  terrain: null,
  fjernvarme: null,
  naboer: null,
  fbbData: null,
  naturbeskyttelse: null,
  dkjord: null,
};

export function useCockpitAnalysis(params: {
  adresseId: string;
  restorePhase: "pending" | "checked";
  initialSnapshot?: Partial<AnalysisSnapshot>;
}): {
  status: Status;
  fetchError: string | null;
  analysisSnapshot: AnalysisSnapshot;
  isRecomputing: boolean;
  setSnapshotPatch: (patch: Partial<AnalysisSnapshot>) => void;
  triggerRefresh: () => void;
  runManualAnalyse: () => Promise<void>;
} {
  const { adresseId, restorePhase, initialSnapshot } = params;
  const navigate = useNavigate();
  const {
    address,
    bbrData,
    complianceDone,
    lokalplaner,
    byggeoenske,
    byggeanalyseResultat,
    setBbrData,
    setComplianceDone,
    setComplianceFlags,
    setComplianceMetrics,
    setLokalplaner,
    setLokalplanExtract,
    setPhase,
    setKommuneplanramme,
    setVurderingData,
    setByggeanalyseResultat,
  } = useProject();

  const [status, setStatus] = useState<Status>(
    routeMatchesAddress(address, adresseId) && bbrData ? "done" : "loading",
  );
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<AnalysisSnapshot>({
    ...EMPTY_SNAPSHOT,
    lokalplaner: routeMatchesAddress(useProject.getState().address, adresseId)
      ? useProject.getState().lokalplaner
      : [],
    ...initialSnapshot,
  });
  const analysisStartedRef = useRef(false);

  const setSnapshotPatch = useCallback((patch: Partial<AnalysisSnapshot>) => {
    setAnalysisSnapshot((prev) => ({ ...prev, ...patch }));
  }, []);

  const triggerRefresh = useCallback(() => {
    analysisStartedRef.current = false;
    setComplianceDone(false);
    setBbrData(null);
    setStatus("loading");
  }, [setBbrData, setComplianceDone]);

  const runManualAnalyse = useCallback(async () => {
    if (!bbrData || !address) return;
    setIsRecomputing(true);
    try {
      const { getSession } = await import("@/lib/auth");
      const session = await getSession();
      if (!session) {
        setIsRecomputing(false);
        return;
      }
      const state = useProject.getState();
      const { selectPrimaryLokalplanForPdf } = await import("@/integrations/plandata/selectors");
      const primaryLp = selectPrimaryLokalplanForPdf(state.lokalplaner);
      const lpNavn = primaryLp?.plannavn ?? primaryLp?.plannr ?? "Ukendt lokalplan";
      const analyse = await runByggeanalyse({
        data: {
          token: session.access_token,
          byggeoenske: state.byggeoenske,
          lokalplanExtract: state.lokalplanExtract,
          bbr: bbrData,
          lokalplanNavn: lpNavn,
          kommuneplanramme: state.kommuneplanramme,
          lokalplaner: state.lokalplaner,
          municipality: address.kommune ?? "",
          kommunekode: address.kommunekode ?? "",
        },
      });
      setByggeanalyseResultat(analyse);
      syncPatch({ byggeanalyseResultat: analyse });
    } catch (e) {
      logger.warn("[Cockpit] manuel AI-analyse fejlede:", e);
    } finally {
      setIsRecomputing(false);
    }
  }, [bbrData, address, setByggeanalyseResultat]);

  useEffect(() => {
    if (restorePhase !== "checked") return;
    const currentAddress = useProject.getState().address;

    if (bbrData && routeMatchesAddress(currentAddress, adresseId)) {
      if (analysisSnapshot.lokalplaner.length === 0 && lokalplaner.length > 0) {
        setSnapshotPatch({ lokalplaner });
      }
      setStatus("done");
      return;
    }

    if (!currentAddress?.adresseid) {
      navigate({ to: "/projekt/adresse" });
      return;
    }
    if (!routeMatchesAddress(currentAddress, adresseId)) {
      navigate({ to: "/projekt/adresse" });
      return;
    }
    if (analysisStartedRef.current) return;
    analysisStartedRef.current = true;

    (async () => {
      const { getSession, isGuest } = await import("@/lib/auth");
      const session = await getSession();

      if (!session) {
        const guest = isGuest();
        setFetchError(
          guest
            ? "Start fra adresse-trinnet som gæst for at hente grunddata."
            : "Login krævet - log ind for at hente analyse.",
        );
        setStatus("error");
        return;
      }

      fetchCompliance({
        data: {
          addressId: currentAddress.adresseid,
          adgangsadresseid: currentAddress.adgangsadresseid,
          ejerlavskode: currentAddress.ejerlavskode ?? null,
          matrikelnummer: currentAddress.matrikelnummer ?? null,
          koordinater: currentAddress.koordinater ?? null,
          grundareal: currentAddress.grundareal ?? null,
          projectId: useProject.getState().currentProjectId,
          token: session.access_token,
        },
      })
        .then(async (result) => {
          setBbrData(result.bbr);
          setLokalplaner(result.lokalplaner);
          setLokalplanExtract(result.lokalplanExtract);
          setKommuneplanramme(result.kommuneplanramme);
          setVurderingData(result.vurderingData ?? null);
          setSnapshotPatch({
            lokalplaner: result.lokalplaner,
            geusRisk: result.geusRisk ?? null,
            servitutter: result.servitutter ?? null,
            terrain: result.terrain ?? null,
            fjernvarme: result.fjernvarme ?? null,
            naboer: result.naboer ?? null,
            fbbData: result.fbbData ?? null,
            naturbeskyttelse: result.naturbeskyttelse ?? null,
            dkjord: result.dkjord ?? null,
          });
          const flags = deriveComplianceFlags(
            result.bbr,
            result.kommuneplanramme,
            result.naturbeskyttelse,
            result.dkjord,
            result.geusRisk,
          );
          setComplianceFlags(flags);
          setComplianceMetrics(calculateComplianceMetrics(result.bbr, result.kommuneplanramme));
          setComplianceDone(true);
          setPhase("hus-dna", "complete");
          setPhase("match", "complete");
          syncPatch({
            bbrData: result.bbr,
            complianceFlags: flags,
            lokalplaner: result.lokalplaner,
            kommuneplanramme: result.kommuneplanramme,
            naturbeskyttelse: result.naturbeskyttelse,
            dkjord: result.dkjord,
            geusRisk: result.geusRisk,
            servitutter: result.servitutter,
            terrain: result.terrain,
            naboer: result.naboer,
            fjernvarme: result.fjernvarme,
            fbbData: result.fbbData,
            byggeanalyseResultat: byggeanalyseResultat,
            vurderingData: result.vurderingData,
            complianceDone: true,
            currentStep: "byggeanalyse",
            analysisRunId: result.analysisRunId,
          });
          if (result.serviceStates) {
            useProject.setState({ serviceStates: result.serviceStates });
          }
          const nowIso = new Date().toISOString();
          const store = useProject.getState();
          store.setDataLastFetchedAt(nowIso);
          store.setDataStatusBulk({
            bbr: result.bbr ? "fresh" : "missing",
            lokalplaner: result.lokalplaner.length > 0 ? "fresh" : "missing",
            kommuneplanramme: result.kommuneplanramme ? "fresh" : "missing",
            fbb: result.fbbData ? "fresh" : "missing",
            naturbeskyttelse: result.naturbeskyttelse ? "fresh" : "missing",
            geusRisk: result.geusRisk ? "fresh" : "missing",
            servitutter: result.servitutter ? "fresh" : "missing",
            terrain: result.terrain ? "fresh" : "missing",
            fjernvarme: result.fjernvarme ? "fresh" : "missing",
            naboer: result.naboer ? "fresh" : "missing",
            vurdering: result.vurderingData ? "fresh" : "missing",
          });
          setStatus("done");
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error("[Compliance] pipeline fejlede:", msg);
          setFetchError(
            msg.startsWith("ArchAI: manglende") ? msg : "BBR-data kunne ikke hentes. Prøv igen.",
          );
          setStatus("error");
        });
    })();
  }, [
    adresseId,
    bbrData,
    complianceDone,
    lokalplaner,
    analysisSnapshot.lokalplaner.length,
    navigate,
    restorePhase,
    byggeanalyseResultat,
    setBbrData,
    setComplianceDone,
    setComplianceFlags,
    setComplianceMetrics,
    setKommuneplanramme,
    setLokalplanExtract,
    setLokalplaner,
    setPhase,
    setVurderingData,
    setSnapshotPatch,
  ]);

  return {
    status,
    fetchError,
    analysisSnapshot,
    isRecomputing,
    setSnapshotPatch,
    triggerRefresh,
    runManualAnalyse,
  };
}
```

- [ ] **Step 2: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors in `useCockpitAnalysis.ts`.

---

### Task 10: Write tests for `useCockpitRestore`

**Files:**

- Create: `src/hooks/useCockpitRestore.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock restoreProject before importing hook
const mockRestoreProject = mock(async () => null);
mock.module("@/lib/project-sync", () => ({
  restoreProject: mockRestoreProject,
  syncPatch: mock(() => {}),
}));

// Mock useProject store
const mockStoreState = {
  address: null as { adresseid: string; adgangsadresseid: string } | null,
  setCurrentProjectId: mock(() => {}),
  setAddress: mock(() => {}),
  setBbrData: mock(() => {}),
  setComplianceFlags: mock(() => {}),
  setLokalplaner: mock(() => {}),
  setKommuneplanramme: mock(() => {}),
  setByggeanalyseResultat: mock(() => {}),
  setVurderingData: mock(() => {}),
  setComplianceDone: mock(() => {}),
  setHeritageSaveValue: mock(() => {}),
  setIsFredet: mock(() => {}),
  setHardStop: mock(() => {}),
  setGrundareal: mock(() => {}),
  setBebyggetAreal: mock(() => {}),
  setBudgetEstimate: mock(() => {}),
  setBfeNr: mock(() => {}),
  setBilledanalyse: mock(() => {}),
  setHusDna: mock(() => {}),
  setDataLastFetchedAt: mock(() => {}),
  setDataStatusBulk: mock(() => {}),
  lokalplaner: [],
  kommuneplanramme: null,
  bbrData: null,
  vurderingData: null,
  byggeanalyseResultat: null,
};

mock.module("@/lib/project-store", () => ({
  useProject: Object.assign(
    (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState),
    { getState: () => mockStoreState },
  ),
}));

import { routeMatchesAddress, objectField } from "./useCockpitRestore";

describe("routeMatchesAddress", () => {
  it("returns false when address is null", () => {
    expect(routeMatchesAddress(null, "addr-1")).toBe(false);
  });

  it("returns true when adresseid matches", () => {
    expect(routeMatchesAddress({ adresseid: "addr-1", adgangsadresseid: "adg-1" }, "addr-1")).toBe(
      true,
    );
  });

  it("returns true when adgangsadresseid matches", () => {
    expect(routeMatchesAddress({ adresseid: "addr-1", adgangsadresseid: "adg-1" }, "adg-1")).toBe(
      true,
    );
  });

  it("returns false when neither matches", () => {
    expect(routeMatchesAddress({ adresseid: "addr-1", adgangsadresseid: "adg-1" }, "other")).toBe(
      false,
    );
  });
});

describe("objectField", () => {
  it("returns null for non-object", () => {
    expect(objectField("string", "key")).toBeNull();
  });

  it("returns null when field is not an object", () => {
    expect(objectField({ key: "value" }, "key")).toBeNull();
  });

  it("returns the object field when it is an object", () => {
    const inner = { x: 1 };
    expect(objectField({ key: inner }, "key")).toEqual(inner);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `bun test src/hooks/useCockpitRestore.test.ts`
Expected: All 7 tests pass.

- [ ] **Step 3: Commit hooks and server functions**

```bash
git add src/lib/cockpit.functions.ts src/hooks/useCockpitRestore.ts src/hooks/useCockpitAnalysis.ts src/hooks/useCockpitRestore.test.ts
git commit -m "feat(arch-266): extract cockpit server functions and analysis hooks"
```

---

### Task 11: Create `src/components/cockpit/FreeDesignCockpit.tsx`

**Files:**

- Create: `src/components/cockpit/FreeDesignCockpit.tsx`

- [ ] **Step 1: Write the file**

Move `FreeDesignCockpit`, `FreeByggeoenskeAccordion`, and `FreeBudgetEstimat` verbatim from `src/routes/projekt.$id.cockpit.tsx` lines 282–460. Add necessary imports at the top:

```typescript
// src/components/cockpit/FreeDesignCockpit.tsx
import { useProject } from "@/lib/project-store";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import { AiDesignHero } from "@/components/cockpit/AiDesignHero";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { estimerTotalpris, STEPS, STEP_GROUPS } from "@/lib/byggeoenske-steps";
```

Then paste `FreeDesignCockpit`, `FreeByggeoenskeAccordion`, and `FreeBudgetEstimat` function bodies unchanged.

Export all three:

```typescript
export { FreeDesignCockpit, FreeByggeoenskeAccordion, FreeBudgetEstimat };
```

- [ ] **Step 2: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors in `FreeDesignCockpit.tsx`.

---

### Task 12: Create `src/components/cockpit/AnalyseTab.tsx`

**Files:**

- Create: `src/components/cockpit/AnalyseTab.tsx`

- [ ] **Step 1: Write the file**

Move `AnalyseTab` and all display sub-components verbatim from `src/routes/projekt.$id.cockpit.tsx` lines 971–1739. The file needs:

```typescript
// src/components/cockpit/AnalyseTab.tsx
import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  ScrollText,
  Cpu,
  Check,
  AlertTriangle,
  Info,
  ExternalLink,
  Map,
  Sparkles,
  Flame,
} from "lucide-react";
import { Card } from "@/components/wizard-ui";
import { useCockpitMode } from "@/lib/use-cockpit-mode";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { AiDesignHero } from "@/components/cockpit/AiDesignHero";
import { AnimatedNumber } from "@/components/cockpit/AnimatedNumber";
import { DetailsAccordion, type DetailsSection } from "@/components/cockpit/DetailsAccordion";
import { RisikoFeed } from "@/components/cockpit/RisikoFeed";
import { CanvasWithGauges } from "@/components/cockpit/CanvasWithGauges";
import { DetailsDrawer } from "@/components/cockpit/DetailsDrawer";
import { StatusStripe } from "@/components/cockpit/StatusStripe";
import { cn } from "@/lib/utils";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan } from "@/integrations/plandata/client";
import type { ByggeanalyseResultat } from "@/integrations/ai/byggeanalyse";
import type { ComplianceMetrics } from "@/lib/compliance-engine";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
```

Then paste the full bodies of `LoadingView`, `ProgressRow`, `ErrorView`, `AnalyseTab`, `FjernvarmeSektion`, `NaboerSektion`, `ByggeanalyseKort`, `TerrainSektion`, `ServitutterSektion`, `GeusRisikoSektion`, `MetricCard`, and `genererVurdering` unchanged.

Add to the top of the file the `LOADING_ROWS` constant (currently at line 195–200 of the route file):

```typescript
const LOADING_ROWS = [
  { icon: FileText, label: "Henter BBR-data", durationMs: 800 },
  { icon: ScrollText, label: "Læser bygningsregister", durationMs: 1600 },
  { icon: Map, label: "Henter lokalplandata", durationMs: 2000 },
  { icon: Cpu, label: "Beregner compliance", durationMs: 2600 },
];
```

Export the publicly used components:

```typescript
export { LoadingView, ErrorView, AnalyseTab };
```

- [ ] **Step 2: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors in `AnalyseTab.tsx`.

---

### Task 13: Slim the cockpit route file

**Files:**

- Modify: `src/routes/projekt.$id.cockpit.tsx`

- [ ] **Step 1: Remove moved code and update imports**

The final cockpit route file should contain only:

1. Imports (updated — no more `createServerFn`, `z`, `withAuth` — those are in `cockpit.functions.ts`)
2. `HardStopBanner` (keep inline — 25 lines)
3. `CockpitTab` type + `VALID_TABS` — keep. Delete `routeMatchesAddress` and `objectField` inline (now in `useCockpitRestore`).
4. `Route` definition
5. `CockpitPage` — auth check, verbatim from original (uses `useEffect`, `navigate`, `import.meta.env.DEV`)
6. `CockpitContent` — slimmed to compose the two hooks and render

Replace the full file with:

```typescript
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useRef } from "react";
import { XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useProject } from "@/lib/project-store";
import { CockpitStatusBar } from "@/components/cockpit/CockpitStatusBar";
import { PageTransition, Card } from "@/components/wizard-ui";
import { BackLink } from "@/components/wizard-chrome";
import { FreeDesignCockpit } from "@/components/cockpit/FreeDesignCockpit";
import { AnalyseTab, LoadingView, ErrorView } from "@/components/cockpit/AnalyseTab";
import { EjendomPanel } from "@/components/cockpit/EjendomPanel";
import { OekonomiPanel } from "@/components/cockpit/OekonomiPanel";
import { useCockpitRestore } from "@/hooks/useCockpitRestore";
import { useCockpitAnalysis } from "@/hooks/useCockpitAnalysis";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

type CockpitTab = "analyse" | "ejendom" | "oekonomi";
const VALID_TABS: readonly CockpitTab[] = ["analyse", "ejendom", "oekonomi"];

export const Route = createFileRoute("/projekt/$id/cockpit")({
  component: CockpitPage,
  validateSearch: (search: Record<string, unknown>) => {
    const tab = search.tab;
    const projectId = search.projectId;
    return {
      tab:
        typeof tab === "string" && (VALID_TABS as readonly string[]).includes(tab)
          ? (tab as CockpitTab)
          : ("analyse" as CockpitTab),
      projectId: typeof projectId === "string" && projectId.trim() ? projectId : undefined,
    };
  },
});

// ---------------------------------------------------------------------------
// HardStopBanner
// ---------------------------------------------------------------------------

function HardStopBanner() {
  const { hard_stop, hard_stop_reason } = useProject();
  if (!hard_stop) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-3">
      <XCircle size={14} className="mt-0.5 shrink-0 text-danger" />
      <div className="text-xs leading-relaxed text-danger/90">
        <span className="font-mono tracking-[0.1em] text-danger">HARD STOP</span>
        <div className="mt-1">{hard_stop_reason ?? "Matriklen har et blokerende forhold."}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth wrapper — verbatim from original CockpitPage lines 208–275
// ---------------------------------------------------------------------------

function CockpitPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getSession, isGuest } = await import("@/lib/auth");
      const session = await getSession();
      if (cancelled) return;
      setNeedsLogin(!session && !isGuest());
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (authChecked && needsLogin) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-[560px] px-6 py-16">
          <div className="mb-6">
            <BackLink to="/projekt/adresse" />
          </div>
          <Card className="text-center">
            <div className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground mb-3">
              LOGIN PÅKRÆVET
            </div>
            <h2 className="text-xl text-foreground mb-2">Cockpit kræver konto</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Vi henter data fra BBR og Plandata til din analyse. Opret en gratis konto for at
              fortsætte.
            </p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground hover:brightness-110 transition-all"
            >
              Log ind eller opret konto →
            </button>
            {import.meta.env.DEV && (
              <button
                onClick={() => setNeedsLogin(false)}
                className="mt-3 w-full inline-flex items-center justify-center rounded-md border border-dashed border-accent/40 bg-accent/5 px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-accent hover:bg-accent/10 transition-colors"
              >
                ⚡ DEV: Spring login over
              </button>
            )}
          </Card>
        </div>
      </PageTransition>
    );
  }

  if (!authChecked) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
          <div className="font-mono text-xs text-muted-foreground">Tjekker login...</div>
        </div>
      </PageTransition>
    );
  }

  if (id === "frit") return <FreeDesignCockpit />;
  return <CockpitContent adresseId={id} />;
}

// ---------------------------------------------------------------------------
// Cockpit content
// ---------------------------------------------------------------------------

function CockpitContent({ adresseId }: { adresseId: string }) {
  const navigate = useNavigate();
  const { tab: activeTab, projectId: searchProjectId } = Route.useSearch();
  const setActiveTab = useCallback(
    (next: CockpitTab) => {
      navigate({
        to: "/projekt/$id/cockpit",
        params: { id: adresseId },
        search: { tab: next, projectId: searchProjectId },
        replace: false,
      });
    },
    [navigate, adresseId, searchProjectId],
  );

  const { address, bbrData, complianceMetrics, vurderingData } = useProject();

  // useRef breaks the dependency cycle: useCockpitRestore fires onSnapshotRestored
  // after mount, but useCockpitAnalysis.setSnapshotPatch is only available after
  // useCockpitAnalysis has been called. The ref is assigned synchronously each render.
  const setSnapshotPatchRef = useRef<((p: Partial<import("@/hooks/useCockpitAnalysis").AnalysisSnapshot>) => void) | null>(null);

  const { restorePhase } = useCockpitRestore({
    adresseId,
    searchProjectId,
    onSnapshotRestored: (patch) => setSnapshotPatchRef.current?.(patch),
  });

  const {
    status,
    fetchError,
    analysisSnapshot,
    isRecomputing,
    setSnapshotPatch,
    triggerRefresh,
    runManualAnalyse,
  } = useCockpitAnalysis({ adresseId, restorePhase });

  // Wire the ref so restore callbacks reach the analysis hook's state updater.
  setSnapshotPatchRef.current = setSnapshotPatch;

  return (
    <PageTransition>
      <div className={`mx-auto px-6 py-10 ${status === "done" ? "max-w-[1400px]" : "max-w-[720px]"}`}>
        <div className="mb-6"><BackLink to="/projekt/adresse" /></div>

        {status === "loading" && <LoadingView />}

        {status === "error" && (
          <ErrorView
            message={fetchError ?? "Ukendt fejl."}
            onRetry={() => {
              triggerRefresh();
            }}
          />
        )}

        {status === "done" && bbrData && (
          <>
            <CockpitStatusBar onRefreshAll={triggerRefresh} isRefreshing={false} />
            <HardStopBanner />

            <div className="flex gap-1 mb-6 border-b border-border/40">
              {(
                [
                  { id: "analyse", label: "ANALYSE" },
                  { id: "ejendom", label: "EJENDOM" },
                  { id: "oekonomi", label: "ØKONOMI" },
                ] as { id: CockpitTab; label: string }[]
              ).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "relative px-4 py-2 font-mono text-[11px] tracking-[0.15em] transition-colors -mb-px",
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab.label}
                    {isActive && (
                      <motion.span
                        layoutId="cockpit-tab-underline"
                        className="absolute inset-x-0 -bottom-px h-[2px] bg-accent"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {activeTab === "analyse" && (
                <AnalyseTab
                  adresse={address?.adresse ?? ""}
                  data={bbrData}
                  lokalplaner={analysisSnapshot.lokalplaner}
                  byggeanalyse={useProject.getState().byggeanalyseResultat}
                  metrics={complianceMetrics}
                  fbbData={analysisSnapshot.fbbData}
                  vurderingData={vurderingData}
                  geusRisk={analysisSnapshot.geusRisk}
                  servitutter={analysisSnapshot.servitutter}
                  terrain={analysisSnapshot.terrain}
                  fjernvarme={analysisSnapshot.fjernvarme}
                  naboer={analysisSnapshot.naboer}
                  naturbeskyttelse={analysisSnapshot.naturbeskyttelse}
                  dkjord={analysisSnapshot.dkjord}
                  isRecomputing={isRecomputing}
                  onRunAnalyse={runManualAnalyse}
                  onShowEjendom={() => setActiveTab("ejendom")}
                  onShowOekonomi={() => setActiveTab("oekonomi")}
                />
              )}
              {activeTab === "ejendom" && <EjendomPanel />}
              {activeTab === "oekonomi" && <OekonomiPanel />}
            </motion.div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
```

**Note:** The `CockpitPage` auth check uses `useState` with an initializer for the async check — preserve the original `useEffect` pattern from the source. Adjust if TypeScript flags it.

- [ ] **Step 2: Check the route file is under 400 lines**

Run: `wc -l src/routes/projekt.\$id.cockpit.tsx`
Expected: Under 400. If over, check which sections are still duplicated and remove them.

- [ ] **Step 3: Remove re-exports added in Task 4**

Now that the cockpit route no longer imports `deriveComplianceFlags`, `parseComplianceData`, `deriveSourceStatus`, or `isHusDna` from `project-store`, remove those re-exports from `src/lib/project-store.ts`:

Delete these lines:

```typescript
export {
  DATA_SOURCE_LABELS,
  PIPELINE_SERVICE_STATE_LABELS,
  isHusDna,
  parseComplianceData,
  deriveSourceStatus,
} from "@/types/project-state";
export { deriveComplianceFlags } from "@/lib/compliance-flags";
```

Keep only the `export type { ... }` block for types (these are still needed for components that import types via project-store).

- [ ] **Step 4: Run full verification**

Run: `bunx tsc --noEmit`
Expected: Zero errors.

Run: `bun test`
Expected: All tests pass.

Run: `bun build`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Final commit**

```bash
git add src/routes/projekt.\$id.cockpit.tsx src/components/cockpit/FreeDesignCockpit.tsx src/components/cockpit/AnalyseTab.tsx src/lib/project-store.ts
git commit -m "feat(arch-266): decompose cockpit route — server fns, restore/analysis hooks, AnalyseTab component"
```

---

### Task 14: Mark Linear issues done

- [ ] **Step 1: Mark ARCH-264 done in Linear**

The Linear issue is ARCH-264. Mark it Done.

- [ ] **Step 2: Mark ARCH-266 done in Linear**

The Linear issue is ARCH-266. Mark it Done.

- [ ] **Step 3: Run bun dev and manually verify cockpit loads**

Run: `bun dev`

Navigate to the cockpit route in a browser. Verify:

- Loading spinner appears on first visit
- Compliance data loads and renders
- Tab navigation (ANALYSE / EJENDOM / ØKONOMI) works
- Hard stop banner appears if applicable
- No console errors related to missing imports
