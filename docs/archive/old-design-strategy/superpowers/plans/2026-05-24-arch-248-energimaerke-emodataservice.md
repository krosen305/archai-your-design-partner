# ARCH-248 EMOData/Energimærke Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Energistyrelsen's public energy label data to surface energymærke class, validity date, and report URL for existing buildings — enabling the "renover vs rive ned" decision. Generate a building task when the label is missing or expired.

**Architecture:** A new `EnergyLabelService` in `src/integrations/energimaerke/client.ts` follows the existing integration pattern: static async method → `SourceResult<EnergyLabelData>` → `makeOkResult`/`makeErrorResult`. The service runs after BBR (BBR building UUID can be the match key). Data flows into typed `site_constraints` columns via `site-constraints.derivation.ts` and triggers a building task for missing/expired labels. A new `runForsyningStep` introduced by ARCH-247 will be extended to include this service.

**Tech Stack:** REST/JSON (Energistyrelsen EMOData or Sparenergi public API), Zod, `src/lib/source-result.ts`, Bun test, Supabase SQL migrations, TypeScript strict.

**Dependency:** ARCH-247 introduces `forsyning-step.ts`. If ARCH-247 is done first, extend that step. If not, create the step here and ARCH-247 merges into it.

**Protected-file note:** `src/lib/analysis-orchestrator.ts` is a protected file. If it needs updating, the PR must state: `Rører beskyttet fil - kræver review`.

---

## File Structure

### Created

| File                                                          | Purpose                                    |
| ------------------------------------------------------------- | ------------------------------------------ |
| `src/integrations/energimaerke/client.ts`                     | EnergyLabelService + typed result          |
| `src/integrations/energimaerke/client.test.ts`                | Unit tests (parse, expired, no-hit, error) |
| `supabase/migrations/20260524180000_arch248_energimaerke.sql` | New typed columns on `site_constraints`    |

### Modified

| File                                                                    | Change                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/integrations/supabase/repositories/site-constraints.derivation.ts` | Map energy label to typed columns                            |
| `src/integrations/supabase/repositories/building-tasks.derivation.ts`   | Extend `ComplianceTriggers`; add `ENERGIMAERKE_RAPPORT` task |
| `src/types/building-platform.ts`                                        | Add `ENERGIMAERKE_RAPPORT` to `BUILDING_TASK_KEYS`           |
| `src/types/project-state.ts`                                            | Add `"energimaerke"` to `DataSourceKind`                     |
| `src/lib/analysis/forsyning-step.ts`                                    | Call EnergyLabelService (extend from ARCH-247 or create)     |
| `src/lib/analysis-orchestrator.ts` (**protected**, if new step needed)  | Wire step into pipeline                                      |

---

## Task 1: Discovery — Research Energistyrelsen/EMOData API

**Files:** None (research task)

References from issue:

- `https://ens.dk/analyser-og-statistik/energimaerkningsdata`
- `docs/offentlige-datakilder-gap-analyse.md`

- [ ] **Step 1.1: Research API access model**

Check the Energistyrelsen page and the following sources for API access:

1. **emoweb.dk**: Is there a public API at `https://emoweb.dk/EMOData/...`?
2. **sparenergi.dk**: Does `https://sparenergi.dk/offentlig/vaerktoejer/find-dit-energimaerke` expose a public endpoint?
3. **Open data download**: Does Energistyrelsen provide bulk CSV/JSON download that could be used as a lookup?
4. **ODataService**: Some Danish public services expose an OData endpoint — check `https://emoweb.dk/EMOData/EMOData.svc/`

Document:

- Base URL and HTTP method
- Auth requirements (free key vs truly open)
- Input: address text, DAR UUID, BBR building UUID, BFE number, or property id?
- Response schema: energimærke class (A2020, B, C, D, E, F, G), gyldigt til dato, rapport URL, rapportdato

If a free API key is required, document the env var name and add it to `src/lib/env.ts` and `.env.example`.

- [ ] **Step 1.2: Document input match key**

Best options (in order):

1. BBR `bygning_lokal_id` (UUID) — already available from BBR call in Layer 1
2. DAR `adgangsadresseid`
3. Address text (less reliable)

Record which key the real API accepts.

- [ ] **Step 1.3: Commit discovery notes**

```bash
git commit --allow-empty -m "chore(arch-248): EMOData API documented — endpoint=[URL], input=[KEY], auth=[none|key]"
```

---

## Task 2: Create EnergyLabelService

**Files:**

- Create: `src/integrations/energimaerke/client.ts`

Update `[DISCOVERY]` placeholders from Task 1 before implementing.

- [ ] **Step 2.1: Write tests first** (do Task 3.1 first, then return here)

- [ ] **Step 2.2: Create `src/integrations/energimaerke/client.ts`**

```typescript
// SERVER-SIDE ONLY — never import from browser code.
//
// Energimærke integration — Energistyrelsen EMOData / Sparenergi.
// [DISCOVERY: fill in base URL, auth model, and input key type from Task 1]
//
// Formål: hent energimærke, gyldighedsdato og rapportlink til brug i
// "renover vs rive ned"-beslutning og LCA-kontekst.

import { makeOkResult, makeErrorResult, type SourceResult } from "@/lib/source-result";
import { logServerEvent } from "@/lib/server-logger";
import { z } from "zod";

// [DISCOVERY: fill in actual base URL]
const EMODATA_BASE = "https://emoweb.dk/EMOData/EMOData.svc";

export type EnergyLabelData = {
  // Energimærke klasse: "A2020", "A2015", "A2010", "B", "C", "D", "E", "F", "G"
  energimaerke_klasse: string | null;
  // Dato rapport er gyldigt til
  gyldig_til: string | null; // ISO date string
  // Er rapporten udløbet? (derived from gyldig_til vs today)
  er_udloebet: boolean | null;
  // Rapportdato (hvornår energimærket blev udstedt)
  rapportdato: string | null;
  // Link til rapport PDF (null if not available)
  rapport_url: string | null;
  // Source record ID (for reference)
  rapport_id: string | null;
  // Match type
  match_type: "bygning_lokal_id" | "adresse" | "no_hit";
  kilde: "emodata" | "mock";
};

// [DISCOVERY: update schema to match actual API response]
const emoResponseSchema = z.object({
  Faerdiggoerelsesdato: z.string().nullable().optional(),
  GyldigTil: z.string().nullable().optional(),
  Klassificering: z.string().nullable().optional(),
  RapportUrl: z.string().nullable().optional(),
  RapportId: z.string().nullable().optional(),
});

type EmoRawResponse = z.infer<typeof emoResponseSchema>;

function isExpired(gyldigTil: string | null | undefined): boolean | null {
  if (!gyldigTil) return null;
  return new Date(gyldigTil) < new Date();
}

function parseResponse(
  raw: EmoRawResponse,
  matchType: EnergyLabelData["match_type"],
): EnergyLabelData {
  const gyldig_til = raw.GyldigTil ?? null;
  return {
    energimaerke_klasse: raw.Klassificering ?? null,
    gyldig_til,
    er_udloebet: isExpired(gyldig_til),
    rapportdato: raw.Faerdiggoerelsesdato ?? null,
    rapport_url: raw.RapportUrl ?? null,
    rapport_id: raw.RapportId ?? null,
    match_type: matchType,
    kilde: "emodata",
  };
}

export class EnergyLabelService {
  /**
   * Look up energy label by BBR building UUID (bygning_lokal_id).
   * Falls back to null result with no_hit if building has no label.
   *
   * @param bygningLokalId  BBR building UUID from BbrKompliantData.bygning_lokal_id
   */
  static async getLabel(bygningLokalId: string): Promise<SourceResult<EnergyLabelData>> {
    const kilde = "emodata";
    // [DISCOVERY: update URL construction and params to match real API]
    const url = `${EMODATA_BASE}/HentEnergimaerke?bygningId=${encodeURIComponent(bygningLokalId)}&$format=json`;

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (response.status === 404) {
        return makeOkResult<EnergyLabelData>(
          {
            energimaerke_klasse: null,
            gyldig_til: null,
            er_udloebet: null,
            rapportdato: null,
            rapport_url: null,
            rapport_id: null,
            match_type: "no_hit",
            kilde,
          },
          { kilde, sourceUrl: url, rawFeatureCount: 0, confidence: "missing" },
        );
      }

      if (!response.ok) {
        throw new Error(`EMOData HTTP ${response.status}`);
      }

      const raw = emoResponseSchema.parse(await response.json());
      const data = parseResponse(raw, "bygning_lokal_id");

      return makeOkResult<EnergyLabelData>(data, {
        kilde,
        sourceUrl: url,
        rawFeatureCount: 1,
        confidence: "confirmed",
      });
    } catch (e) {
      logServerEvent({
        module: "energimaerke/client",
        operation: "getLabel",
        severity: "warn",
        message: "EMOData API fejl",
        error: e,
      });
      return makeErrorResult<EnergyLabelData>(e, { kilde, sourceUrl: url });
    }
  }
}
```

- [ ] **Step 2.3: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 2.4: Commit**

```bash
git add src/integrations/energimaerke/client.ts
git commit -m "feat(energimaerke): add EnergyLabelService with tri-state label types"
```

---

## Task 3: Write unit tests for EnergyLabelService

**Files:**

- Create: `src/integrations/energimaerke/client.test.ts`

- [ ] **Step 3.1: Write tests**

Create `src/integrations/energimaerke/client.test.ts`:

```typescript
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { EnergyLabelService } from "@/integrations/energimaerke/client";

// [DISCOVERY: update mock response field names to match actual API]
const VALID_LABEL_RESPONSE = {
  Klassificering: "C",
  GyldigTil: "2030-01-01",
  Faerdiggoerelsesdato: "2020-01-15",
  RapportUrl: "https://sparenergi.dk/rapport/abc123",
  RapportId: "abc123",
};

const EXPIRED_LABEL_RESPONSE = {
  Klassificering: "E",
  GyldigTil: "2015-06-01", // expired
  Faerdiggoerelsesdato: "2005-06-01",
  RapportUrl: null,
  RapportId: "xyz999",
};

describe("EnergyLabelService.getLabel", () => {
  it("parses a valid energy label correctly", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(VALID_LABEL_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const result = await EnergyLabelService.getLabel("building-uuid-123");

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("confirmed");
    expect(result.data?.energimaerke_klasse).toBe("C");
    expect(result.data?.gyldig_til).toBe("2030-01-01");
    expect(result.data?.er_udloebet).toBe(false);
    expect(result.data?.rapport_url).toBe("https://sparenergi.dk/rapport/abc123");
    expect(result.data?.match_type).toBe("bygning_lokal_id");
  });

  it("marks expired label as er_udloebet=true", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(EXPIRED_LABEL_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const result = await EnergyLabelService.getLabel("building-uuid-456");

    expect(result.status).toBe("ok");
    expect(result.data?.er_udloebet).toBe(true);
    expect(result.data?.energimaerke_klasse).toBe("E");
  });

  it("returns ok with no_hit when API returns 404", async () => {
    globalThis.fetch = mock(
      async () => new Response("Not Found", { status: 404 }),
    ) as unknown as typeof fetch;

    const result = await EnergyLabelService.getLabel("unknown-building");

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("missing");
    expect(result.data?.match_type).toBe("no_hit");
    expect(result.data?.energimaerke_klasse).toBeNull();
    expect(result.data?.er_udloebet).toBeNull();
  });

  it("returns error result on HTTP 500 — does NOT map to no label", async () => {
    globalThis.fetch = mock(
      async () => new Response("Server Error", { status: 500 }),
    ) as unknown as typeof fetch;

    const result = await EnergyLabelService.getLabel("test-uuid");

    expect(result.status).toBe("error");
    expect(result.data).toBeNull();
  });

  it("returns error result on network failure", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("Network");
    }) as unknown as typeof fetch;

    const result = await EnergyLabelService.getLabel("test-uuid");

    expect(result.status).toBe("error");
    expect(result.confidence).toBe("unknown");
  });
});
```

- [ ] **Step 3.2: Run tests**

Run: `bun test src/integrations/energimaerke/client.test.ts`
Expected: PASS (5 tests) — update mock field names after Task 1 if needed

- [ ] **Step 3.3: Commit**

```bash
git add src/integrations/energimaerke/client.test.ts
git commit -m "test(energimaerke): add unit tests for getLabel (parse, expired, no-hit, errors)"
```

---

## Task 4: Database migration for energy label columns

**Files:**

- Create: `supabase/migrations/20260524180000_arch248_energimaerke.sql`

- [ ] **Step 4.1: Create migration**

```sql
-- ARCH-248: Energimærke typed columns on site_constraints.
-- Alle kolonner nullable — tri-state: null = ukendt/ikke hentet/API-fejl.
-- Energimærke er due-diligence/forsyningsøkonomi — IKKE hard-stop.

ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS energimaerke_klasse     TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_gyldig_til TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_er_udloebet BOOLEAN,
  ADD COLUMN IF NOT EXISTS energimaerke_rapport_url TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_rapport_id  TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_rapportdato TEXT;

COMMENT ON COLUMN public.site_constraints.energimaerke_klasse IS
  'ARCH-248 Energistyrelsen EMOData: energimærke klasse (A2020, B, C...). null = ingen rapport/ukendt.';
COMMENT ON COLUMN public.site_constraints.energimaerke_gyldig_til IS
  'ARCH-248: ISO-dato energimærket er gyldigt til. null = ingen rapport.';
COMMENT ON COLUMN public.site_constraints.energimaerke_er_udloebet IS
  'ARCH-248: true = gyldig_til er passeret. false = stadig gyldigt. null = ingen rapport.';
COMMENT ON COLUMN public.site_constraints.energimaerke_rapport_url IS
  'ARCH-248: URL til energimærkningsrapport PDF. null = ingen URL i API-svar.';

-- ROLLBACK:
-- ALTER TABLE public.site_constraints
--   DROP COLUMN IF EXISTS energimaerke_klasse,
--   DROP COLUMN IF EXISTS energimaerke_gyldig_til,
--   DROP COLUMN IF EXISTS energimaerke_er_udloebet,
--   DROP COLUMN IF EXISTS energimaerke_rapport_url,
--   DROP COLUMN IF EXISTS energimaerke_rapport_id,
--   DROP COLUMN IF EXISTS energimaerke_rapportdato;
```

- [ ] **Step 4.2: Apply migration and regenerate types**

Run: `bunx supabase db push`
Run: `bunx supabase gen types typescript --local > src/integrations/supabase/types.ts`
Expected: types.ts updated with six new columns

- [ ] **Step 4.3: Commit**

```bash
git add supabase/migrations/20260524180000_arch248_energimaerke.sql src/integrations/supabase/types.ts
git commit -m "feat(db): add energimaerke typed columns to site_constraints (ARCH-248)"
```

---

## Task 5: Map energy label to site_constraints and building task

**Files:**

- Modify: `src/integrations/supabase/repositories/site-constraints.derivation.ts`
- Modify: `src/integrations/supabase/repositories/building-tasks.derivation.ts`
- Modify: `src/types/building-platform.ts`
- Modify: `src/types/project-state.ts`

- [ ] **Step 5.1: Add `ENERGIMAERKE_RAPPORT` task key**

In `src/types/building-platform.ts`, inside `BUILDING_TASK_KEYS`, add (Matriklen phase):

```typescript
  ENERGIMAERKE_RAPPORT: "energimaerke_rapport",
```

- [ ] **Step 5.2: Add `"energimaerke"` to `DataSourceKind`**

In `src/types/project-state.ts`:

In `DataSourceKind` union, add: `"energimaerke"`

In `DATA_SOURCE_LABELS`, add:

```typescript
  energimaerke: "Energimærke (EMOData)",
```

In `STALE_DAYS`, add:

```typescript
  energimaerke: 30,
```

- [ ] **Step 5.3: Map energy label to site_constraints patch**

In `site-constraints.derivation.ts`, add import:

```typescript
import type { EnergyLabelData } from "@/integrations/energimaerke/client";
```

Add a new block in `deriveSiteConstraintsPatch` (alongside existing data source blocks):

```typescript
if (patch.energimaerke !== undefined) {
  hasConstraintField = true;
  const em = patch.energimaerke;
  sitePatch.energimaerke_klasse = em?.energimaerke_klasse ?? null;
  sitePatch.energimaerke_gyldig_til = em?.gyldig_til ?? null;
  sitePatch.energimaerke_er_udloebet = em?.er_udloebet ?? null;
  sitePatch.energimaerke_rapport_url = em?.rapport_url ?? null;
  sitePatch.energimaerke_rapport_id = em?.rapport_id ?? null;
  sitePatch.energimaerke_rapportdato = em?.rapportdato ?? null;
}
```

- [ ] **Step 5.4: Add `energimaerke` to `ProjectPatch`**

Find the `ProjectPatch` type and add:

```typescript
  energimaerke?: EnergyLabelData | null;
```

Add import of `EnergyLabelData` where needed.

- [ ] **Step 5.5: Add `energimaerkeMangler` trigger and building task**

In `building-tasks.derivation.ts`, add to `ComplianceTriggers`:

```typescript
energimaerkeMangler: boolean | null;
```

(`true` = no label or expired; `false` = valid label present; `null` = API error/unknown)

Add task generator in `deriveAutoTasks` before `return tasks;`:

```typescript
// ARCH-248: Energimærke mangler eller udløbet
if (t.energimaerkeMangler === true) {
  tasks.push({
    project_id: t.projectId,
    task_key: BUILDING_TASK_KEYS.ENERGIMAERKE_RAPPORT,
    title: "Energimærke mangler eller udløbet — indhent rapport",
    description:
      "Der er ikke fundet et gyldigt energimærke for ejendommen. Et energimærke er " +
      "krævet ved salg og kan være afgørende for beslutningen om at renovere frem for at " +
      "rive ned. Kontakt en certificeret energikonsulent. Gyldighed: 7-10 år (afhænger af mærke).",
    phase: "matriklen",
    status: "pending",
    priority: 3,
    is_auto_generated: true,
    blocked_by_constraint: "energimaerke_er_udloebet",
    metadata: { myndighed: "Certificeret energikonsulent", lovgrundlag: "Energimærkningsloven" },
  });
}
```

Compute `energimaerkeMangler` in the orchestration layer:

```typescript
// true = ingen rapport ELLER udløbet; false = gyldigt; null = API-fejl
const energimaerkeMangler =
  constraints.energimaerke_klasse === null
    ? constraints.energimaerke_er_udloebet === null
      ? null
      : true // no_hit
    : constraints.energimaerke_er_udloebet === true
      ? true // expired
      : false; // valid
```

- [ ] **Step 5.6: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 5.7: Commit**

```bash
git add src/types/building-platform.ts \
        src/types/project-state.ts \
        src/integrations/supabase/repositories/site-constraints.derivation.ts \
        src/integrations/supabase/repositories/building-tasks.derivation.ts \
        src/integrations/supabase/project-persistence.ts
git commit -m "feat(energimaerke): wire label into site_constraints, ComplianceTriggers and building tasks"
```

---

## Task 6: Wire EnergyLabelService into analysis pipeline

**Files:**

- Modify: `src/lib/analysis/forsyning-step.ts` (from ARCH-247, or create it here)
- Modify (**protected** if needed): `src/lib/analysis-orchestrator.ts`

**Note: `src/lib/analysis-orchestrator.ts` is a protected file. If it needs changing, the PR must state: `Rører beskyttet fil - kræver review`**

- [ ] **Step 6.1: Extend forsyning-step to call EnergyLabelService**

If `forsyning-step.ts` already exists from ARCH-247, extend it:

```typescript
import { EnergyLabelService } from "@/integrations/energimaerke/client";
import type { EnergyLabelData } from "@/integrations/energimaerke/client";

// Update ForsyningStepInput to include bygningLokalId
export type ForsyningStepInput = {
  adgangsadresseid: string;
  bygningLokalId: string | null; // from BBR result — needed for energy label lookup
};

export type ForsyningStepResult = {
  tjekditnetCoverage: TjekditnetCoverageData | null; // from ARCH-247
  energimaerke: EnergyLabelData | null; // ARCH-248 addition
};

export async function runForsyningStep(
  input: ForsyningStepInput,
  _trace: AnalysisTraceContext,
): Promise<ForsyningStepResult> {
  const [tjekditnetResult, energimaerkeResult] = await Promise.all([
    TjekditnetService.getCoverage(input.adgangsadresseid),
    input.bygningLokalId
      ? EnergyLabelService.getLabel(input.bygningLokalId)
      : Promise.resolve(makeSkippedResult<EnergyLabelData>({ kilde: "emodata", sourceUrl: null })),
  ]);

  return {
    tjekditnetCoverage: tjekditnetResult.data,
    energimaerke: energimaerkeResult.data,
  };
}
```

Import `makeSkippedResult` from `@/lib/source-result`.

If `forsyning-step.ts` does not exist yet (ARCH-247 not done), create it with both Tjekditnet and EnergyLabel combined.

- [ ] **Step 6.2: Add `energimaerke` to `ComplianceResult` in analysis-orchestrator.ts (if not already)**

Add to the `ComplianceResult` type:

```typescript
energimaerke: EnergyLabelData | null; // ARCH-248
```

- [ ] **Step 6.3: Pass `bygningLokalId` to `runForsyningStep`**

When calling `runForsyningStep` in the orchestrator, pass the BBR result:

```typescript
const forsyningResult = await runForsyningStep(
  {
    adgangsadresseid: input.adgangsadresseid,
    bygningLokalId: bbrResult?.bygning_lokal_id ?? null,
  },
  trace,
);
```

This requires that Layer 1 (BBR) runs before the forsyning step — which is correct since the forsyning step runs in parallel with Layer 2/3/4 (after Layer 1).

- [ ] **Step 6.4: Wire into project patch and result**

In the result assembly, add:

```typescript
energimaerke: forsyningResult.energimaerke,
```

In patch assembly, add:

```typescript
patch.energimaerke = result.energimaerke;
```

- [ ] **Step 6.5: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 6.6: Commit**

```bash
git add src/lib/analysis/forsyning-step.ts \
        src/lib/analysis-orchestrator.ts
git commit -m "feat(energimaerke): wire EnergyLabelService into analysis pipeline via forsyning-step

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

- [ ] **Step 7.3: Manual verification with 3 addresses**

Test addresses with known expected outcomes:

1. A building with a valid energimærke — expect class C/D, er_udloebet=false
2. An older property likely without an energimærke — expect no_hit or missing
3. A newly built property (< 2010) — often A or B label

Check `site_constraints` rows for the expected column values after analysis.

- [ ] **Step 7.4: Run lint and build**

Run: `bunx eslint . && bun run build`
Expected: No errors

- [ ] **Step 7.5: Final commit**

```bash
git commit --allow-empty -m "chore: ARCH-248 energimaerke integration complete — all checks pass"
```

---

## Self-Review Checklist

- [x] API error returns `makeErrorResult` — never maps to `no_hit`
- [x] No-hit (404 or empty result) returns `makeOkResult` with `confidence: "missing"` and `match_type: "no_hit"`
- [x] `er_udloebet` is derived locally from `gyldig_til` date — no trust in API-provided "expired" flags
- [x] Task triggered on BOTH missing label AND expired label (both = `energimaerkeMangler: true`)
- [x] Not a hard-stop — `status: "pending"`, not `"blocked"`
- [x] EnergyLabelService only called when `bygningLokalId` is non-null — skipped otherwise
- [x] `makeSkippedResult` used when BBR has no building UUID — confidence: "unknown"
- [x] STALE_DAYS: 30 days (labels expire, so more frequent refresh than geometry)
- [x] Discovery step (Task 1) MUST be completed before finalizing Task 2's URL, schema, and params
- [x] Protected file flagged in commit message and PR if analysis-orchestrator.ts is touched
- [x] If ARCH-247 is NOT yet merged, create `forsyning-step.ts` here with both services; ARCH-247 plan's Task 6 should then extend this step rather than create a new one
