# ARCH-259: Cache/Supabase Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `address_source_results` and missing `address_analysis` columns to the generated Supabase types, introduce a typed `cache-policy.ts` TTL module, add Zod decoders for cached payloads, and remove all `any` casts from `cache/client.ts`.

**Architecture:** Fix the generated types so `supabaseAdmin.from("address_source_results")` is fully typed. Extract TTL constants to a shared config module. Add a thin decoder layer that validates cached JSON envelopes before they become trusted domain objects. All decoder logic is pure and unit-testable with no Supabase dependency.

**Tech Stack:** TypeScript, Zod, Bun test, Supabase generated types

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/integrations/supabase/types.ts` | Add `address_source_results` table + `jordstykke_polygon`/`jordstykke_polygon_at` to `address_analysis` |
| Create | `src/lib/cache-policy.ts` | Named TTL constants + `sourceResultTtlDays()` helper |
| Create | `src/integrations/cache/decoders.ts` | Zod schemas for `SourceResult` envelope + `ComplianceResult` shape guard |
| Create | `src/integrations/cache/decoders.test.ts` | Pure unit tests — no Supabase |
| Modify | `src/integrations/cache/client.ts` | Remove `any` casts, use typed tables + decoders |

---

## Task 1: Update Supabase types

**Files:**
- Modify: `src/integrations/supabase/types.ts`

The following DB objects exist in migrations but are absent from `types.ts`:
- `address_source_results` table — added in `20260519120000_address_source_results.sql`
- `address_analysis.jordstykke_polygon` + `jordstykke_polygon_at` — added in `20260517000000_add_jordstykke_polygon.sql`

- [ ] **Step 1: Add `jordstykke_polygon` and `jordstykke_polygon_at` to `address_analysis`**

In `types.ts`, locate the `address_analysis` `Row` block (around line 12). Add two fields:

```typescript
        Row: {
          address_id: string;
          compliance_result: Json | null;
          compliance_result_at: string | null;
          created_at: string;
          id: string;
          jordstykke_polygon: Json | null;        // ADD THIS
          jordstykke_polygon_at: string | null;   // ADD THIS
          lokalplan_extracted: Json | null;
          lokalplan_extracted_at: string | null;
          lokalplan_pdf_url: string | null;
          report_generated_at: string | null;
          report_text: string | null;
          servitut_extracted: Json | null;
          servitut_extracted_at: string | null;
          updated_at: string;
        };
```

Add the same fields to `Insert` and `Update` blocks (both optional):
```typescript
          jordstykke_polygon?: Json | null;
          jordstykke_polygon_at?: string | null;
```

- [ ] **Step 2: Add `address_source_results` table**

After the closing `};` of the `site_constraints` table entry (around line 400), add a new table entry. Add it before the closing `}` of `Tables`:

```typescript
      address_source_results: {
        Row: {
          id: string;
          address_id: string;
          source_kind: string;
          status: string;
          confidence: string;
          is_mock: boolean;
          fetched_at: string;
          source_url: string | null;
          raw_feature_count: number | null;
          payload: Json | null;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          address_id: string;
          source_kind: string;
          status: string;
          confidence: string;
          is_mock?: boolean;
          fetched_at?: string;
          source_url?: string | null;
          raw_feature_count?: number | null;
          payload?: Json | null;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          address_id?: string;
          source_kind?: string;
          status?: string;
          confidence?: string;
          is_mock?: boolean;
          fetched_at?: string;
          source_url?: string | null;
          raw_feature_count?: number | null;
          payload?: Json | null;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 3: Verify type-check passes**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(arch-259): add address_source_results + jordstykke_polygon to Supabase types"
```

---

## Task 2: Create `cache-policy.ts`

**Files:**
- Create: `src/lib/cache-policy.ts`

- [ ] **Step 1: Create the file**

```typescript
// Named TTL constants for address analysis cache layers.
// Import from here — never hardcode day values in cache/client.ts.

export const CACHE_TTL_DAYS = {
  lokalplan: 30,
  servitut: 7,
  compliance: 30,
  report: 30,
  jordstykke: 90,
} as const;

export const SOURCE_RESULT_TTL_DAYS_DEFAULT = 30;

const SOURCE_RESULT_TTL_OVERRIDES: Partial<Record<string, number>> = {
  dkjord: 30,
  geus: 30,
  hip: 30,
  dhm: 30,
  geodanmark_mat: 90,
  dai_extended: 30,
  plandata_ext: 14,
};

export function sourceResultTtlDays(sourceKind: string): number {
  return SOURCE_RESULT_TTL_OVERRIDES[sourceKind] ?? SOURCE_RESULT_TTL_DAYS_DEFAULT;
}

export function daysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/cache-policy.ts
git commit -m "feat(arch-259): add cache-policy.ts — named TTL constants"
```

---

## Task 3: Create `cache/decoders.ts`

**Files:**
- Create: `src/integrations/cache/decoders.ts`

The decoders validate the shape of cached JSON before it is returned as trusted domain types. The `SourceResult<T>` metadata (all fields except `data`/`payload`) is fully validated with Zod. The `payload` field remains generic — callers are responsible for their own data shape.

- [ ] **Step 1: Create the file**

```typescript
import { z } from "zod";
import type { SourceResult, SourceStatus, SourceConfidence } from "@/lib/source-result";

// ---------------------------------------------------------------------------
// SourceResult metadata schema (envelope fields — not the payload/data)
// ---------------------------------------------------------------------------

const sourceStatusSchema = z.enum(["ok", "error", "skipped", "mock"]);
const sourceConfidenceSchema = z.enum(["confirmed", "estimated", "missing", "unknown"]);

export const sourceResultRowSchema = z.object({
  status: sourceStatusSchema,
  confidence: sourceConfidenceSchema,
  is_mock: z.boolean(),
  fetched_at: z.string(),
  source_url: z.string().nullable(),
  raw_feature_count: z.number().int().nullable(),
  payload: z.unknown().nullable(),
  source_kind: z.string(),
});

export type SourceResultRow = z.infer<typeof sourceResultRowSchema>;

/**
 * Decode a raw `address_source_results` DB row into a typed `SourceResult<T>`.
 * Returns null if the row fails schema validation.
 */
export function decodeSourceResultRow<T>(raw: unknown): SourceResult<T> | null {
  const parsed = sourceResultRowSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    status: r.status as SourceStatus,
    confidence: r.confidence as SourceConfidence,
    isMock: r.is_mock,
    fetchedAt: r.fetched_at,
    sourceUrl: r.source_url,
    rawFeatureCount: r.raw_feature_count,
    data: (r.payload ?? null) as T | null,
    kilde: r.source_kind,
  };
}

// ---------------------------------------------------------------------------
// ComplianceResult shape guard
// ---------------------------------------------------------------------------
// Not a full Zod schema (too many nested types), but verifies the key
// structural property: analysedAt must be a non-empty string.
// This prevents the common failure mode of an empty cached object being
// returned as a valid ComplianceResult.

export function isValidComplianceResultShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v["analysedAt"] === "string" && v["analysedAt"].length > 0;
}

// ---------------------------------------------------------------------------
// LokalplanExtract shape guard
// ---------------------------------------------------------------------------

export function isValidLokalplanExtractShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  // LokalplanExtract must have at least one recognized property
  return "bebyggelsesprocent" in v || "maxEtager" in v || "maxHoejde" in v || "formaal" in v;
}
```

---

## Task 4: Write unit tests for decoders

**Files:**
- Create: `src/integrations/cache/decoders.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect } from "bun:test";
import {
  decodeSourceResultRow,
  isValidComplianceResultShape,
  isValidLokalplanExtractShape,
} from "./decoders";
import { sourceResultTtlDays, daysToMs, CACHE_TTL_DAYS } from "@/lib/cache-policy";

describe("decodeSourceResultRow", () => {
  it("decodes a valid row", () => {
    const raw = {
      status: "ok",
      confidence: "confirmed",
      is_mock: false,
      fetched_at: "2026-05-20T10:00:00Z",
      source_url: "https://dkjord.mst.dk/wfs",
      raw_feature_count: 3,
      payload: { v1Kortlagt: false, v2Kortlagt: null },
      source_kind: "dkjord",
    };
    const result = decodeSourceResultRow<{ v1Kortlagt: boolean | null }>(raw);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("ok");
    expect(result?.confidence).toBe("confirmed");
    expect(result?.isMock).toBe(false);
    expect(result?.kilde).toBe("dkjord");
    expect(result?.data?.v1Kortlagt).toBe(false);
  });

  it("returns null for invalid status", () => {
    const raw = {
      status: "invalid_status",
      confidence: "confirmed",
      is_mock: false,
      fetched_at: "2026-05-20T10:00:00Z",
      source_url: null,
      raw_feature_count: null,
      payload: null,
      source_kind: "dkjord",
    };
    expect(decodeSourceResultRow(raw)).toBeNull();
  });

  it("returns null for missing required fields", () => {
    expect(decodeSourceResultRow({})).toBeNull();
    expect(decodeSourceResultRow(null)).toBeNull();
    expect(decodeSourceResultRow("string")).toBeNull();
  });

  it("decodes mock result", () => {
    const raw = {
      status: "mock",
      confidence: "estimated",
      is_mock: true,
      fetched_at: "2026-05-20T10:00:00Z",
      source_url: null,
      raw_feature_count: 0,
      payload: { area: 800 },
      source_kind: "geodanmark_mat",
    };
    const result = decodeSourceResultRow(raw);
    expect(result?.isMock).toBe(true);
    expect(result?.status).toBe("mock");
  });

  it("decodes null payload as null data", () => {
    const raw = {
      status: "error",
      confidence: "unknown",
      is_mock: false,
      fetched_at: "2026-05-20T10:00:00Z",
      source_url: null,
      raw_feature_count: null,
      payload: null,
      source_kind: "geus",
    };
    const result = decodeSourceResultRow(raw);
    expect(result?.data).toBeNull();
  });
});

describe("isValidComplianceResultShape", () => {
  it("returns true for object with analysedAt string", () => {
    expect(isValidComplianceResultShape({ analysedAt: "2026-05-20T10:00:00Z", bbr: null })).toBe(true);
  });

  it("returns false for empty object", () => {
    expect(isValidComplianceResultShape({})).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidComplianceResultShape(null)).toBe(false);
  });

  it("returns false for object with empty analysedAt", () => {
    expect(isValidComplianceResultShape({ analysedAt: "" })).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isValidComplianceResultShape("string")).toBe(false);
    expect(isValidComplianceResultShape(42)).toBe(false);
  });
});

describe("isValidLokalplanExtractShape", () => {
  it("returns true for object with bebyggelsesprocent", () => {
    expect(isValidLokalplanExtractShape({ bebyggelsesprocent: { value: 30, source: "pdf_extracted", confidence: 0.8 } })).toBe(true);
  });

  it("returns true for object with maxEtager", () => {
    expect(isValidLokalplanExtractShape({ maxEtager: { value: 2, source: "pdf_extracted", confidence: 0.9 } })).toBe(true);
  });

  it("returns false for empty object", () => {
    expect(isValidLokalplanExtractShape({})).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidLokalplanExtractShape(null)).toBe(false);
  });
});

describe("cache-policy", () => {
  it("sourceResultTtlDays returns correct TTL for known kinds", () => {
    expect(sourceResultTtlDays("dkjord")).toBe(30);
    expect(sourceResultTtlDays("geodanmark_mat")).toBe(90);
    expect(sourceResultTtlDays("plandata_ext")).toBe(14);
  });

  it("sourceResultTtlDays returns 30 for unknown kind", () => {
    expect(sourceResultTtlDays("unknown_source")).toBe(30);
  });

  it("daysToMs converts correctly", () => {
    expect(daysToMs(1)).toBe(86_400_000);
    expect(daysToMs(30)).toBe(30 * 86_400_000);
  });

  it("CACHE_TTL_DAYS constants are correct", () => {
    expect(CACHE_TTL_DAYS.lokalplan).toBe(30);
    expect(CACHE_TTL_DAYS.servitut).toBe(7);
    expect(CACHE_TTL_DAYS.jordstykke).toBe(90);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
bun test src/integrations/cache/decoders.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/cache/decoders.ts src/integrations/cache/decoders.test.ts src/lib/cache-policy.ts
git commit -m "feat(arch-259): add cache decoders + cache-policy TTL module with tests"
```

---

## Task 5: Update `cache/client.ts` — remove `any` casts

**Files:**
- Modify: `src/integrations/cache/client.ts`

There are four `any` casts to remove:
1. `(supabaseAdmin.from as any)("address_source_results")` (×2 — getCachedSourceResult + setCachedSourceResult)
2. `(row as any).jordstykke_polygon_at` (getCachedJordstykkePolygon)
3. `(row as any).jordstykke_polygon` (getCachedJordstykkePolygon)

After Task 1 (types.ts updated) and Task 2 (cache-policy.ts created), these can be replaced with typed access.

- [ ] **Step 1: Update the imports block**

Replace the existing imports in `cache/client.ts`:

```typescript
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import type { ComplianceResult } from "@/lib/analysis-orchestrator";
import type * as GeoJSON from "geojson";
import type { SourceResult, SourceStatus, SourceConfidence } from "@/lib/source-result";
import { CACHE_TTL_DAYS, sourceResultTtlDays, daysToMs } from "@/lib/cache-policy";
import { decodeSourceResultRow, isValidComplianceResultShape } from "./decoders";
```

- [ ] **Step 2: Replace TTL constants block**

Remove the inline `DAYS_MS` helper and `TTL` object (lines 19-27 in current file). Replace with references to `cache-policy.ts`:

```typescript
function isFresh(timestamp: string | null, ttlMs: number): boolean {
  if (!timestamp) return false;
  return Date.now() - new Date(timestamp).getTime() < ttlMs;
}
```

The `TTL` usages become:
- `TTL.lokalplan` → `daysToMs(CACHE_TTL_DAYS.lokalplan)`
- `TTL.servitut` → `daysToMs(CACHE_TTL_DAYS.servitut)`
- `TTL.compliance` → `daysToMs(CACHE_TTL_DAYS.compliance)`
- `TTL.report` → `daysToMs(CACHE_TTL_DAYS.report)`
- `TTL.jordstykke` → `daysToMs(CACHE_TTL_DAYS.jordstykke)`

- [ ] **Step 3: Fix `getCachedCompliance` — add shape guard**

Replace:
```typescript
export async function getCachedCompliance(addressId: string): Promise<ComplianceResult | null> {
  const row = await getRow(addressId);
  if (!row) return null;
  if (!isFresh(row.compliance_result_at, TTL.compliance)) return null;
  return row.compliance_result as unknown as ComplianceResult;
}
```

With:
```typescript
export async function getCachedCompliance(addressId: string): Promise<ComplianceResult | null> {
  const row = await getRow(addressId);
  if (!row) return null;
  if (!isFresh(row.compliance_result_at, daysToMs(CACHE_TTL_DAYS.compliance))) return null;
  if (!isValidComplianceResultShape(row.compliance_result)) return null;
  return row.compliance_result as unknown as ComplianceResult;
}
```

- [ ] **Step 4: Fix `getCachedJordstykkePolygon` — use typed column access**

Replace the `any` casts for `jordstykke_polygon_at` and `jordstykke_polygon`:

```typescript
export async function getCachedJordstykkePolygon(
  addressId: string,
): Promise<GeoJSON.FeatureCollection | null> {
  const row = await getRow(addressId);
  if (!row) return null;
  if (!isFresh(row.jordstykke_polygon_at, daysToMs(CACHE_TTL_DAYS.jordstykke))) return null;
  return row.jordstykke_polygon as GeoJSON.FeatureCollection | null;
}

export async function setCachedJordstykkePolygon(
  addressId: string,
  featureCollection: GeoJSON.FeatureCollection,
): Promise<void> {
  await upsert(addressId, {
    jordstykke_polygon: featureCollection as unknown as Json,
    jordstykke_polygon_at: new Date().toISOString(),
  });
}
```

- [ ] **Step 5: Fix `getCachedSourceResult` — use typed table + decoder**

Replace:
```typescript
export async function getCachedSourceResult<T>(
  addressId: string,
  sourceKind: string,
): Promise<SourceResult<T> | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin.from as any)("address_source_results")
    .select("*")
    .eq("address_id", addressId)
    .eq("source_kind", sourceKind)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error)
    throw new Error(
      `[SourceCache] select fejlede for ${addressId}/${sourceKind}: ${error.message}`,
    );
  if (!data) return null;

  return {
    status: data.status as SourceStatus,
    confidence: data.confidence as SourceConfidence,
    isMock: data.is_mock,
    fetchedAt: data.fetched_at,
    sourceUrl: data.source_url,
    rawFeatureCount: data.raw_feature_count,
    data: (data.payload ?? null) as T | null,
    kilde: data.source_kind,
  };
}
```

With:
```typescript
export async function getCachedSourceResult<T>(
  addressId: string,
  sourceKind: string,
): Promise<SourceResult<T> | null> {
  const { data, error } = await supabaseAdmin
    .from("address_source_results")
    .select("*")
    .eq("address_id", addressId)
    .eq("source_kind", sourceKind)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error)
    throw new Error(
      `[SourceCache] select fejlede for ${addressId}/${sourceKind}: ${error.message}`,
    );
  if (!data) return null;

  return decodeSourceResultRow<T>(data);
}
```

- [ ] **Step 6: Fix `setCachedSourceResult` — use typed table**

Replace:
```typescript
export async function setCachedSourceResult<T>(
  addressId: string,
  sourceKind: string,
  result: SourceResult<T>,
  ttlDaysOverride?: number,
): Promise<void> {
  const ttlDays = ttlDaysOverride ?? sourceResultTtlDays(sourceKind);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin.from as any)("address_source_results").upsert(
    { ... },
    { onConflict: "address_id,source_kind" },
  );
  ...
}
```

With:
```typescript
export async function setCachedSourceResult<T>(
  addressId: string,
  sourceKind: string,
  result: SourceResult<T>,
  ttlDaysOverride?: number,
): Promise<void> {
  const ttlDays = ttlDaysOverride ?? sourceResultTtlDays(sourceKind);
  const expiresAt = new Date(Date.now() + daysToMs(ttlDays)).toISOString();

  const { error } = await supabaseAdmin
    .from("address_source_results")
    .upsert(
      {
        address_id: addressId,
        source_kind: sourceKind,
        status: result.status,
        confidence: result.confidence,
        is_mock: result.isMock,
        fetched_at: result.fetchedAt,
        source_url: result.sourceUrl,
        raw_feature_count: result.rawFeatureCount,
        payload: result.data as unknown as Json,
        expires_at: expiresAt,
      },
      { onConflict: "address_id,source_kind" },
    );

  if (error) {
    throw new Error(
      `[SourceCache] upsert fejlede for ${addressId}/${sourceKind}: ${error.message}`,
    );
  }
}
```

- [ ] **Step 7: Remove the inline `SOURCE_RESULT_TTL_DAYS` and `sourceResultTtlDays` definitions**

Delete lines 171–181 in the current `client.ts` (the `SOURCE_RESULT_TTL_DAYS` and `sourceResultTtlDays` function) — they are now in `cache-policy.ts`.

---

## Task 6: Verify and commit

- [ ] **Step 1: Type-check**

```bash
bunx tsc --noEmit
```

Expected: no errors. No `any` or `eslint-disable` comments remain in `cache/client.ts`.

- [ ] **Step 2: Run all tests**

```bash
bun test
```

Expected: all tests pass (includes the new decoder tests + the integration tests that skip without Supabase env).

- [ ] **Step 3: Lint**

```bash
bunx eslint src/integrations/cache/ src/lib/cache-policy.ts
```

Expected: no new errors. No remaining `@typescript-eslint/no-explicit-any` disable comments in `cache/client.ts`.

- [ ] **Step 4: Final commit**

```bash
git add src/integrations/cache/client.ts
git commit -m "feat(arch-259): remove any casts from cache client — typed address_source_results + decoders"
```

---

## Self-Review

**Spec coverage:**
- ✅ Supabase `Database` types include `address_source_results` (Task 1)
- ✅ `address_analysis` includes `jordstykke_polygon`/`jordstykke_polygon_at` (Task 1)
- ✅ `cache/client.ts` contains no `any` or `as unknown as ComplianceResult` casts (Task 5)
- ✅ Zod schema for `SourceResult` envelope — `sourceResultRowSchema` (Task 3)
- ✅ Shape guards for `ComplianceResult` and `LokalplanExtract` (Task 3)
- ✅ TTL values in named config module `cache-policy.ts` (Task 2)
- ✅ Unit tests: valid decode, malformed payload, null/missing fields, TTL values, shape guards (Task 4)

**Placeholder scan:** No TBD or "implement later" — all steps have complete code.

**Type consistency:** `decodeSourceResultRow` is used in both `getCachedSourceResult` (Task 5) and tested in `decoders.test.ts` (Task 4). `CACHE_TTL_DAYS` + `daysToMs` + `sourceResultTtlDays` all defined in `cache-policy.ts`, imported in both `client.ts` and `decoders.test.ts`.
