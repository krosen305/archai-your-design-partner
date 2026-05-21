# ARCH-275: datafordeler-clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a shared typed `datafordelerGraphqlFetch<T>()` transport and typed response decoders for all five Datafordeler GraphQL clients (DAR, BBR, MAT, EBR, Plandata), eliminating `Promise<any>`, `any[]`, and `map((node: any) => ...)` patterns.

**Architecture:** New `src/integrations/datafordeler/graphql-client.ts` owns the transport — it wraps `fetchWithRetry`, injects apiKey, handles GraphQL error envelope, and returns `T` parsed from `data`. Each client defines its own node types and decoder (narrow type guard or Zod schema) and calls `datafordelerGraphqlFetch<NodeType[]>()` instead of its own `gqlFetch`. The `Promise<any>` in each client's fetch helper is replaced by `Promise<T>`.

**Tech Stack:** TypeScript, Bun test, `fetchWithRetry` (already exists at `src/integrations/http/fetch-with-retry.ts`), Zod (already in project).

---

## File Map

| Action | File |
|--------|------|
| Create | `src/integrations/datafordeler/graphql-client.ts` |
| Create | `src/integrations/datafordeler/graphql-client.test.ts` |
| Modify | `src/integrations/dar/client.ts` |
| Modify | `src/integrations/bbr/client.ts` |
| Modify | `src/integrations/mat/client.ts` |
| Modify | `src/integrations/ebr/client.ts` |
| Modify | `src/integrations/plandata/client.ts` |

---

### Task 1: Create the shared `datafordelerGraphqlFetch` transport

**Files:**
- Create: `src/integrations/datafordeler/graphql-client.ts`
- Create: `src/integrations/datafordeler/graphql-client.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/integrations/datafordeler/graphql-client.test.ts
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { datafordelerGraphqlFetch } from "./graphql-client";
import { installSequentialJsonFetch, resetMockedFetch } from "@/testing/fetch-mocks";

beforeEach(() => resetMockedFetch());
afterEach(() => resetMockedFetch());

const TEST_URL = new URL("https://graphql.datafordeler.dk/DAR/v1");
const TEST_QUERY = "query { DAR_Adresse(where: {id_lokalId: {eq: $id}}) { nodes { id_lokalId } } }";
const TEST_VARS = { id: "abc", virkningstid: "2026-01-01", registreringstid: "2026-01-01" };

describe("datafordelerGraphqlFetch", () => {
  it("returns typed data on success", async () => {
    installSequentialJsonFetch([
      { data: { DAR_Adresse: { nodes: [{ id_lokalId: "abc" }] } } },
    ]);
    const result = await datafordelerGraphqlFetch<{ DAR_Adresse: { nodes: { id_lokalId: string }[] } }>(
      TEST_URL,
      TEST_QUERY,
      TEST_VARS,
      "DAR_Adresse",
    );
    expect(result.DAR_Adresse.nodes[0].id_lokalId).toBe("abc");
  });

  it("throws on HTTP error", async () => {
    installSequentialJsonFetch([{ error: "server error" }], { status: 500 });
    await expect(
      datafordelerGraphqlFetch(TEST_URL, TEST_QUERY, TEST_VARS, "DAR_Adresse"),
    ).rejects.toThrow("HTTP 500");
  });

  it("throws on GraphQL errors array", async () => {
    installSequentialJsonFetch([
      { errors: [{ message: "Field not found" }] },
    ]);
    await expect(
      datafordelerGraphqlFetch(TEST_URL, TEST_QUERY, TEST_VARS, "DAR_Adresse"),
    ).rejects.toThrow("Field not found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/integrations/datafordeler/graphql-client.test.ts
```

Expected: `Cannot find module './graphql-client'`

- [ ] **Step 3: Create `graphql-client.ts`**

```typescript
// src/integrations/datafordeler/graphql-client.ts
// Shared typed GraphQL transport for all Datafordeler registers.
// SERVER-SIDE ONLY — API key must never reach the browser.

import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { logServerEvent } from "@/lib/server-logger";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";

export type DatafordelerGraphqlOptions = {
  timeoutMs?: number;
  trace?: AnalysisTraceContext | null;
};

export async function datafordelerGraphqlFetch<T>(
  url: URL,
  query: string,
  variables: Record<string, unknown>,
  operation: string,
  options?: DatafordelerGraphqlOptions,
): Promise<T> {
  const response = await fetchWithRetry(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
    { timeoutMs: options?.timeoutMs ?? 12_000 },
    {
      trace: options?.trace ?? null,
      service: `Datafordeler ${operation.split("_")[0]}`,
      operation,
      phase: "datafordeler_fetch",
    },
  );

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`Datafordeler ${operation} HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const parsed = JSON.parse(bodyText) as { data?: T; errors?: { message: string }[] };

  if (parsed.errors?.length) {
    logServerEvent({
      module: "datafordeler/graphql-client",
      operation,
      severity: "fatal",
      message: "GraphQL-fejl fra Datafordeler",
      metadata: { errors: parsed.errors },
    });
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data as T;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/integrations/datafordeler/graphql-client.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/datafordeler/graphql-client.ts src/integrations/datafordeler/graphql-client.test.ts
git commit -m "feat(arch-275): create shared datafordelerGraphqlFetch<T> transport"
```

---

### Task 2: Update `dar/client.ts`

**Files:**
- Modify: `src/integrations/dar/client.ts`

- [ ] **Step 1: Define node types and replace `gqlFetch`**

At the top of `dar/client.ts`, add imports and define response shapes:

```typescript
import { datafordelerGraphqlFetch } from "@/integrations/datafordeler/graphql-client";
```

Define node types for each query response (add after imports):

```typescript
type DarAdresseNode = {
  id_lokalId: string | null;
  adressebetegnelse: string | null;
  husnummer: string | null;
  etagebetegnelse: string | null;
  doerbetegnelse: string | null;
  status: string | null;
};

type DarHusnummerNode = {
  id_lokalId: string | null;
  adgangsadressebetegnelse: string | null;
  husnummertekst: string | null;
  adgangspunkt: string | null;
  postnummer: string | null;
  kommuneinddeling: string | null;
  navngivenVej: string | null;
  jordstykke: string | null;
  status: string | null;
};

type DarPostnummerNode = { postnr: string | null; navn: string | null };
type DarAdressepunktNode = { position: { wkt: string | null } | null };
type MatJordstykkeNode = { matrikelnummer: string | null; ejerlavLokalId: string | null; registreretAreal: number | null };
type MatEjerlavNode = { ejerlavskode: number | null; ejerlavsnavn: string | null };
```

- [ ] **Step 2: Replace the `gqlFetch` helper with typed calls**

Remove the `async function gqlFetch(...)` function (lines ~211-247).

In `getAddressDetails`, replace each `gqlFetch(url, QUERY, vars, operation, trace)` call with:

```typescript
// Kald 1:
const adresseData = await datafordelerGraphqlFetch<{ DAR_Adresse: { nodes: DarAdresseNode[] } }>(
  url, ADRESSE_QUERY, { id, ...bitemporalArgs }, "DAR_Adresse", { trace },
);
const adresseNodes = adresseData.DAR_Adresse.nodes;

// Kald 2:
const husnummerData = await datafordelerGraphqlFetch<{ DAR_Husnummer: { nodes: DarHusnummerNode[] } }>(
  url, HUSNUMMER_QUERY, { id: husnummerFK, ...bitemporalArgs }, "DAR_Husnummer", { trace },
);
const husnummer = husnummerData.DAR_Husnummer.nodes[0] ?? null;

// Kald 3a:
const postnummerData = await datafordelerGraphqlFetch<{ DAR_Postnummer: { nodes: DarPostnummerNode[] } }>(
  url, POSTNUMMER_QUERY, { id: postnummerFK, ...bitemporalArgs }, "DAR_Postnummer", { trace },
);

// Kald 3b:
const adressepunktData = await datafordelerGraphqlFetch<{ DAR_Adressepunkt: { nodes: DarAdressepunktNode[] } }>(
  url, ADRESSEPUNKT_QUERY, { id: adgangspunktFK, ...bitemporalArgs }, "DAR_Adressepunkt", { trace },
);

// Kald 3c:
const jordstykkeData = await datafordelerGraphqlFetch<{ MAT_Jordstykke: { nodes: MatJordstykkeNode[] } }>(
  matUrl, MAT_JORDSTYKKE_QUERY, { id: jordstykkeFK, ...bitemporalArgs }, "MAT_Jordstykke_by_id", { trace },
);

// Kald 4:
const ejerlavData = await datafordelerGraphqlFetch<{ MAT_Ejerlav: { nodes: MatEjerlavNode[] } }>(
  matUrl, MAT_EJERLAV_QUERY, { id: matEjerlavLokalId, ...bitemporalArgs }, "MAT_Ejerlav_by_id", { trace },
);
```

Remove all `.nodes?.[0]` with `any` casts — use the typed node types instead.

- [ ] **Step 3: Run existing DAR tests**

```bash
bun test src/integrations/dar/dar.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/dar/client.ts
git commit -m "refactor(arch-275): dar/client uses typed datafordelerGraphqlFetch"
```

---

### Task 3: Update `bbr/client.ts`

**Files:**
- Modify: `src/integrations/bbr/client.ts`

- [ ] **Step 1: Add node type and replace gqlFetch**

Import the shared transport:
```typescript
import { datafordelerGraphqlFetch } from "@/integrations/datafordeler/graphql-client";
```

Define BBR response type (the `BbrBygning` type already exists — wrap it):
```typescript
type BbrQueryResponse = { BBR_Bygning: { nodes: BbrBygning[] } };
```

Find the inline `gqlFetch` / `fetchBbr` helper in `bbr/client.ts` and replace the call site with:
```typescript
const data = await datafordelerGraphqlFetch<BbrQueryResponse>(
  url, BBR_BYGNING_QUERY, variables, "BBR_Bygning", { trace },
);
const bygninger: BbrBygning[] = data.BBR_Bygning.nodes;
```

Remove the `any[]` cast on `parseBbrBygninger`.

- [ ] **Step 2: Run BBR tests**

```bash
bun test src/integrations/bbr/bbr.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/bbr/client.ts
git commit -m "refactor(arch-275): bbr/client uses typed datafordelerGraphqlFetch"
```

---

### Task 4: Update `mat/client.ts`

**Files:**
- Modify: `src/integrations/mat/client.ts`

- [ ] **Step 1: Add node types and replace gqlFetch**

Import:
```typescript
import { datafordelerGraphqlFetch } from "@/integrations/datafordeler/graphql-client";
```

Define node types:
```typescript
type MatEjerlavNode = { id_lokalId: string | null };
type MatJordstykkeNode = {
  registreretAreal: number | null;
  matrikelnummer: string | null;
  strandbeskyttelse: string | null;
  fredskov: string | null;
  klitfredning: string | null;
};
```

Replace inline `gqlFetch` calls with:
```typescript
const ejerlavData = await datafordelerGraphqlFetch<{ MAT_Ejerlav: { nodes: MatEjerlavNode[] } }>(
  url, EJERLAV_QUERY, variables, "MAT_Ejerlav",
);
const jordstykkeData = await datafordelerGraphqlFetch<{ MAT_Jordstykke: { nodes: MatJordstykkeNode[] } }>(
  url, JORDSTYKKE_QUERY, variables, "MAT_Jordstykke",
);
```

Remove `any[]` casts on ejerlav/jordstykke nodes.

- [ ] **Step 2: Run MAT tests**

```bash
bun test src/integrations/mat/mat.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/mat/client.ts
git commit -m "refactor(arch-275): mat/client uses typed datafordelerGraphqlFetch"
```

---

### Task 5: Update `ebr/client.ts`

**Files:**
- Modify: `src/integrations/ebr/client.ts`

- [ ] **Step 1: Add node type and replace gqlFetch**

Import:
```typescript
import { datafordelerGraphqlFetch } from "@/integrations/datafordeler/graphql-client";
```

Define:
```typescript
type EbrEjendomsbeliggenhedNode = { bfeNr: number | null };
```

Replace inline fetch with:
```typescript
const data = await datafordelerGraphqlFetch<{ EBR_Ejendomsbeliggenhed: { nodes: EbrEjendomsbeliggenhedNode[] } }>(
  url, EBR_QUERY, variables, "EBR_Ejendomsbeliggenhed",
);
const bfeNr = data.EBR_Ejendomsbeliggenhed.nodes[0]?.bfeNr ?? null;
```

- [ ] **Step 2: Run EBR tests**

```bash
bun test src/integrations/ebr/ebr.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/ebr/client.ts
git commit -m "refactor(arch-275): ebr/client uses typed datafordelerGraphqlFetch"
```

---

### Task 6: Update `plandata/client.ts` (WFS transport only)

**Files:**
- Modify: `src/integrations/plandata/client.ts`

Note: Plandata uses WFS (HTTP GET), not GraphQL. The `any` casts here are on GeoJSON feature mapping, not on GraphQL transport. Fix them without introducing the GraphQL client.

- [ ] **Step 1: Define WFS feature node types**

```typescript
type PlandataWfsFeature = {
  type: "Feature";
  properties: Record<string, string | number | boolean | null>;
  geometry: unknown;
};

type PlandataWfsResponse = {
  type: "FeatureCollection";
  features: PlandataWfsFeature[];
};
```

Replace `any` casts in `mapLokalplan()` and `mapKommuneplanramme()`:

```typescript
// Before:
function mapLokalplan(feature: any): Lokalplan { ... }

// After:
function mapLokalplan(feature: PlandataWfsFeature): Lokalplan { ... }
```

And in the fetch response:
```typescript
const json = await res.json() as PlandataWfsResponse;
const features: PlandataWfsFeature[] = json.features ?? [];
```

- [ ] **Step 2: Run Plandata tests**

```bash
bun test src/integrations/plandata/client.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/plandata/client.ts
git commit -m "refactor(arch-275): plandata WFS feature mapper uses typed PlandataWfsFeature"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite and type check**

```bash
bunx tsc --noEmit && bun test
```

Expected: No errors, all tests pass.

- [ ] **Step 2: Static check — no remaining `any` in integration clients**

```bash
bunx eslint src/integrations/dar/client.ts src/integrations/bbr/client.ts src/integrations/mat/client.ts src/integrations/ebr/client.ts src/integrations/plandata/client.ts
```

Expected: No `@typescript-eslint/no-explicit-any` violations.
