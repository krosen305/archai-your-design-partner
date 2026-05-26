# ARCH-269: projekt.adresse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/routes/projekt.adresse.tsx` by moving server functions to a dedicated module, extracting two hooks (autocomplete and pre-check controller), replacing `any` event handler casts, and moving `flagIcon()` to a pure helper.

**Architecture:** Route file becomes a thin UI shell. Server functions live in `src/lib/adresse.functions.ts`. `useAddressSearch` encapsulates debounced GSearch. `useAddressSelectionPrecheck` encapsulates the 3-step select/enrich/pre-check flow. `flagIcon` moves to `src/lib/compliance-flag-icons.ts`.

**Tech Stack:** TypeScript, React, TanStack Start `createServerFn`, Zod, Bun test.

---

## File Map

| Action | File                                    |
| ------ | --------------------------------------- |
| Create | `src/lib/adresse.functions.ts`          |
| Create | `src/lib/use-address-search.ts`         |
| Create | `src/lib/use-address-precheck.ts`       |
| Create | `src/lib/compliance-flag-icons.ts`      |
| Create | `src/lib/compliance-flag-icons.test.ts` |
| Modify | `src/routes/projekt.adresse.tsx`        |

---

### Task 1: Extract server functions to `adresse.functions.ts`

**Files:**

- Create: `src/lib/adresse.functions.ts`

- [ ] **Step 1: Create the file with both server functions**

```typescript
// src/lib/adresse.functions.ts
// Server functions for address search and detail fetch.
// SERVER-SIDE ONLY — GSearch og DAR credentials må aldrig nå browseren.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const searchAddresses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ q: z.string().min(2).max(200).trim() }).parse(data))
  .handler(async ({ data }) => {
    const { GsearchService } = await import("@/integrations/gsearch/client");
    return GsearchService.getSuggestions(data.q);
  });

export const fetchAddressDetails = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ adresseid: z.string().regex(UUID_RE, "Ugyldigt adresse-ID").max(64) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { DarService } = await import("@/integrations/dar/client");
    return DarService.getAddressDetails(data.adresseid);
  });
```

- [ ] **Step 2: Verify type check passes**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/adresse.functions.ts
git commit -m "feat(arch-269): extract searchAddresses + fetchAddressDetails to adresse.functions.ts"
```

---

### Task 2: Extract `flagIcon` to `compliance-flag-icons.ts` with tests

**Files:**

- Create: `src/lib/compliance-flag-icons.ts`
- Create: `src/lib/compliance-flag-icons.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/compliance-flag-icons.test.ts
import { describe, it, expect } from "bun:test";
import { flagIcon } from "./compliance-flag-icons";

describe("flagIcon", () => {
  it("returns heritage icon for fredet", () => {
    expect(flagIcon("fredet_bygning")).toBe("🏛️");
  });
  it("returns wave icon for strandbeskyttelse", () => {
    expect(flagIcon("strandbeskyttelse")).toBe("🌊");
  });
  it("returns tree icon for fredskov", () => {
    expect(flagIcon("fredskov")).toBe("🌲");
  });
  it("returns tree2 icon for skovbyggelinje", () => {
    expect(flagIcon("skovbyggelinje_buffer")).toBe("🌳");
  });
  it("returns water icon for soebeskyttelse", () => {
    expect(flagIcon("soebeskyttelse_linje")).toBe("💧");
  });
  it("returns warning icon for unknown id", () => {
    expect(flagIcon("unknown_flag")).toBe("⚠️");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/lib/compliance-flag-icons.test.ts
```

Expected: `Cannot find module './compliance-flag-icons'`

- [ ] **Step 3: Create `compliance-flag-icons.ts`**

```typescript
// src/lib/compliance-flag-icons.ts
export function flagIcon(id: string): string {
  if (id.includes("fredet")) return "🏛️";
  if (id.includes("strandbeskyttelse")) return "🌊";
  if (id.includes("fredskov")) return "🌲";
  if (id.includes("skovbyggelinje")) return "🌳";
  if (id.includes("soebeskyttelse")) return "💧";
  return "⚠️";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/lib/compliance-flag-icons.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compliance-flag-icons.ts src/lib/compliance-flag-icons.test.ts
git commit -m "feat(arch-269): extract flagIcon helper with tests"
```

---

### Task 3: Extract `useAddressSearch` hook

**Files:**

- Create: `src/lib/use-address-search.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/lib/use-address-search.ts
import { useEffect, useMemo, useRef, useState } from "react";
import type { GsearchSuggestion } from "@/integrations/gsearch/client";
import { searchAddresses } from "./adresse.functions";

export type UseAddressSearchResult = {
  query: string;
  setQuery: (q: string) => void;
  suggestions: GsearchSuggestion[];
  loading: boolean;
  error: string | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  highlightIdx: number;
  setHighlightIdx: (i: number) => void;
  showDropdown: boolean;
};

export function useAddressSearch(initialQuery = ""): UseAddressSearchResult {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<GsearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const lastQueryRef = useRef<string>("");
  const [selected, setSelected] = useState(false);

  const queryTrimmed = useMemo(() => query.trim(), [query]);
  const showDropdown = open && queryTrimmed.length > 0 && !selected;

  useEffect(() => {
    if (!open || selected) return;
    if (queryTrimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const q = queryTrimmed;
    lastQueryRef.current = q;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await searchAddresses({ data: { q } });
        if (lastQueryRef.current !== q) return;
        setSuggestions(res);
        setHighlightIdx(0);
      } catch {
        if (lastQueryRef.current !== q) return;
        setSuggestions([]);
        setError("Kunne ikke hente adresser. Prøv igen.");
      } finally {
        if (lastQueryRef.current === q) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [open, queryTrimmed, selected]);

  function setQueryAndClearSelection(q: string) {
    setQuery(q);
    setSelected(false);
  }

  return {
    query,
    setQuery: setQueryAndClearSelection,
    suggestions,
    loading,
    error,
    open,
    setOpen,
    highlightIdx,
    setHighlightIdx,
    showDropdown,
  };
}
```

- [ ] **Step 2: Verify type check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/use-address-search.ts
git commit -m "feat(arch-269): extract useAddressSearch hook with debounced GSearch"
```

---

### Task 4: Extract `useAddressSelectionPrecheck` hook

**Files:**

- Create: `src/lib/use-address-precheck.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/lib/use-address-precheck.ts
import { useState } from "react";
import type { GsearchSuggestion } from "@/integrations/gsearch/client";
import type { Address } from "@/types/project-state";
import { fetchAddressDetails } from "./adresse.functions";
import { preCheckAdresse } from "./pre-check-adresse";
import { syncPatch } from "./project-sync";
import { useProject } from "./project-store";
import { logger } from "./logger";
import { kommunenavnFraKode } from "./kommuner";

export function useAddressSelectionPrecheck() {
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const {
    setAddress,
    setBbrData,
    setKommuneplanramme,
    setLokalplaner,
    setComplianceFlags,
    setVurderingData,
    setComplianceMetrics,
    setComplianceDone,
    setAdressePreCheck,
  } = useProject();

  async function handleSelectSuggestion(s: GsearchSuggestion): Promise<Address> {
    setAdressePreCheck(null);
    setBbrData(null);
    setComplianceDone(false);

    const immediateAddress: Address = {
      adresseid: s.adresseid,
      adresse: s.tekst,
      postnr: s.postnr,
      postnrnavn: s.postnrnavn,
      kommune: s.kommunekode,
      kommunekode: s.kommunekode,
      matrikel: null,
      adgangsadresseid: s.adgangsadresseid,
      koordinater: s.koordinater,
      bbrId: null,
      ejerlavskode: null,
      matrikelnummer: null,
      grundareal: null,
    };
    setAddress(immediateAddress);
    setIsCheckingCompliance(true);

    let fullAddress = immediateAddress;
    try {
      const details = await fetchAddressDetails({ data: { adresseid: s.adresseid } });
      fullAddress = {
        ...immediateAddress,
        adresse: details.adresse || s.tekst,
        postnr: details.postnr || s.postnr,
        postnrnavn: details.postnrnavn || s.postnrnavn,
        kommunekode: details.kommunekode || s.kommunekode,
        kommune: details.kommunenavn || kommunenavnFraKode(details.kommunekode || s.kommunekode),
        matrikel: details.matrikel,
        adgangsadresseid: details.adgangsadresseid || s.adgangsadresseid,
        koordinater: details.koordinater || s.koordinater,
        ejerlavskode: details.ejerlavskode,
        matrikelnummer: details.matrikelnummer,
        grundareal: details.grundareal ?? null,
      };
      setAddress(fullAddress);
      syncPatch({ address: fullAddress, complianceDone: false, currentStep: "boligoenske" });
    } catch (err) {
      logger.error("[Adresse] getAddressDetails fejlede (ikke kritisk):", err);
      syncPatch({ address: immediateAddress, complianceDone: false, currentStep: "boligoenske" });
    }

    try {
      const vejnavn = fullAddress.adresse?.split(",")[0]?.trim() ?? null;
      const preCheck = await preCheckAdresse({
        data: {
          adgangsadresseid: fullAddress.adgangsadresseid,
          adresseid: s.adresseid,
          ejerlavskode: fullAddress.ejerlavskode,
          matrikelnummer: fullAddress.matrikelnummer,
          koordinater: fullAddress.koordinater,
          grundareal: fullAddress.grundareal,
          vejnavn,
          kommunenavn: fullAddress.kommune ?? null,
        },
      });
      setAdressePreCheck(preCheck);
      if (preCheck.bbr) setBbrData(preCheck.bbr);
      setKommuneplanramme(preCheck.kommuneplanramme);
      setLokalplaner(preCheck.lokalplaner);
      setComplianceFlags([...preCheck.blockers, ...preCheck.advarsler]);
      if (preCheck.vurderingData) setVurderingData(preCheck.vurderingData);
      if (preCheck.complianceMetrics) setComplianceMetrics(preCheck.complianceMetrics);
    } catch (err) {
      logger.error("[Adresse] preCheckAdresse fejlede:", err);
    } finally {
      setIsCheckingCompliance(false);
    }

    return fullAddress;
  }

  return { handleSelectSuggestion, isCheckingCompliance };
}
```

- [ ] **Step 2: Verify type check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/use-address-precheck.ts
git commit -m "feat(arch-269): extract useAddressSelectionPrecheck controller hook"
```

---

### Task 5: Refactor `projekt.adresse.tsx` to use extracted modules

**Files:**

- Modify: `src/routes/projekt.adresse.tsx`

- [ ] **Step 1: Replace inline server functions and helpers with imports**

Remove the `searchAddresses` and `fetchAddressDetails` `createServerFn` definitions (lines 40–54) and the `flagIcon` function (lines 25–32).

Replace with:

```typescript
import { searchAddresses, fetchAddressDetails } from "@/lib/adresse.functions";
import { flagIcon } from "@/lib/compliance-flag-icons";
```

- [ ] **Step 2: Replace `handleSelectSuggestion` and autocomplete state with hooks**

Remove the local state for `query`, `open`, `suggestions`, `loading`, `error`, `highlightIdx`, `lastQueryRef`, and `isCheckingCompliance`. Remove the debounce `useEffect` and `handleSelectSuggestion` function.

Replace with:

```typescript
const {
  query,
  setQuery,
  suggestions,
  loading,
  error,
  open,
  setOpen,
  highlightIdx,
  setHighlightIdx,
  showDropdown,
} = useAddressSearch(address?.adresse ?? "");
const { handleSelectSuggestion, isCheckingCompliance } = useAddressSelectionPrecheck();
```

Add imports:

```typescript
import { useAddressSearch } from "@/lib/use-address-search";
import { useAddressSelectionPrecheck } from "@/lib/use-address-precheck";
```

- [ ] **Step 3: Fix `any` event handler casts**

Replace:

```typescript
onChange={(e: any) => {
```

with:

```typescript
onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
```

Replace:

```typescript
onMouseDown={(e: any) => {
```

with:

```typescript
onMouseDown={(e: React.MouseEvent<HTMLButtonElement>) => {
```

- [ ] **Step 4: Add `selected` state and wire it to `handleSelectSuggestion`**

The `useAddressSelectionPrecheck` hook does not manage the local `selected` display state. Keep a local `selected` state for the chips display:

```typescript
const [selected, setSelected] = useState<Address | null>(address ?? null);

async function onSelectSuggestion(s: GsearchSuggestion) {
  setSelected(null);
  setOpen(false);
  const full = await handleSelectSuggestion(s);
  setSelected(full);
  setQuery(s.tekst);
}
```

Pass `onSelectSuggestion` as the click handler instead of `handleSelectSuggestion` directly.

- [ ] **Step 5: Remove unused imports**

Remove `useEffect`, `useRef`, `useMemo` if no longer used. Remove the `GsearchSuggestion` import if only used in the removed code.

- [ ] **Step 6: Run full verification**

```bash
bunx tsc --noEmit && bun test && bunx eslint src/routes/projekt.adresse.tsx src/lib/adresse.functions.ts src/lib/use-address-search.ts src/lib/use-address-precheck.ts
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/projekt.adresse.tsx
git commit -m "refactor(arch-269): adresse route uses extracted hooks and server functions"
```
