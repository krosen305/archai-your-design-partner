# ARCH-246 BBR Due-Diligence Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the BBR GraphQL integration with vandforsyning (byg030), afløbsforhold (byg031) and renovation year (byg027), derive a saneringsrisiko heuristic from building age and materials, and generate three new building tasks (olietank miljøscreening, asbest/PCB screening, kloak/nedsivning) from both existing DK-Jord data and the new BBR fields.

**Architecture:** The BBR adapter (`src/integrations/bbr/client.ts`) is extended with two new GraphQL fields. Saneringsrisiko lives as a pure domain function in `src/domain/bbr/`. New typed columns are written to `site_constraints` and consumed by `building-tasks.derivation.ts` via an extended `ComplianceTriggers` type. The orchestrator is unchanged — BBR data flows through the existing `patch.bbrData` path.

**Tech Stack:** Datafordeler GraphQL v2, Zod, Bun test, Supabase SQL migrations, TypeScript strict.

**Protected-file note:** This plan does NOT modify `analysis-orchestrator.ts`. All new data flows through the existing BBR path already wired in Layer 1.

---

## File Structure

### Modified

| File                                                                    | Change                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/domain/bbr/code-lists.ts`                                          | Add `vandforsyningLabel()` and `afloebsforholdLabel()`                                        |
| `src/domain/bbr/node-decoder.ts`                                        | Add `byg030Vandforsyning` and `byg031Afloebsforhold` to Zod schema and `BbrBuildingNode` type |
| `src/integrations/bbr/client.ts`                                        | Add fields to `BYGNING_QUERY`, `BbrBygning`, `BbrKompliantData`; update return value          |
| `src/integrations/supabase/repositories/site-constraints.derivation.ts` | Map new BBR fields to site_constraints patch                                                  |
| `src/integrations/supabase/repositories/building-tasks.derivation.ts`   | Extend `ComplianceTriggers`; add olietank, asbest, afløb tasks                                |
| `src/types/building-platform.ts`                                        | Add `OLIETANK_MILJOESCREENING` and `ASBEST_PCB_SCREENING` to `BUILDING_TASK_KEYS`             |

### Created

| File                                                                           | Purpose                                                  |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `src/domain/bbr/sanerings-risiko.ts`                                           | Pure heuristic: byggeår + materialer → `SaneringsRisiko` |
| `supabase/migrations/20260524160000_arch246_bbr_due_diligence.sql`             | New typed columns on `site_constraints`                  |
| `src/domain/bbr/sanerings-risiko.test.ts`                                      | Unit tests for heuristic                                 |
| `src/integrations/supabase/repositories/building-tasks-bbr.derivation.test.ts` | Unit tests for three new task generators                 |

---

## Task 1: Add code-list label functions

**Files:**

- Modify: `src/domain/bbr/code-lists.ts`

- [ ] **Step 1.1: Add maps and exports at end of code-lists.ts**

```typescript
const VANDFORSYNING_KODER: Record<string, string> = {
  "1": "Alment vandforsyningsanlæg",
  "2": "Privat fælles vandforsyningsanlæg",
  "3": "Enkeltindvinding (privat boring/brønd)",
  "4": "Ingen vandindvinding",
  "9": "Blandet vandforsyning",
};

const AFLOEBSFORHOLD_KODER: Record<string, string> = {
  "1": "Fælleskloak",
  "2": "Separatkloak",
  "3": "Spildevandsledning (ingen regnvandshåndtering)",
  "4": "Nedsivningsanlæg",
  "5": "Bundfælldningstank med nedsivning",
  "6": "Samletank",
  "7": "Ingen afledning",
  "8": "Drænledning",
  "9": "Blandet afløbsforhold",
};

export function vandforsyningLabel(kode: string | null): string | null {
  if (!kode) return null;
  return VANDFORSYNING_KODER[kode] ?? `Vandforsyning kode ${kode}`;
}

export function afloebsforholdLabel(kode: string | null): string | null {
  if (!kode) return null;
  return AFLOEBSFORHOLD_KODER[kode] ?? `Afløb kode ${kode}`;
}
```

- [ ] **Step 1.2: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 1.3: Commit**

```bash
git add src/domain/bbr/code-lists.ts
git commit -m "feat(bbr): add vandforsyning and afloebsforhold code-list label functions"
```

---

## Task 2: Extend BBR Zod decoder

**Files:**

- Modify: `src/domain/bbr/node-decoder.ts`

- [ ] **Step 2.1: Write failing test**

Create file `src/domain/bbr/node-decoder-ext.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { parseBbrBygninger } from "@/domain/bbr/node-decoder";

const mockResponse = {
  BBR_Bygning: {
    nodes: [
      {
        id_lokalId: "abc123",
        byg007Bygningsnummer: 1,
        byg021BygningensAnvendelse: "120",
        byg024AntalLejlighederMedKoekken: null,
        byg025AntalLejlighederUdenKoekken: null,
        byg026Opfoerelsesaar: 1965,
        byg027OmTilbygningsaar: 1985,
        byg029DatoForMidlertidigOpfoertBygning: null,
        byg030Vandforsyning: "1",
        byg031Afloebsforhold: "2",
        byg032YdervaeggensMateriale: "1",
        byg033Tagdaekningsmateriale: "1",
        byg038SamletBygningsareal: 120,
        byg039BygningensSamledeBoligAreal: 110,
        byg040BygningensSamledeErhvervsAreal: null,
        byg041BebyggetAreal: 80,
        byg054AntalEtager: 1,
        byg055AfvigendeEtager: null,
        byg056Varmeinstallation: "1",
        byg057Opvarmningsmiddel: "8",
        byg070Fredning: null,
        byg071BevaringsvaerdighedReference: null,
        byg094Revisionsdato: "2024-01-01",
        status: "6",
        registreringFra: "2020-01-01",
        registreringTil: null,
        virkningFra: "2020-01-01",
        virkningTil: null,
      },
    ],
  },
};

describe("parseBbrBygninger with new fields", () => {
  it("parses byg030Vandforsyning and byg031Afloebsforhold", () => {
    const result = parseBbrBygninger(mockResponse);
    expect(result).toHaveLength(1);
    expect(result[0].byg030Vandforsyning).toBe("1");
    expect(result[0].byg031Afloebsforhold).toBe("2");
  });

  it("accepts null for both new fields", () => {
    const withNulls = {
      BBR_Bygning: {
        nodes: [
          {
            ...mockResponse.BBR_Bygning.nodes[0],
            byg030Vandforsyning: null,
            byg031Afloebsforhold: null,
          },
        ],
      },
    };
    const result = parseBbrBygninger(withNulls);
    expect(result[0].byg030Vandforsyning).toBeNull();
    expect(result[0].byg031Afloebsforhold).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run test to see it fail**

Run: `bun test src/domain/bbr/node-decoder-ext.test.ts`
Expected: FAIL — `result[0].byg030Vandforsyning` is undefined (field not in schema yet)

- [ ] **Step 2.3: Add fields to `BbrBuildingNode` type in node-decoder.ts**

Add after `byg027OmTilbygningsaar: number | null;`:

```typescript
byg030Vandforsyning: string | null;
byg031Afloebsforhold: string | null;
```

- [ ] **Step 2.4: Add fields to `bbrBuildingNodeSchema` in node-decoder.ts**

Add after `byg027OmTilbygningsaar: z.number().nullable(),`:

```typescript
  byg030Vandforsyning: z.string().nullable(),
  byg031Afloebsforhold: z.string().nullable(),
```

- [ ] **Step 2.5: Run test to see it pass**

Run: `bun test src/domain/bbr/node-decoder-ext.test.ts`
Expected: PASS

- [ ] **Step 2.6: Commit**

```bash
git add src/domain/bbr/node-decoder.ts src/domain/bbr/node-decoder-ext.test.ts
git commit -m "feat(bbr): add byg030Vandforsyning and byg031Afloebsforhold to Zod decoder"
```

---

## Task 3: Extend BBR GraphQL query and output types

**Files:**

- Modify: `src/integrations/bbr/client.ts`

- [ ] **Step 3.1: Add fields to `BYGNING_QUERY` in client.ts**

In the `nodes { ... }` block of `BYGNING_QUERY`, add after `byg027OmTilbygningsaar`:

```graphql
      byg030Vandforsyning
      byg031Afloebsforhold
```

- [ ] **Step 3.2: Add fields to `BbrBygning` type**

Add after `byg027OmTilbygningsaar: number | null;`:

```typescript
byg030Vandforsyning: string | null;
byg031Afloebsforhold: string | null;
```

- [ ] **Step 3.3: Add imports at top of client.ts**

In the import from `@/domain/bbr/code-lists`, add `vandforsyningLabel` and `afloebsforholdLabel`:

```typescript
import {
  anvendelseLabel,
  opvarmningsmiddelLabel,
  tagdaekningLabel,
  varmeinstallationLabel,
  ydervaegsMaterialeLabel,
  vandforsyningLabel,
  afloebsforholdLabel,
} from "@/domain/bbr/code-lists";
```

- [ ] **Step 3.4: Add fields to `BbrKompliantData` type**

Add after `bygning_samlet_boligareal`:

```typescript
// ARCH-246: Due-diligence felter
ombygningsaar: number | null; // byg027 — nu eksponeret i output
vandforsyning_kode: string | null; // byg030 raw kode
vandforsyning: string | null; // byg030 label
afloebsforhold_kode: string | null; // byg031 raw kode
afloebsforhold: string | null; // byg031 label
```

- [ ] **Step 3.5: Populate new fields in `getKompliantData` return value**

In the return statement of `getKompliantData`, add after `bygning_samlet_boligareal`:

```typescript
        ombygningsaar: canonicalBuilding.byg027OmTilbygningsaar ?? null,
        vandforsyning_kode: canonicalBuilding.byg030Vandforsyning ?? null,
        vandforsyning: vandforsyningLabel(canonicalBuilding.byg030Vandforsyning ?? null),
        afloebsforhold_kode: canonicalBuilding.byg031Afloebsforhold ?? null,
        afloebsforhold: afloebsforholdLabel(canonicalBuilding.byg031Afloebsforhold ?? null),
```

- [ ] **Step 3.6: Add null values to `getEmptyData` return**

Add after `bygning_samlet_boligareal: null`:

```typescript
        ombygningsaar: null,
        vandforsyning_kode: null,
        vandforsyning: null,
        afloebsforhold_kode: null,
        afloebsforhold: null,
```

- [ ] **Step 3.7: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3.8: Commit**

```bash
git add src/integrations/bbr/client.ts
git commit -m "feat(bbr): expose vandforsyning, afloebsforhold, ombygningsaar in BbrKompliantData"
```

---

## Task 4: Create saneringsrisiko heuristic

**Files:**

- Create: `src/domain/bbr/sanerings-risiko.ts`
- Create: `src/domain/bbr/sanerings-risiko.test.ts`

- [ ] **Step 4.1: Write failing tests**

Create `src/domain/bbr/sanerings-risiko.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { deriveSaneringsRisiko } from "@/domain/bbr/sanerings-risiko";

describe("deriveSaneringsRisiko", () => {
  it("returns null when byggeaar is null", () => {
    expect(deriveSaneringsRisiko(null, null, null)).toBeNull();
  });

  it("returns hoej for pre-1950 building", () => {
    expect(deriveSaneringsRisiko(1930, null, null)).toBe("hoej");
    expect(deriveSaneringsRisiko(1949, null, null)).toBe("hoej");
  });

  it("returns moderat for 1950-1979 buildings", () => {
    expect(deriveSaneringsRisiko(1965, null, null)).toBe("moderat");
    expect(deriveSaneringsRisiko(1979, null, null)).toBe("moderat");
  });

  it("returns lav for post-1984 building with no asbestos materials", () => {
    expect(deriveSaneringsRisiko(1990, "1", "1")).toBe("lav");
  });

  it("returns moderat for pre-1985 building with eternit ydervæg (kode 5)", () => {
    expect(deriveSaneringsRisiko(1982, "5", null)).toBe("moderat");
  });

  it("returns moderat for pre-1985 building with eternit tagdækning (kode 5)", () => {
    expect(deriveSaneringsRisiko(1983, "1", "5")).toBe("moderat");
  });

  it("returns lav for post-1985 building even with eternit materials", () => {
    expect(deriveSaneringsRisiko(1988, "5", "5")).toBe("lav");
  });
});
```

- [ ] **Step 4.2: Run test to see it fail**

Run: `bun test src/domain/bbr/sanerings-risiko.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4.3: Create `src/domain/bbr/sanerings-risiko.ts`**

```typescript
// Pure heuristic for demolition/renovation contamination risk.
// Based on building year and cladding codes from BBR.
//
// Danish asbest/PCB bans:
//   Asbestcement products: banned 1972 for production (still in use until ~1984)
//   PCB in building materials: banned 1978
//   Asbest in ALL products: banned 1986
//
// "hoej" = asbest + PCB + bly all plausible → environmental survey required
// "moderat" = PCB or asbestcement plausible → investigation recommended
// "lav" = post-ban materials, low risk

export type SaneringsRisiko = "hoej" | "moderat" | "lav";

// BBR byg032 kode 5 = "Eternit/fibercement" — asbestcement risk until 1984
const ETERNIT_KODE = "5";

export function deriveSaneringsRisiko(
  byggeaar: number | null,
  ydervaegKode: string | null,
  tagKode: string | null,
): SaneringsRisiko | null {
  if (byggeaar === null) return null;
  if (byggeaar < 1950) return "hoej";
  if (byggeaar < 1980) return "moderat";
  if ((ydervaegKode === ETERNIT_KODE || tagKode === ETERNIT_KODE) && byggeaar < 1985) {
    return "moderat";
  }
  return "lav";
}
```

- [ ] **Step 4.4: Run tests to see them pass**

Run: `bun test src/domain/bbr/sanerings-risiko.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 4.5: Commit**

```bash
git add src/domain/bbr/sanerings-risiko.ts src/domain/bbr/sanerings-risiko.test.ts
git commit -m "feat(bbr): add deriveSaneringsRisiko pure heuristic with unit tests"
```

---

## Task 5: Database migration for new site_constraints columns

**Files:**

- Create: `supabase/migrations/20260524160000_arch246_bbr_due_diligence.sql`

- [ ] **Step 5.1: Create migration file**

```sql
-- ARCH-246: BBR Due-Diligence typed columns on site_constraints.
-- Nye felter: vandforsyning, afløbsforhold, ombygningsår og saneringsrisiko fra BBR.
-- Alle kolonner nullable — tri-state: null = ukendt/ikke hentet.

ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS bbr_vandforsyning_kode   TEXT,
  ADD COLUMN IF NOT EXISTS bbr_afloebsforhold_kode  TEXT,
  ADD COLUMN IF NOT EXISTS bbr_ombygningsaar        INTEGER,
  ADD COLUMN IF NOT EXISTS bbr_sanerings_risiko     TEXT
    CHECK (bbr_sanerings_risiko IN ('lav', 'moderat', 'hoej'));

COMMENT ON COLUMN public.site_constraints.bbr_vandforsyning_kode IS
  'ARCH-246 BBR byg030Vandforsyning: vandforsyningstype kode. null = ukendt/ikke hentet.';
COMMENT ON COLUMN public.site_constraints.bbr_afloebsforhold_kode IS
  'ARCH-246 BBR byg031Afloebsforhold: afløbstype kode. "4" = nedsivningsanlæg. null = ukendt.';
COMMENT ON COLUMN public.site_constraints.bbr_ombygningsaar IS
  'ARCH-246 BBR byg027OmTilbygningsaar: seneste ombygningsår. null = aldrig ombygget/ukendt.';
COMMENT ON COLUMN public.site_constraints.bbr_sanerings_risiko IS
  'ARCH-246 heuristik: saneringsrisiko for asbest/PCB/bly. "hoej"/"moderat"/"lav". null = ukendt byggeår.';

-- ROLLBACK:
-- ALTER TABLE public.site_constraints
--   DROP COLUMN IF EXISTS bbr_vandforsyning_kode,
--   DROP COLUMN IF EXISTS bbr_afloebsforhold_kode,
--   DROP COLUMN IF EXISTS bbr_ombygningsaar,
--   DROP COLUMN IF EXISTS bbr_sanerings_risiko;
```

- [ ] **Step 5.2: Apply migration locally**

Run: `bunx supabase db push` (or the project's migration apply command)
Expected: Migration applied without errors

- [ ] **Step 5.3: Regenerate Supabase types**

Run: `bunx supabase gen types typescript --local > src/integrations/supabase/types.ts`
Expected: `src/integrations/supabase/types.ts` updated with four new columns on `site_constraints`

- [ ] **Step 5.4: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 5.5: Commit**

```bash
git add supabase/migrations/20260524160000_arch246_bbr_due_diligence.sql src/integrations/supabase/types.ts
git commit -m "feat(db): add bbr due-diligence typed columns to site_constraints (ARCH-246)"
```

---

## Task 6: Map new BBR fields to site_constraints patch

**Files:**

- Modify: `src/integrations/supabase/repositories/site-constraints.derivation.ts`

- [ ] **Step 6.1: Add import for saneringsrisiko**

Add import at top of `site-constraints.derivation.ts`:

```typescript
import type { BbrKompliantData } from "@/integrations/bbr/client";
import { deriveSaneringsRisiko } from "@/domain/bbr/sanerings-risiko";
```

- [ ] **Step 6.2: Extend `deriveSiteConstraintsPatch` for new BBR fields**

The function already handles `patch.bbrData`. In that block (currently setting strandbeskyttelse/fredskov/klitfredning), add the new fields:

```typescript
if (patch.bbrData !== undefined && patch.bbrData !== null) {
  hasConstraintField = true;
  sitePatch.strandbeskyttelse = patch.bbrData.mat_strandbeskyttelse ?? false;
  sitePatch.fredskov = patch.bbrData.mat_fredskov ?? false;
  sitePatch.klitfredning = patch.bbrData.mat_klitfredning ?? false;
  // ARCH-246: BBR due-diligence
  sitePatch.bbr_vandforsyning_kode = patch.bbrData.vandforsyning_kode ?? null;
  sitePatch.bbr_afloebsforhold_kode = patch.bbrData.afloebsforhold_kode ?? null;
  sitePatch.bbr_ombygningsaar = patch.bbrData.ombygningsaar ?? null;
  sitePatch.bbr_sanerings_risiko =
    deriveSaneringsRisiko(
      patch.bbrData.byggeaar != null ? parseInt(patch.bbrData.byggeaar, 10) : null,
      patch.bbrData.ydervaegs_materiale !== null
        ? (patch.bbrData as BbrKompliantData).vandforsyning_kode // use raw kode
        : null,
      null, // tag kode not exposed in BbrKompliantData yet; pass null
    ) ?? null;
}
```

Wait — `BbrKompliantData.byggeaar` is `string | null`, but `deriveSaneringsRisiko` expects `number | null`. And we need the raw ydervæg/tag **kodes**, not the label strings. Let me fix this: `BbrKompliantData` now has `afloebsforhold_kode` (added in Task 3) and the raw ydervæg code is NOT in BbrKompliantData.

The issue is: ydervægs_materiale is a label string in BbrKompliantData but deriveSaneringsRisiko needs the raw code. I need to also expose the raw ydervæg/tag kodes.

Go back to Task 3 and add these fields to BbrKompliantData (add at the same time):

- `ydervaegs_materiale_kode: string | null` — raw byg032 code
- `tagdaekning_kode: string | null` — raw byg033 code

These are already in canonicalBuilding as `byg032YdervaeggensMateriale` and `byg033Tagdaekningsmateriale`. Add them to BbrKompliantData return.

Then in site-constraints.derivation.ts:

```typescript
sitePatch.bbr_sanerings_risiko =
  deriveSaneringsRisiko(
    patch.bbrData.byggeaar != null ? parseInt(patch.bbrData.byggeaar, 10) : null,
    (patch.bbrData as BbrKompliantData).ydervaegs_materiale_kode ?? null,
    (patch.bbrData as BbrKompliantData).tagdaekning_kode ?? null,
  ) ?? null;
```

**Correction to Task 3**: Add `ydervaegs_materiale_kode` and `tagdaekning_kode` to BbrKompliantData.

Add to BbrKompliantData type:

```typescript
ydervaegs_materiale_kode: string | null; // byg032 raw kode (for saneringsrisiko)
tagdaekning_kode: string | null; // byg033 raw kode (for saneringsrisiko)
```

Add to getKompliantData return:

```typescript
        ydervaegs_materiale_kode: yv_kode,
        tagdaekning_kode: tag_kode,
```

Add to getEmptyData:

```typescript
        ydervaegs_materiale_kode: null,
        tagdaekning_kode: null,
```

**Step 6.2 corrected**: In `site-constraints.derivation.ts`, add to the bbrData block:

```typescript
sitePatch.bbr_vandforsyning_kode = patch.bbrData.vandforsyning_kode ?? null;
sitePatch.bbr_afloebsforhold_kode = patch.bbrData.afloebsforhold_kode ?? null;
sitePatch.bbr_ombygningsaar = patch.bbrData.ombygningsaar ?? null;
sitePatch.bbr_sanerings_risiko =
  deriveSaneringsRisiko(
    patch.bbrData.byggeaar != null ? parseInt(patch.bbrData.byggeaar, 10) : null,
    patch.bbrData.ydervaegs_materiale_kode ?? null,
    patch.bbrData.tagdaekning_kode ?? null,
  ) ?? null;
```

Note: `patch.bbrData.byggeaar` is `string | null` (year as string like "1965"). `parseInt("1965", 10)` = 1965.

- [ ] **Step 6.3: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 6.4: Commit**

```bash
git add src/integrations/supabase/repositories/site-constraints.derivation.ts src/integrations/bbr/client.ts
git commit -m "feat(bbr/site-constraints): map vandforsyning, afloebsforhold, ombygningsaar and saneringsrisiko to typed columns"
```

---

## Task 7: Add new building task keys and task generators

**Files:**

- Modify: `src/types/building-platform.ts`
- Modify: `src/integrations/supabase/repositories/building-tasks.derivation.ts`
- Create: `src/integrations/supabase/repositories/building-tasks-bbr.derivation.test.ts`

- [ ] **Step 7.1: Write failing tests**

Create `src/integrations/supabase/repositories/building-tasks-bbr.derivation.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { deriveAutoTasks } from "@/integrations/supabase/repositories/building-tasks.derivation";
import { BUILDING_TASK_KEYS } from "@/types/building-platform";

const baseProject = "project-uuid-123";

const baseTriggers = {
  projectId: baseProject,
  saveValue: null,
  isFredet: null,
  strandbeskyttelse: null,
  fredskov: null,
  klitfredning: null,
  landzonePermitRequired: null,
  lokalplanByggefeltPresent: null,
  withinBuildingField: null,
  wastewaterPlanStatus: null,
  sewerAreaType: null,
  paragraph3Nature: null,
  natura2000: null,
  protectedDige: null,
  fortidsminde: null,
  fortidsmindeBuffer: null,
  bnbo: null,
  osd: null,
  rawMaterialArea: null,
  soilContamination: null,
  jordforureningV1: null,
  jordforureningV2: null,
  omraadeklassificering: null,
  jordforureningOlietank: null,
  bbrAfloebsforholdKode: null,
  bbrSaneringsRisiko: null,
} as const;

describe("ARCH-246 building tasks", () => {
  it("generates OLIETANK_MILJOESCREENING when olietank is true", () => {
    const tasks = deriveAutoTasks({
      ...baseTriggers,
      jordforureningOlietank: true,
    });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).toContain(BUILDING_TASK_KEYS.OLIETANK_MILJOESCREENING);
  });

  it("does NOT generate OLIETANK_MILJOESCREENING when olietank is false", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, jordforureningOlietank: false });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).not.toContain(BUILDING_TASK_KEYS.OLIETANK_MILJOESCREENING);
  });

  it("does NOT generate OLIETANK_MILJOESCREENING when olietank is null (unknown)", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, jordforureningOlietank: null });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).not.toContain(BUILDING_TASK_KEYS.OLIETANK_MILJOESCREENING);
  });

  it("generates ASBEST_PCB_SCREENING when saneringsrisiko is hoej", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, bbrSaneringsRisiko: "hoej" });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).toContain(BUILDING_TASK_KEYS.ASBEST_PCB_SCREENING);
  });

  it("generates ASBEST_PCB_SCREENING when saneringsrisiko is moderat", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, bbrSaneringsRisiko: "moderat" });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).toContain(BUILDING_TASK_KEYS.ASBEST_PCB_SCREENING);
  });

  it("does NOT generate ASBEST_PCB_SCREENING when saneringsrisiko is lav", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, bbrSaneringsRisiko: "lav" });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).not.toContain(BUILDING_TASK_KEYS.ASBEST_PCB_SCREENING);
  });

  it("generates KLOAK_NEDSIVNING_AFKLARING when afloebsforhold is nedsivning (kode 4)", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, bbrAfloebsforholdKode: "4" });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).toContain(BUILDING_TASK_KEYS.KLOAK_NEDSIVNING_AFKLARING);
  });

  it("does NOT generate KLOAK_NEDSIVNING_AFKLARING for fælleskloak (kode 1)", () => {
    const tasks = deriveAutoTasks({ ...baseTriggers, bbrAfloebsforholdKode: "1" });
    const keys = tasks.map((t) => t.task_key);
    expect(keys).not.toContain(BUILDING_TASK_KEYS.KLOAK_NEDSIVNING_AFKLARING);
  });
});
```

- [ ] **Step 7.2: Run tests to see them fail**

Run: `bun test src/integrations/supabase/repositories/building-tasks-bbr.derivation.test.ts`
Expected: FAIL — new fields not in ComplianceTriggers yet

- [ ] **Step 7.3: Add new task keys to `BUILDING_TASK_KEYS` in building-platform.ts**

In the `// Matriklen phase` section, add:

```typescript
  OLIETANK_MILJOESCREENING: "olietank_miljoescreening",
  ASBEST_PCB_SCREENING: "asbest_pcb_screening",
```

- [ ] **Step 7.4: Extend `ComplianceTriggers` in building-tasks.derivation.ts**

Add three new fields to the `ComplianceTriggers` type after `omraadeklassificering`:

```typescript
// ARCH-246: BBR Due-Diligence triggers
jordforureningOlietank: boolean | null;
bbrAfloebsforholdKode: string | null;
bbrSaneringsRisiko: "lav" | "moderat" | "hoej" | null;
```

- [ ] **Step 7.5: Add three task generators in `deriveAutoTasks`**

Add at the end of `deriveAutoTasks`, before `return tasks;`:

```typescript
// ARCH-246: Olietank (from DK-Jord WFS — jordforurening_olietank column)
if (t.jordforureningOlietank === true) {
  tasks.push({
    project_id: t.projectId,
    task_key: BUILDING_TASK_KEYS.OLIETANK_MILJOESCREENING,
    title: "Olietank registreret — miljøscreening påkrævet",
    description:
      "DK-Jord registrerer en olietank på eller nær grunden. En miljøteknisk undersøgelse " +
      "(jordprøver) er nødvendig inden nedrivning eller byggestart for at fastlægge eventuel forurening.",
    phase: "matriklen",
    status: "pending",
    priority: 2,
    is_auto_generated: true,
    blocked_by_constraint: "jordforurening_olietank",
    metadata: { kilde: "DK-Jord WFS olietank", myndighed: "Miljøstyrelsen" },
  });
}

// ARCH-246: Asbest/PCB saneringsrisiko (from BBR byggeår + materialer)
if (t.bbrSaneringsRisiko === "hoej" || t.bbrSaneringsRisiko === "moderat") {
  tasks.push({
    project_id: t.projectId,
    task_key: BUILDING_TASK_KEYS.ASBEST_PCB_SCREENING,
    title: `Asbest/PCB-screening anbefales (${t.bbrSaneringsRisiko === "hoej" ? "høj risiko" : "moderat risiko"})`,
    description:
      t.bbrSaneringsRisiko === "hoej"
        ? "Byggeår og materialer indikerer høj risiko for asbest, PCB og bly. " +
          "En miljøscreening er lovpligtig inden nedrivning (Affaldsbekendtgørelsen). " +
          "Budgettér screeningsrapport + evt. sanering som separat post."
        : "Byggeår eller materialer (fx eternit) indikerer moderat risiko for asbestcement eller PCB. " +
          "En screening anbefales inden nedrivning eller større renovering.",
    phase: "matriklen",
    status: t.bbrSaneringsRisiko === "hoej" ? "blocked" : "pending",
    priority: t.bbrSaneringsRisiko === "hoej" ? 1 : 2,
    is_auto_generated: true,
    blocked_by_constraint: "bbr_sanerings_risiko",
    metadata: {
      saneringsrisiko: t.bbrSaneringsRisiko,
      lovgrundlag: "Affaldsbekendtgørelsen §57",
      myndighed: "Kommunen (byggesag)",
    },
  });
}

// ARCH-246: BBR afløb — nedsivning/samletank kræver forsyningsafklaring
// Kode 4=nedsivning, 5=bundfælldningstank, 6=samletank, 7=ingen afledning
const AFLOEB_KODER_MED_AFKLARING = new Set(["4", "5", "6", "7"]);
if (t.bbrAfloebsforholdKode !== null && AFLOEB_KODER_MED_AFKLARING.has(t.bbrAfloebsforholdKode)) {
  tasks.push({
    project_id: t.projectId,
    task_key: BUILDING_TASK_KEYS.KLOAK_NEDSIVNING_AFKLARING,
    title: "Kloak- og afløbsforhold skal afklares",
    description:
      `BBR registrerer ikke offentlig kloak (afløbstype: kode ${t.bbrAfloebsforholdKode}). ` +
      "Nedsivning, samletank eller manglende afledning skal afklares med kommunen/forsyningen " +
      "inden projektet budgetteres og myndighedsbehandles.",
    phase: "maskinrummet",
    status: "pending",
    priority: 2,
    is_auto_generated: true,
    blocked_by_constraint: "bbr_afloebsforhold_kode",
    metadata: {
      afloebsforhold_kode: t.bbrAfloebsforholdKode,
      kilde: "BBR byg031Afloebsforhold",
      myndighed: "Kommune/Forsyning",
    },
  });
}
```

- [ ] **Step 7.6: Run tests to see them pass**

Run: `bun test src/integrations/supabase/repositories/building-tasks-bbr.derivation.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 7.7: Commit**

```bash
git add src/types/building-platform.ts \
        src/integrations/supabase/repositories/building-tasks.derivation.ts \
        src/integrations/supabase/repositories/building-tasks-bbr.derivation.test.ts
git commit -m "feat(building-tasks): add olietank, asbest/PCB and afloeb task generators (ARCH-246)"
```

---

## Task 8: Final verification

- [ ] **Step 8.1: Run full TypeScript check**

Run: `bunx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8.2: Run all tests**

Run: `bun test src`
Expected: All pass (new tests included)

- [ ] **Step 8.3: Run lint**

Run: `bunx eslint .`
Expected: 0 errors, 0 warnings

- [ ] **Step 8.4: Run build**

Run: `bun run build`
Expected: Successful build

- [ ] **Step 8.5: Commit final**

```bash
git commit --allow-empty -m "chore: ARCH-246 BBR due-diligence expansion — all checks pass"
```

---

## Self-Review Checklist

- [x] byg030/byg031 fields confirmed in `schema/BBR.graphql` — field names `byg030Vandforsyning` and `byg031Afloebsforhold`
- [x] Oil tank data already stored in `site_constraints.jordforurening_olietank` from DK-Jord — task trigger added to ComplianceTriggers
- [x] saneringsrisiko heuristic is pure function with no imports — testable without DB or network
- [x] New building tasks use existing unique (project_id, task_key) constraint — upsert-safe
- [x] `analysis-orchestrator.ts` unchanged — BBR data flows through existing path
- [x] No new `any` casts
- [x] `byggeaar` is string in BbrKompliantData — parseInt used in site-constraints.derivation
- [x] Raw ydervæg/tag kodes (`ydervaegs_materiale_kode`, `tagdaekning_kode`) must be added to BbrKompliantData in Task 3 (see correction in Task 6)
- [x] Protected files: none touched
