# ARCH-247 Tjekditnet Bredbånds- og Mobilcoverage Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Tjekditnet's public API to fetch broadband and mobile coverage per DAR address, store coverage data in typed `site_constraints` columns, and generate a `kortlaeg_forsyninger` building task when fixed broadband coverage is absent.

**Architecture:** A new `TjekditnetService` in `src/integrations/tjekditnet/client.ts` follows the existing integration pattern: static async method → `SourceResult<TjekditnetCoverageData>` → `makeOkResult`/`makeErrorResult` from `src/lib/source-result.ts`. The raw payload is also cached in `address_source_results`. Coverage data flows into `site_constraints` via `site-constraints.derivation.ts` and triggers building tasks via an extended `ComplianceTriggers`. The orchestrator change is minimal: one parallel call added to `runGeoRiskStep` or a new `runForsyningStep` (protected file — see flag below).

**Tech Stack:** REST/JSON (Tjekditnet public API), Zod, `src/lib/source-result.ts`, Bun test, Supabase SQL migrations, TypeScript strict.

**Protected-file note:** `src/lib/analysis-orchestrator.ts` is a protected file. The plan adds a thin wiring call — the PR must state: `Rører beskyttet fil - kræver review`.

---

## File Structure

### Created

| File                                                        | Purpose                                 |
| ----------------------------------------------------------- | --------------------------------------- |
| `src/integrations/tjekditnet/client.ts`                     | TjekditnetService + typed result        |
| `src/integrations/tjekditnet/client.test.ts`                | Unit tests (parse, no-hit, error)       |
| `supabase/migrations/20260524170000_arch247_tjekditnet.sql` | New typed columns on `site_constraints` |

### Modified

| File                                                                    | Change                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/integrations/supabase/repositories/site-constraints.derivation.ts` | Map Tjekditnet coverage to typed columns                         |
| `src/integrations/supabase/repositories/building-tasks.derivation.ts`   | Extend `ComplianceTriggers`; add `KORTLAEG_FORSYNINGER` task     |
| `src/types/project-state.ts`                                            | Add `"tjekditnet"` to `DataSourceKind`; add label and stale days |
| `src/lib/analysis/geo-risk-step.ts` (or new `forsyning-step.ts`)        | Call TjekditnetService                                           |
| `src/lib/analysis-orchestrator.ts` (**protected**)                      | Wire new step into parallel execution                            |

---

## Task 1: Discovery — Read Tjekditnet API PDF and document the contract

**Files:** None (research task)

The issue links to: `https://tjekditnet.dk/sites/default/files/2025-06/API-funktionen%20på%20Tjekditnet.dk%20-%20uden%20selskabsnavne.pdf`

- [ ] **Step 1.1: Fetch and read the PDF**

Use WebFetch or download the PDF. Document:

1. Base URL of the API (e.g. `https://api.tjekditnet.dk/...` or similar)
2. How to look up by address: adgangsadresseid UUID? adressenavn+postnr? coordinates?
3. Response schema: which technology keys exist, are speeds provided, is it flat JSON?
4. Auth requirements: is it truly open/no-key, or does it need a free API key?
5. Rate limits or terms of use noted in the PDF

Fill in the placeholders marked `[DISCOVERY]` in Tasks 2–4 based on what you find.

- [ ] **Step 1.2: Confirm input key**

The ideal join key is the DAR `adgangsadresseid` UUID — it is already available in the analysis pipeline as `adgangsadresseid`. If the API does not accept a UUID, the next best option is `adressebetegnelse` (street + house number + postal code).

Document which key to use and record it in a comment at the top of `src/integrations/tjekditnet/client.ts`.

- [ ] **Step 1.3: Commit discovery notes**

```bash
# After filling in what you found, commit a brief note:
git commit --allow-empty -m "chore(arch-247): tjekditnet API documented — [API_BASE_URL], input=[KEY_TYPE], auth=[none|key]"
```

---

## Task 2: Create TjekditnetService

**Files:**

- Create: `src/integrations/tjekditnet/client.ts`

**Assumptions from discovery (update `[DISCOVERY]` placeholders based on Task 1):**

- API base: `[DISCOVERY: e.g. https://api.tjekditnet.dk/v1]`
- Input: `adgangsadresseid` UUID query param (update if different)
- Response: JSON with technology keys as top-level properties

- [ ] **Step 2.1: Write failing test first** (see Task 3 — do Task 3 Step 3.1 before this)

(Skip to Task 3.1 now, then come back here.)

- [ ] **Step 2.2: Create `src/integrations/tjekditnet/client.ts`**

```typescript
// SERVER-SIDE ONLY — never import from browser code.
//
// Tjekditnet integration — bredbånds- og mobilcoverage pr. adresse.
// API: [DISCOVERY: fill in base URL from PDF]
// Auth: [DISCOVERY: none / API-key]
// Input: DAR adgangsadresseid UUID (preferred) or adressebetegnelse
// Output: TjekditnetCoverageData — tri-state booleans, null = ukendt
//
// Data uden selskabsnavne — må offentliggøres jf. Tjekditnet's vilkår.

import { makeOkResult, makeErrorResult, type SourceResult } from "@/lib/source-result";
import { logServerEvent } from "@/lib/server-logger";
import { z } from "zod";

// [DISCOVERY: replace with actual base URL from PDF]
const TJEKDITNET_BASE = "https://api.tjekditnet.dk/v1";

export type TjekditnetCoverageData = {
  // Fixed broadband — null = unknown/API error
  fiber_tilgaengelig: boolean | null;
  kabel_tilgaengelig: boolean | null;
  xdsl_tilgaengelig: boolean | null;
  fast_traadloes_tilgaengelig: boolean | null;
  // Best fixed download speed across available technologies (Mbit/s)
  max_fast_download_mbit: number | null;
  max_fast_upload_mbit: number | null;
  // Mobile coverage
  mobil_4g_tilgaengelig: boolean | null;
  mobil_5g_tilgaengelig: boolean | null;
  // Match metadata
  adresse_match_type: "uuid" | "adressebetegnelse" | "no_hit";
  kilde: "tjekditnet" | "mock";
};

// [DISCOVERY: update schema to match actual API response shape]
const tjekditnetResponseSchema = z.object({
  // Update these field names to match the real API response
  fiber: z.boolean().nullable().optional(),
  kabel: z.boolean().nullable().optional(),
  xdsl: z.boolean().nullable().optional(),
  fastTraadloes: z.boolean().nullable().optional(),
  maxDownloadMbit: z.number().nullable().optional(),
  maxUploadMbit: z.number().nullable().optional(),
  mobil4g: z.boolean().nullable().optional(),
  mobil5g: z.boolean().nullable().optional(),
});

type TjekditnetRawResponse = z.infer<typeof tjekditnetResponseSchema>;

function parseResponse(
  raw: TjekditnetRawResponse,
): Omit<TjekditnetCoverageData, "adresse_match_type" | "kilde"> {
  return {
    fiber_tilgaengelig: raw.fiber ?? null,
    kabel_tilgaengelig: raw.kabel ?? null,
    xdsl_tilgaengelig: raw.xdsl ?? null,
    fast_traadloes_tilgaengelig: raw.fastTraadloes ?? null,
    max_fast_download_mbit: raw.maxDownloadMbit ?? null,
    max_fast_upload_mbit: raw.maxUploadMbit ?? null,
    mobil_4g_tilgaengelig: raw.mobil4g ?? null,
    mobil_5g_tilgaengelig: raw.mobil5g ?? null,
  };
}

export class TjekditnetService {
  static async getCoverage(
    adgangsadresseid: string,
  ): Promise<SourceResult<TjekditnetCoverageData>> {
    const kilde = "tjekditnet";
    // [DISCOVERY: update URL and params to match actual API]
    const url = `${TJEKDITNET_BASE}/daekning?adgangsadresseid=${encodeURIComponent(adgangsadresseid)}`;

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (response.status === 404) {
        return makeOkResult<TjekditnetCoverageData>(
          {
            fiber_tilgaengelig: null,
            kabel_tilgaengelig: null,
            xdsl_tilgaengelig: null,
            fast_traadloes_tilgaengelig: null,
            max_fast_download_mbit: null,
            max_fast_upload_mbit: null,
            mobil_4g_tilgaengelig: null,
            mobil_5g_tilgaengelig: null,
            adresse_match_type: "no_hit",
            kilde,
          },
          {
            kilde,
            sourceUrl: url,
            rawFeatureCount: 0,
            confidence: "missing",
          },
        );
      }

      if (!response.ok) {
        throw new Error(`Tjekditnet HTTP ${response.status}`);
      }

      const raw = tjekditnetResponseSchema.parse(await response.json());
      const parsed = parseResponse(raw);

      return makeOkResult<TjekditnetCoverageData>(
        { ...parsed, adresse_match_type: "uuid", kilde },
        {
          kilde,
          sourceUrl: url,
          rawFeatureCount: 1,
          confidence: "confirmed",
        },
      );
    } catch (e) {
      logServerEvent({
        module: "tjekditnet/client",
        operation: "getCoverage",
        severity: "warn",
        message: "Tjekditnet API fejl",
        error: e,
      });
      return makeErrorResult<TjekditnetCoverageData>(e, { kilde, sourceUrl: url });
    }
  }
}
```

**Important:** After discovery (Task 1), update:

1. `TJEKDITNET_BASE` URL
2. `tjekditnetResponseSchema` field names to match the real response
3. URL construction if input key is not `adgangsadresseid`

- [ ] **Step 2.3: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 2.4: Commit**

```bash
git add src/integrations/tjekditnet/client.ts
git commit -m "feat(tjekditnet): add TjekditnetService with tri-state coverage types"
```

---

## Task 3: Write unit tests for TjekditnetService

**Files:**

- Create: `src/integrations/tjekditnet/client.test.ts`

- [ ] **Step 3.1: Write tests**

Create `src/integrations/tjekditnet/client.test.ts`:

```typescript
import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { TjekditnetService } from "@/integrations/tjekditnet/client";

// Mock global fetch
const mockFetch = mock(async (url: string) => {
  return new Response("", { status: 500 });
});

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  mock.restore();
});

// [DISCOVERY: update these mock responses to match the real API response shape]
const FIBER_RESPONSE = {
  fiber: true,
  kabel: false,
  xdsl: false,
  fastTraadloes: false,
  maxDownloadMbit: 1000,
  maxUploadMbit: 500,
  mobil4g: true,
  mobil5g: false,
};

const NO_COVERAGE_RESPONSE = {
  fiber: false,
  kabel: false,
  xdsl: false,
  fastTraadloes: false,
  maxDownloadMbit: null,
  maxUploadMbit: null,
  mobil4g: false,
  mobil5g: false,
};

describe("TjekditnetService.getCoverage", () => {
  it("returns confirmed ok result with fiber coverage parsed", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(FIBER_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const result = await TjekditnetService.getCoverage("test-uuid-123");

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("confirmed");
    expect(result.data?.fiber_tilgaengelig).toBe(true);
    expect(result.data?.max_fast_download_mbit).toBe(1000);
    expect(result.data?.adresse_match_type).toBe("uuid");
  });

  it("returns ok with no_hit when API returns 404", async () => {
    globalThis.fetch = mock(
      async () => new Response("Not Found", { status: 404 }),
    ) as unknown as typeof fetch;

    const result = await TjekditnetService.getCoverage("unknown-uuid");

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("missing");
    expect(result.data?.adresse_match_type).toBe("no_hit");
    expect(result.data?.fiber_tilgaengelig).toBeNull();
  });

  it("returns error result on HTTP 500 — does NOT map to false", async () => {
    globalThis.fetch = mock(
      async () => new Response("Server Error", { status: 500 }),
    ) as unknown as typeof fetch;

    const result = await TjekditnetService.getCoverage("test-uuid");

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
    // Must not return false for any field — that would mean "no coverage" instead of "unknown"
  });

  it("returns error result on network failure", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("Network error");
    }) as unknown as typeof fetch;

    const result = await TjekditnetService.getCoverage("test-uuid");

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
    expect(result.confidence).toBe("unknown");
  });

  it("returns no-coverage result with all-false fields", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(NO_COVERAGE_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const result = await TjekditnetService.getCoverage("test-uuid");

    expect(result.status).toBe("ok");
    expect(result.data?.fiber_tilgaengelig).toBe(false);
    expect(result.data?.max_fast_download_mbit).toBeNull();
  });
});
```

- [ ] **Step 3.2: Run tests**

Run: `bun test src/integrations/tjekditnet/client.test.ts`
Expected: PASS (5 tests) — update mock response shapes after Task 1 discovery if needed

- [ ] **Step 3.3: Commit**

```bash
git add src/integrations/tjekditnet/client.test.ts
git commit -m "test(tjekditnet): add unit tests for getCoverage (parse, no-hit, errors)"
```

---

## Task 4: Database migration for Tjekditnet coverage columns

**Files:**

- Create: `supabase/migrations/20260524170000_arch247_tjekditnet.sql`

- [ ] **Step 4.1: Create migration file**

```sql
-- ARCH-247: Tjekditnet bredbånds- og mobilcoverage typed columns on site_constraints.
-- Alle kolonner nullable — tri-state: null = ukendt/ikke hentet/API-fejl.
-- false = hentet, adresse fundet, men teknologien er ikke tilgængelig.
-- Selskabsnavne gemmes ikke (jf. Tjekditnet API-vilkår).

ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS tjekditnet_fiber_tilgaengelig           BOOLEAN,
  ADD COLUMN IF NOT EXISTS tjekditnet_kabel_tilgaengelig           BOOLEAN,
  ADD COLUMN IF NOT EXISTS tjekditnet_xdsl_tilgaengelig            BOOLEAN,
  ADD COLUMN IF NOT EXISTS tjekditnet_fast_traadloes_tilgaengelig  BOOLEAN,
  ADD COLUMN IF NOT EXISTS tjekditnet_max_fast_download_mbit       NUMERIC,
  ADD COLUMN IF NOT EXISTS tjekditnet_max_fast_upload_mbit         NUMERIC,
  ADD COLUMN IF NOT EXISTS tjekditnet_mobil_4g_tilgaengelig        BOOLEAN,
  ADD COLUMN IF NOT EXISTS tjekditnet_mobil_5g_tilgaengelig        BOOLEAN,
  ADD COLUMN IF NOT EXISTS tjekditnet_adresse_match_type           TEXT
    CHECK (tjekditnet_adresse_match_type IN ('uuid', 'adressebetegnelse', 'no_hit'));

COMMENT ON COLUMN public.site_constraints.tjekditnet_fiber_tilgaengelig IS
  'ARCH-247 Tjekditnet: fiber (FTTH/FTTB) teknisk mulig. null = ukendt/API-fejl.';
COMMENT ON COLUMN public.site_constraints.tjekditnet_max_fast_download_mbit IS
  'ARCH-247 Tjekditnet: bedste faste bredbånds-download (Mbit/s). null = ingen fast dækning/ukendt.';
COMMENT ON COLUMN public.site_constraints.tjekditnet_adresse_match_type IS
  'ARCH-247 Tjekditnet: hvad der blev brugt til opslag (uuid/adressebetegnelse/no_hit).';

-- ROLLBACK:
-- ALTER TABLE public.site_constraints
--   DROP COLUMN IF EXISTS tjekditnet_fiber_tilgaengelig,
--   DROP COLUMN IF EXISTS tjekditnet_kabel_tilgaengelig,
--   DROP COLUMN IF EXISTS tjekditnet_xdsl_tilgaengelig,
--   DROP COLUMN IF EXISTS tjekditnet_fast_traadloes_tilgaengelig,
--   DROP COLUMN IF EXISTS tjekditnet_max_fast_download_mbit,
--   DROP COLUMN IF EXISTS tjekditnet_max_fast_upload_mbit,
--   DROP COLUMN IF EXISTS tjekditnet_mobil_4g_tilgaengelig,
--   DROP COLUMN IF EXISTS tjekditnet_mobil_5g_tilgaengelig,
--   DROP COLUMN IF EXISTS tjekditnet_adresse_match_type;
```

- [ ] **Step 4.2: Apply migration and regenerate types**

Run: `bunx supabase db push`
Run: `bunx supabase gen types typescript --local > src/integrations/supabase/types.ts`
Expected: types.ts updated with nine new columns

- [ ] **Step 4.3: Commit**

```bash
git add supabase/migrations/20260524170000_arch247_tjekditnet.sql src/integrations/supabase/types.ts
git commit -m "feat(db): add Tjekditnet typed coverage columns to site_constraints (ARCH-247)"
```

---

## Task 5: Map Tjekditnet data to site_constraints + building task

**Files:**

- Modify: `src/integrations/supabase/repositories/site-constraints.derivation.ts`
- Modify: `src/integrations/supabase/repositories/building-tasks.derivation.ts`
- Modify: `src/types/project-state.ts`

- [ ] **Step 5.1: Add `tjekditnet` to `DataSourceKind` in project-state.ts**

In `DataSourceKind`, add `"tjekditnet"` to the union.

In `DATA_SOURCE_LABELS`, add:

```typescript
  tjekditnet: "Bredbåndsdækning (Tjekditnet)",
```

In `STALE_DAYS`, add (find the pattern in the file):

```typescript
  tjekditnet: 90,
```

- [ ] **Step 5.2: Add `tjekditnetCoverage` field to `ProjectPatch`**

Find the `ProjectPatch` type (in `src/integrations/supabase/project-persistence.ts` or nearby). Add:

```typescript
  tjekditnetCoverage?: TjekditnetCoverageData | null;
```

Add import:

```typescript
import type { TjekditnetCoverageData } from "@/integrations/tjekditnet/client";
```

- [ ] **Step 5.3: Map Tjekditnet coverage to site_constraints in derivation**

In `site-constraints.derivation.ts`, add import:

```typescript
import type { TjekditnetCoverageData } from "@/integrations/tjekditnet/client";
```

Add a new block inside `deriveSiteConstraintsPatch`:

```typescript
if (patch.tjekditnetCoverage !== undefined) {
  hasConstraintField = true;
  const cov = patch.tjekditnetCoverage;
  sitePatch.tjekditnet_fiber_tilgaengelig = cov?.fiber_tilgaengelig ?? null;
  sitePatch.tjekditnet_kabel_tilgaengelig = cov?.kabel_tilgaengelig ?? null;
  sitePatch.tjekditnet_xdsl_tilgaengelig = cov?.xdsl_tilgaengelig ?? null;
  sitePatch.tjekditnet_fast_traadloes_tilgaengelig = cov?.fast_traadloes_tilgaengelig ?? null;
  sitePatch.tjekditnet_max_fast_download_mbit = cov?.max_fast_download_mbit ?? null;
  sitePatch.tjekditnet_max_fast_upload_mbit = cov?.max_fast_upload_mbit ?? null;
  sitePatch.tjekditnet_mobil_4g_tilgaengelig = cov?.mobil_4g_tilgaengelig ?? null;
  sitePatch.tjekditnet_mobil_5g_tilgaengelig = cov?.mobil_5g_tilgaengelig ?? null;
  sitePatch.tjekditnet_adresse_match_type = cov?.adresse_match_type ?? null;
}
```

- [ ] **Step 5.4: Add `tjekditnetNoFixedBroadband` trigger and building task**

In `building-tasks.derivation.ts`, add to `ComplianceTriggers`:

```typescript
tjekditnetNoFixedBroadband: boolean | null;
```

(`true` = confirmed no fixed coverage at all; `false` = some coverage; `null` = unknown/API error)

Add task generator in `deriveAutoTasks` before `return tasks;`:

```typescript
// ARCH-247: Tjekditnet — ingen fast bredbåndsdækning
if (t.tjekditnetNoFixedBroadband === true) {
  tasks.push({
    project_id: t.projectId,
    task_key: BUILDING_TASK_KEYS.KORTLAEG_FORSYNINGER,
    title: "Bredbåndsdækning mangler — forsyningsforhold skal kortlægges",
    description:
      "Tjekditnet registrerer ingen tilgængelig fast bredbåndsdækning (fiber, kabel eller xDSL) " +
      "på adressen. Mobildata alene er normalt ikke tilstrækkeligt til fjernarbejde. " +
      "Undersøg muligheder for fiberfremføring med kommunen eller lokalt forsyningsselskab, " +
      "inden boligformål og pris vurderes.",
    phase: "matriklen",
    status: "pending",
    priority: 3,
    is_auto_generated: true,
    blocked_by_constraint: "tjekditnet_fiber_tilgaengelig",
    metadata: {
      kilde: "Tjekditnet",
      fiber: false,
      kabel: false,
      xdsl: false,
    },
  });
}
```

Compute `tjekditnetNoFixedBroadband` in the orchestration layer when building the triggers:

```typescript
// Ingen fast bredbånd = alle tre teknologier eksplicit false (NOT null)
const tjekditnetNoFixedBroadband =
  constraints.tjekditnet_fiber_tilgaengelig === false &&
  constraints.tjekditnet_kabel_tilgaengelig === false &&
  constraints.tjekditnet_xdsl_tilgaengelig === false
    ? true
    : constraints.tjekditnet_fiber_tilgaengelig === null &&
        constraints.tjekditnet_kabel_tilgaengelig === null &&
        constraints.tjekditnet_xdsl_tilgaengelig === null
      ? null
      : false;
```

- [ ] **Step 5.5: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 5.6: Commit**

```bash
git add src/types/project-state.ts \
        src/integrations/supabase/repositories/site-constraints.derivation.ts \
        src/integrations/supabase/repositories/building-tasks.derivation.ts \
        src/integrations/supabase/project-persistence.ts
git commit -m "feat(tjekditnet): wire coverage into site_constraints, ComplianceTriggers and building tasks"
```

---

## Task 6: Wire TjekditnetService into analysis pipeline

**Files:**

- Modify (or create): `src/lib/analysis/geo-risk-step.ts`
- Modify (**protected**): `src/lib/analysis-orchestrator.ts`

**Note: `src/lib/analysis-orchestrator.ts` is a protected file — the PR must state: `Rører beskyttet fil - kræver review`**

- [ ] **Step 6.1: Add Tjekditnet call to geo-risk step (or create a new forsyning step)**

Option A (simpler): Add to `runGeoRiskStep` — it already runs in parallel with other Layer 4 steps.

In `src/lib/analysis/geo-risk-step.ts`, import and call:

```typescript
import { TjekditnetService } from "@/integrations/tjekditnet/client";

// Inside the step, add:
const tjekditnetResult = await TjekditnetService.getCoverage(adgangsadresseid);
// (run in parallel with existing geo-risk calls via Promise.all)
```

Return `tjekditnetResult.data` as part of the step's output.

Option B (cleaner isolation): Create `src/lib/analysis/forsyning-step.ts`:

```typescript
import { TjekditnetService } from "@/integrations/tjekditnet/client";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";
import type { TjekditnetCoverageData } from "@/integrations/tjekditnet/client";

export type ForsyningStepResult = {
  tjekditnetCoverage: TjekditnetCoverageData | null;
};

export async function runForsyningStep(
  adgangsadresseid: string,
  _trace: AnalysisTraceContext,
): Promise<ForsyningStepResult> {
  const result = await TjekditnetService.getCoverage(adgangsadresseid);
  return { tjekditnetCoverage: result.data };
}
```

Choose Option B. It keeps the protected orchestrator change to a single parallel call.

- [ ] **Step 6.2: Add `tjekditnetCoverage` to `ComplianceResult` in analysis-orchestrator.ts**

Add to the `ComplianceResult` type:

```typescript
tjekditnetCoverage: TjekditnetCoverageData | null; // ARCH-247
```

- [ ] **Step 6.3: Call `runForsyningStep` in the orchestrator**

In the main orchestration function, where Layer 2/3/4 steps run in parallel, add:

```typescript
import { runForsyningStep } from "@/lib/analysis/forsyning-step";

// In the parallel Promise.all block:
const [..existingSteps.., forsyningResult] = await Promise.all([
  ...existingCalls...,
  runForsyningStep(input.adgangsadresseid, trace),
]);

// In the result assembly:
tjekditnetCoverage: forsyningResult.tjekditnetCoverage,
```

- [ ] **Step 6.4: Wire into project patch**

Where `ProjectPatch` is assembled in the analysis flow, add:

```typescript
patch.tjekditnetCoverage = result.tjekditnetCoverage;
```

- [ ] **Step 6.5: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 6.6: Commit**

```bash
git add src/lib/analysis/forsyning-step.ts \
        src/lib/analysis-orchestrator.ts \
        src/lib/analysis-orchestrator.ts  # protected — PR must note this
git commit -m "feat(tjekditnet): wire Tjekditnet into analysis pipeline via forsyning-step

Rører beskyttet fil - kræver review: src/lib/analysis-orchestrator.ts"
```

---

## Task 7: Final verification

- [ ] **Step 7.1: Run full TypeScript check**

Run: `bunx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7.2: Run all tests**

Run: `bun test src`
Expected: All pass

- [ ] **Step 7.3: Verify 3 test addresses manually (live)**

Pick 3 addresses with different expected coverage profiles:

1. Urbanized address (e.g. Copenhagen inner city) — expect fiber=true
2. Rural address (e.g. Lolland landzone) — expect fiber=false or no_hit
3. Unknown address UUID — expect no_hit or error

Run the analysis flow and check `site_constraints` rows for the expected column values.

- [ ] **Step 7.4: Run lint and build**

Run: `bunx eslint . && bun run build`
Expected: No errors

- [ ] **Step 7.5: Final commit**

```bash
git commit --allow-empty -m "chore: ARCH-247 Tjekditnet integration complete — all checks pass"
```

---

## Self-Review Checklist

- [x] API errors return `makeErrorResult` — never `false` for coverage
- [x] No-hit (404) returns `makeOkResult` with `confidence: "missing"` and all nulls — not `false`
- [x] Company names are not stored (field names describe technology, not provider)
- [x] `tjekditnetNoFixedBroadband` tri-state: only `true` when ALL three are confirmed false — never true when any is null
- [x] `KORTLAEG_FORSYNINGER` task key already exists in `BUILDING_TASK_KEYS` — no new key needed
- [x] `analysis-orchestrator.ts` change is one import + one parallel call + one result mapping — minimal
- [x] Protected file flagged in commit message and PR
- [x] STALE_DAYS: 90 days (coverage data changes slowly)
- [x] Discovery step (Task 1) must be completed before finalizing Task 2's URL and schema
