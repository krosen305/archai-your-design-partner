# Backend Sanitation: ARCH-274 + ARCH-261 + ARCH-265 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three sequential refactors: remove duplicate hard-stop logic from `building-platform.ts` (ARCH-274), decompose `analysis-orchestrator.ts` into focused step modules (ARCH-261), and replace scattered `console.warn/error` with the typed `logServerEvent` helper (ARCH-265).

**Architecture:** ARCH-274 adds a Zod schema for JSONB byggeoenske parsing and unit tests proving hard-stop consistency. ARCH-261 extracts six layer-step modules into `src/lib/analysis/` and rewrites the orchestrator as a thin coordinator that imports `DataSourceKind`/`PipelineServiceState` from `@/types/project-state` (not `project-store`). ARCH-265 migrates all remaining `console.warn`/`console.error` calls in integration clients to the structured `logServerEvent` helper.

**Tech Stack:** Bun test, Zod (already in project), TypeScript strict, TanStack Start (Cloudflare Workers), Supabase.

**Protected files:** `src/lib/analysis-orchestrator.ts` — mark PR with `🔒 Rører beskyttet fil — kræver review`.

---

## File Map

### ARCH-274 — building-platform hard-stop tests + Zod schema

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/types/building-platform.test.ts` | Unit tests for `hasAbsoluteHardStop`, `getSaveHardStop`, `getDesignAreaM2` |
| Create | `src/lib/design-iteration-parsers.ts` | Zod schema for `DesignIteration.byggeoenske` JSONB |
| Modify | `src/types/building-platform.ts` | Use `parseByggeoenskePayload` in `getDesignAreaM2` / `getDesignFloors` |

### ARCH-261 — orchestrator decomposition

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/lib/analysis/address-enrichment.ts` | DAR address enrichment step |
| Create | `src/lib/analysis/layer1-analysis.ts` | Cache-first BBR + Plandata + VUR |
| Create | `src/lib/analysis/hard-stop-gate.ts` | Pure predicate: should expensive Layer 4 be skipped? |
| Create | `src/lib/analysis/lokalplan-extraction-step.ts` | Layer 2: PDF extraction + cache |
| Create | `src/lib/analysis/servitut-step.ts` | Layer 3: Tinglysning + cache |
| Create | `src/lib/analysis/geo-risk-step.ts` | Layer 4: naturbeskyttelse, dkjord, geus, terrain, naboer, fjernvarme, FBB, matGeometri |
| Create | `src/lib/analysis/hard-stop-gate.test.ts` | Unit test for skip predicate |
| Modify | `src/lib/analysis-orchestrator.ts` | Thin coordinator; fix project-store imports |

### ARCH-265 — replace console.warn/error

| Action | Path | # calls |
|--------|------|---------|
| Modify | `src/integrations/ai/billede-analyse.ts` | 2 warn |
| Modify | `src/integrations/ai/hus-dna-generator.ts` | 2 warn |
| Modify | `src/integrations/ai/pdf-extractor.ts` | 2 warn |
| Modify | `src/integrations/bbr/client.ts` | 3 error |
| Modify | `src/integrations/dar/client.ts` | 2 error + 2 warn |
| Modify | `src/integrations/ebr/client.ts` | 4 error |
| Modify | `src/integrations/fbb/client.ts` | 2 warn |
| Modify | `src/integrations/geus/client.ts` | 2 warn |
| Modify | `src/integrations/mat/client.ts` | 3 error |
| Modify | `src/integrations/mat/grundareal-resolver.ts` | 2 warn |
| Modify | `src/integrations/plandata/client.ts` | 2 error |
| Modify | `src/integrations/plandata/fjernvarme.ts` | 1 warn |
| Modify | `src/integrations/tinglysning/client.ts` | 3 warn |
| Modify | `src/integrations/vur/client.ts` | 1 error |
| Create | `src/lib/server-logger.test.ts` | Test degraded/fatal paths |

---

## Phase 1: ARCH-274 — building-platform Zod schema + tests

### Task 1: Write failing tests for building-platform hard-stop helpers

**Files:**
- Create: `src/types/building-platform.test.ts`

- [ ] **Step 1.1: Create the test file**

```typescript
// src/types/building-platform.test.ts
import { describe, test, expect } from "bun:test";
import { hasAbsoluteHardStop, getSaveHardStop, getDesignAreaM2, getDesignFloors } from "./building-platform";
import type { SiteConstraints, DesignIteration } from "./building-platform";

function mockSC(overrides: Partial<SiteConstraints> = {}): SiteConstraints {
  return {
    id: "sc-1",
    created_at: new Date().toISOString(),
    address_id: "adr-1",
    confidence: "confirmed",
    grundareal: 800,
    bebyggelsesprocent_max: 30,
    max_etager: 2,
    max_bygningshojde_m: 8.5,
    zone: "byzone",
    lokalplan_id: null,
    kommuneplan_id: null,
    save_value: null,
    is_fredet: null,
    strandbeskyttelse: null,
    fredskov: null,
    klitfredning: null,
    skovbyggelinje: null,
    kirkebeskyttelse: null,
    soe_aa_beskyttelse: null,
    geoteknik: null,
    radon_risiko: null,
    jordforurening: null,
    dkjord_v1: null,
    dkjord_v2: null,
    omraadeklassificering: null,
    ...overrides,
  } as SiteConstraints;
}

function mockDI(overrides: Partial<DesignIteration> = {}): DesignIteration {
  return {
    id: "di-1",
    created_at: new Date().toISOString(),
    project_id: "proj-1",
    is_active: true,
    area_m2: null,
    floors: null,
    byggeoenske: null,
    ...overrides,
  } as unknown as DesignIteration;
}

describe("hasAbsoluteHardStop", () => {
  test("SAVE 1 → true", () => {
    expect(hasAbsoluteHardStop(mockSC({ save_value: 1 }))).toBe(true);
  });
  test("SAVE 3 → true", () => {
    expect(hasAbsoluteHardStop(mockSC({ save_value: 3 }))).toBe(true);
  });
  test("SAVE 4 → false (warning only)", () => {
    expect(hasAbsoluteHardStop(mockSC({ save_value: 4 }))).toBe(false);
  });
  test("SAVE null → false", () => {
    expect(hasAbsoluteHardStop(mockSC({ save_value: null }))).toBe(false);
  });
  test("is_fredet true → true", () => {
    expect(hasAbsoluteHardStop(mockSC({ is_fredet: true }))).toBe(true);
  });
  test("strandbeskyttelse true → true", () => {
    expect(hasAbsoluteHardStop(mockSC({ strandbeskyttelse: true }))).toBe(true);
  });
  test("fredskov true → true", () => {
    expect(hasAbsoluteHardStop(mockSC({ fredskov: true }))).toBe(true);
  });
  test("no constraints → false", () => {
    expect(hasAbsoluteHardStop(mockSC())).toBe(false);
  });
});

describe("getSaveHardStop", () => {
  test("SAVE 1 → dispensation_required", () => {
    const result = getSaveHardStop(mockSC({ save_value: 1 }));
    expect(result?.severity).toBe("dispensation_required");
  });
  test("SAVE 4 → warning", () => {
    const result = getSaveHardStop(mockSC({ save_value: 4 }));
    expect(result?.severity).toBe("warning");
  });
  test("SAVE 5 → null", () => {
    expect(getSaveHardStop(mockSC({ save_value: 5 }))).toBeNull();
  });
  test("SAVE null → null", () => {
    expect(getSaveHardStop(mockSC({ save_value: null }))).toBeNull();
  });
  test("result matches adapter evaluateHardStop violations", () => {
    // Prove consistency: getSaveHardStop must produce same rule as rule engine
    const result = getSaveHardStop(mockSC({ save_value: 2 }));
    expect(result?.rule).toBe("save_1_3_demolition");
  });
});

describe("getDesignAreaM2", () => {
  test("prefers area_m2 typed column", () => {
    expect(getDesignAreaM2(mockDI({ area_m2: 150 }))).toBe(150);
  });
  test("falls back to byggeoenske.bruttoAreal", () => {
    expect(getDesignAreaM2(mockDI({ byggeoenske: { bruttoAreal: 120 } as unknown as import("@/integrations/supabase/types").Json }))).toBe(120);
  });
  test("falls back to byggeoenske.bruttoareal (lowercase)", () => {
    expect(getDesignAreaM2(mockDI({ byggeoenske: { bruttoareal: 130 } as unknown as import("@/integrations/supabase/types").Json }))).toBe(130);
  });
  test("returns null when both are missing", () => {
    expect(getDesignAreaM2(mockDI())).toBeNull();
  });
  test("returns null when byggeoenske is non-object", () => {
    expect(getDesignAreaM2(mockDI({ byggeoenske: "invalid" as unknown as import("@/integrations/supabase/types").Json }))).toBeNull();
  });
});

describe("getDesignFloors", () => {
  test("prefers floors typed column", () => {
    expect(getDesignFloors(mockDI({ floors: 2 }))).toBe(2);
  });
  test("falls back to byggeoenske.etager", () => {
    expect(getDesignFloors(mockDI({ byggeoenske: { etager: 1 } as unknown as import("@/integrations/supabase/types").Json }))).toBe(1);
  });
  test("returns null when both missing", () => {
    expect(getDesignFloors(mockDI())).toBeNull();
  });
});
```

- [ ] **Step 1.2: Run tests — expect failures on getDesignAreaM2 non-object case (Zod not yet added)**

```bash
bun test src/types/building-platform.test.ts
```

Expected: Most pass. The `"invalid"` case may pass if the current `as Record<string, unknown>` cast returns undefined (which is falsy). Make a note of actual output before proceeding.

---

### Task 2: Add Zod schema for byggeoenske + update helpers

**Files:**
- Create: `src/lib/design-iteration-parsers.ts`
- Modify: `src/types/building-platform.ts`

- [ ] **Step 2.1: Create the Zod parser module**

```typescript
// src/lib/design-iteration-parsers.ts
import { z } from "zod";

const ByggeonkskePayloadSchema = z
  .object({
    bruttoAreal: z.number().optional(),
    bruttoareal: z.number().optional(),
    etager: z.number().optional(),
  })
  .passthrough()
  .nullable();

export type ByggeonkskePayload = z.infer<typeof ByggeonkskePayloadSchema>;

export function parseByggeoenskePayload(raw: unknown): ByggeonkskePayload | null {
  const result = ByggeonkskePayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}
```

- [ ] **Step 2.2: Update `getDesignAreaM2` and `getDesignFloors` in `building-platform.ts`**

Add the import at the top of `src/types/building-platform.ts` (after the existing imports):

```typescript
import { parseByggeoenskePayload } from "@/lib/design-iteration-parsers";
```

Replace `getDesignAreaM2`:

```typescript
export function getDesignAreaM2(di: DesignIteration): number | null {
  if (di.area_m2 !== null) return di.area_m2;
  const boe = parseByggeoenskePayload(di.byggeoenske);
  if (boe?.bruttoAreal !== undefined) return boe.bruttoAreal;
  if (boe?.bruttoareal !== undefined) return boe.bruttoareal;
  return null;
}
```

Replace `getDesignFloors`:

```typescript
export function getDesignFloors(di: DesignIteration): number | null {
  if (di.floors !== null) return di.floors;
  const boe = parseByggeoenskePayload(di.byggeoenske);
  if (boe?.etager !== undefined) return boe.etager;
  return null;
}
```

- [ ] **Step 2.3: Run tests — all should pass**

```bash
bun test src/types/building-platform.test.ts
```

Expected: All tests PASS.

- [ ] **Step 2.4: Type check**

```bash
bunx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2.5: Commit ARCH-274**

```bash
git add src/types/building-platform.ts src/types/building-platform.test.ts src/lib/design-iteration-parsers.ts
git commit -m "feat(arch-274): add Zod schema for byggeoenske parsing + hard-stop consistency tests"
```

---

## Phase 2: ARCH-261 — Decompose analysis-orchestrator

### Task 3: Fix project-store imports in orchestrator

The orchestrator currently references `DataSourceKind` and `PipelineServiceState` via inline `import("@/lib/project-store")` dynamic-type expressions. These types now live in `@/types/project-state`.

**Files:**
- Modify: `src/lib/analysis-orchestrator.ts`

- [ ] **Step 3.1: Replace the project-store dynamic import references**

In `src/lib/analysis-orchestrator.ts`, add a static import after the existing imports block:

```typescript
import type { DataSourceKind, PipelineServiceState } from "@/types/project-state";
```

Replace the `ComplianceResult.serviceStates` field type (currently at ~lines 87-93):

```typescript
// OLD:
serviceStates?: Partial<
    Record<
      import("@/lib/project-store").DataSourceKind,
      import("@/lib/project-store").PipelineServiceState
    >
  >;

// NEW:
serviceStates?: Partial<Record<DataSourceKind, PipelineServiceState>>;
```

Replace the `states` variable declaration (currently at ~lines 144-150):

```typescript
// OLD:
const states: Partial<
    Record<
      import("@/lib/project-store").DataSourceKind,
      import("@/lib/project-store").PipelineServiceState
    >
  > = {};

// NEW:
const states: Partial<Record<DataSourceKind, PipelineServiceState>> = {};
```

Remove the `(states as Record<string, unknown>)` casts on the `matGeometri` assignments (~lines 523-534) since `matGeometri` is in the updated `DataSourceKind`. Replace:

```typescript
// OLD:
(states as Record<string, unknown>).matGeometri = matGeoResult == null ? "error" : ...;
// OLD:
(states as Record<string, unknown>).matGeometri = "no_hit";

// NEW:
states.matGeometri = matGeoResult == null ? "error" : ...;
// NEW:
states.matGeometri = "no_hit";
```

- [ ] **Step 3.2: Type check**

```bash
bunx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/analysis-orchestrator.ts
git commit -m "fix(arch-261): import DataSourceKind/PipelineServiceState from project-state, not project-store"
```

---

### Task 4: Write failing test + extract `hard-stop-gate.ts`

**Files:**
- Create: `src/lib/analysis/hard-stop-gate.ts`
- Create: `src/lib/analysis/hard-stop-gate.test.ts`

- [ ] **Step 4.1: Write the test first**

```typescript
// src/lib/analysis/hard-stop-gate.test.ts
import { describe, test, expect } from "bun:test";
import { shouldSkipExpensiveLayer4 } from "./hard-stop-gate";
import type { BbrKompliantData } from "@/integrations/bbr/client";

function mockBbr(overrides: Partial<BbrKompliantData> = {}): BbrKompliantData {
  return {
    adgangsadresseid: "adr-1",
    grundareal: 800,
    bebyggetAreal: 120,
    fredet: false,
    mat_strandbeskyttelse: false,
    mat_fredskov: false,
    mat_klitfredning: false,
    save_value: null,
    jordstykke_lokal_id: null,
    alle_bbr_public_ids: [],
    ...overrides,
  } as BbrKompliantData;
}

describe("shouldSkipExpensiveLayer4", () => {
  test("null bbr → false (no data, do not skip)", () => {
    expect(shouldSkipExpensiveLayer4(null)).toBe(false);
  });
  test("no hard stop → false", () => {
    expect(shouldSkipExpensiveLayer4(mockBbr())).toBe(false);
  });
  test("fredet → true", () => {
    expect(shouldSkipExpensiveLayer4(mockBbr({ fredet: true }))).toBe(true);
  });
  test("mat_strandbeskyttelse → true", () => {
    expect(shouldSkipExpensiveLayer4(mockBbr({ mat_strandbeskyttelse: true }))).toBe(true);
  });
  test("mat_fredskov → true", () => {
    expect(shouldSkipExpensiveLayer4(mockBbr({ mat_fredskov: true }))).toBe(true);
  });
  test("mat_klitfredning → true", () => {
    expect(shouldSkipExpensiveLayer4(mockBbr({ mat_klitfredning: true }))).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run test — expect failure (module doesn't exist yet)**

```bash
bun test src/lib/analysis/hard-stop-gate.test.ts
```

Expected: FAIL — cannot find module.

- [ ] **Step 4.3: Create the module**

```typescript
// src/lib/analysis/hard-stop-gate.ts
import type { BbrKompliantData } from "@/integrations/bbr/client";

export function shouldSkipExpensiveLayer4(bbr: BbrKompliantData | null): boolean {
  if (!bbr) return false;
  return (
    bbr.fredet === true ||
    bbr.mat_strandbeskyttelse === true ||
    bbr.mat_fredskov === true ||
    bbr.mat_klitfredning === true
  );
}
```

- [ ] **Step 4.4: Run test — all pass**

```bash
bun test src/lib/analysis/hard-stop-gate.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/analysis/hard-stop-gate.ts src/lib/analysis/hard-stop-gate.test.ts
git commit -m "feat(arch-261): extract hard-stop skip gate as pure tested function"
```

---

### Task 5: Extract `address-enrichment.ts`

**Files:**
- Create: `src/lib/analysis/address-enrichment.ts`

- [ ] **Step 5.1: Create the module**

This module owns the DAR fallback that fills in missing `adgangsadresseid`, `ejerlavskode`, `matrikelnummer`, and `grundareal` when the client didn't prefetch them.

```typescript
// src/lib/analysis/address-enrichment.ts
// SERVER-SIDE ONLY.

import { logServerEvent } from "@/lib/server-logger";
import { traceStep } from "@/lib/analysis-tracing";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";

export type AddressFields = {
  adgangsadresseid: string;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  grundareal: number | null;
};

export async function enrichAddressDetails(
  addressId: string,
  initial: AddressFields,
  trace: AnalysisTraceContext,
): Promise<AddressFields> {
  const needsEnrichment = !initial.adgangsadresseid || initial.grundareal === null;
  if (!needsEnrichment) return initial;

  try {
    const { DarService } = await import("@/integrations/dar/client");
    const dar = await traceStep(
      trace,
      {
        eventType: "pipeline_step",
        phase: "address_enrichment",
        service: "DAR",
        operation: "getAddressDetails",
        inputSummary: `adresseid=${addressId}`,
      },
      () => DarService.getAddressDetails(addressId, undefined, trace),
      {
        outputSummary: (r) =>
          `grundareal=${r.grundareal ?? "null"} matrikel=${r.matrikelnummer ?? "null"} ejerlavskode=${r.ejerlavskode ?? "null"}`,
      },
    );
    return {
      adgangsadresseid: initial.adgangsadresseid || dar.adgangsadresseid,
      ejerlavskode: initial.ejerlavskode ?? dar.ejerlavskode,
      matrikelnummer: initial.matrikelnummer ?? dar.matrikelnummer,
      grundareal: initial.grundareal ?? dar.grundareal,
    };
  } catch (e) {
    logServerEvent({
      module: "address-enrichment",
      operation: "dar.getAddressDetails",
      severity: "degraded",
      message: "DAR opslag fejlede",
      error: e,
      trace,
    });
    return initial;
  }
}
```

- [ ] **Step 5.2: Type check**

```bash
bunx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5.3: Commit**

```bash
git add src/lib/analysis/address-enrichment.ts
git commit -m "feat(arch-261): extract address-enrichment step from orchestrator"
```

---

### Task 6: Extract `layer1-analysis.ts`

**Files:**
- Create: `src/lib/analysis/layer1-analysis.ts`

Layer 1 owns the cache-first BBR + Plandata + VUR fetch and writes back to the compliance cache.

- [ ] **Step 6.1: Create the module**

```typescript
// src/lib/analysis/layer1-analysis.ts
// SERVER-SIDE ONLY.

import {
  getCachedCompliance,
  setCachedCompliance,
} from "@/integrations/cache/client";
import { fetchBbrWithMat, fetchPlandata, fetchVurViaEbr } from "@/lib/compliance-layer1";
import { logServerEvent } from "@/lib/server-logger";
import { traceStep, recordAnalysisEvent } from "@/lib/analysis-tracing";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { VurData } from "@/integrations/vur/client";
import type { DataSourceKind, PipelineServiceState } from "@/types/project-state";

export type ComplianceBase = {
  bbr: BbrKompliantData | null;
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  analysedAt: string;
  vurderingData: VurData | null;
};

export type Layer1Result = {
  complianceBase: ComplianceBase;
  states: Partial<Record<DataSourceKind, PipelineServiceState>>;
};

export type Layer1Input = {
  addressId: string;
  adgangsadresseid: string;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  grundareal: number | null;
  koordinater: { lat: number; lng: number } | null;
};

export async function runLayer1Analysis(
  input: Layer1Input,
  trace: AnalysisTraceContext,
): Promise<Layer1Result> {
  const { addressId, adgangsadresseid, ejerlavskode, matrikelnummer, grundareal, koordinater } =
    input;
  const states: Partial<Record<DataSourceKind, PipelineServiceState>> = {};

  // Cache read
  try {
    const cached = await traceStep(
      trace,
      {
        eventType: "cache_read",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.compliance_result.read",
        inputSummary: `adresseid=${addressId}`,
      },
      () => getCachedCompliance(addressId),
      {
        cacheHit: (value) => !!value,
        outputSummary: (v) =>
          v ? `cache_hit=true bbr=${v.bbr ? "present" : "null"}` : "cache_hit=false",
      },
    );
    if (cached) {
      const canRecoverGrundareal =
        grundareal !== null || (ejerlavskode !== null && matrikelnummer !== null);
      if (cached.bbr?.grundareal === null && canRecoverGrundareal) {
        logServerEvent({
          module: "layer1-analysis",
          operation: "cache.compliance.stale_bypass",
          severity: "ignored",
          message: "Stale cache bypassed — grundareal mangler, genberegner",
          trace,
          metadata: { grundareal, ejerlavskode, matrikelnummer },
        });
      } else {
        states.bbr = "cache_hit";
        states.lokalplaner = "cache_hit";
        states.kommuneplanramme = "cache_hit";
        states.vurdering = "cache_hit";
        return { complianceBase: cached, states };
      }
    }
  } catch (e) {
    logServerEvent({
      module: "layer1-analysis",
      operation: "cache.compliance.read",
      severity: "degraded",
      message: "cache-læsning fejlede (behandles som cache-miss)",
      error: e,
      trace,
    });
  }

  // Live fetch
  const [bbrResult, plandataResult, vurderingResult] = await Promise.all([
    fetchBbrWithMat({ adgangsadresseid, adresseid: addressId, ejerlavskode, matrikelnummer, grundareal, trace }),
    fetchPlandata(koordinater, trace),
    fetchVurViaEbr(adgangsadresseid, trace),
  ]);

  states.bbr = bbrResult ? "success" : "no_hit";
  states.lokalplaner = plandataResult.lokalplaner.length > 0 ? "success" : "no_hit";
  states.kommuneplanramme = plandataResult.kommuneplanramme ? "success" : "no_hit";
  states.vurdering = vurderingResult ? "success" : "no_hit";

  await recordAnalysisEvent(trace, {
    eventType: "pipeline_step",
    phase: "layer1",
    service: "ComplianceLayer1",
    operation: "bbr_plandata_vur_parallel",
    status: "ok",
    outputSummary: [
      `grundareal=${bbrResult?.grundareal ?? "null"}`,
      `lokalplaner=${plandataResult.lokalplaner.length}`,
      `vurdering=${vurderingResult != null ? "present" : "null"}`,
    ].join(" "),
  });

  const complianceBase: ComplianceBase = {
    bbr: bbrResult,
    lokalplaner: plandataResult.lokalplaner,
    kommuneplanramme: plandataResult.kommuneplanramme,
    analysedAt: new Date().toISOString(),
    vurderingData: vurderingResult,
  };

  // Cache write (non-blocking — failure doesn't abort)
  try {
    await traceStep(
      trace,
      {
        eventType: "cache_write",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.compliance_result.write",
      },
      () =>
        setCachedCompliance(addressId, {
          ...complianceBase,
          lokalplanExtract: null,
          naturbeskyttelse: null,
          dkjord: null,
          geusRisk: null,
          servitutter: null,
          terrain: null,
          naboer: null,
          fjernvarme: null,
          fbbData: null,
          matGeometri: null,
        }),
    );
  } catch (e) {
    logServerEvent({
      module: "layer1-analysis",
      operation: "cache.compliance.write",
      severity: "degraded",
      message: "compliance-cache-skriv fejlede (returnerer resultat uncached)",
      error: e,
      trace,
    });
  }

  return { complianceBase, states };
}
```

- [ ] **Step 6.2: Type check**

```bash
bunx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6.3: Commit**

```bash
git add src/lib/analysis/layer1-analysis.ts
git commit -m "feat(arch-261): extract layer1-analysis (cache-first BBR+Plandata+VUR) step"
```

---

### Task 7: Extract `lokalplan-extraction-step.ts` and `servitut-step.ts`

**Files:**
- Create: `src/lib/analysis/lokalplan-extraction-step.ts`
- Create: `src/lib/analysis/servitut-step.ts`

- [ ] **Step 7.1: Create lokalplan-extraction-step.ts**

```typescript
// src/lib/analysis/lokalplan-extraction-step.ts
// SERVER-SIDE ONLY. Layer 2: PDF extraction with cache.

import {
  getCachedLokalplan,
  setCachedLokalplan,
} from "@/integrations/cache/client";
import { logServerEvent } from "@/lib/server-logger";
import { traceStep, recordAnalysisEvent } from "@/lib/analysis-tracing";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import type { Json } from "@/integrations/supabase/types";

export async function runLokalplanExtractionStep(
  addressId: string,
  primaryPdfUrl: string | null,
  trace: AnalysisTraceContext,
): Promise<LokalplanExtract | null> {
  try {
    const cached = await traceStep(
      trace,
      {
        eventType: "cache_read",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.lokalplan_extracted.read",
      },
      () => getCachedLokalplan(addressId, primaryPdfUrl ?? undefined),
      { cacheHit: (value) => !!value, metadata: { has_pdf_url: !!primaryPdfUrl } },
    );
    if (cached) return cached as unknown as LokalplanExtract;

    if (!primaryPdfUrl) {
      await recordAnalysisEvent(trace, {
        eventType: "pipeline_step",
        phase: "layer2",
        service: "Lokalplan",
        operation: "extract_lokalplan",
        status: "skipped",
        metadata: { reason: "missing_pdf_url" },
      });
      return null;
    }

    const { PdfExtractorService } = await import("@/integrations/ai/pdf-extractor");
    const extract = await traceStep(
      trace,
      {
        eventType: "api_call",
        phase: "layer2",
        service: "Anthropic/PDF",
        operation: "extract_lokalplan",
      },
      () => PdfExtractorService.extractLokalplan(primaryPdfUrl),
    );
    await traceStep(
      trace,
      {
        eventType: "cache_write",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.lokalplan_extracted.write",
      },
      () => setCachedLokalplan(addressId, primaryPdfUrl, extract as unknown as Json),
    );
    return extract;
  } catch (e) {
    logServerEvent({
      module: "lokalplan-extraction-step",
      operation: "layer2.extract_lokalplan",
      severity: "degraded",
      message: "lokalplan PDF-udtræk fejlede",
      error: e,
      trace,
    });
    return null;
  }
}
```

- [ ] **Step 7.2: Create servitut-step.ts**

```typescript
// src/lib/analysis/servitut-step.ts
// SERVER-SIDE ONLY. Layer 3: Tinglysning servitut extraction with cache.

import {
  getCachedServitut,
  setCachedServitut,
} from "@/integrations/cache/client";
import { logServerEvent } from "@/lib/server-logger";
import { traceStep } from "@/lib/analysis-tracing";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { Json } from "@/integrations/supabase/types";

export async function runServitutStep(
  addressId: string,
  ejerlavskode: number | null,
  matrikelnummer: string | null,
  trace: AnalysisTraceContext,
): Promise<TinglysningResult | null> {
  try {
    const cachedServitut = await traceStep(
      trace,
      {
        eventType: "cache_read",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.servitut_extracted.read",
      },
      () => getCachedServitut(addressId),
      { cacheHit: (value) => !!value },
    );
    if (cachedServitut) return cachedServitut as unknown as TinglysningResult;

    const { TinglysningService } = await import("@/integrations/tinglysning/client");
    const result = await traceStep(
      trace,
      {
        eventType: "api_call",
        phase: "layer3",
        service: "Tinglysning",
        operation: "getServitutter",
      },
      () => TinglysningService.getServitutter(addressId, ejerlavskode, matrikelnummer),
    );
    await traceStep(
      trace,
      {
        eventType: "cache_write",
        phase: "cache",
        service: "Supabase",
        operation: "address_analysis.servitut_extracted.write",
      },
      () => setCachedServitut(addressId, result as unknown as Json),
    );
    return result;
  } catch (e) {
    logServerEvent({
      module: "servitut-step",
      operation: "layer3.servitut_extract",
      severity: "degraded",
      message: "servitut-udtræk fejlede",
      error: e,
      trace,
    });
    return null;
  }
}
```

- [ ] **Step 7.3: Type check**

```bash
bunx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7.4: Commit**

```bash
git add src/lib/analysis/lokalplan-extraction-step.ts src/lib/analysis/servitut-step.ts
git commit -m "feat(arch-261): extract lokalplan-extraction-step and servitut-step"
```

---

### Task 8: Extract `geo-risk-step.ts`

**Files:**
- Create: `src/lib/analysis/geo-risk-step.ts`

This owns all of Layer 4: matGeometri, FBB, naturbeskyttelse, dkjord, geus, terrain, naboer, fjernvarme. The `skipExpensive` flag comes from `shouldSkipExpensiveLayer4`.

- [ ] **Step 8.1: Create the module**

```typescript
// src/lib/analysis/geo-risk-step.ts
// SERVER-SIDE ONLY. Layer 4: all geodata sources in parallel.

import { logServerEvent } from "@/lib/server-logger";
import { traceStep, recordAnalysisEvent } from "@/lib/analysis-tracing";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { MatParcelGeometryPayload } from "@/integrations/mat/geometry";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { DataSourceKind, PipelineServiceState } from "@/types/project-state";
import { summarizeSourceResult } from "@/lib/source-result";
import { getCachedJordstykkePolygon } from "@/integrations/cache/client";

export type GeoRiskInput = {
  addressId: string;
  koordinater: { lat: number; lng: number } | null;
  jordstykkeId: string | null;
  bygningIds: number[];
  grundareal: number | null;
  skipExpensive: boolean;
};

export type GeoRiskResult = {
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  dkjord: DkJordResultat | null;
  geusRisk: GeusRiskData | null;
  terrain: TerrainData | null;
  naboer: NeighborBuildingData | null;
  fjernvarme: FjernvarmeResultat | null;
  fbbData: FbbResultat | null;
  matGeometri: MatParcelGeometryPayload | null;
  states: Partial<Record<DataSourceKind, PipelineServiceState>>;
};

export async function runGeoRiskStep(
  input: GeoRiskInput,
  trace: AnalysisTraceContext,
): Promise<GeoRiskResult> {
  const { addressId, koordinater, jordstykkeId, bygningIds, grundareal, skipExpensive } = input;
  const states: Partial<Record<DataSourceKind, PipelineServiceState>> = {};

  let matGeometri: MatParcelGeometryPayload | null = null;
  let fbbData: FbbResultat | null = null;
  let naturbeskyttelse: NaturbeskyttelsesResultat | null = null;
  let dkjord: DkJordResultat | null = null;
  let geusRisk: GeusRiskData | null = null;
  let terrain: TerrainData | null = null;
  let naboer: NeighborBuildingData | null = null;
  let fjernvarme: FjernvarmeResultat | null = null;

  // MAT geometry: must run before parallel block — provides bbox25832 for naboer.
  if (jordstykkeId) {
    const matGeoResult = await traceStep(
      trace,
      {
        eventType: "api_call",
        phase: "layer4",
        service: "Datafordeler MAT WFS",
        operation: "MatGeometryService.getParcelGeometry",
        inputSummary: `jordstykkeId=${jordstykkeId}`,
      },
      () =>
        import("@/integrations/mat/geometry").then(({ MatGeometryService }) =>
          MatGeometryService.getParcelGeometry(jordstykkeId, grundareal),
        ),
      {
        outputSummary: (r) =>
          summarizeSourceResult(
            r,
            (d) => `area=${d.polygonAreaM2?.toFixed(0) ?? "null"} canonical=${d.hasCanonicalPolygon}`,
          ),
        metadata: (r) => ({ source: r.kilde, isMock: r.isMock, feature_count: r.rawFeatureCount }),
      },
    ).catch((e: Error) => {
      logServerEvent({
        module: "geo-risk-step",
        operation: "layer4.mat_geometry",
        severity: "degraded",
        message: "MatGeometryService fejlede",
        error: e,
        trace,
      });
      return null;
    });
    matGeometri = matGeoResult?.data ?? null;
    states.matGeometri =
      matGeoResult == null
        ? "error"
        : matGeoResult.status === "mock"
          ? "mock"
          : matGeoResult.status === "error"
            ? "error"
            : matGeoResult.data != null
              ? "success"
              : "no_hit";
  } else {
    states.matGeometri = "no_hit";
  }

  // FBB: always run — SAVE value needed even on hard-stop sites.
  if (bygningIds.length) {
    fbbData = await import("@/integrations/fbb/client")
      .then(({ FbbService }) =>
        traceStep(
          trace,
          { eventType: "api_call", phase: "layer4", service: "FBB WFS", operation: "getSaveData" },
          () => FbbService.getSaveData(bygningIds),
          { metadata: { building_ids_count: bygningIds.length } },
        ),
      )
      .catch((e: Error) => {
        logServerEvent({
          module: "geo-risk-step",
          operation: "layer4.fbb",
          severity: "degraded",
          message: "FBB fejlede",
          error: e,
          trace,
        });
        return null;
      });
  }

  if (skipExpensive) {
    await recordAnalysisEvent(trace, {
      eventType: "pipeline_step",
      phase: "layer4",
      service: "Orchestrator",
      operation: "skip_expensive_layer4",
      status: "skipped",
      metadata: { reason: "bbr_hard_stop" },
    });
    if (koordinater) {
      naturbeskyttelse = await import("@/integrations/sdfi/naturbeskyttelse")
        .then(({ NaturbeskyttelseService }) =>
          traceStep(
            trace,
            { eventType: "api_call", phase: "layer4", service: "DAI WFS", operation: "naturbeskyttelse.getTilstand" },
            () => NaturbeskyttelseService.getTilstand(koordinater),
          ),
        )
        .catch(() => null);
    }
    states.fbb = fbbData ? "success" : "no_hit";
    states.naturbeskyttelse = naturbeskyttelse ? "success" : "no_hit";
    states.geusRisk = "skipped";
    states.terrain = "skipped";
    states.servitutter = "mock";
    states.fjernvarme = "no_hit";
    return { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, fbbData, matGeometri, states };
  }

  if (koordinater) {
    const [natur, jord, geus, terr, nabo, varme] = await Promise.all([
      import("@/integrations/sdfi/naturbeskyttelse")
        .then(({ NaturbeskyttelseService }) =>
          traceStep(
            trace,
            { eventType: "api_call", phase: "layer4", service: "DAI WFS", operation: "naturbeskyttelse.getTilstand" },
            () => NaturbeskyttelseService.getTilstand(koordinater),
          ),
        )
        .catch((e: Error) => {
          logServerEvent({ module: "geo-risk-step", operation: "layer4.naturbeskyttelse", severity: "degraded", message: "naturbeskyttelse fejlede", error: e, trace });
          return null;
        }),
      import("@/integrations/miljoe/dkjord")
        .then(async ({ DkJordService }) => {
          const polygon = await getCachedJordstykkePolygon(addressId).catch(() => null);
          return traceStep(
            trace,
            { eventType: "api_call", phase: "layer4", service: "DK-Jord WFS", operation: "getTilstand", inputSummary: `koordinater=${koordinater.lat.toFixed(4)},${koordinater.lng.toFixed(4)} polygon=${polygon ? "yes" : "no"}` },
            () => DkJordService.getTilstand(koordinater, polygon),
            {
              outputSummary: (r) => summarizeSourceResult(r, (d) => `v1=${d.v1Kortlagt} v2=${d.v2Kortlagt}`),
              metadata: (r) => ({ source: r.kilde, isMock: r.isMock, feature_count: r.rawFeatureCount }),
            },
          );
        })
        .catch((e: Error) => {
          logServerEvent({ module: "geo-risk-step", operation: "layer4.dkjord", severity: "degraded", message: "DK-Jord fejlede", error: e, trace });
          return null;
        }),
      import("@/integrations/geus/client")
        .then(({ GeusService }) =>
          traceStep(
            trace,
            { eventType: "api_call", phase: "layer4", service: "GEUS", operation: "getRiskData" },
            () => GeusService.getRiskData(koordinater.lat, koordinater.lng),
          ),
        )
        .catch((e: Error) => {
          logServerEvent({ module: "geo-risk-step", operation: "layer4.geus", severity: "degraded", message: "GEUS fejlede", error: e, trace });
          return null;
        }),
      import("@/integrations/sdfi/dhm-client")
        .then(({ DhmService, bboxFromPoint }) => {
          const bbox = bboxFromPoint(koordinater.lat, koordinater.lng, grundareal);
          return traceStep(
            trace,
            { eventType: "api_call", phase: "layer4", service: "SDFI DHM", operation: "getTerrainData" },
            () => DhmService.getTerrainData(bbox, koordinater.lat, koordinater.lng),
          );
        })
        .catch((e: Error) => {
          logServerEvent({ module: "geo-risk-step", operation: "layer4.terrain", severity: "degraded", message: "DHM terrain fejlede", error: e, trace });
          return null;
        }),
      (async () => {
        const { createBboxAroundPoint } = await import("@/lib/map-proxy");
        const fallbackBboxRaw = createBboxAroundPoint(koordinater, 150);
        const fallbackBbox: [number, number, number, number] = [
          fallbackBboxRaw.minX,
          fallbackBboxRaw.minY,
          fallbackBboxRaw.maxX,
          fallbackBboxRaw.maxY,
        ];
        return import("@/integrations/geodanmark/client")
          .then(({ GeoDanmarkNaboService }) =>
            traceStep(
              trace,
              { eventType: "api_call", phase: "layer4", service: "GeoDanmark WFS", operation: "getNabobygninger", inputSummary: `hasParcelBbox=${!!matGeometri?.bbox25832}` },
              () => GeoDanmarkNaboService.getNabobygninger(matGeometri?.bbox25832 ?? null, fallbackBbox, null),
              {
                outputSummary: (r) => summarizeSourceResult(r, (d) => `count=${d.count} kilde=${d.kilde}`),
                metadata: (r) => ({ source: r.kilde, isMock: r.isMock, feature_count: r.rawFeatureCount }),
              },
            ),
          )
          .catch((e: Error) => {
            logServerEvent({ module: "geo-risk-step", operation: "layer4.geodanmark_naboer", severity: "degraded", message: "GeoDanmarkNaboService fejlede", error: e, trace });
            return null;
          });
      })(),
      import("@/integrations/plandata/fjernvarme")
        .then(({ FjernvarmeService }) =>
          traceStep(
            trace,
            { eventType: "api_call", phase: "layer4", service: "Plandata WFS", operation: "fjernvarme.getDaekning" },
            () => FjernvarmeService.getDaekning(koordinater),
          ),
        )
        .catch((e: Error) => {
          logServerEvent({ module: "geo-risk-step", operation: "layer4.fjernvarme", severity: "degraded", message: "FjernvarmeService fejlede", error: e, trace });
          return null;
        }),
    ]);

    naturbeskyttelse = natur;
    dkjord = jord?.data ?? null;
    states.dkjord = jord === null ? "error" : jord.isMock ? "mock" : jord.data != null ? "success" : "no_hit";
    geusRisk = geus;
    terrain = terr;
    naboer = nabo?.data ?? null;
    states.naboer = nabo == null ? "error" : nabo.status === "mock" ? "mock" : nabo.status === "error" ? "error" : nabo.data != null ? "success" : "no_hit";
    fjernvarme = varme;
  }

  states.fbb = fbbData ? "success" : "no_hit";
  states.naturbeskyttelse = naturbeskyttelse ? "success" : "no_hit";
  states.geusRisk = "mock";
  states.terrain = "mock";
  states.servitutter = "mock";
  states.fjernvarme = fjernvarme ? "success" : "no_hit";

  return { naturbeskyttelse, dkjord, geusRisk, terrain, naboer, fjernvarme, fbbData, matGeometri, states };
}
```

- [ ] **Step 8.2: Type check**

```bash
bunx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8.3: Commit**

```bash
git add src/lib/analysis/geo-risk-step.ts
git commit -m "feat(arch-261): extract geo-risk-step (Layer 4 geodata) from orchestrator"
```

---

### Task 9: Rewrite orchestrator as thin coordinator

**Files:**
- Modify: `src/lib/analysis-orchestrator.ts` (protected file — PR must include `🔒 Rører beskyttet fil — kræver review`)

Replace `analyseAddressWithTrace` with a thin coordinator that calls the extracted steps. The file keeps `ComplianceResult`, `AnalysisInput`, and `analyseAddress` public; `analyseAddressWithTrace` becomes a private coordinator.

- [ ] **Step 9.1: Rewrite the orchestrator**

Replace the full content of `src/lib/analysis-orchestrator.ts` with:

```typescript
// SERVER-SIDE ONLY – never import this from browser code.
//
// Cache-first orchestrator for address analysis (ARCH-32: fuldt paralleliseret).
// Decomposed per ARCH-261: each pipeline layer lives in src/lib/analysis/.
//
// Current layer status:
//   compliance_result   ✅  BBR + MAT + Plandata pipeline (live)
//   lokalplan_extracted ✅  live Anthropic PDF-parsing (ARCH-53)
//   naturbeskyttelse    ✅  live DAI WFS — ARCH-65
//   dkjord              ⏳  IS_MOCK=true — ARCH-66
//   geus                ⏳  IS_MOCK=true — ARCH-101
//   servitut_extracted  ⏳  IS_MOCK=true — ARCH-30
//   terrain             ⏳  IS_MOCK=true — ARCH-102
//   naboer              ✅  live GeoDanmark WFS — ARCH-240
//   fjernvarme          ✅  live Plandata WFS — ARCH-111
//   fbbData             ✅  live FBB WFS — ARCH-29
//   report_text         ⏳  ARCH-27

import { validateEnv } from "@/lib/env";
validateEnv();

import type { BbrKompliantData } from "@/integrations/bbr/client";
import type { Lokalplan, Kommuneplanramme } from "@/integrations/plandata/client";
import type { LokalplanExtract } from "@/integrations/ai/pdf-extractor";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { NeighborBuildingData } from "@/integrations/bbr/neighbor-client";
import type { MatParcelGeometryPayload } from "@/integrations/mat/geometry";
import type { FjernvarmeResultat } from "@/integrations/plandata/fjernvarme";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { RuleEngineResult } from "@/lib/rule-engine/types";
import type { VurData } from "@/integrations/vur/client";
import type { DataSourceKind, PipelineServiceState } from "@/types/project-state";
import {
  finishAnalysisRun,
  startAnalysisRun,
  type AnalysisTraceContext,
} from "@/lib/analysis-tracing";
import { enrichAddressDetails } from "@/lib/analysis/address-enrichment";
import { runLayer1Analysis } from "@/lib/analysis/layer1-analysis";
import { shouldSkipExpensiveLayer4 } from "@/lib/analysis/hard-stop-gate";
import { runLokalplanExtractionStep } from "@/lib/analysis/lokalplan-extraction-step";
import { runServitutStep } from "@/lib/analysis/servitut-step";
import { runGeoRiskStep } from "@/lib/analysis/geo-risk-step";
import { selectPrimaryLokalplanForPdf } from "@/integrations/plandata/selectors";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ComplianceResult = {
  bbr: BbrKompliantData | null;
  lokalplaner: Lokalplan[];
  kommuneplanramme: Kommuneplanramme | null;
  analysedAt: string;
  lokalplanExtract: LokalplanExtract | null;
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  dkjord: DkJordResultat | null;
  geusRisk: GeusRiskData | null;
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  naboer: NeighborBuildingData | null;
  fjernvarme: FjernvarmeResultat | null;
  fbbData: FbbResultat | null;
  matGeometri: MatParcelGeometryPayload | null;
  vurderingData: VurData | null;
  ruleEngine?: RuleEngineResult;
  analysisRunId?: string | null;
  serviceStates?: Partial<Record<DataSourceKind, PipelineServiceState>>;
};

export type AnalysisInput = {
  addressId: string;
  adgangsadresseid: string;
  ejerlavskode: number | null;
  matrikelnummer: string | null;
  koordinater: { lat: number; lng: number } | null;
  grundareal?: number | null;
  projectId?: string | null;
  userId?: string | null;
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function analyseAddress(input: AnalysisInput): Promise<ComplianceResult> {
  const startedAt = Date.now();
  const trace = await startAnalysisRun({
    runKind: "full_analysis",
    projectId: input.projectId ?? null,
    addressId: input.addressId,
    userId: input.userId ?? null,
    source: "analyseAddress",
    metadata: {
      has_prefetched_grundareal: input.grundareal !== undefined && input.grundareal !== null,
      has_coordinates: !!input.koordinater,
    },
  });

  try {
    const result = await analyseAddressWithTrace(input, trace);
    await finishAnalysisRun(trace, "done", startedAt);
    return { ...result, analysisRunId: trace.runId };
  } catch (e) {
    await finishAnalysisRun(trace, "failed", startedAt, e);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Private coordinator — calls extracted layer steps
// ---------------------------------------------------------------------------

async function analyseAddressWithTrace(
  input: AnalysisInput,
  trace: AnalysisTraceContext,
): Promise<ComplianceResult> {
  // Step 1: Address enrichment (DAR fallback for missing fields)
  const enriched = await enrichAddressDetails(
    input.addressId,
    {
      adgangsadresseid: input.adgangsadresseid,
      ejerlavskode: input.ejerlavskode,
      matrikelnummer: input.matrikelnummer,
      grundareal: input.grundareal ?? null,
    },
    trace,
  );

  // Step 2: Layer 1 — cache-first BBR + Plandata + VUR
  const { complianceBase, states: layer1States } = await runLayer1Analysis(
    {
      addressId: input.addressId,
      adgangsadresseid: enriched.adgangsadresseid,
      ejerlavskode: enriched.ejerlavskode,
      matrikelnummer: enriched.matrikelnummer,
      grundareal: enriched.grundareal,
      koordinater: input.koordinater,
    },
    trace,
  );

  const states: Partial<Record<DataSourceKind, PipelineServiceState>> = { ...layer1States };

  // Steps 3 + 4 + 5: Layers 2, 3, 4 in parallel — no inter-dependencies
  const primaryLokalplan = selectPrimaryLokalplanForPdf(complianceBase.lokalplaner);
  const primaryPdfUrl = primaryLokalplan?.plandokumentLink ?? null;

  const [lokalplanExtract, servitutter, geoRisk] = await Promise.all([
    runLokalplanExtractionStep(input.addressId, primaryPdfUrl, trace),
    runServitutStep(input.addressId, enriched.ejerlavskode, enriched.matrikelnummer, trace),
    runGeoRiskStep(
      {
        addressId: input.addressId,
        koordinater: input.koordinater,
        jordstykkeId: complianceBase.bbr?.jordstykke_lokal_id ?? null,
        bygningIds: complianceBase.bbr?.alle_bbr_public_ids ?? [],
        grundareal: enriched.grundareal,
        skipExpensive: shouldSkipExpensiveLayer4(complianceBase.bbr),
      },
      trace,
    ),
  ]);

  Object.assign(states, geoRisk.states);

  return {
    ...complianceBase,
    lokalplanExtract,
    naturbeskyttelse: geoRisk.naturbeskyttelse,
    dkjord: geoRisk.dkjord,
    geusRisk: geoRisk.geusRisk,
    servitutter,
    terrain: geoRisk.terrain,
    naboer: geoRisk.naboer,
    fjernvarme: geoRisk.fjernvarme,
    fbbData: geoRisk.fbbData,
    matGeometri: geoRisk.matGeometri,
    vurderingData: complianceBase.vurderingData,
    serviceStates: states,
  };
}
```

- [ ] **Step 9.2: Type check**

```bash
bunx tsc --noEmit
```

Expected: 0 errors. Fix any type errors before proceeding.

- [ ] **Step 9.3: Run all tests**

```bash
bun test
```

Expected: All tests PASS. No regressions.

- [ ] **Step 9.4: Build check**

```bash
bun build
```

Expected: Build succeeds.

- [ ] **Step 9.5: Commit (mark as protected file)**

```bash
git add src/lib/analysis-orchestrator.ts src/lib/analysis/
git commit -m "feat(arch-261): 🔒 rewrite analysis-orchestrator as thin coordinator over layer step modules"
```

---

## Phase 3: ARCH-265 — Replace console.warn/error in integration files

### Task 10: Replace console calls in AI integration files

**Files:**
- Modify: `src/integrations/ai/billede-analyse.ts`
- Modify: `src/integrations/ai/hus-dna-generator.ts`
- Modify: `src/integrations/ai/pdf-extractor.ts`

All AI files follow the same pattern: `console.warn("[ServiceName] reason:", ...)`. Map to `logServerEvent` with `severity: "degraded"`.

- [ ] **Step 10.1: Add `logServerEvent` import to each AI file**

In each file, add at the top:
```typescript
import { logServerEvent } from "@/lib/server-logger";
```

- [ ] **Step 10.2: Replace in `billede-analyse.ts`**

Find and replace:
```typescript
// OLD (~line 81):
console.warn("[BilledeAnalyse] ANTHROPIC_API_KEY mangler — returnerer mock");
// NEW:
logServerEvent({ module: "billede-analyse", operation: "generate", severity: "degraded", message: "ANTHROPIC_API_KEY mangler — returnerer mock" });

// OLD (~line 88):
console.warn("[BilledeAnalyse] Haiku-kald fejlede — returnerer mock:", (e as Error).message);
// NEW:
logServerEvent({ module: "billede-analyse", operation: "generate", severity: "degraded", message: "Haiku-kald fejlede — returnerer mock", error: e });
```

- [ ] **Step 10.3: Replace in `hus-dna-generator.ts`**

```typescript
// OLD (~line 97):
console.warn("[HusDna] ANTHROPIC_API_KEY mangler — returnerer mock");
// NEW:
logServerEvent({ module: "hus-dna-generator", operation: "generate", severity: "degraded", message: "ANTHROPIC_API_KEY mangler — returnerer mock" });

// OLD (~line 104):
console.warn("[HusDna] Anthropic-kald fejlede — returnerer mock:", (e as Error).message);
// NEW:
logServerEvent({ module: "hus-dna-generator", operation: "generate", severity: "degraded", message: "Anthropic-kald fejlede — returnerer mock", error: e });
```

- [ ] **Step 10.4: Replace in `pdf-extractor.ts`**

```typescript
// OLD (~line 162):
console.warn("[PdfExtractor] ANTHROPIC_API_KEY mangler — returnerer mock");
// NEW:
logServerEvent({ module: "pdf-extractor", operation: "extractLokalplan", severity: "degraded", message: "ANTHROPIC_API_KEY mangler — returnerer mock" });

// OLD (~line 230):
console.warn(...);  // check exact message at that line
// NEW:
logServerEvent({ module: "pdf-extractor", operation: "extractLokalplan", severity: "degraded", message: "<exact message>", error: e });
```

- [ ] **Step 10.5: Type check**

```bash
bunx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 10.6: Commit**

```bash
git add src/integrations/ai/billede-analyse.ts src/integrations/ai/hus-dna-generator.ts src/integrations/ai/pdf-extractor.ts
git commit -m "feat(arch-265): replace console.warn with logServerEvent in AI integrations"
```

---

### Task 11: Replace console calls in Datafordeler + other integration files

**Files:**
- Modify: `src/integrations/bbr/client.ts`
- Modify: `src/integrations/dar/client.ts`
- Modify: `src/integrations/ebr/client.ts`
- Modify: `src/integrations/fbb/client.ts`
- Modify: `src/integrations/geus/client.ts`
- Modify: `src/integrations/mat/client.ts`
- Modify: `src/integrations/mat/grundareal-resolver.ts`
- Modify: `src/integrations/plandata/client.ts`
- Modify: `src/integrations/plandata/fjernvarme.ts`
- Modify: `src/integrations/tinglysning/client.ts`
- Modify: `src/integrations/vur/client.ts`
- Create: `src/lib/server-logger.test.ts`

Use `severity: "fatal"` for `console.error` calls (HTTP errors, GraphQL errors, service failures) and `severity: "degraded"` for `console.warn` calls (non-fatal fallbacks).

- [ ] **Step 11.1: For each file, add the import and replace calls**

Pattern for every file:
```typescript
import { logServerEvent } from "@/lib/server-logger";
```

Mapping table (apply to each file, find the exact surrounding context):

| File | Old | severity |
|------|-----|----------|
| `bbr/client.ts:212` | `console.error("[BBR] HTTP-fejl:", ...)` | `fatal` |
| `bbr/client.ts:224` | `console.error("[BBR] GraphQL-fejl:", ...)` | `fatal` |
| `bbr/client.ts:367` | `console.error("[BBR] Service fejl:", ...)` | `fatal` |
| `dar/client.ts:241` | `console.error("[DAR] GraphQL-fejl:", ...)` | `fatal` |
| `dar/client.ts:353,373` | `console.error(...)` | `fatal` |
| `dar/client.ts:362,399` | `console.warn(...)` | `degraded` |
| `ebr/client.ts:120,131,179,219` | `console.error(...)` | `fatal` |
| `fbb/client.ts:248,279` | `console.warn(...)` | `degraded` |
| `geus/client.ts:136,140` | `console.warn(...)` | `degraded` |
| `mat/client.ts:137,148,282` | `console.error(...)` | `fatal` |
| `mat/grundareal-resolver.ts:275,327` | `console.warn(...)` | `degraded` |
| `plandata/client.ts:224,266` | `console.error(...)` | `fatal` |
| `plandata/fjernvarme.ts:63` | `console.warn(...)` | `degraded` |
| `tinglysning/client.ts:88,190,216` | `console.warn(...)` | `degraded` |
| `vur/client.ts:149` | `console.error(...)` | `fatal` |

Example replacement for `bbr/client.ts:212`:
```typescript
// OLD:
console.error("[BBR] HTTP-fejl:", { status: response.status, body: text });
// NEW:
logServerEvent({ module: "bbr/client", operation: "graphqlFetch", severity: "fatal", message: "HTTP-fejl", metadata: { status: response.status, body: text } });
```

Example for `fbb/client.ts:248`:
```typescript
// OLD:
console.warn("[FBB] GeoServer fejl:", (e as Error).message);
// NEW:
logServerEvent({ module: "fbb/client", operation: "getSaveData", severity: "degraded", message: "GeoServer fejl", error: e });
```

- [ ] **Step 11.2: Write failing test for server-logger**

```typescript
// src/lib/server-logger.test.ts
import { describe, test, expect, mock, spyOn } from "bun:test";
import { logServerEvent } from "./server-logger";

describe("logServerEvent", () => {
  test("degraded → console.warn called with module info", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    logServerEvent({
      module: "test-module",
      operation: "test-op",
      severity: "degraded",
      message: "degraded failure",
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [label, payload] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(label).toBe("[ServerLog]");
    expect(payload.module).toBe("test-module");
    expect(payload.severity).toBe("degraded");
    warnSpy.mockRestore();
  });

  test("fatal → console.error called", () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    logServerEvent({
      module: "test-module",
      operation: "test-op",
      severity: "fatal",
      message: "fatal failure",
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  test("error object is normalized to string", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    logServerEvent({
      module: "m",
      operation: "o",
      severity: "degraded",
      message: "msg",
      error: new Error("something went wrong"),
    });
    const [, payload] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.error).toBe("something went wrong");
    warnSpy.mockRestore();
  });

  test("non-fatal failures do not throw", () => {
    // Simulate a caller that ignores the return value
    expect(() =>
      logServerEvent({ module: "m", operation: "o", severity: "degraded", message: "ok" })
    ).not.toThrow();
  });
});
```

- [ ] **Step 11.3: Run test**

```bash
bun test src/lib/server-logger.test.ts
```

Expected: All pass.

- [ ] **Step 11.4: Full test suite**

```bash
bun test
```

Expected: All pass.

- [ ] **Step 11.5: Type check + lint**

```bash
bunx tsc --noEmit && bunx eslint .
```

Expected: 0 errors.

- [ ] **Step 11.6: Verify no console.warn/error remain in integration files**

```bash
grep -rn "console\.warn\|console\.error" src/integrations --include="*.ts" | grep -v "server-logger"
```

Expected: 0 lines output.

- [ ] **Step 11.7: Final commit**

```bash
git add src/integrations/ src/lib/server-logger.test.ts
git commit -m "feat(arch-265): replace all console.warn/error in integration clients with logServerEvent"
```

---

## Self-Review

### Spec coverage check

| Acceptance criterion | Covered by |
|---|---|
| ARCH-274: `building-platform.ts` exports types only, no hard-stop trees | Task 2 — helpers already delegate; Zod schema replaces Record cast |
| ARCH-274: Tests prove SAVE/fredning/MAT consistency | Task 1 (full test suite) |
| ARCH-261: Orchestrator no longer imports from `project-store` | Task 3 |
| ARCH-261: Extract 6 focused step modules | Tasks 4–8 |
| ARCH-261: Hard-stop skip = pure function with tests | Task 4 |
| ARCH-261: `analyseAddressWithTrace` is thin coordinator | Task 9 |
| ARCH-265: Typed logger with module/operation/severity | Already exists; Task 10–11 migrate callers |
| ARCH-265: Replace `console.warn` in all 4 named files | Tasks 10–11 |
| ARCH-265: Tests for non-fatal persistence sync failure | Task 11 (server-logger.test.ts) |

### Known limitations

- `as unknown as LokalplanExtract` cast in `lokalplan-extraction-step.ts` is kept because `getCachedLokalplan` already validates shape via `isValidLokalplanExtractShape` before returning. Adding a full Zod schema for `LokalplanExtract` is ARCH-020 scope.
- `geo-risk-step.ts` passes `null` for `jordstykke_lokal_id` to `GeoDanmarkNaboService.getNabobygninger` instead of the BBR value — this was the existing behavior and is safe (the service has its own null handling). ARCH-240 owns improvement here.
- `src/integrations/supabase/client.ts` has 1 `console.warn` that is intentional (Supabase auth warning) — leave it untouched.
